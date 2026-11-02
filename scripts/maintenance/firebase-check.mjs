/**
 * Read-only connectivity check for Firebase project mjlis-26-27.
 * Never writes. Usage: node scripts/maintenance/firebase-check.mjs
 *  1. Web app config: asks Firebase for the app's config with the public API key
 *     (proves key + appId belong to the project).
 *  2. Realtime Database: unauthenticated shallow read of / and /public — with the
 *     repository rules, "/" must be denied and "/public" readable once deployed.
 */
const PROJECT = 'mjlis-26-27';
const API_KEY = 'AIzaSyDN9mAV7ImnPmSHWehF5iyVHHqV2P5m-Js';
const APP_ID = '1:786348734775:web:e154be65461ee9c37a02b2';
const DB = 'https://mjlis-26-27-default-rtdb.firebaseio.com';

async function get(label, url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log(`${label}: HTTP ${res.status} ${text.slice(0, 300).replace(/\s+/g, ' ')}`);
    return { status: res.status, text };
  } catch (e) {
    console.log(`${label}: NETWORK ERROR ${e.message}`);
    return { status: 0, text: '' };
  }
}

const cfg = await get('web-config', `https://firebase.googleapis.com/v1alpha/projects/-/apps/${APP_ID}/webConfig?key=${API_KEY}`);
if (cfg.status === 200) {
  const j = JSON.parse(cfg.text);
  console.log(`  projectId=${j.projectId} databaseURL=${j.databaseURL ?? '(none)'} storageBucket=${j.storageBucket} measurementId=${j.measurementId}`);
  console.log(`  matches expected project: ${j.projectId === PROJECT}`);
}
await get('rtdb root (shallow)', `${DB}/.json?shallow=true`);
await get('rtdb public (shallow)', `${DB}/public.json?shallow=true`);
