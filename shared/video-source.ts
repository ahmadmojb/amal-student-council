/**
 * External daily-video links: syntax + allowlist validation only.
 *
 * The server NEVER fetches these URLs (no proxy, no SSRF surface). A link is
 * accepted only if it is HTTPS, public-looking, and either
 *  - a direct .mp4/.m4v/.webm file (played by the native <video> element), or
 *  - a YouTube / Vimeo video link (played through the provider's official embed).
 * Whether the video actually plays is checked in the admin's browser preview.
 */
export type ExternalProvider = 'direct' | 'youtube' | 'vimeo';

export interface ParsedVideoUrl {
  provider: ExternalProvider;
  /** Normalised link stored in the record. */
  canonicalUrl: string;
  /** What the player loads: the file URL (direct) or the official embed URL. */
  playUrl: string;
  videoId?: string;
  mimeType?: 'video/mp4' | 'video/webm';
}

export type ParseResult = { ok: true; value: ParsedVideoUrl } | { ok: false; error: string };

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export const EMBED_ORIGINS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com'];

const ERR_UNSUPPORTED =
  'هذا الرابط ليس ملف فيديو مباشرًا (MP4/WebM) ولا رابط فيديو من YouTube أو Vimeo. استخدم رابطًا مباشرًا عامًّا لملف الفيديو أو رابطًا من منصة مدعومة.';

function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return true;
  if (!host.includes('.')) return true; // single-label (intranet) names
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // any IPv4 literal
  if (host.startsWith('[')) return true; // any IPv6 literal
  return false;
}

export function parseExternalVideoUrl(raw: string): ParseResult {
  const input = (raw ?? '').trim();
  if (!input) return { ok: false, error: 'أدخل رابط الفيديو.' };
  if (input.length > 2048) return { ok: false, error: 'الرابط طويل جدًا.' };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: 'صيغة الرابط غير صحيحة. انسخ الرابط كاملًا بدءًا من https://' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'يجب أن يكون الرابط آمنًا ويبدأ بـ https://' };
  if (url.username || url.password) return { ok: false, error: 'لا يُسمح بروابط تحتوي على اسم مستخدم أو كلمة مرور.' };
  if (url.port && url.port !== '443') return { ok: false, error: 'لا يُسمح بروابط تستخدم منفذًا خاصًّا.' };
  const host = url.hostname.toLowerCase();
  if (host.includes('shahaf')) {
    return { ok: false, error: 'رابط شاشة البرنامج القديمة (dsp.shahaf.info) ليس فيديو ولا يُسمح باستخدامه. ارفع فيديو البرنامج أو استخدم رابط فيديو مباشرًا.' };
  }
  if (isPrivateHost(host)) return { ok: false, error: 'يجب أن يكون الرابط لموقع عام على الإنترنت يستطيع جميع الزوار فتحه.' };

  if (YT_HOSTS.has(host)) {
    let id: string | null = null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') id = parts[0] ?? null;
    else if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null;
    if (!id || !YT_ID.test(id)) return { ok: false, error: 'رابط YouTube لا يشير إلى فيديو محدّد. انسخ رابط الفيديو نفسه (وليس رابط قناة أو قائمة تشغيل).' };
    return {
      ok: true,
      value: { provider: 'youtube', videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}`, playUrl: `https://www.youtube-nocookie.com/embed/${id}` },
    };
  }

  if (VIMEO_HOSTS.has(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    let id: string | undefined;
    let hash = url.searchParams.get('h') ?? undefined;
    if (host === 'player.vimeo.com') {
      if (parts[0] === 'video' && /^\d+$/.test(parts[1] ?? '')) id = parts[1];
    } else {
      const idx = parts.findIndex((p) => /^\d+$/.test(p));
      if (idx >= 0) {
        id = parts[idx];
        const next = parts[idx + 1];
        if (!hash && next && /^[0-9a-f]{6,20}$/i.test(next)) hash = next;
      }
    }
    if (!id || id.length > 12) return { ok: false, error: 'رابط Vimeo لا يشير إلى فيديو محدّد. انسخ رابط الفيديو نفسه.' };
    if (hash && !/^[0-9a-f]{6,20}$/i.test(hash)) hash = undefined;
    return {
      ok: true,
      value: {
        provider: 'vimeo',
        videoId: id,
        canonicalUrl: `https://vimeo.com/${id}${hash ? `/${hash}` : ''}`,
        playUrl: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}`,
      },
    };
  }

  const ext = url.pathname.toLowerCase().match(/\.(mp4|m4v|webm)$/)?.[1];
  if (ext) {
    url.hash = '';
    return { ok: true, value: { provider: 'direct', canonicalUrl: url.href, playUrl: url.href, mimeType: ext === 'webm' ? 'video/webm' : 'video/mp4' } };
  }
  return { ok: false, error: ERR_UNSUPPORTED };
}

/** Provider embed URL with autoplay (muted) + loop parameters. */
export function embedSrc(provider: 'youtube' | 'vimeo', playUrl: string, videoId: string, opts: { controls: boolean; origin?: string }): string {
  const u = new URL(playUrl);
  if (provider === 'youtube') {
    u.searchParams.set('autoplay', '1');
    u.searchParams.set('mute', '1');
    u.searchParams.set('loop', '1');
    u.searchParams.set('playlist', videoId); // required by YouTube for single-video loop
    u.searchParams.set('playsinline', '1');
    u.searchParams.set('rel', '0');
    u.searchParams.set('controls', opts.controls ? '1' : '0');
    u.searchParams.set('enablejsapi', '1');
    if (opts.origin) u.searchParams.set('origin', opts.origin);
  } else {
    u.searchParams.set('autoplay', '1');
    u.searchParams.set('muted', '1');
    u.searchParams.set('loop', '1');
    u.searchParams.set('playsinline', '1');
    u.searchParams.set('dnt', '1');
  }
  return u.href;
}

export const PROVIDER_LABEL: Record<'uploaded' | ExternalProvider, string> = {
  uploaded: 'ملف مرفوع',
  direct: 'رابط فيديو مباشر',
  youtube: 'YouTube',
  vimeo: 'Vimeo',
};
