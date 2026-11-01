import { defineConfig } from 'vitest/config';

/** Runs only under `firebase emulators:exec` (see `npm run test:rules`). */
export default defineConfig({
  test: { include: ['tests/rules/**/*.test.ts'], environment: 'node', testTimeout: 30000 },
});
