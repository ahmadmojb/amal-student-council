import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { ServerConfig } from '../config.js';
import type { Store } from '../store/types.js';
import { ConflictError, ContentService, type AuditEntry } from '../services/content.js';
import { LeagueError, LeagueService } from '../services/league.js';
import { processUpload, UploadError, MAX_PDF_BYTES, type MediaStore } from '../services/media.js';
import { constantTimeEquals, createSessionToken, loadSession, requireAdmin, revokeSession, SESSION_COOKIE, sessionCookieOptions } from '../security/session.js';
import { csrfGuard } from '../security/csrf.js';
import { generateCertificateCode, hashCertificateCode } from '../security/certificates.js';
import {
  bracketGenerateInput,
  certificateInput,
  COLLECTIONS,
  loginInput,
  matchResultInput,
  visibility,
  type CertificateRecord,
  type CollectionName,
} from '../../shared/schemas.js';
import { mkdirSync } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VideoError, type ScheduleVideoService } from '../services/schedule-video.js';
import { scheduleVideoExternalRequest, scheduleVideoUploadRequest } from '../../shared/schemas.js';

/** A short, non-reversible client fingerprint for the audit log (no raw IPs stored). */
export function clientTag(req: Request, secret: string): string {
  return createHash('sha256').update(`${secret}:${req.ip ?? ''}`).digest('hex').slice(0, 10);
}

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

function isCollection(name: string): name is CollectionName {
  return (COLLECTIONS as string[]).includes(name);
}

/**
 * Failed-login counters kept in the database (private/loginLimits), not in
 * process memory, so they hold across serverless instances (Netlify) and
 * restarts. Successful logins are not counted.
 *  - per client (hashed IP tag): 8 failures / 15 min
 *  - global: 30 failures / 15 min (distributed guessing)
 */
class LoginLimits {
  constructor(
    private readonly store: Store,
    private readonly windowMs = 15 * 60_000,
    private readonly perClient = 8,
    private readonly global = 30,
  ) {}
  private async count(key: string, now: number): Promise<number> {
    const v = await this.store.get<{ start: number; count: number }>(`private/loginLimits/${key}`);
    return v && now - v.start < this.windowMs ? v.count : 0;
  }
  async check(client: string, now = Date.now()): Promise<'ok' | 'client' | 'global'> {
    if ((await this.count('global', now)) >= this.global) return 'global';
    if ((await this.count(`c-${client}`, now)) >= this.perClient) return 'client';
    return 'ok';
  }
  async fail(client: string, now = Date.now()): Promise<void> {
    const bump = (cur: { start: number; count: number } | null) => (!cur || now - cur.start >= this.windowMs ? { start: now, count: 1 } : { start: cur.start, count: cur.count + 1 });
    await this.store.transaction('private/loginLimits/global', bump);
    await this.store.transaction(`private/loginLimits/c-${client}`, bump);
  }
}

