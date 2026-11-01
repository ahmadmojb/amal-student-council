/**
 * DEMO-ONLY sample content for screenshots and manual testing.
 * Every record is explicitly labelled "تجريبي" and this script refuses to run
 * against production. Remove with: delete the .data/ folder.
 */
import { loadDotEnv, readConfig } from '../../server/config.js';
import { createStore, seedInitialData } from '../../server/bootstrap.js';
import { ContentService } from '../../server/services/content.js';
import { LeagueService } from '../../server/services/league.js';
import { todayInSchool, addDays } from '../../shared/dates.js';

loadDotEnv();
const config = readConfig();
if (config.dataMode !== 'demo') {
  console.error('demo-samples only runs in DATA_MODE=demo.');
  process.exit(1);
}
const { store } = await createStore(config);
await seedInitialData(store);
const content = new ContentService(store);
const league = new LeagueService(store, content);
const today = todayInSchool();
const tag = 'demo-sample';

await content.create('announcements', { title: 'إعلان تجريبي: اجتماع مجلس الطلاب', body: 'هذا محتوى تجريبي لعرض شكل الإعلانات فقط، وليس إعلانًا حقيقيًا.', priority: 'important', publishDate: today, visibility: 'published' }, tag);
await content.create('scheduleNotices', { title: 'ملاحظة تجريبية حول برنامج اليوم', body: 'محتوى تجريبي لعرض الشاشة.', activeOn: today, expiresOn: addDays(today, 7), visibility: 'published' }, tag);

const ids: string[] = [];
for (const n of ['أ', 'ب', 'ج', 'د', 'هـ']) {
  const t = await content.create('teams', { className: `تجريبي ${n}`, grade: 10, displayName: `فريق تجريبي ${n}`, visibility: 'published' }, tag);
  ids.push(t.id);
}
const matches = await league.generateGradeBracket(10, ids, true, tag);
for (const m of matches) await content.setVisibility('matches', m.id, 'published', tag);
const firstReal = matches.find((m) => m.round === 1 && !m.isBye);
if (firstReal) await league.setResult(firstReal.id, { status: 'completed', homeScore: 2, awayScore: 1, homePenalties: null, awayPenalties: null, confirmDownstreamReset: false }, tag);

console.log('Demo sample content added (all labelled "تجريبي").');
await store.close?.();
process.exit(0);
