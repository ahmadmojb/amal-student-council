/**
 * Football league business logic — pure functions shared by the server (writes)
 * and the client (public views). No I/O here.
 *
 * Competition model (configurable defaults, see docs/league.md):
 *   1. A single-elimination bracket per grade (10, 11, 12).
 *   2. The three grade champions play a round-robin final championship.
 */
import type { Grade, LeagueConfig, Match, MatchInput, Tiebreaker } from './schemas.js';

export type MatchLike = MatchInput & { id: string };

// ───────────────────────── Results ─────────────────────────

export interface MatchOutcome {
  /** True when the match has a final, usable result. */
  decided: boolean;
  winnerId: string | null;
  loserId: string | null;
  draw: boolean;
}

const UNDECIDED: MatchOutcome = { decided: false, winnerId: null, loserId: null, draw: false };

export function hasScore(m: Pick<MatchLike, 'homeScore' | 'awayScore'>): boolean {
  return m.homeScore !== null && m.awayScore !== null;
}

export function matchOutcome(m: MatchLike): MatchOutcome {
  if (m.isBye) {
    const only = m.homeTeamId ?? m.awayTeamId;
    return only ? { decided: true, winnerId: only, loserId: null, draw: false } : UNDECIDED;
  }
  if (m.status !== 'completed' || !hasScore(m) || !m.homeTeamId || !m.awayTeamId) return UNDECIDED;
  const h = m.homeScore as number;
  const a = m.awayScore as number;
  if (h > a) return { decided: true, winnerId: m.homeTeamId, loserId: m.awayTeamId, draw: false };
  if (a > h) return { decided: true, winnerId: m.awayTeamId, loserId: m.homeTeamId, draw: false };
  if (m.stage === 'final') return { decided: true, winnerId: null, loserId: null, draw: true };
  // Knockout draw: penalties decide.
  if (m.homePenalties !== null && m.awayPenalties !== null && m.homePenalties !== m.awayPenalties) {
    const homeWins = m.homePenalties > m.awayPenalties;
    return {
      decided: true,
      winnerId: homeWins ? m.homeTeamId : m.awayTeamId,
      loserId: homeWins ? m.awayTeamId : m.homeTeamId,
      draw: false,
    };
  }
  return UNDECIDED;
}

/** Validation for a result submission; returns an Arabic error message or null. */
export function validateResult(m: MatchLike): string | null {
  if (m.status === 'completed') {
    if (!m.homeTeamId || !m.awayTeamId) return 'لا يمكن إنهاء مباراة قبل تحديد الفريقين.';
    if (!hasScore(m)) return 'أدخل نتيجة الفريقين قبل اعتماد المباراة كمنتهية.';
    if (m.stage === 'knockout' && m.homeScore === m.awayScore) {
      if (m.homePenalties === null || m.awayPenalties === null) return 'التعادل في الأدوار الإقصائية يتطلب إدخال نتيجة ركلات الترجيح.';
      if (m.homePenalties === m.awayPenalties) return 'نتيجة ركلات الترجيح لا يمكن أن تكون متعادلة.';
    }
  }
  if (m.status === 'live' && (!m.homeTeamId || !m.awayTeamId)) return 'لا يمكن بدء مباراة قبل تحديد الفريقين.';
  if ((m.homeScore === null) !== (m.awayScore === null)) return 'أدخل نتيجة الفريقين معًا أو اتركهما فارغتين.';
  return null;
}

// ───────────────────────── Bracket generation ─────────────────────────

