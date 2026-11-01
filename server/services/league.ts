/**
 * League write operations that touch several matches at once (bracket
 * generation, result entry with propagation, final round-robin creation).
 */
import { generateBracket, propagateBracket, resolvedChampions, roundRobinPairs, validateResult, type BracketConflict, type MatchLike } from '../../shared/league.js';
import { matchInput, type Grade, type Match, type MatchResultInput } from '../../shared/schemas.js';
import type { Store } from '../store/types.js';
import type { ContentService } from './content.js';

export class LeagueError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly conflicts: BracketConflict[] = [],
  ) {
    super(message);
  }
}

function toRecord(m: MatchLike, existing: Match | undefined, now: number): Match {
  const parsed = matchInput.parse(m);
  return { ...parsed, id: m.id, createdAt: existing?.createdAt ?? now, updatedAt: now };
}

function stripMeta(m: Match): Omit<Match, 'createdAt' | 'updatedAt'> {
  const { createdAt: _c, updatedAt: _u, ...rest } = m;
  return rest;
}

export class LeagueService {
  constructor(
    private readonly store: Store,
    private readonly content: ContentService,
  ) {}

  private async allMatches(): Promise<Match[]> {
    return this.content.list('matches');
  }

  async generateGradeBracket(grade: Grade, teamIds: string[], replaceExisting: boolean, client?: string): Promise<Match[]> {
    const teams = await this.content.list('teams');
    const valid = new Set(teams.filter((t) => t.grade === grade && t.teamStatus !== 'withdrawn').map((t) => t.id));
    const bad = teamIds.filter((id) => !valid.has(id));
    if (bad.length) throw new LeagueError('بعض الفرق المختارة غير موجودة أو لا تنتمي إلى هذا الصف.');

    const all = await this.allMatches();
    const existing = all.filter((m) => m.stage === 'knockout' && m.grade === grade);
    if (existing.length && !replaceExisting) throw new LeagueError('يوجد جدول إقصائي لهذا الصف. أكّد الاستبدال لحذفه وإنشاء جدول جديد.', 409);
    // Replacing a bracket that has results is allowed only with explicit confirmation and is recorded in the audit log.

    const now = Date.now();
    const generated = generateBracket(grade, teamIds).map((m) => toRecord(m, undefined, now));
    const updates: Record<string, unknown> = {};
    for (const m of existing) {
      updates[`content/matches/${m.id}`] = null;
      updates[`public/matches/${m.id}`] = null;
    }
    for (const m of generated) Object.assign(updates, this.content.writeUpdates('matches', m));
    Object.assign(
      updates,
      this.content.auditUpdate({ action: existing.length ? 'bracket-replace' : 'bracket-create', collection: 'matches', summary: `grade ${grade}: ${teamIds.length} teams, ${existing.length} old matches removed`, client }, now),
    );
    await this.store.update(updates);
    return generated;
  }

