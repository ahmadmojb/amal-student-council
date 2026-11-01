/**
 * Express application factory. Kept free of process-level concerns (ports,
 * Vite, signals) so integration tests can build an app around a temporary
 * FileStore and exercise the real routes with supertest.
 */
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { ServerConfig } from './config.js';
import type { Store } from './store/types.js';
import type { MediaStore } from './services/media.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';
import type { VideoStorage } from './services/video-storage.js';
import { ScheduleVideoService } from './services/schedule-video.js';
import { ContentService } from './services/content.js';
import { EMBED_ORIGINS } from '../shared/video-source.js';

export interface AppDeps {
  config: ServerConfig;
  store: Store;
  media: MediaStore;
  /** Directory with locally stored uploads (demo mode). */
  video: VideoStorage;
  uploadsDir?: string;
}

export interface BuiltApp {
  app: Express;
  scheduleVideo: ScheduleVideoService;
}

/** Firebase Analytics (gtag) — loaded only when a measurement id is configured. */
export const ANALYTICS_SCRIPT = ['https://www.googletagmanager.com'];
export const ANALYTICS_CONNECT = ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com', 'https://firebase.googleapis.com', 'https://firebaseinstallations.googleapis.com'];

export function contentSecurityPolicy(config: ServerConfig): Record<string, string[]> {
  const firebaseHosts = ['https://*.firebaseio.com', 'wss://*.firebaseio.com', 'https://*.firebasedatabase.app', 'wss://*.firebasedatabase.app'];
  return {
    defaultSrc: ["'self'"],
    scriptSrc: config.isProd ? ["'self'", 'https://*.firebaseio.com', 'https://*.firebasedatabase.app', ...ANALYTICS_SCRIPT] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://firebasestorage.googleapis.com', 'https://*.google-analytics.com', 'https://*.googletagmanager.com'],
    fontSrc: ["'self'", 'data:'],
    // storage.googleapis.com: signed direct uploads of the daily schedule video.
    connectSrc: ["'self'", ...firebaseHosts, 'https://storage.googleapis.com', ...ANALYTICS_CONNECT, ...(config.isProd ? [] : ['ws:', 'wss:'])],
    // Only the official YouTube / Vimeo players may be framed (daily video links).
    frameSrc: EMBED_ORIGINS,
    // https: — admins may publish a direct public MP4/WebM link from any HTTPS host (played by <video>, never fetched by the server).
    mediaSrc: ["'self'", 'blob:', 'https://firebasestorage.googleapis.com', 'https:'],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
    ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
  };
}

export function createApp(deps: AppDeps): BuiltApp {
  const { config, store } = deps;
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  const content = new ContentService(store);
  const scheduleVideo = new ScheduleVideoService(store, deps.video, config.scheduleVideoMaxBytes, (e) => content.auditUpdate(e));

  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: contentSecurityPolicy(config) },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.use((_req, res, next) => {
    res.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });

  app.use(express.json({ limit: '200kb' }));

  if (deps.uploadsDir) {
    app.use(
      '/uploads',
      express.static(deps.uploadsDir, {
        index: false,
        dotfiles: 'deny',
        immutable: true,
        maxAge: '365d',
        setHeaders: (res) => res.set('x-content-type-options', 'nosniff'),
      }),
    );
  }

  app.use(publicRoutes(config, store, scheduleVideo));
  app.use(adminRoutes({ config, store, media: deps.media, scheduleVideo }));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Certificate verification pages must never be indexed.
  app.use('/verify', (_req, res, next) => {
    res.set('x-robots-tag', 'noindex, nofollow');
    next();
  });

  return { app, scheduleVideo };
}

/** Final error handler: no stack traces or internals in responses. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const status = typeof (err as { status?: unknown })?.status === 'number' ? ((err as { status: number }).status as number) : 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}:`, err instanceof Error ? err.message : err);
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).json({ error: status === 400 ? 'bad_request' : 'server_error', message: status === 400 ? 'طلب غير صالح.' : 'حدث خطأ في الخادم. حاول مرة أخرى.' });
}
