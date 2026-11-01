/**
 * Bagrut calendar filtering. An exam with several dates (a window, or the
 * same subject on consecutive days) expands into one "occurrence" per date
 * so the calendar and list views can treat every day independently.
 */
import type { Exam, Grade } from './schemas.js';

export const EXAM_TYPE_LABEL: Record<Exam['examType'], string> = {
  written: 'كتابي',
  oral: 'شفهي',
  avatar: 'أفاتار',
  oral_avatar: 'شفهي / أفاتار',
};

export const TRACK_LABEL: Record<Exam['tracks'][number], string> = {
  arab: 'مسار الطلاب العرب',
  general: 'امتحان عام',
  islamic_heritage: 'للطلاب الذين يدرسون التراث والدين الإسلامي',
  unconfirmed: 'الأهلية غير مؤكّدة',
};

export interface ExamOccurrence {
  key: string;
  exam: Exam;
  date: string;
  /** 1-based position inside a window (e.g. day 2 of 5). */
  index: number;
  total: number;
}

export interface ExamFilters {
  query: string;
  grade: Grade | null;
  className: string;
  track: Exam['tracks'][number] | '';
  subjectKey: string;
  examType: Exam['examType'] | '';
  from: string;
  to: string;
  /** When true, past dates are hidden. */
  upcomingOnly: boolean;
  /** "Show all relevant exams": ignore grade/class preferences. */
  showAll: boolean;
}

export const EMPTY_FILTERS: ExamFilters = {
  query: '',
  grade: null,
  className: '',
  track: '',
  subjectKey: '',
  examType: '',
  from: '',
  to: '',
  upcomingOnly: true,
  showAll: false,
};

export function expandOccurrences(exams: Exam[]): ExamOccurrence[] {
  const out: ExamOccurrence[] = [];
  for (const exam of exams) {
    const dates = [...exam.dates].sort();
    dates.forEach((date, i) => out.push({ key: `${exam.id}:${date}`, exam, date, index: i + 1, total: dates.length }));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.exam.nameAr.localeCompare(b.exam.nameAr, 'ar'));
}

/** Normalises Arabic for search: strips diacritics/tatweel and unifies alef, ya and ta marbuta. */
export function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u0591-\u05C7]/g, '') // Hebrew niqqud / cantillation
    .trim();
}

/**
 * An exam with no grade/class restrictions applies to everyone who takes the
 * subject; unknown eligibility is surfaced in the UI as "unconfirmed", never
 * hidden and never assumed.
 */
export function matchesAudience(exam: Exam, f: Pick<ExamFilters, 'grade' | 'className' | 'showAll'>): boolean {
  if (f.showAll) return true;
  if (f.grade !== null && exam.grades.length > 0 && !exam.grades.includes(f.grade)) return false;
  if (f.className && exam.classes.length > 0 && !exam.classes.includes(f.className)) return false;
  return true;
}

export function filterOccurrences(all: ExamOccurrence[], f: ExamFilters, today: string): ExamOccurrence[] {
  const q = normalizeArabic(f.query);
  return all.filter(({ exam, date }) => {
    if (exam.visibility !== 'published') return false;
    if (f.upcomingOnly && date < today) return false;
    if (f.from && date < f.from) return false;
    if (f.to && date > f.to) return false;
    if (f.subjectKey && exam.subjectKey !== f.subjectKey) return false;
    if (f.examType && exam.examType !== f.examType) return false;
    if (f.track && !exam.tracks.includes(f.track)) return false;
    if (!matchesAudience(exam, f)) return false;
    if (q) {
      const numbers = exam.questionnaireNumbers ?? [];
      const hay = normalizeArabic(`${exam.nameAr} ${exam.officialName ?? ''} ${exam.subjectKey} ${numbers.join(' ')}`);
      // Questionnaire numbers also match without their leading zeros ("35481" finds "035481").
      const digits = q.replace(/\D/g, '');
      const numberHit = digits.length >= 3 && numbers.some((n) => n.includes(digits) || n.replace(/^0+/, '').includes(digits.replace(/^0+/, '')));
      if (!hay.includes(q) && !numberHit) return false;
    }
    return true;
  });
}

export function subjectsOf(exams: Exam[]): Array<{ key: string; label: string }> {
  const map = new Map<string, string>();
  for (const e of exams) if (!map.has(e.subjectKey)) map.set(e.subjectKey, e.nameAr);
  return [...map.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'ar'));
}

export function classesOf(exams: Exam[]): string[] {
  return [...new Set(exams.flatMap((e) => e.classes))].sort((a, b) => a.localeCompare(b, 'ar'));
}
