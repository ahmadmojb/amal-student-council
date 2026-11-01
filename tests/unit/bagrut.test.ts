import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, expandOccurrences, filterOccurrences, normalizeArabic } from '../../shared/bagrut';
import { examInput, type Exam } from '../../shared/schemas';
import { BAGRUT_WINTER_2027_SEED } from '../../server/seed-data';

const exams: Exam[] = BAGRUT_WINTER_2027_SEED.map(({ id, ...e }) => ({ ...examInput.parse(e), id, createdAt: 0, updatedAt: 0 }));

describe('Bagrut seed data', () => {
  it('contains exactly the specified provisional records', () => {
    expect(exams).toHaveLength(12);
    expect(exams.every((e) => e.certainty === 'provisional')).toBe(true);
    expect(exams.every((e) => e.verifiedTime === '')).toBe(true);
  });

  it('excludes Tanakh, Christian heritage and Hebrew-for-Jewish-students exams', () => {
    const names = exams.map((e) => `${e.nameAr} ${e.officialName}`).join(' ');
    expect(names).not.toMatch(/تناخ|التوراة|المسيحي|תנ"ך|נצרות/);
    expect(exams.find((e) => e.id === 'seed-w27-hebrew')?.tracks).toEqual(['arab']);
  });

  it('keeps separate records for separate dates', () => {
    expect(exams.filter((e) => e.subjectKey === 'math').map((e) => e.dates)).toEqual([['2027-01-11'], ['2027-01-12']]);
  });
});

describe('Bagrut filtering', () => {
  const occ = expandOccurrences(exams);
  const today = '2026-11-01';

  it('expands examination windows into one occurrence per day', () => {
    const english = occ.filter((o) => o.exam.id === 'seed-w27-english-oral');
    expect(english.map((o) => o.date)).toEqual(['2026-11-24', '2026-11-25', '2026-12-01', '2026-12-02', '2026-12-14']);
    expect(english[2]).toMatchObject({ index: 3, total: 5 });
  });

  it('orders occurrences chronologically', () => {
    const dates = occ.map((o) => o.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('searches Arabic text tolerant of hamza/ta marbuta variants', () => {
    expect(normalizeArabic('الإنجليزية')).toBe(normalizeArabic('الانجليزيه'));
    const r = filterOccurrences(occ, { ...EMPTY_FILTERS, query: 'انجليزيه' }, today);
    expect(new Set(r.map((o) => o.exam.subjectKey))).toEqual(new Set(['english']));
  });

  it('filters by type, track, subject and date range', () => {
    expect(filterOccurrences(occ, { ...EMPTY_FILTERS, examType: 'oral' }, today).every((o) => o.exam.examType === 'oral')).toBe(true);
    expect(filterOccurrences(occ, { ...EMPTY_FILTERS, track: 'islamic_heritage' }, today).map((o) => o.exam.id)).toEqual(['seed-w27-islam']);
    expect(filterOccurrences(occ, { ...EMPTY_FILTERS, subjectKey: 'math' }, today)).toHaveLength(2);
    expect(filterOccurrences(occ, { ...EMPTY_FILTERS, from: '2027-01-18', to: '2027-01-21' }, today).map((o) => o.date)).toEqual(['2027-01-18', '2027-01-19', '2027-01-21']);
  });

  it('hides past dates when upcomingOnly is set', () => {
    expect(filterOccurrences(occ, EMPTY_FILTERS, '2027-01-20').every((o) => o.date >= '2027-01-20')).toBe(true);
    expect(filterOccurrences(occ, { ...EMPTY_FILTERS, upcomingOnly: false }, '2027-01-20')).toHaveLength(occ.length);
  });

  it('applies grade/class eligibility only where it was assigned, and "show all" overrides it', () => {
    const restricted = occ.map((o) => (o.exam.id === 'seed-w27-civics' ? { ...o, exam: { ...o.exam, grades: [11 as const] } } : o));
    expect(filterOccurrences(restricted, { ...EMPTY_FILTERS, grade: 10 }, today).some((o) => o.exam.id === 'seed-w27-civics')).toBe(false);
    expect(filterOccurrences(restricted, { ...EMPTY_FILTERS, grade: 11 }, today).some((o) => o.exam.id === 'seed-w27-civics')).toBe(true);
    // Unassigned grades = not restricted (shown, marked unconfirmed in the UI).
    expect(filterOccurrences(restricted, { ...EMPTY_FILTERS, grade: 10 }, today).some((o) => o.exam.id === 'seed-w27-history')).toBe(true);
    expect(filterOccurrences(restricted, { ...EMPTY_FILTERS, grade: 10, showAll: true }, today).some((o) => o.exam.id === 'seed-w27-civics')).toBe(true);
  });

  it('never shows unpublished exams', () => {
    const hidden = occ.map((o) => ({ ...o, exam: { ...o.exam, visibility: 'draft' as const } }));
    expect(filterOccurrences(hidden, EMPTY_FILTERS, today)).toHaveLength(0);
  });
});

describe('Bagrut bilingual names and questionnaire numbers (מספר שאלון)', () => {
  const base = BAGRUT_WINTER_2027_SEED[1] as (typeof BAGRUT_WINTER_2027_SEED)[number];
  const { id: _id, ...input } = base;

  it('keeps questionnaire numbers as strings with leading zeros, several per exam', () => {
    const parsed = examInput.parse({ ...input, questionnaireNumbers: ['035481', '035482'] });
    expect(parsed.questionnaireNumbers).toEqual(['035481', '035482']);
  });

  it('rejects malformed or duplicate numbers', () => {
    expect(examInput.safeParse({ ...input, questionnaireNumbers: ['35-481'] }).success).toBe(false);
    expect(examInput.safeParse({ ...input, questionnaireNumbers: ['12'] }).success).toBe(false);
    expect(examInput.safeParse({ ...input, questionnaireNumbers: ['035481', '035481'] }).success).toBe(false);
  });

  it('ships no unverified questionnaire number as official', () => {
    expect(exams.every((e) => e.questionnaireNumbers.length === 0)).toBe(true);
    expect(exams.find((e) => e.id === 'seed-w27-math-1')?.officialName).toBe('מתמטיקה');
  });

  it('searches Arabic names, Hebrew names and questionnaire numbers', () => {
    const withNumbers = exams.map((e) => (e.id === 'seed-w27-math-1' ? { ...e, questionnaireNumbers: ['035481'] } : e));
    const occ = expandOccurrences(withNumbers);
    const ids = (query: string) => [...new Set(filterOccurrences(occ, { ...EMPTY_FILTERS, query, upcomingOnly: false, showAll: true }, '2026-11-01').map((o) => o.exam.id))];
    expect(ids('رياضيات')).toEqual(['seed-w27-math-1', 'seed-w27-math-2']);
    expect(ids('מתמטיקה')).toEqual(['seed-w27-math-1', 'seed-w27-math-2']);
    expect(ids('מָתֵמָטִיקָה')).toEqual(['seed-w27-math-1', 'seed-w27-math-2']); // niqqud ignored
    expect(ids('035481')).toEqual(['seed-w27-math-1']);
    expect(ids('35481')).toEqual(['seed-w27-math-1']);
  });
});
