/**
 * Store + media construction and first-run initialisation.
 */
import { join } from 'node:path';
import type { ServerConfig } from './config.js';
import { FileStore } from './store/file-store.js';
import { FirebaseStore } from './store/firebase-store.js';
import type { Store } from './store/types.js';
import { FirebaseMediaStore, LocalMediaStore, type MediaStore } from './services/media.js';
import { FirebaseVideoStorage, LocalVideoStorage, type VideoStorage } from './services/video-storage.js';
import { ContentService, SCHEMA_VERSION } from './services/content.js';
import { BAGRUT_WINTER_2027_SEED } from './seed-data.js';

export async function createStore(config: ServerConfig): Promise<{ store: Store; media: MediaStore; video: VideoStorage; uploadsDir?: string }> {
  if (config.dataMode === 'production') {
    const store = new FirebaseStore({ projectId: config.firebase.projectId, databaseUrl: config.firebase.databaseUrl, storageBucket: config.firebase.storageBucket });
    // Fail loudly — never fall back to demo storage when production is misconfigured.
    await store.ping();
    if (!config.firebase.storageBucket) console.warn('[config] FIREBASE_STORAGE_BUCKET is not set: admin uploads will fail until it is configured.');
    return { store, media: new FirebaseMediaStore(config.firebase.storageBucket), video: new FirebaseVideoStorage(config.firebase.storageBucket) };
  }
  const store = new FileStore(join(config.demoDataDir, 'demo-db.json'));
  const uploadsDir = join(config.demoDataDir, 'uploads');
  return { store, media: new LocalMediaStore(uploadsDir), video: new LocalVideoStorage(uploadsDir), uploadsDir };
}

/** Seeds the provisional Bagrut data + default settings exactly once. */
export async function seedInitialData(store: Store, opts: { force?: boolean } = {}): Promise<{ seeded: boolean; exams: number }> {
  const version = await store.get<number>('system/schemaVersion');
  if (version && !opts.force) return { seeded: false, exams: 0 };
  const content = new ContentService(store);
  let exams = 0;
  for (const { id, ...exam } of BAGRUT_WINTER_2027_SEED) {
    if (await content.getRecord('exams', id)) continue;
    await content.create('exams', exam, 'seed', id);
    exams++;
  }
  if (!(await store.get('content/settings'))) await content.saveSettings({}, 'seed');
  if (!(await store.get('content/leagueConfig'))) await content.saveLeagueConfig({}, 'seed');
  await store.update({ 'system/schemaVersion': SCHEMA_VERSION, 'public/meta/schemaVersion': SCHEMA_VERSION });
  return { seeded: true, exams };
}
