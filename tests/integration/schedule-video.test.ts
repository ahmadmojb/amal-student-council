import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminAgent, makeApp } from './helpers';
import type { ScheduleVideoRecord } from '../../shared/schemas';

const WEBM = readFileSync('tests/fixtures/schedule.webm');
const MP4 = readFileSync('tests/fixtures/schedule.mp4');
const CRON = 'c'.repeat(40);
const pathOf = (rec: ScheduleVideoRecord): string => (rec.source.type === 'uploaded' ? rec.source.objectPath : '');

let cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
  vi.restoreAllMocks();
});

async function setup(env: Record<string, string> = {}) {
  const ctx = await makeApp({ CRON_SECRET: CRON, ...env });
  cleanups.push(ctx.cleanup);
  const admin = await adminAgent(ctx.app);
  const upload = (buf: Buffer, name: string) =>
    admin.agent.post('/api/admin/schedule-video/upload').set({ 'x-amal-request': '1', origin: 'http://127.0.0.1', host: '127.0.0.1' }).attach('video', buf, name);
  const file = (rec: ScheduleVideoRecord) => join(ctx.uploadsDir, pathOf(rec));
  return { ...ctx, admin, upload, file };
}

describe('daily schedule video — upload', () => {
  it('publishes a valid WebM to everyone, with the upload day and midnight expiry', async () => {
    const { app, upload, file, admin } = await setup();
    expect((await request(app).get('/api/schedule-video')).body.video).toBeNull();
    const res = await upload(WEBM, 'program.webm');
    expect(res.status).toBe(201);
    const rec = res.body as ScheduleVideoRecord;
    expect(rec.source.type).toBe('uploaded');
    expect(rec.source.type === 'uploaded' && rec.source.mimeType).toBe('video/webm');
    expect(rec.source.type === 'uploaded' && rec.source.size).toBe(WEBM.length);
    expect(pathOf(rec)).toMatch(/^schedule-video\/[0-9a-f-]{36}\.webm$/);
    expect(existsSync(file(rec))).toBe(true);
    // Public (unauthenticated) visitors see the same record.
    const pub = (await request(app).get('/api/schedule-video')).body.video;
    expect(pub).toMatchObject({ id: rec.id, provider: 'uploaded', url: `/uploads/${pathOf(rec)}`, scheduleDate: rec.scheduleDate, expiresAt: rec.expiresAt });
    const snap = (await request(app).get('/api/public/snapshot')).body;
    expect(snap.scheduleVideo.id).toBe(rec.id);
    const served = await request(app).get(pub.url);
    expect(served.status).toBe(200);
    expect(served.body.length ?? Number(served.headers['content-length'])).toBeGreaterThan(0);
    const status = (await admin.get('/api/admin/schedule-video')).body;
    expect(status.active).toBe(true);
    expect(status.current.id).toBe(rec.id);
  });

  it('accepts MP4 by real signature, rejects a renamed non-video (415)', async () => {
    const { upload, app } = await setup();
    expect((await upload(MP4, 'p.mp4')).status).toBe(201);
    const fake = await upload(Buffer.from('<html>not a video</html>'.repeat(10)), 'fake.mp4');
    expect(fake.status).toBe(415);
    expect(fake.body.message).toMatch(/MP4|WebM/);
    // The valid one is still public.
    expect((await request(app).get('/api/schedule-video')).body.video.mimeType).toBe('video/mp4');
  });

  it('rejects oversized files (413) with an Arabic message, before and during upload', async () => {
    const { upload, admin } = await setup({ SCHEDULE_VIDEO_MAX_MB: '1' });
    const big = Buffer.concat([WEBM, Buffer.alloc(1024 * 1024 + 10)]);
    const res = await upload(big, 'big.webm');
    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/حجم/);
    const target = await admin.post('/api/admin/schedule-video/upload-target', { name: 'big.webm', size: 5 * 1024 * 1024, type: 'video/webm' });
    expect(target.status).toBe(413);
    const bad = await admin.post('/api/admin/schedule-video/upload-target', { name: 'x.mov', size: 100, type: 'video/quicktime' });
    expect(bad.status).toBe(415);
  });

  it('requires an admin session', async () => {
    const { app } = await setup();
    const res = await request(app).post('/api/admin/schedule-video/upload').set({ 'x-amal-request': '1', origin: 'http://127.0.0.1', host: '127.0.0.1' }).attach('video', WEBM, 'a.webm');
    expect(res.status).toBe(401);
    expect((await request(app).delete('/api/admin/schedule-video').set({ 'x-amal-request': '1', origin: 'http://127.0.0.1', host: '127.0.0.1' })).status).toBe(401);
  });

  it('a failed upload keeps the current video; a successful replacement deletes the old file', async () => {
    const { upload, app, file } = await setup();
    const first = (await upload(WEBM, 'a.webm')).body as ScheduleVideoRecord;
    expect((await upload(Buffer.from('garbage'.repeat(20)), 'b.webm')).status).toBe(415);
    expect((await request(app).get('/api/schedule-video')).body.video.id).toBe(first.id);
    expect(existsSync(file(first))).toBe(true);

    const second = (await upload(WEBM, 'c.webm')).body as ScheduleVideoRecord;
    expect(pathOf(second)).not.toBe(pathOf(first));
    expect((await request(app).get('/api/schedule-video')).body.video.id).toBe(second.id);
    expect(existsSync(file(first))).toBe(false);
    expect(existsSync(file(second))).toBe(true);
  });

  it('manual delete removes record and file immediately', async () => {
    const { upload, app, admin, file } = await setup();
    const rec = (await upload(WEBM, 'a.webm')).body as ScheduleVideoRecord;
    expect((await admin.del('/api/admin/schedule-video')).status).toBe(204);
    expect((await request(app).get('/api/schedule-video')).body.video).toBeNull();
    expect(existsSync(file(rec))).toBe(false);
    expect((await admin.del('/api/admin/schedule-video')).status).toBe(404);
  });
});

