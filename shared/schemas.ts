/**
 * Single source of truth for every record shape in the system.
 * Used by the server (validation of every admin write) and by the admin UI
 * (form validation before submit). Public types are inferred from these.
 */
import { z } from 'zod';
import { EXAM_TRACKS, EXAM_TYPES, GRADES, MATCH_STATUSES, TIEBREAKERS, VISIBILITY } from './constants.js';

export { EXAM_TRACKS, EXAM_TYPES, GRADES, MATCH_STATUSES, TIEBREAKERS, VISIBILITY };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Real calendar date in YYYY-MM-DD form (rejects 2027-02-30). */
export const dateOnly = z
  .string()
  .regex(DATE_ONLY, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'تاريخ غير صالح');

export const timeHHMM = z.string().regex(TIME_HHMM, 'صيغة الوقت يجب أن تكون HH:MM');

const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number, message = 'هذا الحقل مطلوب') => z.string().trim().min(1, message).max(max);

/** Only http(s) URLs or site-relative paths are accepted for links and media. */
export const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === '' || /^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v), 'رابط غير صالح (يجب أن يبدأ بـ https://)');

const optionalUrl = safeUrl.optional().default('');

export const visibility = z.enum(VISIBILITY);
export type Visibility = z.infer<typeof visibility>;

