import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { Activity } from '../../../shared/schemas';
import { formatDateOnly } from '../../../shared/dates';

export function ActivityCard({ a }: { a: Activity }) {
  const cover = a.photos[0];
  return (
    <article className="activity-card" aria-labelledby={`act-${a.id}`}>
      <Link to={`/activities/${a.id}`} className="activity-link">
        <div className="activity-cover">
          {cover ? <img src={cover.url} alt={cover.alt} loading="lazy" /> : <div className="activity-cover-empty" aria-hidden="true" />}
        </div>
        <div className="activity-text">
          <div className="row">
            <span className="badge badge-lime">{a.category}</span>
            {a.featured ? (
              <span className="badge badge-info">
                <Star aria-hidden="true" /> مميّز
              </span>
            ) : null}
          </div>
          <h3 id={`act-${a.id}`}>{a.title}</h3>
          <time dateTime={a.date} className="xsmall muted">
            {formatDateOnly(a.date)}
          </time>
        </div>
      </Link>
    </article>
  );
}
