// Removes the isolated E2E demo data before the test server starts.
import { rmSync } from 'node:fs';
rmSync('.data-e2e', { recursive: true, force: true });
console.log('[e2e] fresh demo data directory');
