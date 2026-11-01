/**
 * Plain constants shared by schemas and UI. Kept free of zod so public pages
 * can import them without pulling the validation library into the main bundle.
 */
export const VISIBILITY = ['draft', 'published', 'archived'] as const;
export const GRADES = [10, 11, 12] as const;
export const MATCH_STATUSES = ['scheduled', 'live', 'completed', 'postponed', 'cancelled'] as const;
export const TIEBREAKERS = ['headToHead', 'goalDifference', 'goalsFor', 'fewerGoalsAgainst'] as const;
export const EXAM_TYPES = ['written', 'oral', 'avatar', 'oral_avatar'] as const;
export const EXAM_TRACKS = ['arab', 'general', 'islamic_heritage', 'unconfirmed'] as const;
