/**
 * Corridor TV display (/display): 16:9, large type, no site navigation.
 * Shows the same daily schedule video as /program (public/scheduleVideo),
 * muted autoplay + loop. The clock and rotating notices are separate leaf
 * components, so their timers never re-render the video element.
 */
import { useEffect, useMemo, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { usePublicData } from '../../lib/public-data';
import { useDocumentTitle, useNow, useOnline, useToday } from '../../hooks/useToday';
import { formatClock, formatLongToday } from '../../../shared/dates';
import { isAnnouncementLive, isScheduleNoticeLive, sortAnnouncements, values } from '../../../shared/visibility';
import { SchoolMark } from '../../components/layout/SchoolMark';
import { scheduleDateLabel, ScheduleVideoEmpty, ScheduleVideoPlayer, useActiveScheduleVideo } from './ScheduleVideo';

interface DisplayItem {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
}

function Clock() {
  const now = useNow(1000);
  return (
    <div className="tv-clock">
      <span className="tv-time num">{formatClock(now)}</span>
      <span className="tv-date">{formatLongToday(now)}</span>
    </div>
  );
}

function ConnectionStatus() {
  const online = useOnline();
  const { state } = usePublicData();
  const ok = online && state !== 'error';
  return (
    <div className={`tv-status ${ok ? 'tv-ok' : 'tv-bad'}`} role="status">
      {ok ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
      <span>{!online ? 'لا يوجد اتصال بالإنترنت' : state === 'error' ? 'تعذّر تحديث البيانات' : 'متصل'}</span>
    </div>
  );
}

function TvSchedule() {
  const video = useActiveScheduleVideo();
  const { state } = usePublicData();
  if (state === 'loading') return <div className="tv-wait">جارٍ تجهيز الشاشة…</div>;
  if (!video) return <ScheduleVideoEmpty variant="tv" />;
  return (
    <div className="tv-video">
      <div className="tv-video-heading">
        <h1>البرنامج المدرسي اليومي</h1>
        <p>
          <time dateTime={video.scheduleDate}>{scheduleDateLabel(video.scheduleDate)}</time>
        </p>
      </div>
      <ScheduleVideoPlayer video={video} variant="tv" />
    </div>
  );
}

function NoticeRotator({ items, seconds }: { items: DisplayItem[]; seconds: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % items.length), seconds * 1000);
    return () => window.clearInterval(id);
  }, [items.length, seconds]);
  const item = items[index % Math.max(items.length, 1)];
  if (!item) return null;
  return (
    <div className="tv-notice" aria-live="polite">
      <p className="tv-notice-label">{item.urgent ? 'إعلان عاجل' : 'من مجلس الطلاب'}</p>
      <h2 className={item.urgent ? 'tv-urgent' : undefined}>{item.title}</h2>
      {item.body ? <p className="tv-notice-body">{item.body}</p> : null}
      {items.length > 1 ? (
        <div className="tv-dots" aria-hidden="true">
          {items.map((it, i) => (
            <span key={it.id} className={i === index % items.length ? 'on' : undefined} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Keeps the TV screen awake where the browser supports it. */
function useWakeLock(): void {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const request = () => {
      if (document.visibilityState === 'visible' && nav.wakeLock) nav.wakeLock.request('screen').then((l) => (lock = l)).catch(() => undefined);
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

export default function DisplayPage() {
  useDocumentTitle('شاشة الممرّ');
  useWakeLock();
  const { data } = usePublicData();
  const today = useToday();

  const items = useMemo<DisplayItem[]>(() => {
    const notices = values(data.scheduleNotices)
      .filter((n) => isScheduleNoticeLive(n, today))
      .sort((a, b) => a.order - b.order)
      .map((n) => ({ id: `n-${n.id}`, title: n.title, body: n.body, urgent: false }));
    const anns = sortAnnouncements(values(data.announcements).filter((a) => isAnnouncementLive(a, today) && (a.showOnDisplay || a.priority === 'urgent'))).map((a) => ({
      id: `a-${a.id}`,
      title: a.title,
      body: a.body.length > 280 ? `${a.body.slice(0, 277)}…` : a.body,
      urgent: a.priority === 'urgent',
    }));
    return [...anns.filter((a) => a.urgent), ...notices, ...anns.filter((a) => !a.urgent)];
  }, [data.scheduleNotices, data.announcements, today]);

  return (
    <div className={`tv ${items.length ? 'tv-with-side' : ''}`}>
      <header className="tv-top">
        <div className="tv-brand">
          <SchoolMark size={64} logoUrl={data.settings?.logoUrl} />
          <div>
            <strong>مجلس الطلاب</strong>
            <span>مدرسة عمال الثانوية الشاملة — الطيبة</span>
          </div>
        </div>
        <Clock />
        <ConnectionStatus />
      </header>
      <main className="tv-main">
        <section className="tv-schedule" aria-label="البرنامج اليومي الرسمي">
          <TvSchedule />
        </section>
        <aside className="tv-side" aria-label="إعلانات المجلس" hidden={items.length === 0}>
          <NoticeRotator items={items} seconds={data.settings?.displayRotationSeconds ?? 12} />
        </aside>
      </main>
    </div>
  );
}
