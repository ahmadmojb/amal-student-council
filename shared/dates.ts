/**
 * Date handling rules (see docs/architecture.md → "Dates"):
 * - Date-only values (exam days, expiry days) are stored as 'YYYY-MM-DD' strings
 *   and are NEVER passed through `new Date('YYYY-MM-DD')`, which parses as UTC
 *   midnight and can shift the displayed day.
 * - "Today" is always computed in Asia/Jerusalem.
 * - Timestamps (createdAt, etc.) are epoch milliseconds, displayed in Asia/Jerusalem.
 */
export const SCHOOL_TZ = 'Asia/Jerusalem';
/** Arabic with Latin (Western) digits — the convention used in Arab schools in Israel. */
export const LOCALE = 'ar-u-nu-latn';

const isoFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in the school's timezone as YYYY-MM-DD. */
export function todayInSchool(now: Date = new Date()): string {
  return isoFmt.format(now);
}

export function parseDateOnly(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** A Date anchored at 12:00 UTC of the given day: safe to format with timeZone 'UTC'. */
function anchor(value: string): Date | null {
  const p = parseDateOnly(value);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m - 1, p.d, 12));
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, opts);
    fmtCache.set(key, f);
  }
  return f;
}

/** e.g. "الاثنين، 4 يناير 2027" */
export function formatDateOnly(value: string, options: { weekday?: boolean; year?: boolean } = {}): string {
  const d = anchor(value);
  if (!d) return value;
  const { weekday = true, year = true } = options;
  const key = `d-${weekday}-${year}`;
  return fmt(key, {
    timeZone: 'UTC',
    weekday: weekday ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: year ? 'numeric' : undefined,
  }).format(d);
}

export function weekdayOf(value: string): string {
  const d = anchor(value);
  return d ? fmt('wd', { timeZone: 'UTC', weekday: 'long' }).format(d) : '';
}

/** Day of week 0 (Sunday) … 6 (Saturday) for a date-only string. */
export function dayOfWeek(value: string): number {
  const d = anchor(value);
  return d ? d.getUTCDay() : 0;
}

export function monthLabel(year: number, month1: number): string {
  return fmt('ml', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month1 - 1, 15, 12)));
}

export function formatTimestamp(ms: number, withTime = true): string {
  return fmt(`ts-${withTime}`, {
    timeZone: SCHOOL_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: withTime ? '2-digit' : undefined,
    minute: withTime ? '2-digit' : undefined,
    hourCycle: 'h23',
  }).format(new Date(ms));
}

export function formatClock(now: Date): string {
  return fmt('clock', { timeZone: SCHOOL_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

export function formatLongToday(now: Date): string {
  return fmt('today', { timeZone: SCHOOL_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). Positive if `to` is later. */
export function daysBetween(from: string, to: string): number {
  const a = anchor(from);
  const b = anchor(to);
  if (!a || !b) return NaN;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addDays(value: string, days: number): string {
  const d = anchor(value);
  if (!d) return value;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Arabic phrase for "in N days". */
export function relativeDays(n: number): string {
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غدًا';
  if (n === 2) return 'بعد يومين';
  if (n > 2 && n <= 10) return `بعد ${n} أيام`;
  if (n > 10) return `بعد ${n} يومًا`;
  if (n === -1) return 'أمس';
  return `قبل ${Math.abs(n)} ${Math.abs(n) <= 10 ? 'أيام' : 'يومًا'}`;
}

/** UTC offset (ms) of the school timezone at the given instant. */
function schoolOffsetMs(at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHOOL_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/**
 * Epoch ms of 00:00 (start of day) of a YYYY-MM-DD date in Asia/Jerusalem.
 * Computed from the zone's real offset on that date, so DST changes are exact.
 */
export function startOfSchoolDay(value: string): number {
  const p = parseDateOnly(value);
  if (!p) return NaN;
  const naive = Date.UTC(p.y, p.m - 1, p.d);
  let guess = naive - schoolOffsetMs(naive);
  guess = naive - schoolOffsetMs(guess); // second pass settles DST edges
  return guess;
}

/** The midnight that ENDS the given school day (i.e. 00:00 of the next calendar day, Asia/Jerusalem). */
export function endOfSchoolDay(value: string): number {
  return startOfSchoolDay(addDays(value, 1));
}
