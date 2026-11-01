/**
 * Server configuration from environment variables. Fails fast in production
 * when a required secret is missing — there are no production defaults for
 * secrets, and demo mode is never entered implicitly in production.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type DataMode = 'demo' | 'production';

export interface ServerConfig {
  nodeEnv: string;
  isProd: boolean;
  port: number;
  dataMode: DataMode;
  adminPin: string;
  /** True when the PIN is the built-in demo PIN (only possible in demo mode). */
  usingDemoPin: boolean;
  sessionSecret: string;
  sessionTtlMinutes: number;
  publicSiteUrl: string;
  trustProxy: boolean;
  demoDataDir: string;
  firebase: {
    projectId: string;
    databaseUrl: string;
    storageBucket: string;
    web: Record<string, string> | null;
  };
  /** Maximum daily schedule video size in bytes (SCHEDULE_VIDEO_MAX_MB, default 250). */
  scheduleVideoMaxBytes: number;
  /** Shared secret for the scheduler endpoint (CRON_SECRET); empty disables the endpoint. */
  cronSecret: string;
}

const DEMO_PIN = 'demo-1234';

/** Minimal .env loader (no dependency). Real environment variables win. */
export function loadDotEnv(file = '.env'): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const key = m[1] as string;
    let value = m[2] as string;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

class ConfigError extends Error {}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProd = nodeEnv === 'production';
  const dataMode = (env.DATA_MODE ?? (isProd ? '' : 'demo')) as DataMode;
  const errors: string[] = [];

  if (dataMode !== 'demo' && dataMode !== 'production') {
    errors.push('DATA_MODE must be "demo" or "production" (it is required when NODE_ENV=production).');
  }

  let adminPin = env.ADMIN_PIN ?? '';
  let usingDemoPin = false;
  if (!adminPin) {
    if (dataMode === 'demo' && !isProd) {
      adminPin = DEMO_PIN;
      usingDemoPin = true;
    } else errors.push('ADMIN_PIN is required.');
  } else if (dataMode === 'production' && adminPin.length < 10) {
    errors.push('ADMIN_PIN must be at least 10 characters in production.');
  }
  if (dataMode === 'production' && adminPin === DEMO_PIN) errors.push('The demo PIN may not be used in production.');

  let sessionSecret = env.SESSION_SECRET ?? '';
  if (sessionSecret.length < 32) {
    if (dataMode === 'demo' && !isProd) sessionSecret = 'demo-only-session-secret-not-for-production-use';
    else errors.push('SESSION_SECRET must be at least 32 characters.');
  }

  // Public web-app config. PUBLIC_FIREBASE_* (runtime) and VITE_FIREBASE_* (Netlify/Vite naming) are both accepted.
  const pub = (name: string): string => env[`PUBLIC_FIREBASE_${name}`] ?? env[`VITE_FIREBASE_${name}`] ?? '';
  const firebaseWebKeys: Record<string, string> = {
    apiKey: pub('API_KEY'),
    authDomain: pub('AUTH_DOMAIN'),
    databaseURL: pub('DATABASE_URL') || (env.FIREBASE_DATABASE_URL ?? ''),
    projectId: pub('PROJECT_ID') || (env.FIREBASE_PROJECT_ID ?? ''),
    storageBucket: pub('STORAGE_BUCKET') || (env.FIREBASE_STORAGE_BUCKET ?? ''),
    messagingSenderId: pub('MESSAGING_SENDER_ID'),
    appId: pub('APP_ID'),
    measurementId: pub('MEASUREMENT_ID'),
  };
  for (const k of Object.keys(firebaseWebKeys)) if (!firebaseWebKeys[k]) delete firebaseWebKeys[k];
  if (dataMode === 'production') {
    if (!env.FIREBASE_DATABASE_URL) errors.push('FIREBASE_DATABASE_URL is required in production mode.');
    if (!firebaseWebKeys.apiKey || !firebaseWebKeys.databaseURL || !firebaseWebKeys.projectId)
      errors.push('PUBLIC_FIREBASE_API_KEY, PUBLIC_FIREBASE_DATABASE_URL (or FIREBASE_DATABASE_URL) and PUBLIC_FIREBASE_PROJECT_ID are required in production mode.');
    // Server and browser must talk to the same project.
    if (env.FIREBASE_PROJECT_ID && firebaseWebKeys.projectId && env.FIREBASE_PROJECT_ID !== firebaseWebKeys.projectId)
      errors.push('FIREBASE_PROJECT_ID and PUBLIC_FIREBASE_PROJECT_ID point to different Firebase projects.');
    if (env.FIREBASE_DATABASE_URL && firebaseWebKeys.databaseURL && env.FIREBASE_DATABASE_URL.replace(/\/$/, '') !== firebaseWebKeys.databaseURL.replace(/\/$/, ''))
      errors.push('FIREBASE_DATABASE_URL and PUBLIC_FIREBASE_DATABASE_URL differ.');
  }

  const maxMb = Number(env.SCHEDULE_VIDEO_MAX_MB ?? 250);
  if (!Number.isFinite(maxMb) || maxMb < 1 || maxMb > 2048) errors.push('SCHEDULE_VIDEO_MAX_MB must be between 1 and 2048.');
  const cronSecret = env.CRON_SECRET ?? '';
  if (cronSecret && cronSecret.length < 32) errors.push('CRON_SECRET must be at least 32 characters.');
  if (dataMode === 'production' && !env.FIREBASE_STORAGE_BUCKET) errors.push('FIREBASE_STORAGE_BUCKET is required in production (daily schedule video storage).');

  const publicSiteUrl = (env.PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  if (isProd && !publicSiteUrl) errors.push('PUBLIC_SITE_URL is required in production (used for CSRF origin checks and certificate QR codes).');

  if (errors.length) throw new ConfigError(`Invalid server configuration:\n - ${errors.join('\n - ')}`);

  return {
    nodeEnv,
    isProd,
    port: Number(env.PORT ?? 3000),
    dataMode,
    adminPin,
    usingDemoPin,
    sessionSecret,
    sessionTtlMinutes: Math.min(Math.max(Number(env.SESSION_TTL_MINUTES ?? 240), 5), 24 * 60),
    publicSiteUrl,
    trustProxy: env.TRUST_PROXY === 'true' || isProd,
    demoDataDir: resolve(process.cwd(), env.DEMO_DATA_DIR ?? '.data'),
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID ?? '',
      databaseUrl: env.FIREBASE_DATABASE_URL ?? '',
      storageBucket: env.FIREBASE_STORAGE_BUCKET ?? '',
      web: dataMode === 'production' ? firebaseWebKeys : null,
    },
    scheduleVideoMaxBytes: Math.round(maxMb * 1024 * 1024),
    cronSecret,
  };
}
