/**
 * Default league configuration as a plain object (no zod) for public pages.
 * A unit test asserts it equals `leagueConfigInput.parse({})`.
 */
import type { LeagueConfig } from './schemas.js';

export const DEFAULT_LEAGUE_CONFIG: LeagueConfig = {
  seasonLabel: '',
  leagueStatus: 'not_started',
  rules: {
    playersOnField: 5,
    unlimitedSubstitutions: true,
    ownClassOnly: true,
    matchMinutes: 25,
    breakMinutes: 5,
    preferredSlot: 'بعد الحصة الثالثة خلال الاستراحة المخصّصة',
    refereeNote: 'معلّم التربية البدنية (بعد التأكيد)',
    penaltiesOnKnockoutDraw: true,
    weatherPolicy: 'تؤجَّل المباريات الخارجية إذا كان الطقس غير مناسب للعب.',
    approved: false,
    extraNotes: '',
  },
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['headToHead', 'goalDifference', 'goalsFor'],
  tiebreakersApproved: false,
  championOverrides: { g10: '', g11: '', g12: '' },
  overallChampionOverride: '',
  announcement: '',
};