/** Fields the server manages; never accepted from the client. */
export const systemFields = z.object({
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type SystemFields = z.infer<typeof systemFields>;

// ───────────────────────── Announcements ─────────────────────────
export const announcementInput = z.object({
  title: requiredText(140),
  body: requiredText(4000),
  priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
  imageUrl: optionalUrl,
  imageAlt: text(200).optional().default(''),
  publishDate: dateOnly,
  expiresOn: dateOnly.optional().or(z.literal('')).default(''),
  showOnDisplay: z.boolean().default(false),
  visibility: visibility.default('draft'),
});
export type AnnouncementInput = z.infer<typeof announcementInput>;
export type Announcement = AnnouncementInput & SystemFields;

// ─────────────── Program-related council notices (/program, /display) ───────────────
export const scheduleNoticeInput = z.object({
  title: requiredText(120),
  body: text(600).optional().default(''),
  activeOn: dateOnly.optional().or(z.literal('')).default(''),
  expiresOn: dateOnly.optional().or(z.literal('')).default(''),
  order: z.number().int().min(0).max(999).default(0),
  visibility: visibility.default('draft'),
});
export type ScheduleNoticeInput = z.infer<typeof scheduleNoticeInput>;
export type ScheduleNotice = ScheduleNoticeInput & SystemFields;

// ───────────────────────── League ─────────────────────────
export const grade = z.union([z.literal(10), z.literal(11), z.literal(12)]);
export type Grade = z.infer<typeof grade>;

export const teamInput = z.object({
  className: requiredText(40, 'اسم الصف مطلوب'),
  grade,
  displayName: requiredText(60, 'اسم الفريق مطلوب'),
  logoUrl: optionalUrl,
  teamStatus: z.enum(['active', 'eliminated', 'withdrawn']).default('active'),
  notes: text(500).optional().default(''),
  visibility: visibility.default('draft'),
});
export type TeamInput = z.infer<typeof teamInput>;
export type Team = TeamInput & SystemFields;

export const matchStatus = z.enum(MATCH_STATUSES);
export type MatchStatus = z.infer<typeof matchStatus>;

const score = z.number().int().min(0).max(99).nullable().default(null);

export const matchInput = z.object({
  stage: z.enum(['knockout', 'final']),
  grade: grade.nullable().default(null),
  round: z.number().int().min(1).max(10),
  slot: z.number().int().min(0).max(63).default(0),
  homeTeamId: z.string().max(64).nullable().default(null),
  awayTeamId: z.string().max(64).nullable().default(null),
  /** Knockout wiring: winner of this match goes to nextMatchId's home/away slot. */
  nextMatchId: z.string().max(64).nullable().default(null),
  nextSlot: z.enum(['home', 'away']).nullable().default(null),
  isBye: z.boolean().default(false),
  date: dateOnly.optional().or(z.literal('')).default(''),
  startTime: timeHHMM.optional().or(z.literal('')).default(''),
  venue: text(120).optional().default(''),
  status: matchStatus.default('scheduled'),
  homeScore: score,
  awayScore: score,
  homePenalties: score,
  awayPenalties: score,
  referee: text(120).optional().default(''),
  notes: text(500).optional().default(''),
  visibility: visibility.default('draft'),
});
export type MatchInput = z.infer<typeof matchInput>;
export type Match = MatchInput & SystemFields;

export const tiebreaker = z.enum(TIEBREAKERS);
export type Tiebreaker = z.infer<typeof tiebreaker>;

export const leagueConfigInput = z.object({
  seasonLabel: text(80).default(''),
  leagueStatus: z.enum(['not_started', 'registration', 'in_progress', 'finished']).default('not_started'),
  rules: z
    .object({
      playersOnField: z.number().int().min(3).max(11).default(5),
      unlimitedSubstitutions: z.boolean().default(true),
      ownClassOnly: z.boolean().default(true),
      matchMinutes: z.number().int().min(10).max(90).default(25),
      breakMinutes: z.number().int().min(0).max(15).default(5),
      preferredSlot: text(200).default('بعد الحصة الثالثة خلال الاستراحة المخصّصة'),
      refereeNote: text(200).default('معلّم التربية البدنية (بعد التأكيد)'),
      penaltiesOnKnockoutDraw: z.boolean().default(true),
      weatherPolicy: text(300).default('تؤجَّل المباريات الخارجية إذا كان الطقس غير مناسب للعب.'),
      approved: z.boolean().default(false),
      extraNotes: text(1500).default(''),
    })
    .prefault({}),
  pointsWin: z.number().int().min(0).max(10).default(3),
  pointsDraw: z.number().int().min(0).max(10).default(1),
  pointsLoss: z.number().int().min(0).max(10).default(0),
  tiebreakers: z.array(tiebreaker).max(4).default(['headToHead', 'goalDifference', 'goalsFor']),
  tiebreakersApproved: z.boolean().default(false),
  championOverrides: z
    .object({ g10: z.string().max(64).default(''), g11: z.string().max(64).default(''), g12: z.string().max(64).default('') })
    .prefault({}),
  overallChampionOverride: z.string().max(64).default(''),
  announcement: text(600).default(''),
});
export type LeagueConfig = z.infer<typeof leagueConfigInput> & { updatedAt?: number };

export const matchResultInput = z.object({
  status: matchStatus,
  homeScore: score,
  awayScore: score,
  homePenalties: score,
  awayPenalties: score,
  /** Must be true to apply a change that rewrites already-played downstream matches. */
  confirmDownstreamReset: z.boolean().default(false),
});
export type MatchResultInput = z.infer<typeof matchResultInput>;

export const bracketGenerateInput = z.object({
  grade,
  /** Ordered seeds (index 0 = top seed). */
  teamIds: z.array(z.string().max(64)).min(2, 'يلزم فريقان على الأقل').max(32),
  replaceExisting: z.boolean().default(false),
});

// ───────────────────────── Bagrut ─────────────────────────

export const examInput = z.object({
  season: requiredText(40),
  subjectKey: requiredText(60),
  nameAr: requiredText(120),
  /** Official Hebrew subject name (as in the Ministry timetable). */
  officialName: text(200).optional().default(''),
  /** מספר שאלון — strings, to keep leading zeros (e.g. "035481"). Empty = awaiting verification. */
  questionnaireNumbers: z
    .array(z.string().trim().regex(/^\d{3,8}$/, 'رقم الاستمارة (מספר שאלון) يتكوّن من 3 إلى 8 أرقام'))
    .max(12)
    .default([])
    .refine((a) => new Set(a).size === a.length, 'رقم استمارة مكرّر'),
  dateMode: z.enum(['single', 'window']).default('single'),
  dates: z.array(dateOnly).min(1, 'أدخل تاريخًا واحدًا على الأقل').max(30),
  examType: z.enum(EXAM_TYPES),
  grades: z.array(grade).max(3).default([]),
  classes: z.array(text(30)).max(40).default([]),
  tracks: z.array(z.enum(EXAM_TRACKS)).max(4).default([]),
  eligibilityConfirmed: z.boolean().default(false),
  eligibilityNote: text(500).optional().default(''),
  /** Only filled after the time is verified against the official source. */
  verifiedTime: timeHHMM.optional().or(z.literal('')).default(''),
  sourceUrl: optionalUrl,
  sourceNote: text(300).optional().default(''),
  lastVerifiedOn: dateOnly.optional().or(z.literal('')).default(''),
  certainty: z.enum(['provisional', 'final']).default('provisional'),
  adminNotes: text(1000).optional().default(''),
  visibility: visibility.default('draft'),
});
export type ExamInput = z.infer<typeof examInput>;
export type Exam = ExamInput & SystemFields;

// ───────────────────────── Benefits ─────────────────────────
export const benefitInput = z.object({
  businessName: requiredText(100),
  category: requiredText(60),
  logoUrl: optionalUrl,
  title: requiredText(140),
  description: requiredText(2000),
  discountKind: z.enum(['percent', 'fixed', 'other']).default('percent'),
  discountValue: z.number().min(0).max(100000).nullable().default(null),
  originalPrice: z.number().min(0).max(100000).nullable().default(null),
  discountedPrice: z.number().min(0).max(100000).nullable().default(null),
  branch: text(120).optional().default(''),
  location: text(200).optional().default(''),
  directionsUrl: optionalUrl,
  officialUrl: optionalUrl,
  terms: text(2000).optional().default(''),
  startsOn: dateOnly.optional().or(z.literal('')).default(''),
  expiresOn: dateOnly.optional().or(z.literal('')).default(''),
  redemption: text(1000).optional().default(''),
  couponCode: text(40).optional().default(''),
  qrImageUrl: optionalUrl,
  verifiedOn: dateOnly.optional().or(z.literal('')).default(''),
  temporarilyUnavailable: z.boolean().default(false),
  visibility: visibility.default('draft'),
});
export type BenefitInput = z.infer<typeof benefitInput>;
export type Benefit = BenefitInput & SystemFields;

// ───────────────────────── Services ─────────────────────────
export const serviceInput = z.object({
  name: requiredText(100),
  description: text(1500).optional().default(''),
  category: requiredText(60),
  building: text(60).optional().default(''),
  floor: text(30).optional().default(''),
  room: text(30).optional().default(''),
  locationNote: text(500).optional().default(''),
  availability: text(200).optional().default(''),
  hours: text(300).optional().default(''),
  contact: text(200).optional().default(''),
  mapUrl: optionalUrl,
  floorPlanUrl: optionalUrl,
  accessibility: text(500).optional().default(''),
  order: z.number().int().min(0).max(999).default(0),
  visibility: visibility.default('draft'),
});
export type ServiceInput = z.infer<typeof serviceInput>;
export type Service = ServiceInput & SystemFields;

// ───────────────────────── Activities ─────────────────────────
export const activityInput = z.object({
  title: requiredText(140),
  description: requiredText(5000),
  date: dateOnly,
  category: requiredText(60),
  photos: z
    .array(z.object({ url: safeUrl.refine((v) => v !== '', 'رابط الصورة مطلوب'), alt: text(200).default(''), approved: z.literal(true, { error: 'يجب تأكيد الموافقة على نشر الصورة' }) }))
    .max(24)
    .default([]),
  videoUrl: optionalUrl,
  gradeOrClass: text(60).optional().default(''),
  achievements: text(2000).optional().default(''),
  relatedEvent: text(140).optional().default(''),
  attachmentUrl: optionalUrl,
  attachmentName: text(120).optional().default(''),
  featured: z.boolean().default(false),
  visibility: visibility.default('draft'),
});
export type ActivityInput = z.infer<typeof activityInput>;
export type Activity = ActivityInput & SystemFields;

// ───────────────────────── Certificates ─────────────────────────
export const certificateInput = z.object({
  studentName: requiredText(120, 'اسم الطالب مطلوب'),
  activityTitle: requiredText(160, 'عنوان النشاط مطلوب'),
  issueDate: dateOnly,
  issuer: requiredText(160).default('مجلس الطلاب — المدرسة الثانوية الشاملة عمال يوسف شاهين، الطيبة'),
});
export type CertificateInput = z.infer<typeof certificateInput>;

export interface CertificateRecord extends CertificateInput {
  status: 'valid' | 'revoked';
  createdAt: number;
  revokedAt: number | null;
  /** Last 4 characters of the code, for admin identification only. */
  codeHint: string;
}

export interface CertificateVerification {
  result: 'valid' | 'revoked' | 'unknown';
  certificate?: Pick<CertificateInput, 'studentName' | 'activityTitle' | 'issueDate' | 'issuer'>;
}

// ───────────────────────── Settings ─────────────────────────
export const siteSettingsInput = z.object({
  welcomeMessage: text(400).default('هنا تجد إعلانات المجلس، برنامج اليوم، مواعيد البجروت، والدوري المدرسي — في مكان واحد.'),
  officialLinks: z.array(z.object({ label: requiredText(60), url: safeUrl.refine((v) => v !== '', 'الرابط مطلوب') })).max(8).default([]),
  logoUrl: optionalUrl,
  displayRotationSeconds: z.number().int().min(5).max(120).default(12),
});
export type SiteSettings = z.infer<typeof siteSettingsInput> & { updatedAt?: number };

// ───────────────────────── Collections registry ─────────────────────────
export const collectionSchemas = {
  announcements: announcementInput,
  scheduleNotices: scheduleNoticeInput,
  teams: teamInput,
  matches: matchInput,
  exams: examInput,
  benefits: benefitInput,
  services: serviceInput,
  activities: activityInput,
} as const;

export type CollectionName = keyof typeof collectionSchemas;
export const COLLECTIONS = Object.keys(collectionSchemas) as CollectionName[];

export interface CollectionRecordMap {
  announcements: Announcement;
  scheduleNotices: ScheduleNotice;
  teams: Team;
  matches: Match;
  exams: Exam;
  benefits: Benefit;
  services: Service;
  activities: Activity;
}

// ───────────────────────── Daily schedule video ─────────────────────────
export const SCHEDULE_VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm' } as const;
export type ScheduleVideoMime = keyof typeof SCHEDULE_VIDEO_TYPES;

/** Where the daily video comes from. Only uploaded files are ours to delete. */
export type ScheduleVideoSource =
  | { type: 'uploaded'; objectPath: string; originalName: string; mimeType: ScheduleVideoMime; size: number }
  | { type: 'external'; provider: 'direct' | 'youtube' | 'vimeo'; externalUrl: string; playUrl: string; videoId?: string; mimeType?: ScheduleVideoMime };

/** Private record (content/scheduleVideo/current). */
export interface ScheduleVideoRecord {
  id: string;
  source: ScheduleVideoSource;
  /** Server time of publication (epoch ms). */
  uploadedAt: number;
  /** YYYY-MM-DD in Asia/Jerusalem of the publication moment. */
  scheduleDate: string;
  /** Epoch ms of the midnight that ends scheduleDate (Asia/Jerusalem). */
  expiresAt: number;
  status: 'published';
}

/** What visitors receive (public/scheduleVideo). */
export interface ScheduleVideoPublic {
  id: string;
  /** 'uploaded' | 'direct' are played natively; youtube/vimeo through the official embed. */
  provider: 'uploaded' | 'direct' | 'youtube' | 'vimeo';
  /** File URL (uploaded/direct) or official embed URL (youtube/vimeo). */
  url: string;
  videoId?: string;
  mimeType?: ScheduleVideoMime;
  scheduleDate: string;
  expiresAt: number;
  uploadedAt: number;
}

export const scheduleVideoExternalRequest = z.object({ url: z.string().trim().min(1).max(2048) });

export const scheduleVideoUploadRequest = z.object({
  name: z.string().trim().min(1).max(200),
  size: z.number().int().positive(),
  type: z.string().max(100),
});

/** Shape of the whole public tree (what visitors may read). */
export interface PublicTree {
  announcements?: Record<string, Announcement>;
  scheduleNotices?: Record<string, ScheduleNotice>;
  teams?: Record<string, Team>;
  matches?: Record<string, Match>;
  exams?: Record<string, Exam>;
  benefits?: Record<string, Benefit>;
  services?: Record<string, Service>;
  activities?: Record<string, Activity>;
  leagueConfig?: LeagueConfig;
  settings?: SiteSettings;
  scheduleVideo?: ScheduleVideoPublic;
  meta?: { updatedAt?: number; schemaVersion?: number };
}

export const loginInput = z.object({ pin: z.string().min(1, 'أدخل الرمز').max(200) });