describe('daily schedule video — expiry at the midnight ending the upload day', () => {
  it('is visible before expiry, hidden at expiry, then file + record are removed by cleanup', async () => {
    const { upload, scheduleVideo, store, file } = await setup();
    const rec = (await upload(WEBM, 'a.webm')).body as ScheduleVideoRecord;
    expect(await scheduleVideo.getActivePublic(rec.expiresAt - 1)).not.toBeNull();
    expect(await scheduleVideo.getActivePublic(rec.expiresAt)).toBeNull(); // server-side read check

    expect((await scheduleVideo.cleanup(rec.expiresAt - 1)).expired).toBeNull();
    expect(existsSync(file(rec))).toBe(true);

    const res = await scheduleVideo.cleanup(rec.expiresAt);
    expect(res.expired).toBe(rec.id);
    expect(res.deleted).toBe(1);
    expect(existsSync(file(rec))).toBe(false);
    expect(await store.get('content/scheduleVideo/current')).toBeNull();
    expect(await store.get('public/scheduleVideo')).toBeNull();
    // Idempotent: running again is a no-op.
    expect(await scheduleVideo.cleanup(rec.expiresAt + 60_000)).toEqual({ expired: null, deleted: 0, failed: 0, abandoned: 0 });
  });

  it('public endpoints hide an expired video even if cleanup has not run yet', async () => {
    const { upload, app } = await setup();
    await upload(WEBM, 'a.webm');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 86_400_000);
    expect((await request(app).get('/api/schedule-video')).body.video).toBeNull();
    expect((await request(app).get('/api/public/snapshot')).body.scheduleVideo).toBeUndefined();
  });

  it('a stale cleanup run never deletes a newer replacement video', async () => {
    const { upload, scheduleVideo, app, file } = await setup();
    const old = (await upload(WEBM, 'old.webm')).body as ScheduleVideoRecord;
    const fresh = (await upload(WEBM, 'new.webm')).body as ScheduleVideoRecord;
    // Simulate a cleanup that read the old record just before the replacement was published.
    vi.spyOn(scheduleVideo, 'getCurrent').mockResolvedValueOnce(old);
    const res = await scheduleVideo.cleanup(old.expiresAt);
    expect(res.expired).toBeNull();
    vi.restoreAllMocks();
    expect((await scheduleVideo.getCurrent())?.id).toBe(fresh.id);
    expect((await request(app).get('/api/schedule-video')).body.video.id).toBe(fresh.id);
    expect(existsSync(file(fresh))).toBe(true);
  });

  it('retries a failed storage deletion on the next run', async () => {
    const { upload, scheduleVideo, video, file, store } = await setup();
    const rec = (await upload(WEBM, 'a.webm')).body as ScheduleVideoRecord;
    const spy = vi.spyOn(video, 'remove').mockRejectedValueOnce(new Error('storage unavailable'));
    const first = await scheduleVideo.cleanup(rec.expiresAt);
    expect(first).toMatchObject({ expired: rec.id, failed: 1, deleted: 0 });
    expect(existsSync(file(rec))).toBe(true);
    expect(await store.get(`private/scheduleVideoTrash/${rec.id}/attempts`)).toBe(1);
    const second = await scheduleVideo.cleanup(rec.expiresAt + 60_000);
    expect(second).toMatchObject({ expired: null, failed: 0, deleted: 1 });
    expect(existsSync(file(rec))).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('cron endpoint requires the bearer secret and runs the same idempotent cleanup', async () => {
    const { app } = await setup();
    expect((await request(app).post('/api/cron/schedule-video-cleanup')).status).toBe(401);
    expect((await request(app).post('/api/cron/schedule-video-cleanup').set('authorization', 'Bearer wrong')).status).toBe(401);
    const ok = await request(app).post('/api/cron/schedule-video-cleanup').set('authorization', `Bearer ${CRON}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ expired: null, deleted: 0, failed: 0, abandoned: 0 });
  });

  it('cron endpoint is disabled when CRON_SECRET is not configured', async () => {
    const ctx = await makeApp();
    cleanups.push(ctx.cleanup);
    expect((await request(ctx.app).post('/api/cron/schedule-video-cleanup').set('authorization', 'Bearer ')).status).toBe(401);
  });
});

describe('daily schedule video — external links', () => {
  const YT = 'https://youtu.be/dQw4w9WgXcQ';

  it('publishes a YouTube link to everyone as an official embed, never fetching it', async () => {
    const { admin, app } = await setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await admin.post('/api/admin/schedule-video/external', { url: YT });
    expect(res.status).toBe(201);
    expect(res.body.source).toMatchObject({ type: 'external', provider: 'youtube', externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    const pub = (await request(app).get('/api/schedule-video')).body.video;
    expect(pub).toMatchObject({ provider: 'youtube', url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', videoId: 'dQw4w9WgXcQ' });
    expect(fetchSpy).not.toHaveBeenCalled(); // no server-side request to user-supplied URLs (no SSRF)
  });

  it('publishes a direct MP4 link for native playback', async () => {
    const { admin, app } = await setup();
    expect((await admin.post('/api/admin/schedule-video/external', { url: 'https://cdn.example.org/school/today.MP4' })).status).toBe(201);
    expect((await request(app).get('/api/schedule-video')).body.video).toMatchObject({ provider: 'direct', url: 'https://cdn.example.org/school/today.MP4', mimeType: 'video/mp4' });
  });

  it.each([
    ['http://cdn.example.org/a.mp4', /https/],
    ['https://dsp.shahaf.info/Pages/Display.aspx?id=b5134001&dev=50295367', /shahaf/],
    ['https://example.org/some/page.html', /YouTube|MP4/],
    ['https://127.0.0.1/a.mp4', /عام/],
    ['https://www.youtube.com/@channel', /YouTube/],
    ['not a url', /صيغة/],
  ])('rejects %s with an Arabic reason (422) and keeps the current video', async (url, msg) => {
    const { admin, app, upload } = await setup();
    const first = (await upload(WEBM, 'a.webm')).body as ScheduleVideoRecord;
    const res = await admin.post('/api/admin/schedule-video/external', { url });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(msg);
    expect((await request(app).get('/api/schedule-video')).body.video.id).toBe(first.id);
  });

  it('replacing an uploaded file with a link deletes the uploaded file only', async () => {
    const { admin, upload, file } = await setup();
    const up = (await upload(WEBM, 'a.webm')).body as ScheduleVideoRecord;
    expect((await admin.post('/api/admin/schedule-video/external', { url: YT })).status).toBe(201);
    expect(existsSync(file(up))).toBe(false);
  });

  it('an expired link is removed from the schedule; nothing is deleted at the provider or in storage', async () => {
    const { admin, scheduleVideo, video, store } = await setup();
    const rec = (await admin.post('/api/admin/schedule-video/external', { url: 'https://vimeo.com/76979871' })).body as ScheduleVideoRecord;
    expect(rec.expiresAt).toBeGreaterThan(rec.uploadedAt);
    const removeSpy = vi.spyOn(video, 'remove');
    expect(await scheduleVideo.getActivePublic(rec.expiresAt - 1)).toMatchObject({ provider: 'vimeo', url: 'https://player.vimeo.com/video/76979871' });
    expect(await scheduleVideo.getActivePublic(rec.expiresAt)).toBeNull();
    const res = await scheduleVideo.cleanup(rec.expiresAt);
    expect(res.expired).toBe(rec.id);
    expect(removeSpy).not.toHaveBeenCalled();
    expect(await store.get('content/scheduleVideo/current')).toBeNull();
    expect(await store.get('public/scheduleVideo')).toBeNull();
    expect(await store.get(`private/scheduleVideoTrash/${rec.id}`)).toBeNull();
  });

  it('a stale cleanup of an expired link does not remove a newer upload', async () => {
    const { admin, upload, scheduleVideo, file } = await setup();
    const link = (await admin.post('/api/admin/schedule-video/external', { url: YT })).body as ScheduleVideoRecord;
    const fresh = (await upload(WEBM, 'new.webm')).body as ScheduleVideoRecord;
    vi.spyOn(scheduleVideo, 'getCurrent').mockResolvedValueOnce(link);
    expect((await scheduleVideo.cleanup(link.expiresAt)).expired).toBeNull();
    vi.restoreAllMocks();
    expect((await scheduleVideo.getCurrent())?.id).toBe(fresh.id);
    expect(existsSync(file(fresh))).toBe(true);
  });

  it('requires an admin session', async () => {
    const { app } = await setup();
    const res = await request(app).post('/api/admin/schedule-video/external').set({ 'x-amal-request': '1', origin: 'http://127.0.0.1', host: '127.0.0.1' }).send({ url: YT });
    expect(res.status).toBe(401);
  });

  it('reads records stored before external links existed', async () => {
    const { store, scheduleVideo } = await setup();
    await store.set('content/scheduleVideo/current', { id: 'old', objectPath: 'schedule-video/00000000-0000-0000-0000-000000000000.mp4', originalName: 'x.mp4', mimeType: 'video/mp4', size: 1, uploadedAt: 1, scheduleDate: '2026-10-31', expiresAt: 2, status: 'published' });
    expect((await scheduleVideo.getCurrent())?.source).toMatchObject({ type: 'uploaded', objectPath: 'schedule-video/00000000-0000-0000-0000-000000000000.mp4' });
    expect((await scheduleVideo.cleanup(3)).expired).toBe('old');
  });
});
