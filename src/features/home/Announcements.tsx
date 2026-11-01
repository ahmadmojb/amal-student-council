import { useMemo } from 'react';
import { AlertOctagon, Megaphone } from 'lucide-react';
import type { Announcement } from '../../../shared/schemas';
import { isAnnouncementLive, sortAnnouncements, values } from '../../../shared/visibility';
import { formatDateOnly } from '../../../shared/dates';
import { usePublicData } from '../../lib/public-data';
import { useToday } from '../../hooks/useToday';

export const PRIORITY_LABEL: Record<Announcement['priority'], string> = { normal: 'عادي', important: 'مهم', urgent: 'عاجل' };

export function useLiveAnnouncements(): Announcement[] {
  const { data } = usePublicData();
  const today = useToday();
  return useMemo(() => sortAnnouncements(values(data.announcements).filter((a) => isAnnouncementLive(a, today))), [data.announcements, today]);
}

export function AnnouncementItem({ a }: { a: Announcement }) {
  return (
    <article className={`announcement announcement-${a.priority}`} aria-labelledby={`ann-${a.id}`}>
      <div className="announcement-meta">
        {a.priority !== 'normal' ? (
          <span className={`badge ${a.priority === 'urgent' ? 'badge-danger' : 'badge-warning'}`}>
            {a.priority === 'urgent' ? <AlertOctagon aria-hidden="true" /> : <Megaphone aria-hidden="true" />}
            {PRIORITY_LABEL[a.priority]}
          </span>
        ) : null}
        <time dateTime={a.publishDate} className="muted xsmall">
          {formatDateOnly(a.publishDate)}
        </time>
      </div>
      <h3 id={`ann-${a.id}`}>{a.title}</h3>
      <p className="announcement-body">{a.body}</p>
      {a.imageUrl ? <img src={a.imageUrl} alt={a.imageAlt} loading="lazy" className="announcement-img" /> : null}
      {a.expiresOn ? <p className="xsmall muted">ساري حتى {formatDateOnly(a.expiresOn, { weekday: false })}</p> : null}
    </article>
  );
}
