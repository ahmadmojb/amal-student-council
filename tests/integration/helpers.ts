import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { readConfig, type ServerConfig } from '../../server/config';
import { createApp, errorHandler } from '../../server/app';
import { FileStore } from '../../server/store/file-store';
import { LocalMediaStore } from '../../server/services/media';
import { LocalVideoStorage } from '../../server/services/video-storage';
import { seedInitialData } from '../../server/bootstrap';

export const PIN = 'test-admin-pin-123';

export async function makeApp(env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'amal-test-'));
  const config: ServerConfig = readConfig({ NODE_ENV: 'test', DATA_MODE: 'demo', ADMIN_PIN: PIN, SESSION_SECRET: 's'.repeat(48), DEMO_DATA_DIR: dir, ...env });
  const store = new FileStore(null);
  await seedInitialData(store);
  const uploadsDir = join(dir, 'uploads');
  const video = new LocalVideoStorage(uploadsDir);
  const { app, scheduleVideo } = createApp({ config, store, media: new LocalMediaStore(uploadsDir), video, uploadsDir });
  app.use(errorHandler);
  return { app, store, config, dir, uploadsDir, video, scheduleVideo, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A logged-in supertest agent that sends the CSRF header and a same-origin Origin. */
export async function adminAgent(app: Parameters<typeof request.agent>[0]) {
  const agent = request.agent(app);
  const res = await agent.post('/api/admin/login').set('x-amal-request', '1').set('origin', 'http://127.0.0.1').set('host', '127.0.0.1').send({ pin: PIN });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const h = { 'x-amal-request': '1', origin: 'http://127.0.0.1', host: '127.0.0.1' };
  return {
    agent,
    get: (url: string) => agent.get(url).set(h),
    post: (url: string, body?: unknown) => agent.post(url).set(h).send(body as object),
    put: (url: string, body?: unknown) => agent.put(url).set(h).send(body as object),
    patch: (url: string, body?: unknown) => agent.patch(url).set(h).send(body as object),
    del: (url: string) => agent.delete(url).set(h),
  };
}
