import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { adminAgent, makeApp, PIN } from './helpers';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => {
  ctx = await makeApp();
});
afterEach(() => ctx.cleanup());

const H = { 'x-amal-request': '1', origin: 'http://127.0.0.1', host: '127.0.0.1' };

describe('public API', () => {
  it('serves runtime config without secrets', async () => {
    const res = await request(ctx.app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('demo');
    expect(JSON.stringify(res.body)).not.toContain(PIN);
    expect(res.body.schedule).toBeUndefined();
  });

  it('exposes only the published projection, with private fields stripped', async () => {
    const res = await request(ctx.app).get('/api/public/snapshot');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.exams)).toHaveLength(12);
    expect(JSON.stringify(res.body)).not.toContain('adminNotes');
    expect(res.body.certificates).toBeUndefined();
    expect(res.body.adminAudit).toBeUndefined();
  });

  it('sets security headers', async () => {
    const res = await request(ctx.app).get('/api/config');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(res.headers['content-security-policy']).not.toContain('dsp.shahaf.info');
    expect(res.headers['content-security-policy']).toContain('frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com;');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('admin authentication', () => {
  it('rejects unauthenticated admin requests with 401', async () => {
    const res = await request(ctx.app).get('/api/admin/content/announcements').set(H);
    expect(res.status).toBe(401);
  });

  it('rejects login without the CSRF header or from a foreign origin', async () => {
    expect((await request(ctx.app).post('/api/admin/login').set('host', '127.0.0.1').send({ pin: PIN })).status).toBe(403);
    expect((await request(ctx.app).post('/api/admin/login').set({ ...H, origin: 'https://evil.example' }).send({ pin: PIN })).status).toBe(403);
  });

  it('rejects a wrong PIN and records the attempt without the PIN', async () => {
    const res = await request(ctx.app).post('/api/admin/login').set(H).send({ pin: 'wrong' });
    expect(res.status).toBe(401);
    const audit = JSON.stringify(await ctx.store.get('private/adminAudit'));
    expect(audit).toContain('login-failed');
    expect(audit).not.toContain('wrong');
  });

  it('issues an HttpOnly SameSite=Strict cookie and never returns the secret', async () => {
    const res = await request(ctx.app).post('/api/admin/login').set(H).send({ pin: PIN });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/amal_admin=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(JSON.stringify(res.body)).not.toContain(PIN);
  });

  it('rate-limits repeated failed logins', async () => {
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await request(ctx.app).post('/api/admin/login').set(H).send({ pin: `bad-${i}` })).status;
    expect(last).toBe(429);
  });

  it('revokes the session on logout', async () => {
    const a = await adminAgent(ctx.app);
    expect((await a.get('/api/admin/overview')).status).toBe(200);
    expect((await a.post('/api/admin/logout')).status).toBe(200);
    expect((await a.get('/api/admin/overview')).status).toBe(401);
  });

  it('rejects expired sessions', async () => {
    const short = await makeApp({ SESSION_TTL_MINUTES: '5' });
    const a = await adminAgent(short.app);
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60_000;
    try {
      expect((await a.get('/api/admin/overview')).status).toBe(401);
    } finally {
      Date.now = realNow;
      short.cleanup();
    }
  });

  it('requires the CSRF header on authenticated writes', async () => {
    const a = await adminAgent(ctx.app);
    const res = await a.agent.post('/api/admin/content/announcements').set('host', '127.0.0.1').set('origin', 'http://127.0.0.1').send({});
    expect(res.status).toBe(403);
  });
});

describe('content lifecycle', () => {
  it('creates a draft (not public), publishes, unpublishes, archives and deletes', async () => {
    const a = await adminAgent(ctx.app);
    const create = await a.post('/api/admin/content/announcements', { title: 'اجتماع المجلس', body: 'يوم الأحد', publishDate: '2026-10-01' });
    expect(create.status).toBe(201);
    const id = create.body.id as string;
    expect(create.body.visibility).toBe('draft');
    expect((await request(ctx.app).get('/api/public/snapshot')).body.announcements).toBeUndefined();

    expect((await a.patch(`/api/admin/content/announcements/${id}/visibility`, { visibility: 'published' })).status).toBe(200);
    expect((await request(ctx.app).get('/api/public/snapshot')).body.announcements[id].title).toBe('اجتماع المجلس');

    const edit = await a.put(`/api/admin/content/announcements/${id}`, { ...create.body, title: 'اجتماع معدّل', visibility: 'published' });
    expect(edit.status).toBe(200);
    expect(edit.body.createdAt).toBe(create.body.createdAt);
    expect((await request(ctx.app).get('/api/public/snapshot')).body.announcements[id].title).toBe('اجتماع معدّل');

    await a.patch(`/api/admin/content/announcements/${id}/visibility`, { visibility: 'archived' });
    expect((await request(ctx.app).get('/api/public/snapshot')).body.announcements).toBeUndefined();

    expect((await a.del(`/api/admin/content/announcements/${id}`)).status).toBe(204);
    expect(await ctx.store.get(`content/announcements/${id}`)).toBeNull();
    const audit = JSON.stringify(await ctx.store.get('private/adminAudit'));
    for (const action of ['"create"', '"published"', 'update', '"archived"', '"delete"']) expect(audit).toContain(action);
  });

  it('returns field-level validation errors', async () => {
    const a = await adminAgent(ctx.app);
    const res = await a.post('/api/admin/content/benefits', { businessName: '', title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['businessName', 'category', 'description']));
  });

  it('never publishes an already-expired benefit', async () => {
    const a = await adminAgent(ctx.app);
    const res = await a.post('/api/admin/content/benefits', { businessName: 'محل', category: 'طعام', title: 'خصم', description: 'وصف', expiresOn: '2020-01-01', visibility: 'published' });
    expect(res.status).toBe(201);
    expect((await request(ctx.app).get('/api/public/snapshot')).body.benefits).toBeUndefined();
  });

  it('404s on unknown collections and records', async () => {
    const a = await adminAgent(ctx.app);
    expect((await a.get('/api/admin/content/secrets')).status).toBe(404);
    expect((await a.put('/api/admin/content/announcements/nope', {})).status).toBe(404);
  });
});

describe('league workflow', () => {
  it('generates a bracket, propagates results and guards corrections', async () => {
    const a = await adminAgent(ctx.app);
    const ids: string[] = [];
    for (const n of ['أ', 'ب', 'ج', 'د']) {
      const r = await a.post('/api/admin/content/teams', { className: `10/${n}`, grade: 10, displayName: `فريق ${n}` });
      ids.push(r.body.id);
    }
    const gen = await a.post('/api/admin/league/bracket', { grade: 10, teamIds: ids });
    expect(gen.status).toBe(201);
    expect(gen.body).toHaveLength(3);
    expect((await a.post('/api/admin/league/bracket', { grade: 10, teamIds: ids })).status).toBe(409);

    // Level knockout result without penalties is rejected.
    expect((await a.post('/api/admin/league/matches/ko-g10-r1-m1/result', { status: 'completed', homeScore: 1, awayScore: 1 })).status).toBe(400);
    expect((await a.post('/api/admin/league/matches/ko-g10-r1-m1/result', { status: 'completed', homeScore: 1, awayScore: 1, homePenalties: 5, awayPenalties: 4 })).status).toBe(200);
    expect((await a.post('/api/admin/league/matches/ko-g10-r1-m2/result', { status: 'completed', homeScore: 0, awayScore: 2 })).status).toBe(200);

    const final = (await ctx.store.get<{ homeTeamId: string; awayTeamId: string }>('content/matches/ko-g10-r2-m1'))!;
    expect(final.homeTeamId).toBe(ids[0]);
    expect(final.awayTeamId).toBe(ids[2]);
    expect((await a.post('/api/admin/league/matches/ko-g10-r2-m1/result', { status: 'completed', homeScore: 3, awayScore: 0 })).status).toBe(200);

    // Changing a semi-final winner now conflicts with the played final.
    const conflict = await a.post('/api/admin/league/matches/ko-g10-r1-m1/result', { status: 'completed', homeScore: 0, awayScore: 1 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.conflicts[0].matchId).toBe('ko-g10-r2-m1');
    const forced = await a.post('/api/admin/league/matches/ko-g10-r1-m1/result', { status: 'completed', homeScore: 0, awayScore: 1, confirmDownstreamReset: true });
    expect(forced.status).toBe(200);
    expect(forced.body.resetIds).toEqual(['ko-g10-r2-m1']);
    const finalAfter = (await ctx.store.get<{ homeTeamId: string; status: string; homeScore: number | null }>('content/matches/ko-g10-r2-m1'))!;
    expect(finalAfter).toMatchObject({ homeTeamId: ids[3], status: 'scheduled', homeScore: null });

    // Matches stay private until published.
    expect((await request(ctx.app).get('/api/public/snapshot')).body.matches).toBeUndefined();
  });

  it('rejects duplicate teams in the same grade', async () => {
    const a = await adminAgent(ctx.app);
    expect((await a.post('/api/admin/content/teams', { className: '10/1', grade: 10, displayName: 'النسور' })).status).toBe(201);
    expect((await a.post('/api/admin/content/teams', { className: '10/1 ', grade: 10, displayName: 'آخر' })).status).toBe(409);
    expect((await a.post('/api/admin/content/teams', { className: '10/2', grade: 10, displayName: 'النسور' })).status).toBe(409);
    expect((await a.post('/api/admin/content/teams', { className: '11/1', grade: 11, displayName: 'النسور' })).status).toBe(201);
  });

  it('refuses teams from another grade', async () => {
    const a = await adminAgent(ctx.app);
    const t1 = (await a.post('/api/admin/content/teams', { className: '10/1', grade: 10, displayName: 'أ' })).body.id;
    const t2 = (await a.post('/api/admin/content/teams', { className: '11/1', grade: 11, displayName: 'ب' })).body.id;
    expect((await a.post('/api/admin/league/bracket', { grade: 10, teamIds: [t1, t2] })).status).toBe(400);
  });
});

describe('certificates', () => {
  it('issues, verifies, revokes, and stores only a hash', async () => {
    const a = await adminAgent(ctx.app);
    const issue = await a.post('/api/admin/certificates', { studentName: 'ريم أحمد', activityTitle: 'يوم التطوّع', issueDate: '2026-10-31' });
    expect(issue.status).toBe(201);
    const code = issue.body.code as string;
    expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    const stored = JSON.stringify(await ctx.store.get('private/certificates'));
    expect(stored).not.toContain(code.replace(/-/g, ''));
    expect(stored).not.toContain(code);

    const ok = await request(ctx.app).get(`/api/verify?code=${encodeURIComponent(code.toLowerCase())}`);
    expect(ok.body).toEqual({ result: 'valid', certificate: { studentName: 'ريم أحمد', activityTitle: 'يوم التطوّع', issueDate: '2026-10-31', issuer: expect.any(String) } });
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.headers['x-robots-tag']).toContain('noindex');

    expect((await request(ctx.app).get('/api/verify?code=AAAAA-AAAAA-AAAAA-AAAAA')).body).toEqual({ result: 'unknown' });
    expect((await request(ctx.app).get('/api/verify?code=x')).body).toEqual({ result: 'unknown' });

    expect((await a.post(`/api/admin/certificates/${issue.body.id}/revoke`)).status).toBe(200);
    expect((await request(ctx.app).get(`/api/verify?code=${code}`)).body).toEqual({ result: 'revoked' });
  });

  it('has no public way to list certificates', async () => {
    expect((await request(ctx.app).get('/api/admin/certificates')).status).toBe(401);
    expect((await request(ctx.app).get('/api/public/snapshot')).body.certificates).toBeUndefined();
  });

  it('rate-limits verification', async () => {
    let status = 0;
    for (let i = 0; i < 25; i++) status = (await request(ctx.app).get('/api/verify?code=AAAAA-AAAAA-AAAAA-AAAAA')).status;
    expect(status).toBe(429);
  });
});

describe('uploads', () => {
  it('re-encodes valid images to WebP and strips metadata', async () => {
    const a = await adminAgent(ctx.app);
    const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#5cbfe8' } })
      .png()
      .withExif({ IFD0: { Copyright: 'secret-gps' } })
      .toBuffer();
    const res = await a.agent.post('/api/admin/uploads').set(H).attach('file', png, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f-]+\.webp$/);
    const file = await request(ctx.app).get(res.body.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/webp');
    expect(file.body.toString('latin1')).not.toContain('secret-gps');
  });

  it('rejects disguised files regardless of name or declared type', async () => {
    const a = await adminAgent(ctx.app);
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const res = await a.agent.post('/api/admin/uploads').set(H).attach('file', html, { filename: 'cat.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    const pdf = Buffer.from('%PDF-1.4\n%fake');
    expect((await a.agent.post('/api/admin/uploads').set(H).attach('file', pdf, { filename: 'a.pdf', contentType: 'application/pdf' })).status).toBe(400);
  });

  it('rejects uploads from unauthenticated users', async () => {
    const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).png().toBuffer();
    expect((await request(ctx.app).post('/api/admin/uploads').set(H).attach('file', png, 'a.png')).status).toBe(401);
  });
});
