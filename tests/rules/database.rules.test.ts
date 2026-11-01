/**
 * Realtime Database security rules, run against the Firebase emulator:
 *   npm run test:rules   (requires firebase-tools and Java; see docs/testing.md)
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, get, set } from 'firebase/database';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-amal-council',
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, 'public/announcements/a1'), { title: 'x' });
    await set(ref(db, 'content/announcements/a2'), { title: 'draft' });
    await set(ref(db, 'private/certificates/h'), { studentName: 'x' });
  });
});
afterAll(() => env?.cleanup());

describe('database rules', () => {
  it('lets anyone read the published tree', async () => {
    await assertSucceeds(get(ref(env.unauthenticatedContext().database(), 'public')));
  });
  it('blocks every client write, even to public', async () => {
    await assertFails(set(ref(env.unauthenticatedContext().database(), 'public/announcements/hack'), { title: 'x' }));
    await assertFails(set(ref(env.authenticatedContext('someone').database(), 'public/x'), 1));
  });
  it('blocks reading drafts, certificates, audit and the root', async () => {
    const db = env.unauthenticatedContext().database();
    await assertFails(get(ref(db, 'content')));
    await assertFails(get(ref(db, 'private/certificates')));
    await assertFails(get(ref(db, 'private/adminAudit')));
    await assertFails(get(ref(db, '/')));
  });
});
