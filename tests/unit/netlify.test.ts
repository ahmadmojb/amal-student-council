import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../../server/app';
import { readConfig } from '../../server/config';
import { buildHandler } from '../../netlify/functions/api';
import { config as cleanupConfig } from '../../netlify/functions/schedule-video-cleanup';

const toml = readFileSync('netlify.toml', 'utf8');

const prodEnv = {
  NODE_ENV: 'production',
  DATA_MODE: 'production',
  ADMIN_PIN: 'x'.repeat(12),
  SESSION_SECRET: 's'.repeat(40),
  PUBLIC_SITE_URL: 'https://council.example.org',
  FIREBASE_PROJECT_ID: 'mjlis-26-27',
  FIREBASE_DATABASE_URL: 'https://mjlis-26-27-default-rtdb.firebaseio.com',
  FIREBASE_STORAGE_BUCKET: 'mjlis-26-27.firebasestorage.app',
  VITE_FIREBASE_API_KEY: 'AIzaSyDN9mAV7ImnPmSHWeHf5iyHHqV2P5m-Js',
  VITE_FIREBASE_AUTH_DOMAIN: 'mjlis-26-27.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'mjlis-26-27',
  VITE_FIREBASE_DATABASE_URL: 'https://mjlis-26-27-default-rtdb.firebaseio.com',
  VITE_FIREBASE_STORAGE_BUCKET: 'mjlis-26-27.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '786348734775',
  VITE_FIREBASE_APP_ID: '1:786348734775:web:e154be65461ee9c37a02b2',
  VITE_FIREBASE_MEASUREMENT_ID: 'G-PKKWM1CDP7',
};

describe('Netlify configuration', () => {
  it('publishes the Vite output and routes /api before the SPA fallback', () => {
    expect(toml).toMatch(/publish = "dist"/);
    expect(toml).toMatch(/command = "npm run build:client"/);
    expect(toml).toMatch(/directory = "netlify\/functions"/);
    const api = toml.indexOf('from = "/api/*"');
    const spa = toml.indexOf('from = "/*"');
    expect(api).toBeGreaterThan(0);
    expect(spa).toBeGreaterThan(api);
    expect(toml).toMatch(/to = "\/\.netlify\/functions\/api\/:splat"/);
  });

  it('static CSP header equals the server production CSP', () => {
    const header = /Content-Security-Policy = "([^"]+)"/.exec(toml)?.[1] ?? '';
    const fromToml = new Set(header.split(';').map((d) => d.trim()).filter(Boolean));
    const directives = contentSecurityPolicy(readConfig(prodEnv));
    const fromServer = new Set(
      Object.entries(directives).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), ...v].join(' ').trim()),
    );
    expect(fromToml).toEqual(fromServer);
  });

  it('cleanup runs on a UTC sweep schedule (expiry itself is timestamp-based)', () => {
    expect(cleanupConfig.schedule).toBe('*/10 * * * *');
  });
});

describe('Firebase project configuration (mjlis-26-27)', () => {
  it('serves the exact web config to browsers and no secrets', () => {
    const cfg = readConfig(prodEnv);
    expect(cfg.firebase).toMatchObject({ projectId: 'mjlis-26-27', databaseUrl: 'https://mjlis-26-27-default-rtdb.firebaseio.com', storageBucket: 'mjlis-26-27.firebasestorage.app' });
    expect(cfg.firebase.web).toEqual({
      apiKey: 'AIzaSyDN9mAV7ImnPmSHWeHf5iyHHqV2P5m-Js',
      authDomain: 'mjlis-26-27.firebaseapp.com',
      databaseURL: 'https://mjlis-26-27-default-rtdb.firebaseio.com',
      projectId: 'mjlis-26-27',
      storageBucket: 'mjlis-26-27.firebasestorage.app',
      messagingSenderId: '786348734775',
      appId: '1:786348734775:web:e154be65461ee9c37a02b2',
      measurementId: 'G-PKKWM1CDP7',
    });
    expect(JSON.stringify(cfg.firebase.web)).not.toMatch(/PIN|SECRET|private_key/i);
  });

  it('refuses a server/browser project mismatch', () => {
    expect(() => readConfig({ ...prodEnv, VITE_FIREBASE_PROJECT_ID: 'some-other-project' })).toThrow(/different Firebase projects/);
  });

  it('.env.example carries the exact values and no secrets', () => {
    const env = readFileSync('.env.example', 'utf8');
    for (const [k, v] of Object.entries(prodEnv)) if (k.startsWith('VITE_FIREBASE') || k.startsWith('FIREBASE_')) expect(env).toContain(`${k}=${v}`);
    expect(env).toMatch(/^ADMIN_PIN=$/m);
    expect(env).toMatch(/^SESSION_SECRET=$/m);
    expect(env).toMatch(/^CRON_SECRET=$/m);
    expect(env).toMatch(/^FIREBASE_PRIVATE_KEY=$/m);
  });
});

describe('Express inside the Netlify function', () => {
  const lambdaEvent = (path: string, method = 'GET') => ({
    httpMethod: method,
    path,
    headers: { host: 'council.example.org' },
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    requestContext: {},
  });

  it('serves the existing API under both the original and the function path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'amal-nf-'));
    const h = await buildHandler({ NODE_ENV: 'test', DATA_MODE: 'demo', ADMIN_PIN: 'p'.repeat(12), SESSION_SECRET: 's'.repeat(40), DEMO_DATA_DIR: dir });
    const call = async (path: string, method = 'GET') => (await h(lambdaEvent(path, method), {})) as { statusCode: number; body: string; headers: Record<string, string> };
    const a = await call('/api/config');
    expect(a.statusCode).toBe(200);
    expect(JSON.parse(a.body).mode).toBe('demo');
    const b = await call('/.netlify/functions/api/schedule-video');
    expect(b.statusCode).toBe(200);
    expect(JSON.parse(b.body)).toEqual({ video: null });
    expect((await call('/.netlify/functions/api/healthz')).statusCode).toBe(200);
    expect((await call('/api/admin/schedule-video')).statusCode).toBe(401);
    expect((await call('/api/cron/schedule-video-cleanup', 'POST')).statusCode).toBe(401);
  });
});
