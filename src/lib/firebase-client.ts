/**
 * The single Firebase Web app for project mjlis-26-27 (config comes from
 * /api/config, i.e. the server's PUBLIC_FIREBASE_* env). Loaded lazily so demo
 * mode and first paint never download the SDK.
 *  - Realtime Database: the live `public/` subscription.
 *  - Storage: available for reads; uploads never use it (they go through a
 *    short-lived signed URL issued by the server after admin login).
 *  - Analytics: only when a measurement id is configured AND isSupported();
 *    any failure is ignored so it can never break the site.
 */
import type { FirebaseApp } from 'firebase/app';

let appPromise: Promise<FirebaseApp> | null = null;

export function getFirebaseApp(cfg: Record<string, string>): Promise<FirebaseApp> {
  appPromise ??= import('firebase/app').then(({ initializeApp, getApps }) => {
    const app = getApps()[0] ?? initializeApp(cfg);
    if (cfg.measurementId) void startAnalytics(app);
    return app;
  });
  return appPromise;
}

async function startAnalytics(app: FirebaseApp): Promise<void> {
  try {
    const { isSupported, getAnalytics } = await import('firebase/analytics');
    if (await isSupported()) getAnalytics(app);
  } catch {
    /* analytics is optional */
  }
}

export async function getFirebaseDatabase(cfg: Record<string, string>) {
  const [app, { getDatabase }] = await Promise.all([getFirebaseApp(cfg), import('firebase/database')]);
  return getDatabase(app);
}

export async function getFirebaseStorage(cfg: Record<string, string>) {
  const [app, { getStorage }] = await Promise.all([getFirebaseApp(cfg), import('firebase/storage')]);
  return getStorage(app);
}
