/**
 * Effective public status. Publication alone is not enough: anything with an
 * expiry date stops being public on that date even if nobody unpublished it.
 * Used by the server when projecting to the public tree AND by the client at
 * render time (time passes after the projection was written).
 */
import type { Announcement, Benefit, ScheduleNotice } from './schemas.js';

export function isExpired(expiresOn: string | undefined, today: string): boolean {
  return Boolean(expiresOn) && (expiresOn as string) < today;
}

export function isAnnouncementLive(a: Announcement, today: string): boolean {
  return a.visibility === 'published' && a.publishDate <= today && !isExpired(a.expiresOn, today);
}

export function isScheduleNoticeLive(n: ScheduleNotice, today: string): boolean {
  if (n.visibility !== 'published') return false;
  if (n.activeOn && n.activeOn > today) return false;
  return !isExpired(n.expiresOn, today);
}

export type BenefitState = 'active' | 'upcoming' | 'expired' | 'unavailable' | 'hidden';

export function benefitState(b: Benefit, today: string): BenefitState {
  if (b.visibility !== 'published') return 'hidden';
  if (isExpired(b.expiresOn, today)) return 'expired';
  if (b.temporarilyUnavailable) return 'unavailable';
  if (b.startsOn && b.startsOn > today) return 'upcoming';
  return 'active';
}

const PRIORITY_RANK = { urgent: 0, important: 1, normal: 2 } as const;

export function sortAnnouncements(list: Announcement[]): Announcement[] {
  return [...list].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.publishDate.localeCompare(a.publishDate) ||
      b.updatedAt - a.updatedAt,
  );
}

export function values<T>(rec: Record<string, T> | undefined | null): T[] {
  return rec ? Object.values(rec) : [];
}
