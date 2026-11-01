/**
 * Initial real-world data. The ONLY real-world timetable data shipped with the
 * project is the provisional Bagrut Winter 2027 list supplied by the council.
 * Everything here stays `certainty: 'provisional'` until a council member
 * checks it against the Ministry timetable and marks it final in /admin.
 *
 * Verification status at build time (2026-10-31):
 *  - Ministry page https://parents.education.gov.il/gov-education/school/matriculation/dates
 *    still labels the Winter 2027 timetable "טיוטה" (draft).
 *  - Oral / Avatar windows below matched the Ministry file
 *    DatesAvatarExams2027.pdf (updated 29/7/2026).
 *  - Written-exam dates could NOT be confirmed: the draft PDF's text could not
 *    be reliably extracted. They must be checked manually. See docs/bagrut.md.
 */
import type { ExamInput } from '../shared/schemas.js';

export const MINISTRY_DATES_URL = 'https://parents.education.gov.il/gov-education/school/matriculation/dates';
export const MINISTRY_AVATAR_PDF = 'https://meyda.education.gov.il/files/Exams/DatesAvatarExams2027.pdf';
export const MINISTRY_WINTER_PDF = 'https://meyda.education.gov.il/files/Exams/LuachWinExams2027Tyota.pdf';

const SEASON = 'شتاء 2027';

function written(id: string, subjectKey: string, nameAr: string, date: string, tracks: ExamInput['tracks'], eligibilityNote: string, officialName = ''): ExamInput & { id: string } {
  return {
    id,
    season: SEASON,
    subjectKey,
    nameAr,
    officialName,
    questionnaireNumbers: [], // מספר שאלון: awaiting verification against the Ministry timetable — never guessed
    dateMode: 'single',
    dates: [date],
    examType: 'written',
    grades: [],
    classes: [],
    tracks,
    eligibilityConfirmed: false,
    eligibilityNote,
    verifiedTime: '',
    sourceUrl: MINISTRY_WINTER_PDF,
    sourceNote: 'مسودة لوح امتحانات شتاء 2027 الصادرة عن وزارة التربية (لم يُتحقّق من هذا التاريخ بعد).',
    lastVerifiedOn: '',
    certainty: 'provisional',
    adminNotes: 'بيانات أولية من المجلس. يجب مطابقتها مع لوح الوزارة وتحديد الصفوف والمسار قبل اعتمادها نهائيًا.',
    visibility: 'published',
  };
}

export const BAGRUT_WINTER_2027_SEED: Array<ExamInput & { id: string }> = [
  written('seed-w27-hebrew', 'hebrew-arab', 'اللغة العبرية للطلاب العرب', '2027-01-04', ['arab'], 'لطلاب مسار العبرية للناطقين بالعربية.', 'עברית לערבים'),
  written('seed-w27-math-1', 'math', 'الرياضيات', '2027-01-11', ['unconfirmed'], 'الأهلية غير مؤكّدة — يحدّدها المعلّم/المدرسة.', 'מתמטיקה'),
  written('seed-w27-math-2', 'math', 'الرياضيات', '2027-01-12', ['unconfirmed'], 'الأهلية غير مؤكّدة — يحدّدها المعلّم/المدرسة.', 'מתמטיקה'),
  written('seed-w27-english-1', 'english', 'اللغة الإنجليزية', '2027-01-18', ['unconfirmed'], 'الأهلية غير مؤكّدة — يحدّدها المعلّم/المدرسة.', 'אנגלית'),
  written('seed-w27-english-2', 'english', 'اللغة الإنجليزية', '2027-01-19', ['unconfirmed'], 'الأهلية غير مؤكّدة — يحدّدها المعلّم/المدرسة.', 'אנגלית'),
  written('seed-w27-civics', 'civics', 'المواطنة', '2027-01-21', ['general'], 'للطلاب المعنيّين بامتحان المواطنة.', 'אזרחות'),
  written('seed-w27-islam', 'islamic-heritage', 'التراث والدين الإسلامي', '2027-01-25', ['islamic_heritage'], 'فقط للطلاب الذين يدرسون الموضوع.', 'מורשת ודת האסלאם'),
  written('seed-w27-arabic-lang', 'arabic-language', 'اللغة والتعبير العربي', '2027-01-28', ['arab'], 'مسار الطلاب العرب (يُفرَّق عن مسار الطلاب الدروز في لوح الوزارة).'),
  written('seed-w27-history', 'history', 'التاريخ', '2027-02-01', ['general'], 'امتحان القطاع العام المعنيّ.', 'היסטוריה'),
  written('seed-w27-arabic-lit', 'arabic-literature', 'الأدب العربي', '2027-02-04', ['arab'], 'امتحان الطلاب العرب المعنيّين (يُفرَّق عن مسار الطلاب الدروز).'),
  {
    id: 'seed-w27-english-oral',
    season: SEASON,
    subjectKey: 'english',
    nameAr: 'اللغة الإنجليزية — شفهي / أفاتار',
    officialName: 'אנגלית',
    questionnaireNumbers: [],
    dateMode: 'window',
    dates: ['2026-11-24', '2026-11-25', '2026-12-01', '2026-12-02', '2026-12-14'],
    examType: 'oral_avatar',
    grades: [],
    classes: [],
    tracks: ['unconfirmed'],
    eligibilityConfirmed: false,
    eligibilityNote: 'هذه أيام نافذة الامتحان وليست مواعيد فردية. المدرسة تحدّد موعد كل طالب.',
    verifiedTime: '',
    sourceUrl: MINISTRY_AVATAR_PDF,
    sourceNote: 'ملف الوزارة لمواعيد امتحانات الأفاتار واللغات الشفهية (محدَّث 29/7/2026).',
    lastVerifiedOn: '2026-10-31',
    certainty: 'provisional',
    adminNotes: 'تطابقت التواريخ مع ملف الوزارة بتاريخ 31/10/2026. تبقى مؤقتة حتى تأكيد المدرسة.',
    visibility: 'published',
  },
  {
    id: 'seed-w27-hebrew-oral',
    season: SEASON,
    subjectKey: 'hebrew-arab',
    nameAr: 'اللغة العبرية للطلاب العرب — شفهي',
    officialName: 'עברית לערבים',
    questionnaireNumbers: [],
    dateMode: 'window',
    dates: ['2026-12-01', '2026-12-02', '2026-12-14'],
    examType: 'oral',
    grades: [],
    classes: [],
    tracks: ['arab'],
    eligibilityConfirmed: false,
    eligibilityNote: 'هذه أيام نافذة الامتحان وليست مواعيد فردية. المدرسة تحدّد موعد كل طالب.',
    verifiedTime: '',
    sourceUrl: MINISTRY_AVATAR_PDF,
    sourceNote: 'ملف الوزارة لمواعيد امتحانات الأفاتار واللغات الشفهية (محدَّث 29/7/2026).',
    lastVerifiedOn: '2026-10-31',
    certainty: 'provisional',
    adminNotes: 'تطابقت التواريخ مع ملف الوزارة بتاريخ 31/10/2026. تبقى مؤقتة حتى تأكيد المدرسة.',
    visibility: 'published',
  },
];
