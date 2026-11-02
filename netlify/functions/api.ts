/**
 * Netlify Function: the existing Express app (all /api/* routes + /healthz),
 * wrapped with serverless-http. No business logic lives here.
 *
 * - Production only: DATA_MODE/NODE_ENV default to "production"; there is no
 *   silent fallback to demo storage (the config check fails loudly instead).
 * - Sessions are stateless HMAC-signed cookies (revocations in the database),
 *   login limits live in the database, so independent instances agree.
 * - Large videos never pass through here: the browser uploads straight to
 *   Firebase Storage with a short-lived signed URL (Function bodies are ~6 MB max).
 */
import express from 'express';
import serverless from 'serverless-http';
import { readConfig } from '../../server/config';
import { createApp, errorHandler } from '../../server/app';
import { createStore, seedInitialData } from '../../server/bootstrap';

process.env.NODE_ENV ??= 'production';
process.env.DATA_MODE ??= 'production';
// Netlify exposes the site's primary URL as URL; used for CSRF origin checks.
if (!process.env.PUBLIC_SITE_URL && process.env.URL) process.env.PUBLIC_SITE_URL = process.env.URL;

type Handler = ReturnType<typeof serverless>;
let ready: Promise<Handler> | null = null;

export async function buildHandler(env: NodeJS.ProcessEnv = process.env): Promise<Handler> {
  const config = readConfig(env);
  const { store, media, video } = await createStore(config);
  // First run against an empty database: write the provisional Bagrut seed + default settings.
  // seedInitialData() is a no-op once system/schemaVersion exists, so existing data is never overwritten.
  const seeded = await seedInitialData(store);
  if (seeded.seeded) console.log(`[api] database initialised (${seeded.exams} provisional Bagrut records).`);
  const { app } = createApp({ config, store, media, video });
  app.use(errorHandler);
  const outer = express();
  outer.disable('x-powered-by');
  if (config.trustProxy) outer.set('trust proxy', 1);
  // Requests may arrive as /.netlify/functions/api/<rest> (redirect target) or with the original /api/<rest> path.
  outer.use((req, _res, next) => {
    const prefix = '/.netlify/functions/api';
    if (req.url.startsWith(prefix)) {
      const rest = req.url.slice(prefix.length) || '/';
      req.url = rest.startsWith('/healthz') || rest.startsWith('/api/') ? rest : `/api${rest}`;
    }
    next();
  });
  outer.use(app);
  return serverless(outer);
}

export const handler = async (event: Parameters<Handler>[0], context: Parameters<Handler>[1]) => {
  ready ??= buildHandler().catch((err: unknown) => {
    ready = null; // retry initialisation on the next request
    throw err;
  });
  let h: Handler;
  try {
    h = await ready;
  } catch (err) {
    // Configuration / connection problem: answer at once (instead of timing out) and log the reason server-side only.
    console.error('[api] backend unavailable:', err instanceof Error ? err.message : err);
    return {
      statusCode: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify({ error: 'backend_unavailable', message: 'الخادم غير متصل بقاعدة البيانات حاليًا. حاول لاحقًا.' }),
    };
  }
  return h(event, context);
};
