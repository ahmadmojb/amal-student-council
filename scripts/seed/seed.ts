/**
 * Initialises the database with the provisional Bagrut seed and default settings.
 *
 *   npm run seed                                  → demo store (.data/)
 *   npm run seed -- --production --confirm        → Firebase (requires production env + ADC)
 *
 * Safe to re-run: existing records with the same id are never overwritten.
 */
import { loadDotEnv, readConfig } from '../../server/config.js';
import { createStore, seedInitialData } from '../../server/bootstrap.js';

loadDotEnv();
const args = new Set(process.argv.slice(2));
if (args.has('--production')) {
  process.env.DATA_MODE = 'production';
  if (!args.has('--confirm')) {
    console.error('Refusing to write to the production database without --confirm.');
    process.exit(1);
  }
}
const config = readConfig();
const { store } = await createStore(config);
const result = await seedInitialData(store, { force: args.has('--force') });
console.log(result.seeded ? `Seeded ${result.exams} provisional Bagrut records into ${config.dataMode} storage.` : 'Already initialised (use --force to add any missing seed records).');
await store.close?.();
process.exit(0);
