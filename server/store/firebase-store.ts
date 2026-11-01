/**
 * Production store: Firebase Realtime Database through the Admin SDK.
 * Credentials (server only, never sent to the browser):
 *  1. FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (recommended on Netlify: the
 *     whole service-account JSON can exceed the 4 KB function env limit), or
 *  2. FIREBASE_SERVICE_ACCOUNT_JSON (the JSON key, raw or base64), or
 *  3. Application Default Credentials (Cloud Run / `gcloud auth application-default login`).
 */
import { initializeApp, applicationDefault, cert, getApps, type App, type Credential } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { assertSafePath, type Store } from './types.js';
import { timeKey } from './file-store.js';

export function adminCredential(env: NodeJS.ProcessEnv = process.env): Credential {
  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') });
  }
  const json = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    const text = json.startsWith('{') ? json : Buffer.from(json, 'base64').toString('utf8');
    const sa = JSON.parse(text) as { project_id?: string; client_email?: string; private_key?: string };
    if (!sa.client_email || !sa.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing client_email/private_key.');
    if (env.FIREBASE_PROJECT_ID && sa.project_id && sa.project_id !== env.FIREBASE_PROJECT_ID) throw new Error('The service account belongs to a different Firebase project.');
    return cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key });
  }
  return applicationDefault();
}

export class FirebaseStore implements Store {
  readonly kind = 'firebase' as const;
  private db: Database;
  private app: App;

  constructor(opts: { projectId: string; databaseUrl: string; storageBucket?: string }) {
    this.app =
      getApps()[0] ??
      initializeApp({
        credential: adminCredential(),
        projectId: opts.projectId || undefined,
        databaseURL: opts.databaseUrl,
        storageBucket: opts.storageBucket || undefined,
      });
    this.db = getDatabase(this.app);
  }

  get firebaseApp(): App {
    return this.app;
  }

  async get<T>(path: string): Promise<T | null> {
    assertSafePath(path);
    const snap = await this.db.ref(path).get();
    return snap.exists() ? (snap.val() as T) : null;
  }

  async set(path: string, value: unknown): Promise<void> {
    assertSafePath(path);
    await this.db.ref(path).set(value);
  }

  async update(updates: Record<string, unknown>): Promise<void> {
    for (const p of Object.keys(updates)) assertSafePath(p);
    // Root-level multi-path update is atomic in Realtime Database.
    await this.db.ref().update(updates);
  }

  async remove(path: string): Promise<void> {
    assertSafePath(path);
    await this.db.ref(path).remove();
  }

  async transaction<T>(path: string, fn: (current: T | null) => T | null | undefined): Promise<boolean> {
    assertSafePath(path);
    const result = await this.db.ref(path).transaction((current: T | null) => fn(current ?? null));
    return result.committed;
  }

  newKey(): string {
    return timeKey();
  }

  async lastChildren<T>(path: string, limit: number): Promise<Record<string, T>> {
    assertSafePath(path);
    const snap = await this.db.ref(path).orderByKey().limitToLast(limit).get();
    return (snap.val() ?? {}) as Record<string, T>;
  }

  /** Verifies connectivity at startup so a broken production DB fails loudly. */
  async ping(): Promise<void> {
    await this.db.ref('system/schemaVersion').get();
  }
}
