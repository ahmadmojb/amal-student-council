import { describe, expect, it } from 'vitest';
import {
  bracketSize,
  computeStandings,
  generateBracket,
  gradeChampion,
  matchOutcome,
  overallChampion,
  propagateBracket,
  roundName,
  roundRobinPairs,
  seedOrder,
  validateResult,
  type MatchLike,
} from '../../shared/league';
import { leagueConfigInput, matchInput } from '../../shared/schemas';

const base = (over: Partial<MatchLike>): MatchLike => ({ ...matchInput.parse({ stage: 'final', round: 1 }), id: 'm', ...over });

function play(ms: MatchLike[], id: string, h: number, a: number, pens?: [number, number], confirmReset = false) {
  const updated = ms.map((m) => (m.id === id ? { ...m, status: 'completed' as const, homeScore: h, awayScore: a, homePenalties: pens?.[0] ?? null, awayPenalties: pens?.[1] ?? null } : m));
  return propagateBracket(updated, { confirmReset });
}

describe('knockout bracket generation', () => {
  it('uses standard seeding and powers of two', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(bracketSize(6)).toBe(8);
    expect(bracketSize(10)).toBe(16);
  });

  it('gives byes to top seeds and advances them automatically', () => {
    const ms = generateBracket(10, ['A', 'B', 'C', 'D', 'E', 'F']);
    expect(ms.filter((m) => m.round === 1)).toHaveLength(4);
    expect(ms.filter((m) => m.isBye).map((m) => m.homeTeamId).sort()).toEqual(['A', 'B']);
    const r2 = ms.filter((m) => m.round === 2);
    expect(r2.map((m) => m.homeTeamId).sort()).toEqual(['A', 'B']);
    expect(ms.find((m) => m.round === 3)?.nextMatchId).toBeNull();
  });

  it('rejects fewer than two distinct teams', () => {
    expect(() => generateBracket(11, ['A', 'A'])).toThrow();
  });

  it('names rounds from the end', () => {
    expect(roundName(3, 3)).toBe('النهائي');
    expect(roundName(2, 3)).toBe('نصف النهائي');
    expect(roundName(1, 3)).toBe('ربع النهائي');
  });
});

describe('results and progression', () => {
  it('progresses winners, uses penalties for level knockout matches, crowns the champion', () => {
    let ms = generateBracket(12, ['A', 'B', 'C', 'D']);
    ms = play(ms, 'ko-g12-r1-m1', 2, 0).matches; // A vs D → A
    ms = play(ms, 'ko-g12-r1-m2', 1, 1, [3, 4]).matches; // B vs C → C on penalties
    const final = ms.find((m) => m.id === 'ko-g12-r2-m1')!;
    expect([final.homeTeamId, final.awayTeamId]).toEqual(['A', 'C']);
    ms = play(ms, 'ko-g12-r2-m1', 0, 1).matches;
    expect(gradeChampion(ms, 12)).toBe('C');
  });

  it('treats a level knockout match without penalties as undecided', () => {
    const m = base({ stage: 'knockout', homeTeamId: 'A', awayTeamId: 'B', status: 'completed', homeScore: 1, awayScore: 1 });
    expect(matchOutcome(m).decided).toBe(false);
    expect(validateResult(m)).toMatch(/ركلات الترجيح/);
  });

  it('final-stage draws are decided draws', () => {
    const m = base({ homeTeamId: 'A', awayTeamId: 'B', status: 'completed', homeScore: 2, awayScore: 2 });
    expect(matchOutcome(m)).toMatchObject({ decided: true, draw: true, winnerId: null });
  });

  it('detects downstream conflicts on corrections and resets only with confirmation', () => {
    let ms = generateBracket(10, ['A', 'B', 'C', 'D']);
    ms = play(ms, 'ko-g10-r1-m1', 2, 0).matches;
    ms = play(ms, 'ko-g10-r1-m2', 2, 0).matches;
    ms = play(ms, 'ko-g10-r2-m1', 1, 0).matches; // A champion
    expect(gradeChampion(ms, 10)).toBe('A');

    const corrected = ms.map((m) => (m.id === 'ko-g10-r1-m1' ? { ...m, homeScore: 0, awayScore: 1 } : m));
    const refused = propagateBracket(corrected, { confirmReset: false });
    expect(refused.conflicts).toEqual([{ matchId: 'ko-g10-r2-m1', slot: 'home', currentTeamId: 'A', expectedTeamId: 'D' }]);
    expect(refused.matches.find((m) => m.id === 'ko-g10-r2-m1')?.homeTeamId).toBe('A');

    const applied = propagateBracket(corrected, { confirmReset: true });
    const final = applied.matches.find((m) => m.id === 'ko-g10-r2-m1')!;
    expect(applied.resetIds).toEqual(['ko-g10-r2-m1']);
    expect(final).toMatchObject({ homeTeamId: 'D', status: 'scheduled', homeScore: null, awayScore: null });
    expect(gradeChampion(applied.matches, 10)).toBeNull();
  });

  it('validates incomplete results', () => {
    expect(validateResult(base({ status: 'completed', homeTeamId: 'A', awayTeamId: 'B' }))).toBeTruthy();
    expect(validateResult(base({ status: 'scheduled', homeScore: 1, awayScore: null }))).toBeTruthy();
    expect(validateResult(base({ status: 'live', homeTeamId: null }))).toBeTruthy();
  });
});

