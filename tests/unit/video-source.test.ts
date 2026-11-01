import { describe, expect, it } from 'vitest';
import { embedSrc, parseExternalVideoUrl } from '../../shared/video-source';

const ok = (u: string) => {
  const r = parseExternalVideoUrl(u);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const err = (u: string) => {
  const r = parseExternalVideoUrl(u);
  if (r.ok) throw new Error(`accepted ${u}`);
  return r.error;
};

describe('external daily-video links', () => {
  it('recognises direct MP4/WebM files', () => {
    expect(ok('https://cdn.example.org/v/today.mp4?token=1#t=3')).toMatchObject({ provider: 'direct', mimeType: 'video/mp4', playUrl: 'https://cdn.example.org/v/today.mp4?token=1' });
    expect(ok('https://cdn.example.org/v/today.webm')).toMatchObject({ provider: 'direct', mimeType: 'video/webm' });
    expect(ok('https://cdn.example.org/v/today.M4V').mimeType).toBe('video/mp4');
  });

  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ])('YouTube %s → official nocookie embed', (u) => {
    expect(ok(u)).toEqual({ provider: 'youtube', videoId: 'dQw4w9WgXcQ', canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', playUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' });
  });

  it('Vimeo public and unlisted links → official player', () => {
    expect(ok('https://vimeo.com/76979871')).toMatchObject({ provider: 'vimeo', playUrl: 'https://player.vimeo.com/video/76979871' });
    expect(ok('https://vimeo.com/76979871/abcdef1234')).toMatchObject({ playUrl: 'https://player.vimeo.com/video/76979871?h=abcdef1234' });
    expect(ok('https://player.vimeo.com/video/76979871?h=abcdef1234')).toMatchObject({ canonicalUrl: 'https://vimeo.com/76979871/abcdef1234' });
    expect(ok('https://vimeo.com/channels/staffpicks/76979871').videoId).toBe('76979871');
  });

  it('rejects unsafe, private and non-video links with Arabic reasons', () => {
    expect(err('http://cdn.example.org/a.mp4')).toMatch(/https/);
    expect(err('https://dsp.shahaf.info/Pages/Display.aspx?id=b5134001&dev=50295367')).toMatch(/shahaf/);
    expect(err('https://user:pw@cdn.example.org/a.mp4')).toMatch(/كلمة مرور/);
    expect(err('https://localhost/a.mp4')).toMatch(/عام/);
    expect(err('https://10.0.0.5/a.mp4')).toMatch(/عام/);
    expect(err('https://[::1]/a.mp4')).toMatch(/عام/);
    expect(err('https://intranet/a.mp4')).toMatch(/عام/);
    expect(err('https://cdn.example.org:8443/a.mp4')).toMatch(/منفذ/);
    expect(err('https://example.org/watch-this')).toMatch(/YouTube|MP4/);
    expect(err('https://www.youtube.com/playlist?list=PL123')).toMatch(/YouTube/);
    expect(err('https://www.youtube.com/watch?v=short')).toMatch(/YouTube/);
    expect(err('https://vimeo.com/channels/staffpicks')).toMatch(/Vimeo/);
    expect(err('javascript:alert(1)')).toMatch(/https/);
    expect(err('')).toMatch(/أدخل/);
  });

  it('embed URLs request muted autoplay and looping', () => {
    const yt = new URL(embedSrc('youtube', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ', { controls: true, origin: 'https://x.org' }));
    expect(Object.fromEntries(yt.searchParams)).toMatchObject({ autoplay: '1', mute: '1', loop: '1', playlist: 'dQw4w9WgXcQ', playsinline: '1', enablejsapi: '1', origin: 'https://x.org' });
    const vm = new URL(embedSrc('vimeo', 'https://player.vimeo.com/video/1?h=abcdef12', '1', { controls: false }));
    expect(Object.fromEntries(vm.searchParams)).toMatchObject({ h: 'abcdef12', autoplay: '1', muted: '1', loop: '1' });
  });
});
