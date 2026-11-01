/**
 * The daily schedule video shared by /program and /display.
 * Source of truth: public/scheduleVideo (live subscription). A video is shown
 * only while now < expiresAt; at that instant the UI switches to the empty
 * state by itself. Deleting the file is the server's job, not the browser's.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarX2, Play } from 'lucide-react';
import type { ScheduleVideoPublic } from '../../../shared/schemas';
import { formatDateOnly, weekdayOf } from '../../../shared/dates';
import { usePublicData } from '../../lib/public-data';
import { EMBED_ORIGINS, embedSrc } from '../../../shared/video-source';

export function useActiveScheduleVideo(): ScheduleVideoPublic | null {
  const { data } = usePublicData();
  const video = data.scheduleVideo ?? null;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!video) return;
    const ms = video.expiresAt - Date.now();
    if (ms <= 0) return;
    // Re-render exactly when the video expires (display only; capped for long timers).
    const id = window.setTimeout(() => setTick((t) => t + 1), Math.min(ms + 250, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [video]);
  return video && Date.now() < video.expiresAt ? video : null;
}

/** "يوم الأحد | 1 نوفمبر 2026" — from the date assigned at upload, not the visitor's clock. */
export function scheduleDateLabel(scheduleDate: string): string {
  return `يوم ${weekdayOf(scheduleDate)} | ${formatDateOnly(scheduleDate, { weekday: false })}`;
}

export function ScheduleVideoHeading({ video, as: Tag = 'h2' }: { video: ScheduleVideoPublic; as?: 'h1' | 'h2' }) {
  return (
    <div className="sv-heading">
      <Tag className="sv-title">البرنامج المدرسي اليومي</Tag>
      <p className="sv-date">
        <time dateTime={video.scheduleDate}>{scheduleDateLabel(video.scheduleDate)}</time>
      </p>
    </div>
  );
}

export function ScheduleVideoEmpty({ variant }: { variant: 'page' | 'tv' }) {
  return (
    <div className={`sv-empty sv-empty-${variant}`} role="status">
      <CalendarX2 aria-hidden="true" />
      <p className="sv-empty-title">لم يتم رفع برنامج المدرسة لهذا اليوم بعد</p>
      <p className="sv-empty-sub">سيظهر البرنامج المدرسي هنا فور رفعه من قبل إدارة مجلس الطلاب.</p>
    </div>
  );
}

export type PlayerStatus = { ok: true } | { ok: false; message: string };

const MEDIA_ERROR: Record<number, string> = {
  1: 'توقّف تحميل الفيديو.',
  2: 'انقطع الاتصال أثناء تحميل الفيديو. تحقّق من الإنترنت.',
  3: 'تعذّر فكّ ترميز الفيديو في هذا المتصفح. يُفضَّل MP4 (H.264/AAC).',
  4: 'تعذّر فتح الفيديو: الرابط غير متاح أو خاص أو بصيغة لا يدعمها المتصفح.',
};

const YT_ERROR: Record<number, string> = {
  2: 'رابط YouTube غير صالح.',
  5: 'تعذّر تشغيل فيديو YouTube في هذا المتصفح.',
  100: 'فيديو YouTube غير موجود أو خاص أو محذوف.',
  101: 'صاحب فيديو YouTube لا يسمح بتشغيله داخل مواقع أخرى.',
  150: 'صاحب فيديو YouTube لا يسمح بتشغيله داخل مواقع أخرى.',
  153: 'رفض YouTube تشغيل الفيديو المضمَّن في هذه الصفحة.',
};

function PlaybackError({ variant, message }: { variant: 'page' | 'tv'; message: string }) {
  return (
    <div className={`sv-empty sv-empty-${variant}`} role="alert">
      <p className="sv-empty-title">تعذّر تشغيل فيديو البرنامج</p>
      <p className="sv-empty-sub">{message}</p>
    </div>
  );
}

/**
 * Native player (uploaded file or direct MP4/WebM link): muted autoplay from the
 * start, endless loop, controls on /program. Autoplay is one explicit play()
 * call — its promise decides whether the Arabic play button is shown.
 * Keyed by video id, so it restarts only when a new source is published.
 */
