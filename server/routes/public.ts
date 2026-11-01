import express, { type Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { ServerConfig } from '../config.js';
import type { Store } from '../store/types.js';
import type { PublicClientConfig } from '../../shared/api-types.js';
import type { PublicTree } from '../../shared/schemas.js';
import { constantTimeEquals } from '../security/session.js';
import { isActive, type ScheduleVideoService } from '../services/schedule-video.js';
import type { CertificateRecord, CertificateVerification } from '../../shared/schemas.js';
import { hashCertificateCode, normalizeCertificateCode } from '../security/certificates.js';


export function publicRoutes(config: ServerConfig, store: Store, scheduleVideo: ScheduleVideoService): Router {
  const r = express.Router();

  r.get('/api/config', (_req, res) => {
    const body: PublicClientConfig = {
      mode: config.dataMode,
      firebase: config.firebase.web,
      siteUrl: config.publicSiteUrl,
    };
    res.set('cache-control', 'no-store').json(body);
  });

  r.get('/healthz', (_req, res) => {
    res.set('cache-control', 'no-store').json({ ok: true, mode: config.dataMode });
  });

  // Active daily schedule video, with the server-side expiry check.
  r.get('/api/schedule-video', async (_req, res, next) => {
    try {
      res.set('cache-control', 'no-store').json({ video: await scheduleVideo.getActivePublic() });
    } catch (e) {
      next(e);
    }
  });

  /**
   * Scheduled cleanup, called by Cloud Scheduler at 00:00 Asia/Jerusalem
   * (see docs/schedule-video.md). Authenticated with CRON_SECRET; idempotent.
   */
  r.post('/api/cron/schedule-video-cleanup', async (req, res, next) => {
    try {
      const auth = req.get('authorization') ?? '';
      if (!config.cronSecret || !constantTimeEquals(auth, `Bearer ${config.cronSecret}`)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      res.set('cache-control', 'no-store').json(await scheduleVideo.cleanup());
    } catch (e) {
      next(e);
    }
  });

  // Demo mode only: in production the browser reads public/ from Firebase directly.
  /** The public tree as visitors may see it now: an expired video is never served, even before cleanup ran. */
  const visiblePublic = async (): Promise<PublicTree> => {
    const tree = ((await store.get<PublicTree>('public')) ?? {}) as PublicTree;
    if (tree.scheduleVideo && !isActive(tree.scheduleVideo)) delete tree.scheduleVideo;
    return tree;
  };

  if (config.dataMode === 'demo') {
    r.get('/api/public/snapshot', async (_req, res, next) => {
      try {
        res.set('cache-control', 'no-store').json(await visiblePublic());
      } catch (e) {
        next(e);
      }
    });

    r.get('/api/public/stream', async (req, res) => {
      res.set({ 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.flushHeaders();
      let pending = false;
      const send = async () => {
        if (pending) return;
        pending = true;
        setTimeout(async () => {
          pending = false;
          const data = await visiblePublic();
          res.write(`event: snapshot\ndata: ${JSON.stringify(data)}\n\n`);
        }, 30);
      };
      await send();
      const off = store.onPublicChange?.(() => void send());
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => {
        off?.();
        clearInterval(ping);
      });
    });
  }

  const verifyLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'محاولات كثيرة. حاول بعد دقيقة.' },
  });

  r.get('/api/verify', verifyLimiter, async (req, res, next) => {
    try {
      res.set({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
      const raw = typeof req.query.code === 'string' ? req.query.code : '';
      const normalized = normalizeCertificateCode(raw);
      if (!normalized) {
        res.json({ result: 'unknown' } satisfies CertificateVerification);
        return;
      }
      const rec = await store.get<CertificateRecord>(`private/certificates/${hashCertificateCode(normalized)}`);
      if (!rec) {
        res.json({ result: 'unknown' } satisfies CertificateVerification);
        return;
      }
      if (rec.status === 'revoked') {
        res.json({ result: 'revoked' } satisfies CertificateVerification);
        return;
      }
      res.json({
        result: 'valid',
        certificate: { studentName: rec.studentName, activityTitle: rec.activityTitle, issueDate: rec.issueDate, issuer: rec.issuer },
      } satisfies CertificateVerification);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