/** Standard seeding order: [1, 8, 4, 5, 2, 7, 3, 6] for 8 slots. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

export function bracketSize(teamCount: number): number {
  let size = 2;
  while (size < teamCount) size *= 2;
  return size;
}

export function roundCount(size: number): number {
  return Math.round(Math.log2(size));
}

export function knockoutMatchId(grade: Grade, round: number, index: number): string {
  return `ko-g${grade}-r${round}-m${index + 1}`;
}

/** Arabic name of a knockout round given how many rounds remain. */
export function roundName(round: number, totalRounds: number): string {
  const remaining = totalRounds - round;
  if (remaining === 0) return 'النهائي';
  if (remaining === 1) return 'نصف النهائي';
  if (remaining === 2) return 'ربع النهائي';
  if (remaining === 3) return 'دور الـ16';
  return `الدور ${round}`;
}

/**
 * Builds an empty single-elimination bracket. Top seeds receive byes when the
 * team count is not a power of two. Byes are marked `isBye` and resolve
 * automatically through `propagateBracket`.
 */
export function generateBracket(grade: Grade, seededTeamIds: string[]): MatchLike[] {
  const unique = [...new Set(seededTeamIds)];
  if (unique.length < 2) throw new Error('يلزم فريقان مختلفان على الأقل');
  const size = bracketSize(unique.length);
  const rounds = roundCount(size);
  const order = seedOrder(size);
  const matches: MatchLike[] = [];

  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round;
    for (let i = 0; i < count; i++) {
      const isLast = round === rounds;
      const base: MatchLike = {
        id: knockoutMatchId(grade, round, i),
        stage: 'knockout',
        grade,
        round,
        slot: i,
        homeTeamId: null,
        awayTeamId: null,
        nextMatchId: isLast ? null : knockoutMatchId(grade, round + 1, Math.floor(i / 2)),
        nextSlot: isLast ? null : i % 2 === 0 ? 'home' : 'away',
        isBye: false,
        date: '',
        startTime: '',
        venue: '',
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        homePenalties: null,
        awayPenalties: null,
        referee: '',
        notes: '',
        visibility: 'draft',
      };
      if (round === 1) {
        const seedA = order[i * 2] as number;
        const seedB = order[i * 2 + 1] as number;
        base.homeTeamId = unique[seedA - 1] ?? null;
        base.awayTeamId = unique[seedB - 1] ?? null;
        base.isBye = base.homeTeamId === null || base.awayTeamId === null;
      }
      matches.push(base);
    }
  }
  return propagateBracket(matches, { confirmReset: true }).matches;
}

// ───────────────────────── Propagation & corrections ─────────────────────────

export interface BracketConflict {
  matchId: string;
  slot: 'home' | 'away';
  currentTeamId: string | null;
  expectedTeamId: string | null;
}

export interface PropagationResult {
  matches: MatchLike[];
  changedIds: string[];
  conflicts: BracketConflict[];
  resetIds: string[];
}

function hasResultRecorded(m: MatchLike): boolean {
  return !m.isBye && (m.status === 'completed' || m.status === 'live' || hasScore(m));
}

/**
 * Re-derives every knockout participant from earlier results.
 * When a correction changes who should be in a match that already has a
 * result, that is a conflict: with `confirmReset` the downstream match is
 * reset (result cleared) and the change cascades; without it, the conflicting
 * slot is left untouched and the caller must refuse the write.
 */
export function propagateBracket(input: MatchLike[], opts: { confirmReset: boolean }): PropagationResult {
  const byId = new Map(input.map((m) => [m.id, { ...m }]));
  const original = new Map(input.map((m) => [m.id, JSON.stringify(m)]));
  const conflicts: BracketConflict[] = [];
  const resetIds = new Set<string>();

  const ordered = [...byId.values()].filter((m) => m.stage === 'knockout').sort((a, b) => a.round - b.round || a.slot - b.slot);

  for (const m of ordered) {
    const current = byId.get(m.id) as MatchLike;
    if (!current.nextMatchId || !current.nextSlot) continue;
    const target = byId.get(current.nextMatchId);
    if (!target) continue;
    const expected = matchOutcome(current).winnerId;
    const key = current.nextSlot === 'home' ? 'homeTeamId' : 'awayTeamId';
    if (target[key] === expected) continue;

    if (hasResultRecorded(target)) {
      conflicts.push({ matchId: target.id, slot: current.nextSlot, currentTeamId: target[key], expectedTeamId: expected });
      if (!opts.confirmReset) continue;
      target.status = 'scheduled';
      target.homeScore = null;
      target.awayScore = null;
      target.homePenalties = null;
      target.awayPenalties = null;
      resetIds.add(target.id);
    }
    target[key] = expected;
  }

  const matches = [...byId.values()];
  const changedIds = matches.filter((m) => original.get(m.id) !== JSON.stringify(m)).map((m) => m.id);
  return { matches, changedIds, conflicts, resetIds: [...resetIds] };
}