describe('round robin standings', () => {
  const cfg = leagueConfigInput.parse({});
  const fm = (h: string, a: string, hs: number, as: number): MatchLike => base({ id: h + a, homeTeamId: h, awayTeamId: a, status: 'completed', homeScore: hs, awayScore: as });

  it('creates every pairing once', () => {
    expect(roundRobinPairs(['X', 'Y', 'Z'])).toEqual([
      ['X', 'Y'],
      ['X', 'Z'],
      ['Y', 'Z'],
    ]);
  });

  it('scores 3/1/0 and computes goal statistics', () => {
    const rows = computeStandings(['X', 'Y', 'Z'], [fm('X', 'Y', 2, 0), fm('X', 'Z', 1, 1), fm('Y', 'Z', 3, 1)], cfg);
    expect(rows[0]).toMatchObject({ teamId: 'X', points: 4, wins: 1, draws: 1, losses: 0, goalsFor: 3, goalsAgainst: 1, goalDifference: 2, rank: 1 });
    expect(rows.map((r) => r.teamId)).toEqual(['X', 'Y', 'Z']);
  });

  it('applies tie-breakers in the configured order', () => {
    // X and Y on 4 points, head-to-head level → goal difference decides (Y +3, X +2).
    const ms = [fm('X', 'Y', 1, 1), fm('X', 'Z', 2, 0), fm('Y', 'Z', 3, 0)];
    expect(computeStandings(['X', 'Y', 'Z'], ms, cfg).map((r) => r.teamId)).toEqual(['Y', 'X', 'Z']);
    // With goals-for first: Y (4) > X (3)
    expect(computeStandings(['X', 'Y', 'Z'], ms, { ...cfg, tiebreakers: ['goalsFor'] }).map((r) => r.teamId)).toEqual(['Y', 'X', 'Z']);
  });

  it('head-to-head decides before goal difference when configured first', () => {
    // X and Y finish on 6 points. X beat Y, but Y has the far better goal difference.
    const ms = [fm('X', 'Y', 1, 0), fm('Y', 'W', 6, 0), fm('W', 'X', 1, 0), fm('X', 'Z', 1, 0), fm('Y', 'Z', 1, 0), fm('W', 'Z', 0, 0)];
    expect(computeStandings(['W', 'X', 'Y', 'Z'], ms, cfg).map((r) => r.teamId)).toEqual(['X', 'Y', 'W', 'Z']);
    expect(computeStandings(['W', 'X', 'Y', 'Z'], ms, { ...cfg, tiebreakers: ['goalDifference'] }).map((r) => r.teamId)).toEqual(['Y', 'X', 'W', 'Z']);
  });

  it('falls through to the next criterion when head-to-head is level', () => {
    const ms = [fm('X', 'Y', 1, 0), fm('Y', 'Z', 5, 0), fm('Z', 'X', 1, 0)];
    expect(computeStandings(['X', 'Y', 'Z'], ms, cfg).map((r) => r.teamId)).toEqual(['Y', 'X', 'Z']);
  });

  it('flags ties it cannot resolve instead of inventing an order', () => {
    const rows = computeStandings(['X', 'Y', 'Z'], [fm('X', 'Y', 1, 1), fm('X', 'Z', 1, 1), fm('Y', 'Z', 1, 1)], cfg);
    expect(rows.every((r) => r.unresolvedTie && r.rank === 1)).toBe(true);
  });

  it('overall champion requires every final match to be complete and an untied leader', () => {
    const ms = [fm('X', 'Y', 2, 0), fm('X', 'Z', 1, 0), { ...fm('Y', 'Z', 0, 0), status: 'scheduled' as const, homeScore: null, awayScore: null }];
    expect(overallChampion(ms, cfg)).toBeNull();
    ms[2] = fm('Y', 'Z', 0, 0);
    expect(overallChampion(ms, cfg)).toBe('X');
    expect(overallChampion(ms, { ...cfg, overallChampionOverride: 'Z' })).toBe('Z');
  });
});