  /**
   * Enters or corrects a result. Knockout changes are propagated to later
   * rounds; if that would rewrite a match that already has a result, the
   * call fails with 409 + the conflicts unless confirmDownstreamReset=true.
   */
  async setResult(matchId: string, input: MatchResultInput, client?: string): Promise<{ match: Match; changed: Match[]; resetIds: string[] }> {
    const all = await this.allMatches();
    const target = all.find((m) => m.id === matchId);
    if (!target) throw new LeagueError('المباراة غير موجودة.', 404);

    // Scores only exist for live/completed matches; penalties only for a level knockout match.
    const keepsScore = input.status === 'live' || input.status === 'completed';
    const updated: Match = {
      ...target,
      status: input.status,
      homeScore: keepsScore ? input.homeScore : null,
      awayScore: keepsScore ? input.awayScore : null,
      homePenalties: null,
      awayPenalties: null,
    };
    const levelKnockout = updated.stage === 'knockout' && input.status === 'completed' && updated.homeScore !== null && updated.homeScore === updated.awayScore;
    if (levelKnockout) {
      updated.homePenalties = input.homePenalties;
      updated.awayPenalties = input.awayPenalties;
    }
    const problem = validateResult(updated);
    if (problem) throw new LeagueError(problem);

    let resulting: MatchLike[] = all.map((m) => (m.id === matchId ? updated : m));
    let resetIds: string[] = [];
    if (updated.stage === 'knockout' && updated.grade !== null) {
      const grade = updated.grade;
      const others = resulting.filter((m) => !(m.stage === 'knockout' && m.grade === grade));
      const bracket = resulting.filter((m) => m.stage === 'knockout' && m.grade === grade);
      const result = propagateBracket(bracket, { confirmReset: input.confirmDownstreamReset });
      if (result.conflicts.length && !input.confirmDownstreamReset) {
        throw new LeagueError('هذا التعديل يغيّر فرقًا في مباريات لاحقة لها نتائج مسجّلة. راجع التعارضات وأكّد لإعادة ضبط تلك المباريات.', 409, result.conflicts);
      }
      resetIds = result.resetIds;
      resulting = [...others, ...result.matches];
    }

    const now = Date.now();
    const byId = new Map(all.map((m) => [m.id, m]));
    const changed: Match[] = [];
    const updates: Record<string, unknown> = {};
    for (const m of resulting) {
      const before = byId.get(m.id);
      if (before && JSON.stringify(stripMeta(before)) === JSON.stringify(stripMeta(m as Match))) continue;
      const rec = toRecord(m, before, now);
      changed.push(rec);
      Object.assign(updates, this.content.writeUpdates('matches', rec));
    }
    Object.assign(
      updates,
      this.content.auditUpdate(
        {
          action: resetIds.length ? 'result-correction+reset' : 'result',
          collection: 'matches',
          recordId: matchId,
          summary: `${target.status}→${updated.status} ${target.homeScore ?? '-'}:${target.awayScore ?? '-'} → ${updated.homeScore ?? '-'}:${updated.awayScore ?? '-'}${resetIds.length ? `; reset ${resetIds.join(',')}` : ''}`,
          client,
        },
        now,
      ),
    );
    await this.store.update(updates);
    return { match: changed.find((m) => m.id === matchId) ?? updated, changed, resetIds };
  }

  /** Creates the round-robin between the three grade champions. */
  async generateFinal(replaceExisting: boolean, client?: string): Promise<Match[]> {
    const all = await this.allMatches();
    const config = await this.content.getLeagueConfig();
    const champions = resolvedChampions(all, config);
    const ids = [champions[10], champions[11], champions[12]].filter((x): x is string => Boolean(x));
    if (ids.length < 2) throw new LeagueError('يلزم تحديد بطلين على الأقل (بطل كل صف) قبل إنشاء البطولة النهائية.');
    const existing = all.filter((m) => m.stage === 'final');
    if (existing.length && !replaceExisting) throw new LeagueError('توجد مباريات للبطولة النهائية. أكّد الاستبدال لإنشائها من جديد.', 409);

    const now = Date.now();
    const updates: Record<string, unknown> = {};
    for (const m of existing) {
      updates[`content/matches/${m.id}`] = null;
      updates[`public/matches/${m.id}`] = null;
    }
    const created = roundRobinPairs(ids).map(([home, away], i) =>
      toRecord(
        {
          ...matchInput.parse({ stage: 'final', round: i + 1, slot: i }),
          id: `final-m${i + 1}`,
          homeTeamId: home,
          awayTeamId: away,
        },
        undefined,
        now,
      ),
    );
    for (const m of created) Object.assign(updates, this.content.writeUpdates('matches', m));
    Object.assign(updates, this.content.auditUpdate({ action: 'final-create', collection: 'matches', summary: `${ids.length} champions`, client }, now));
    await this.store.update(updates);
    return created;
  }
}