function NativePlayer({ video, variant, onStatus }: { video: ScheduleVideoPublic; variant: 'page' | 'tv'; onStatus?: (s: PlayerStatus) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    el.play().then(
      () => setBlocked(false),
      (e: unknown) => {
        // NotAllowedError = autoplay policy. AbortError = source changed meanwhile (harmless).
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setBlocked(true);
      },
    );
  };

  useEffect(() => {
    setError(null);
    start();
  }, [video.id]);

  if (error) return <PlaybackError variant={variant} message={error} />;
  return (
    <div className={`sv-frame sv-frame-${variant}`}>
      <video
        key={video.id}
        ref={ref}
        className="sv-video"
        src={video.url}
        controls={variant === 'page'}
        muted
        loop
        playsInline
        preload="auto"
        aria-label={`فيديو البرنامج المدرسي ${scheduleDateLabel(video.scheduleDate)}`}
        onLoadedMetadata={() => onStatus?.({ ok: true })}
        onError={(e) => {
          const msg = MEDIA_ERROR[e.currentTarget.error?.code ?? 4] ?? MEDIA_ERROR[4] ?? '';
          setError(msg);
          onStatus?.({ ok: false, message: msg });
        }}
        onPlaying={() => setBlocked(false)}
      />
      {blocked ? (
        <button
          type="button"
          className="sv-play"
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            el.play().then(
              () => setBlocked(false),
              () => setError('المتصفح منع تشغيل الفيديو. جرّب متصفحًا آخر.'),
            );
          }}
        >
          <Play aria-hidden="true" />
          تشغيل البرنامج
        </button>
      ) : null}
    </div>
  );
}

/**
 * YouTube / Vimeo through the official embed (autoplay muted + loop
 * parameters). Errors (private, removed, embedding disabled) arrive from the
 * provider's postMessage API; messages are accepted only from this iframe.
 * If the provider blocks autoplay, its own play button is shown.
 */
function EmbedPlayer({ video, variant, onStatus }: { video: ScheduleVideoPublic & { provider: 'youtube' | 'vimeo' }; variant: 'page' | 'tv'; onStatus?: (s: PlayerStatus) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const src = useMemo(
    () => embedSrc(video.provider, video.url, video.videoId ?? '', { controls: variant === 'page', origin: window.location.origin }),
    [video.provider, video.url, video.videoId, variant],
  );
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    setError(null);
    const fail = (message: string) => {
      setError(message);
      statusRef.current?.({ ok: false, message });
    };
    const onMessage = (e: MessageEvent) => {
      if (!ref.current || e.source !== ref.current.contentWindow || !EMBED_ORIGINS.includes(e.origin)) return;
      let msg: { event?: string; info?: unknown; data?: { message?: string } };
      try {
        msg = typeof e.data === 'string' ? (JSON.parse(e.data) as typeof msg) : (e.data as typeof msg);
      } catch {
        return;
      }
      if (video.provider === 'youtube') {
        if (msg.event === 'onError') fail(YT_ERROR[Number(msg.info)] ?? 'تعذّر تشغيل فيديو YouTube.');
        else if (msg.event === 'onReady' || msg.event === 'initialDelivery') statusRef.current?.({ ok: true });
      } else if (msg.event === 'ready') {
        ref.current.contentWindow?.postMessage(JSON.stringify({ method: 'addEventListener', value: 'error' }), 'https://player.vimeo.com');
        statusRef.current?.({ ok: true });
      } else if (msg.event === 'error') {
        fail('تعذّر تشغيل فيديو Vimeo (قد يكون خاصًّا أو لا يسمح صاحبه بتضمينه).');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [video.id, video.provider]);

  if (error) return <PlaybackError variant={variant} message={error} />;
  return (
    <div className={`sv-frame sv-frame-${variant} sv-frame-embed`}>
      <iframe
        key={video.id}
        ref={ref}
        className="sv-embed"
        src={src}
        title={`فيديو البرنامج المدرسي ${scheduleDateLabel(video.scheduleDate)}`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => {
          // YouTube only reports events (incl. errors) after this handshake.
          if (video.provider === 'youtube') ref.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: video.id, channel: 'widget' }), new URL(video.url).origin);
        }}
      />
    </div>
  );
}

export function ScheduleVideoPlayer({ video, variant, onStatus }: { video: ScheduleVideoPublic; variant: 'page' | 'tv'; onStatus?: (s: PlayerStatus) => void }) {
  if (video.provider === 'youtube' || video.provider === 'vimeo') {
    return <EmbedPlayer key={video.id} video={video as ScheduleVideoPublic & { provider: 'youtube' | 'vimeo' }} variant={variant} onStatus={onStatus} />;
  }
  return <NativePlayer key={video.id} video={video} variant={variant} onStatus={onStatus} />;
}
