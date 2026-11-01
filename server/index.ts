/**
 * Process entry point.
 *  - development: one process, one port — Express API + Vite dev middleware.
 *  - production:  serves the built client from dist/ with a service worker.
 */
import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDotEnv, readConfig } from './config.js';
import { createApp, errorHandler } from './app.js';
import { createStore, seedInitialData } from './bootstrap.js';
import { ContentService } from './services/content.js';
import { pruneRevokedSessions } from './security/session.js';
import { todayInSchool } from '../shared/dates.js';

async function main(): Promise<void> {
  loadDotEnv();
  const config = readConfig();
  const { store, media, video, uploadsDir } = await createStore(config);

  if (config.dataMode === 'demo') {
    const r = await seedInitialData(store);
    if (r.seeded) console.log(`[demo] initial data seeded (${r.exams} provisional Bagrut records).`);
  } else if (!(await store.get('system/schemaVersion'))) {
    console.warn('[production] database is not initialised. Run `npm run seed -- --production --confirm` once (see docs/deployment.md).');
  }

  const { app, scheduleVideo } = createApp({ config, store, media, video, uploadsDir });
  const clientRoot = resolve(process.cwd());
  const httpServer = createHttpServer(app);

  // SERVE_DIST=true serves the built client without Vite (used by the E2E suite).
  const useVite = !config.isProd && process.env.SERVE_DIST !== 'true';
  if (useVite) {
    console.log('[dev] starting Vite middleware…');
    const { createServer } = await import('vite');
    // HMR shares the HTTP server/port so the dev setup needs no second port.
    const vite = await createServer({ root: clientRoot, server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' });
    app.use(vite.middlewares);
    console.log('[dev] Vite ready.');
  } else {
    const dist = resolve(clientRoot, 'dist');
    if (!existsSync(resolve(dist, 'index.html'))) throw new Error('dist/ not found — run `npm run build` first.');
    app.use(
      '/assets',
      express.static(resolve(dist, 'assets'), { immutable: true, maxAge: '365d', index: false, fallthrough: false }),
    );
    app.use(
      express.static(dist, {
        index: false,
        setHeaders: (res, path) => {
          if (path.endsWith('sw.js') || path.endsWith('.webmanifest') || path.endsWith('.html')) res.set('cache-control', 'no-cache');
        },
      }),
    );
    // SPA fallback for page routes.
    app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
      res.set('cache-control', 'no-cache').sendFile(resolve(dist, 'index.html'));
    });
  }

  app.use(errorHandler);

  // Keep the public tree honest as days pass (expired items leave it), and tidy revoked sessions.
  const content = new ContentService(store);
  let lastDay = todayInSchool();
  setInterval(() => {
    const today = todayInSchool();
    if (today !== lastDay) {
      lastDay = today;
      content.republishAll('daily-job').catch((e) => console.error('[daily] republish failed', e instanceof Error ? e.message : e));
      pruneRevokedSessions(store).catch(() => undefined);
    }
  }, 10 * 60_000).unref();

  // Daily schedule video: server-side sweep (in addition to the Cloud Scheduler
  // endpoint, which is what guarantees deletion when no instance is running).
  // Expiry is also enforced on every read, so a delayed sweep never shows yesterday's video.
  const sweep = () =>
    scheduleVideo
      .cleanup()
      .then((r) => {
        if (r.expired || r.deleted || r.failed) console.log('[schedule-video] cleanup', JSON.stringify(r));
      })
      .catch((e) => console.error('[schedule-video] cleanup failed', e instanceof Error ? e.message : e));
  void sweep();
  setInterval(sweep, 60_000).unref();

  const server = httpServer.listen(config.port, () => {
    console.log(`Amal Student Council — ${config.dataMode.toUpperCase()} mode — http://localhost:${config.port}`);
    if (config.usingDemoPin) console.log('[demo] Admin PIN is the demo PIN "demo-1234". Set ADMIN_PIN in .env to change it.');
    if (config.isProd && !config.cronSecret) console.warn('[schedule-video] CRON_SECRET is not set: the Cloud Scheduler cleanup endpoint is disabled (see docs/schedule-video.md).');
  });

  const shutdown = () => {
    server.close();
    void store.close?.().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
