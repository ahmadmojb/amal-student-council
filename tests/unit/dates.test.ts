import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, dayOfWeek, formatDateOnly, formatTimestamp, relativeDays, todayInSchool, weekdayOf } from '../../shared/dates';

describe('dates (Asia/Jerusalem, date-only safety)', () => {
  it('formats date-only values in Arabic without UTC shift', () => {
    expect(formatDateOnly('2027-01-04')).toBe('الاثنين، 4 يناير 2027');
    expect(formatDateOnly('2027-02-04', { weekday: false })).toBe('4 فبراير 2027');
  });

  it('gives the correct Arabic weekday for every seeded exam date', () => {
    expect(weekdayOf('2026-11-24')).toBe('الثلاثاء');
    expect(weekdayOf('2026-12-14')).toBe('الاثنين');
    expect(weekdayOf('2027-01-25')).toBe('الاثنين');
    expect(dayOfWeek('2027-01-03')).toBe(0); // Sunday
  });

  it('computes "today" in the school timezone, not UTC', () => {
    // 22:30 UTC on 31 Oct = 00:30 on 1 Nov in Israel (UTC+2 in winter)
    expect(todayInSchool(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11-01');
    // 20:30 UTC on 30 Jun = 23:30 in Israel (UTC+3 in summer)
    expect(todayInSchool(new Date('2026-06-30T20:30:00Z'))).toBe('2026-06-30');
  });

  it('does day arithmetic across month/DST boundaries', () => {
    expect(daysBetween('2026-10-31', '2027-01-04')).toBe(65);
    expect(daysBetween('2027-03-25', '2027-03-27')).toBe(2);
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('returns the input unchanged for malformed dates', () => {
    expect(formatDateOnly('not-a-date')).toBe('not-a-date');
    expect(Number.isNaN(daysBetween('x', '2027-01-01'))).toBe(true);
  });

  it('formats timestamps in Asia/Jerusalem with Latin digits', () => {
    const s = formatTimestamp(Date.UTC(2026, 9, 31, 20, 5));
    expect(s).toContain('22:05');
    expect(s).toMatch(/2026/);
  });

  it('has Arabic relative phrases', () => {
    expect(relativeDays(0)).toBe('اليوم');
    expect(relativeDays(1)).toBe('غدًا');
    expect(relativeDays(5)).toBe('بعد 5 أيام');
    expect(relativeDays(30)).toBe('بعد 30 يومًا');
  });
});

describe('daily video expiry (midnight that ends the upload day, Asia/Jerusalem)', () => {
  it('is 00:00 of the next calendar day, not +24h', async () => {
    const { endOfSchoolDay, startOfSchoolDay, todayInSchool } = await import('../../shared/dates');
    // Sunday 1 Nov 2026 (winter, UTC+2): expires Monday 00:00 = 2026-11-01T22:00Z
    expect(new Date(endOfSchoolDay('2026-11-01')).toISOString()).toBe('2026-11-01T22:00:00.000Z');
    // DST ends 25 Oct 2026: a 25-hour day
    expect(new Date(endOfSchoolDay('2026-10-24')).toISOString()).toBe('2026-10-24T21:00:00.000Z');
    expect(endOfSchoolDay('2026-10-25') - startOfSchoolDay('2026-10-25')).toBe(25 * 3600_000);
    // DST starts 26 Mar 2027: a 23-hour day
    expect(endOfSchoolDay('2027-03-26') - startOfSchoolDay('2027-03-26')).toBe(23 * 3600_000);
    // An upload at 07:00 Sunday belongs to Sunday and expires exactly at Monday 00:00
    const upload = new Date('2026-11-01T05:00:00Z'); // 07:00 Jerusalem
    const day = todayInSchool(upload);
    expect(day).toBe('2026-11-01');
    const exp = endOfSchoolDay(day);
    expect(todayInSchool(new Date(exp - 1))).toBe('2026-11-01');
    expect(todayInSchool(new Date(exp))).toBe('2026-11-02');
    // An upload at 23:59 still expires at that same midnight (one minute later)
    expect(endOfSchoolDay(todayInSchool(new Date('2026-11-01T21:59:00Z')))).toBe(exp);
  });
});
