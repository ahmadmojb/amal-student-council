import { useMemo } from 'react';
import { MonitorPlay } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDocumentTitle, useToday } from '../../hooks/useToday';
import { PublicDataGate, SkeletonLines } from '../../components/ui/states';
import { usePublicData } from '../../lib/public-data';
import { isScheduleNoticeLive, values } from '../../../shared/visibility';
import { ScheduleVideoEmpty, ScheduleVideoHeading, ScheduleVideoPlayer, useActiveScheduleVideo } from './ScheduleVideo';

export default function ProgramPage() {
  useDocumentTitle('البرنامج المدرسي اليومي');
  const { data } = usePublicData();
  const today = useToday();
  const video = useActiveScheduleVideo();
  const notices = useMemo(() => values(data.scheduleNotices).filter((n) => isScheduleNoticeLive(n, today)).sort((a, b) => a.order - b.order), [data.scheduleNotices, today]);

  return (
    <div className="container program-layout program-video-page">
      <section className="program-main" aria-label="البرنامج المدرسي اليومي">
        <PublicDataGate skeleton={<SkeletonLines count={1} height={420} />}>
          {video ? (
            <>
              <ScheduleVideoHeading video={video} as="h1" />
              <ScheduleVideoPlayer video={video} variant="page" />
            </>
          ) : (
            <>
              <div className="sv-heading">
                <h1 className="sv-title">البرنامج المدرسي اليومي</h1>
              </div>
              <ScheduleVideoEmpty variant="page" />
            </>
          )}
        </PublicDataGate>
        <div className="program-tools row">
          <Link to="/display" className="btn btn-sm btn-ghost">
            <MonitorPlay aria-hidden="true" /> وضع شاشة الممرّ
          </Link>
        </div>
      </section>
      <aside className="program-side" aria-labelledby="program-notices">
        <h2 id="program-notices">ملاحظات المجلس لهذا اليوم</h2>
        {notices.length === 0 ? (
          <p className="small muted">لا توجد ملاحظات لهذا اليوم.</p>
        ) : (
          <ul className="notice-list">
            {notices.map((n) => (
              <li key={n.id}>
                <strong>{n.title}</strong>
                {n.body ? <p className="small">{n.body}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