/** The champion of a grade's bracket, or null until the final is decided. */
export function gradeChampion(matches: MatchLike[], grade: Grade): string | null {
  const ko = matches.filter((m) => m.stage === 'knockout' && m.grade === grade);
  const final = ko.find((m) => m.nextMatchId === null && ko.length > 0 && m.round === Math.max(...ko.map((x) => x.round)));
  return final ? matchOutcome(final).winnerId : null;
}

export function resolvedChampions(matches: MatchLike[], config: Pick<LeagueConfig, 'championOverrides'> | undefined): Record<Grade, string | null> {
  const o = config?.championOverrides;
  return {
    10: o?.g10 || gradeChampion(matches, 10),
    11: o?.g11 || gradeChampion(matches, 11),
    12: o?.g12 || gradeChampion(matches, 12),
  };
}

// ───────────────────────── Round robin & standings ─────────────────────────

export function roundRobinPairs(teamIds: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) pairs.push([teamIds[i] as string, teamIds[j] as string]);
  }
  return pairs;
}

export interface StandingRow {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  rank: number;
  /** True when the configured tie-breakers could not separate this team. */
  unresolvedTie: boolean;
}

type Points = Pick<LeagueConfig, 'pointsWin' | 'pointsDraw' | 'pointsLoss'>;

function emptyRow(teamId: string): StandingRow {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, rank: 0, unresolvedTie: false };
}

function countable(m: MatchLike): boolean {
  return !m.isBye && m.status === 'completed' && hasScore(m) && Boolean(m.homeTeamId) && Boolean(m.awayTeamId);
}

export function tally(teamIds: string[], matches: MatchLike[], pts: Points): Map<string, StandingRow> {
  const rows = new Map(teamIds.map((id) => [id, emptyRow(id)]));
  for (const m of matches) {
    if (!countable(m)) continue;
    const home = rows.get(m.homeTeamId as string);
    const away = rows.get(m.awayTeamId as string);
    if (!home || !away) continue;
    const h = m.homeScore as number;
    const a = m.awayScore as number;
    home.played++;
    away.played++;
    home.goalsFor += h;
    home.goalsAgainst += a;
    away.goalsFor += a;
    away.goalsAgainst += h;
    if (h > a) {
      home.wins++;
      away.losses++;
      home.points += pts.pointsWin;
      away.points += pts.pointsLoss;
    } else if (a > h) {
      away.wins++;
      home.losses++;
      away.points += pts.pointsWin;
      home.points += pts.pointsLoss;
    } else {
      home.draws++;
      away.draws++;
      home.points += pts.pointsDraw;
      away.points += pts.pointsDraw;
    }
  }
  for (const r of rows.values()) r.goalDifference = r.goalsFor - r.goalsAgainst;
  return rows;
}

function criterionValue(row: StandingRow, criterion: Tiebreaker | 'points', group: StandingRow[], matches: MatchLike[], pts: Points): number {
  switch (criterion) {
    case 'points':
      return row.points;
    case 'goalDifference':
      return row.goalDifference;
    case 'goalsFor':
      return row.goalsFor;
    case 'fewerGoalsAgainst':
      return -row.goalsAgainst;
    case 'headToHead': {
      const ids = new Set(group.map((g) => g.teamId));
      const mini = matches.filter((m) => ids.has(m.homeTeamId ?? '') && ids.has(m.awayTeamId ?? ''));
      return tally([...ids], mini, pts).get(row.teamId)?.points ?? 0;
    }
  }
}