export function adminRoutes(deps: { config: ServerConfig; store: Store; media: MediaStore; scheduleVideo: ScheduleVideoService }): Router {
  const { config, store, media } = deps;
  const content = new ContentService(store);
  const league = new LeagueService(store, content);
  const r = express.Router();
  const limits = new LoginLimits(store);

  r.use('/api/admin', (_req, res, next) => {
    res.set('cache-control', 'no-store');
    next();
  });
  r.use('/api/admin', csrfGuard(config));

  // ───────── Authentication ─────────
  r.post(
    '/api/admin/login',
    wrap(async (req, res) => {
      const client = clientTag(req, config.sessionSecret);
      const limit = await limits.check(client);
      if (limit === 'global') {
        res.status(429).json({ error: 'locked', message: 'تم إيقاف تسجيل الدخول مؤقتًا بسبب محاولات فاشلة كثيرة. حاول لاحقًا.' });
        return;
      }
      if (limit === 'client') {
        res.status(429).json({ error: 'rate_limited', message: 'محاولات دخول كثيرة. حاول مجددًا بعد 15 دقيقة.' });
        return;
      }
      const parsed = loginInput.safeParse(req.body);
      const ok = parsed.success && constantTimeEquals(parsed.data.pin, config.adminPin);
      if (!ok) {
        await limits.fail(client);
        await content.audit({ action: 'login-failed', client });
        res.status(401).json({ error: 'invalid', message: 'الرمز غير صحيح.' });
        return;
      }
      const { token, payload } = createSessionToken(config.sessionSecret, config.sessionTtlMinutes);
      res.cookie(SESSION_COOKIE, token, sessionCookieOptions(config, payload.exp - payload.iat));
      await content.audit({ action: 'login', client });
      res.json({ authenticated: true, expiresAt: payload.exp });
    }),
  );

  r.get(
    '/api/admin/session',
    wrap(async (req, res) => {
      const s = await loadSession(req, config, store);
      res.json(s ? { authenticated: true, expiresAt: s.exp, mode: config.dataMode, demoPin: config.usingDemoPin } : { authenticated: false, mode: config.dataMode, demoPin: config.usingDemoPin });
    }),
  );

  r.post(
    '/api/admin/logout',
    wrap(async (req, res) => {
      const s = await loadSession(req, config, store);
      if (s) {
        await revokeSession(store, s);
        await content.audit({ action: 'logout', client: clientTag(req, config.sessionSecret) });
      }
      res.clearCookie(SESSION_COOKIE, sessionCookieOptions(config));
      res.json({ authenticated: false });
    }),
  );

  // Everything below requires a valid session.
  r.use('/api/admin', requireAdmin(config, store));

  r.get(
    '/api/admin/overview',
    wrap(async (_req, res) => {
      const counts: Record<string, { total: number; published: number; draft: number; archived: number }> = {};
      for (const c of COLLECTIONS) {
        const list = await content.list(c);
        counts[c] = {
          total: list.length,
          published: list.filter((x) => x.visibility === 'published').length,
          draft: list.filter((x) => x.visibility === 'draft').length,
          archived: list.filter((x) => x.visibility === 'archived').length,
        };
      }
      const certs = (await store.get<Record<string, CertificateRecord>>('private/certificates')) ?? {};
      res.json({
        mode: config.dataMode,
        storeKind: store.kind,
        usingDemoPin: config.usingDemoPin,
        counts,
        certificates: Object.keys(certs).length,
      });
    }),
  );

  // ───────── Generic collections ─────────
  r.get(
    '/api/admin/content/:collection',
    wrap(async (req, res) => {
      const c = String(req.params.collection);
      if (!isCollection(c)) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.json(await content.list(c));
    }),
  );

  r.post(
    '/api/admin/content/:collection',
    wrap(async (req, res) => {
      const c = String(req.params.collection);
      if (!isCollection(c)) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(201).json(await content.create(c, req.body, clientTag(req, config.sessionSecret)));
    }),
  );

  r.put(
    '/api/admin/content/:collection/:id',
    wrap(async (req, res) => {
      const c = String(req.params.collection);
      if (!isCollection(c)) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const rec = await content.replace(c, String(req.params.id), req.body, clientTag(req, config.sessionSecret));
      if (!rec) res.status(404).json({ error: 'not_found', message: 'السجل غير موجود.' });
      else res.json(rec);
    }),
  );

  r.patch(
    '/api/admin/content/:collection/:id/visibility',
    wrap(async (req, res) => {
      const c = String(req.params.collection);
      if (!isCollection(c)) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const v = z.object({ visibility }).parse(req.body).visibility;
      const rec = await content.setVisibility(c, String(req.params.id), v, clientTag(req, config.sessionSecret));
      if (!rec) res.status(404).json({ error: 'not_found', message: 'السجل غير موجود.' });
      else res.json(rec);
    }),
  );

  r.delete(
    '/api/admin/content/:collection/:id',
    wrap(async (req, res) => {
      const c = String(req.params.collection);
      if (!isCollection(c)) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const ok = await content.remove(c, String(req.params.id), clientTag(req, config.sessionSecret));
      if (!ok) res.status(404).json({ error: 'not_found', message: 'السجل غير موجود.' });
      else res.status(204).end();
    }),
  );

  // ───────── League ─────────
  r.get('/api/admin/league/config', wrap(async (_req, res) => void res.json(await content.getLeagueConfig())));
  r.put('/api/admin/league/config', wrap(async (req, res) => void res.json(await content.saveLeagueConfig(req.body, clientTag(req, config.sessionSecret)))));

  r.post(
    '/api/admin/league/bracket',
    wrap(async (req, res) => {
      const input = bracketGenerateInput.parse(req.body);
      res.status(201).json(await league.generateGradeBracket(input.grade, input.teamIds, input.replaceExisting, clientTag(req, config.sessionSecret)));
    }),
  );

  r.post(
    '/api/admin/league/final',
    wrap(async (req, res) => {
      const replace = z.object({ replaceExisting: z.boolean().default(false) }).parse(req.body ?? {}).replaceExisting;
      res.status(201).json(await league.generateFinal(replace, clientTag(req, config.sessionSecret)));
    }),
  );

  r.post(
    '/api/admin/league/matches/:id/result',
    wrap(async (req, res) => {
      const input = matchResultInput.parse(req.body);
      res.json(await league.setResult(String(req.params.id), input, clientTag(req, config.sessionSecret)));
    }),
  );

  // ───────── Settings ─────────
  r.get('/api/admin/settings', wrap(async (_req, res) => void res.json(await content.getSettings())));
  r.put('/api/admin/settings', wrap(async (req, res) => void res.json(await content.saveSettings(req.body, clientTag(req, config.sessionSecret)))));
  r.post(
    '/api/admin/republish',
    wrap(async (req, res) => {
      res.json({ published: await content.republishAll(clientTag(req, config.sessionSecret)) });
    }),
  );

  // ───────── Certificates ─────────
  r.get(
    '/api/admin/certificates',
    wrap(async (_req, res) => {
      const all = (await store.get<Record<string, CertificateRecord>>('private/certificates')) ?? {};
      res.json(Object.entries(all).map(([id, c]) => ({ id, ...c })).sort((a, b) => b.createdAt - a.createdAt));
    }),
  );

  r.post(
    '/api/admin/certificates',
    wrap(async (req, res) => {
      const input = certificateInput.parse(req.body);
      const code = generateCertificateCode();
      const normalized = code.replace(/-/g, '');
      const id = hashCertificateCode(normalized);
      const record: CertificateRecord = { ...input, status: 'valid', createdAt: Date.now(), revokedAt: null, codeHint: normalized.slice(-4) };
      await store.update({
        [`private/certificates/${id}`]: record,
        ...content.auditUpdate({ action: 'certificate-issue', collection: 'certificates', recordId: id.slice(0, 12), summary: input.activityTitle.slice(0, 80), client: clientTag(req, config.sessionSecret) }),
      });
      // The raw code is returned exactly once, for printing. It is not stored.
      res.status(201).json({ id, code, record });
    }),
  );

  r.post(
    '/api/admin/certificates/:id/revoke',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      if (!/^[a-f0-9]{64}$/.test(id)) {
        res.status(400).json({ error: 'bad_id' });
        return;
      }
      const rec = await store.get<CertificateRecord>(`private/certificates/${id}`);
      if (!rec) {
        res.status(404).json({ error: 'not_found', message: 'الشهادة غير موجودة.' });
        return;
      }
      const updated: CertificateRecord = { ...rec, status: 'revoked', revokedAt: Date.now() };
      await store.update({
        [`private/certificates/${id}`]: updated,
        ...content.auditUpdate({ action: 'certificate-revoke', collection: 'certificates', recordId: id.slice(0, 12), client: clientTag(req, config.sessionSecret) }),
      });
      res.json({ id, ...updated });
    }),
  );

  // ───────── Uploads ─────────
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 4 } });
  r.post(
    '/api/admin/uploads',
    upload.single('file'),
    wrap(async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'no_file', message: 'لم يتم اختيار ملف.' });
        return;
      }
      const allowPdf = req.body?.kind === 'attachment';
      const processed = await processUpload(req.file.buffer, { allowPdf });
      const url = await media.save(processed);
      await content.audit({ action: 'upload', summary: `${processed.contentType} ${processed.data.length}B`, client: clientTag(req, config.sessionSecret) });
      res.status(201).json({ url, contentType: processed.contentType, width: processed.width, height: processed.height });
    }),
  );

  // ───────── Daily schedule video ─────────
  const video = deps.scheduleVideo;
  const videoTmp = join(tmpdir(), 'amal-video-uploads');
  mkdirSync(videoTmp, { recursive: true });
  // Streamed to disk (never held in memory); size limit enforced while streaming.
  const videoUpload = multer({ dest: videoTmp, limits: { fileSize: config.scheduleVideoMaxBytes, files: 1, fields: 2 } });

  r.get(
    '/api/admin/schedule-video',
    wrap(async (_req, res) => {
      const current = await video.getCurrent();
      res.json({ current, active: current ? Date.now() < current.expiresAt : false, maxBytes: video.maxBytes });
    }),
  );

  /** Step 1: returns where the browser should send the file (signed Storage URL in production, this server in demo). */
  r.post(
    '/api/admin/schedule-video/upload-target',
    wrap(async (req, res) => {
      const body = scheduleVideoUploadRequest.parse(req.body);
      res.json(await video.beginSignedUpload(body.name, body.size, body.type));
    }),
  );

  /** Direct mode: multipart upload through this server (demo / local). */
  r.post(
    '/api/admin/schedule-video/upload',
    videoUpload.single('video'),
    wrap(async (req, res) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'no_file', message: 'لم يتم اختيار ملف فيديو.' });
        return;
      }
      try {
        const fh = await open(file.path, 'r');
        const head = Buffer.alloc(64);
        await fh.read(head, 0, 64, 0);
        await fh.close();
        const record = await video.ingestTempFile(file.path, file.originalname, file.size, head, clientTag(req, config.sessionSecret));
        res.status(201).json(record);
      } finally {
        await rm(file.path, { force: true });
      }
    }),
  );

  /** Signed mode: verify the uploaded object and publish it. */
  r.post(
    '/api/admin/schedule-video/finalize',
    wrap(async (req, res) => {
      const { uploadId } = z.object({ uploadId: z.string().max(64) }).parse(req.body);
      res.status(201).json(await video.finalizeSignedUpload(uploadId, clientTag(req, config.sessionSecret)));
    }),
  );

  /** External link (direct MP4/WebM, YouTube, Vimeo): validated by syntax + allowlist; never fetched by the server. */
  r.post(
    '/api/admin/schedule-video/external',
    wrap(async (req, res) => {
      const { url } = scheduleVideoExternalRequest.parse(req.body);
      res.status(201).json(await video.publishExternal(url, clientTag(req, config.sessionSecret)));
    }),
  );

  r.delete(
    '/api/admin/schedule-video',
    wrap(async (req, res) => {
      const removed = await video.removeCurrent(clientTag(req, config.sessionSecret));
      if (!removed) res.status(404).json({ error: 'not_found', message: 'لا يوجد فيديو منشور.' });
      else res.status(204).end();
    }),
  );

  // ───────── Audit ─────────
  r.get(
    '/api/admin/audit',
    wrap(async (_req, res) => {
      const entries = await store.lastChildren<AuditEntry>('private/adminAudit', 200);
      res.json(Object.entries(entries).map(([id, e]) => ({ id, ...e })).reverse());
    }),
  );

  // Error mapping for this router.
  r.use('/api/admin', (err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'validation', message: 'بعض الحقول غير صالحة.', issues: err.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })) });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(409).json({ error: 'conflict', message: err.message });
      return;
    }
    if (err instanceof LeagueError) {
      res.status(err.status).json({ error: 'league', message: err.message, conflicts: err.conflicts });
      return;
    }
    if (err instanceof UploadError) {
      res.status(400).json({ error: 'upload', message: err.message });
      return;
    }
    if (err instanceof VideoError) {
      res.status(err.status).json({ error: 'video', message: err.message });
      return;
    }
    if (err instanceof multer.MulterError && req.originalUrl.startsWith('/api/admin/schedule-video')) {
      res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'video', message: err.code === 'LIMIT_FILE_SIZE' ? `حجم الفيديو أكبر من الحد المسموح (${Math.round(config.scheduleVideoMaxBytes / 1024 / 1024)} ميغابايت).` : 'تعذّر رفع الفيديو.' });
      return;
    }
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: 'upload', message: err.code === 'LIMIT_FILE_SIZE' ? 'الملف أكبر من الحد المسموح.' : 'تعذّر رفع الملف.' });
      return;
    }
    next(err);
  });

  return r;
}
