/** Rebuilds public/ from content/ (drops expired/unpublished items). Same as the admin button. */
import { loadDotEnv, readConfig } from '../../server/config.js';
import { createStore } from '../../server/bootstrap.js';
import { ContentService } from '../../server/services/content.js';

loadDotEnv();
const { store } = await createStore(readConfig());
const n = await new ContentService(store).republishAll('cli');
console.log(`Republished ${n} records.`);
await store.close?.();
process.exit(0);