function rankGroup(group: StandingRow[], criteria: Array<Tiebreaker | 'points'>, matches: MatchLike[], pts: Points, nameOf: (id: string) => string): StandingRow[][] {
  if (group.length <= 1) return [group];
  const [criterion, ...rest] = criteria;
  if (!criterion) {
    // Nothing left to separate them: deterministic display order, flagged as unresolved.
    const sorted = [...group].sort((a, b) => nameOf(a.teamId).localeCompare(nameOf(b.teamId), 'ar'));
    for (const r of sorted) r.unresolvedTie = true;
    return [sorted];
  }
  const buckets = new Map<number, StandingRow[]>();
  for (const row of group) {
    const v = criterionValue(row, criterion, group, matches, pts);
    buckets.set(v, [...(buckets.get(v) ?? []), row]);
  }
  return [...buckets.entries()].sort((a, b) => b[0] - a[0]).flatMap(([, rows]) => rankGroup(rows, rest, matches, pts, nameOf));
}

/**
 * Standings with configurable tie-breakers applied in order after points.
 * Teams that remain level after every configured criterion share a rank and
 * are flagged `unresolvedTie` — the app never invents an official tie-break.
 */
export function computeStandings(
  teamIds: string[],
  matches: MatchLike[],
  config: Points & Pick<LeagueConfig, 'tiebreakers'>,
  nameOf: (id: string) => string = (id) => id,
): StandingRow[] {
  const rows = [...tally(teamIds, matches, config).values()];
  const groups = rankGroup(rows, ['points', ...config.tiebreakers], matches.filter(countable), config, nameOf);
  const result: StandingRow[] = [];
  let position = 1;
  for (const g of groups) {
    for (const row of g) {
      row.rank = position;
      result.push(row);
    }
    position += g.length;
  }
  return result;
}

export function finalChampionshipTeams(matches: MatchLike[]): string[] {
  const ids = new Set<string>();
  for (const m of matches) {
    if (m.stage !== 'final') continue;
    if (m.homeTeamId) ids.add(m.homeTeamId);
    if (m.awayTeamId) ids.add(m.awayTeamId);
  }
  return [...ids];
}

/** Overall champion: top of the final table once every final match is complete and the top spot is not tied. */
export function overallChampion(matches: MatchLike[], config: LeagueConfig): string | null {
  if (config.overallChampionOverride) return config.overallChampionOverride;
  const finals = matches.filter((m) => m.stage === 'final' && m.status !== 'cancelled');
  if (finals.length === 0 || finals.some((m) => m.status !== 'completed')) return null;
  const table = computeStandings(finalChampionshipTeams(finals), finals, config);
  const top = table[0];
  if (!top || top.unresolvedTie) return null;
  return top.teamId;
}

export function sortMatchesChronologically<T extends Pick<Match, 'date' | 'startTime' | 'round' | 'slot'>>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      (a.date || '9999').localeCompare(b.date || '9999') ||
      (a.startTime || '99').localeCompare(b.startTime || '99') ||
      a.round - b.round ||
      a.slot - b.slot,
  );
}

export const MATCH_STATUS_LABEL: Record<Match['status'], string> = {
  scheduled: 'مجدولة',
  live: 'جارية الآن',
  completed: 'انتهت',
  postponed: 'مؤجّلة',
  cancelled: 'ملغاة',
};

export const TIEBREAKER_LABEL: Record<Tiebreaker, string> = {
  headToHead: 'المواجهة المباشرة',
  goalDifference: 'فارق الأهداف',
  goalsFor: 'الأهداف المسجّلة',
  fewerGoalsAgainst: 'الأهداف المستقبلة (الأقل أفضل)',
};
