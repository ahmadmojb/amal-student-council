import { describe, expect, it } from 'vitest';
import { benefitState, isAnnouncementLive, isScheduleNoticeLive, sortAnnouncements } from '../../shared/visibility';
import { DEFAULT_LEAGUE_CONFIG } from '../../shared/defaults';
import { leagueConfigInput, activityInput, announcementInput, benefitInput, dateOnly, examInput, safeUrl, type Announcement, type Benefit } from '../../shared/schemas';

const ann = (o: Partial<Announcement>): Announcement => ({ ...announcementInput.parse({ title: 't', body: 'b', publishDate: '2026-10-01', visibility: 'published' }), id: Math.random().toString(), createdAt: 0, updatedAt: 0, ...o });
const ben = (o: Partial<Benefit>): Benefit => ({ ...benefitInput.parse({ businessName: 'x', category: 'c', title: 't', description: 'd', visibility: 'published' }), id: 'b', createdAt: 0, updatedAt: 0, ...o });

describe('publication and automatic expiry', () => {
  it('hides drafts, future and expired announcements', () => {
    const today = '2026-10-31';
    expect(isAnnouncementLive(ann({}), today)).toBe(true);
    expect(isAnnouncementLive(ann({ visibility: 'draft' }), today)).toBe(false);
    expect(isAnnouncementLive(ann({ publishDate: '2026-11-01' }), today)).toBe(false);
    expect(isAnnouncementLive(ann({ expiresOn: '2026-10-31' }), today)).toBe(true); // valid through its last day
    expect(isAnnouncementLive(ann({ expiresOn: '2026-10-30' }), today)).toBe(false);
  });

  it('sorts urgent → important → normal, newest first', () => {
    const list = sortAnnouncements([ann({ id: 'n', priority: 'normal', publishDate: '2026-10-30' }), ann({ id: 'u', priority: 'urgent', publishDate: '2026-10-01' }), ann({ id: 'i', priority: 'important' })]);
    expect(list.map((a) => a.id)).toEqual(['u', 'i', 'n']);
  });

  it('expires benefits automatically even when still marked published', () => {
    expect(benefitState(ben({ expiresOn: '2026-10-30' }), '2026-10-31')).toBe('expired');
    expect(benefitState(ben({ startsOn: '2026-11-05' }), '2026-10-31')).toBe('upcoming');
    expect(benefitState(ben({ temporarilyUnavailable: true }), '2026-10-31')).toBe('unavailable');
    expect(benefitState(ben({ visibility: 'draft' }), '2026-10-31')).toBe('hidden');
    expect(benefitState(ben({}), '2026-10-31')).toBe('active');
  });

  it('schedule notices respect start and end days', () => {
    const n = { id: 'n', title: 't', body: '', activeOn: '2026-11-01', expiresOn: '2026-11-01', order: 0, visibility: 'published' as const, createdAt: 0, updatedAt: 0 };
    expect(isScheduleNoticeLive(n, '2026-10-31')).toBe(false);
    expect(isScheduleNoticeLive(n, '2026-11-01')).toBe(true);
    expect(isScheduleNoticeLive(n, '2026-11-02')).toBe(false);
  });
});

describe('validation schemas', () => {
  it('rejects impossible dates and accepts real ones', () => {
    expect(dateOnly.safeParse('2027-02-30').success).toBe(false);
    expect(dateOnly.safeParse('2027-2-3').success).toBe(false);
    expect(dateOnly.safeParse('2028-02-29').success).toBe(true);
  });

  it('only accepts http(s) or site-relative URLs', () => {
    expect(safeUrl.safeParse('javascript:alert(1)').success).toBe(false);
    expect(safeUrl.safeParse('//evil.example').success).toBe(false);
    expect(safeUrl.safeParse('https://example.org').success).toBe(true);
    expect(safeUrl.safeParse('/uploads/a.webp').success).toBe(true);
    expect(safeUrl.safeParse('').success).toBe(true);
  });

  it('requires a title and body for announcements', () => {
    const r = announcementInput.safeParse({ title: ' ', body: '', publishDate: '2026-10-31' });
    expect(r.success).toBe(false);
  });

  it('rejects unverified time formats and empty date lists for exams', () => {
    expect(examInput.safeParse({ season: 's', subjectKey: 'm', nameAr: 'م', dates: [], examType: 'written' }).success).toBe(false);
    expect(examInput.safeParse({ season: 's', subjectKey: 'm', nameAr: 'م', dates: ['2027-01-11'], examType: 'written', verifiedTime: '9am' }).success).toBe(false);
  });

  it('refuses activity photos without explicit publication approval', () => {
    const base = { title: 't', description: 'd', date: '2026-10-31', category: 'c' };
    expect(activityInput.safeParse({ ...base, photos: [{ url: '/uploads/a.webp', alt: '', approved: false }] }).success).toBe(false);
    expect(activityInput.safeParse({ ...base, photos: [{ url: '/uploads/a.webp', alt: '', approved: true }] }).success).toBe(true);
  });
});

describe('defaults', () => {
  it('the zod-free league default equals the schema default', () => {
    expect(DEFAULT_LEAGUE_CONFIG).toEqual(leagueConfigInput.parse({}));
  });
});
