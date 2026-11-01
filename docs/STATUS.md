# Implementation status report

Build date: 31 October 2026. Environment used for verification: Windows 11, Node 24.19,
npm 11.17, Chromium (Playwright), plus a real Chromium browser pane for the provider
investigation.

## Verification results (last run)
| Check | Result |
|---|---|
| `npm run typecheck` (client, server/scripts, tests) | ✅ pass |
| `npm run lint` | ✅ pass |
| `npm test` — Vitest unit + integration | ✅ 82 tests pass |
| `npm run build` (client + server) | ✅ pass |
| `npm run test:e2e` — Playwright, Chromium (built client) | ✅ 33 / 33 pass |
| `npm audit --omit=dev` | 6 moderate, 0 high, 0 critical (see Known limitations) |
| `npm run test:rules` (Firebase emulator) | ⏳ written, not run — needs firebase-tools + Java |

## ✅ Completed and tested
- Public routes `/ /program /display /league /bagrut /benefits /services /activities /verify /admin`, 404 page, Arabic RTL, no console errors (E2E).
- Homepage with all eight areas, the live "today" board, honest empty states (E2E).
- Admin: PIN login (wrong PIN rejected), HttpOnly SameSite=Strict session, expiry, logout revocation, rate limiting, CSRF header + origin checks, 401/403/404/409 handling (integration + E2E).
- Content lifecycle for every section: create, validate (field errors), preview, publish, unpublish, archive, delete with confirmation, audit log (integration + E2E for announcements).
- Real-time update: unpublishing in admin removes the item from an already-open public page (E2E, demo SSE).
- Automatic expiry of announcements/benefits/notices (unit + integration).
- League: teams (unique per grade), seeded bracket generation with byes, result entry, penalties validation, progression, correction conflicts (409) and confirmed downstream reset, champions, round-robin standings with configurable tie-breakers and unresolved-tie flag, public bracket/results views (unit + integration + E2E).
- Bagrut: 12 provisional seed records, list + calendar views, search (Arabic-normalised), grade/class/track/subject/type/date filters, "show all", locally saved preferences, window-day expansion, provisional/final badges, verified-time-only display (unit + E2E).
- Certificates: CSPRNG codes, hash-only storage, QR, print/PDF (Arabic verified in exported PDF), verify valid/revoked/unknown, rate-limited, noindex, revocation (integration + E2E).
- Uploads: magic-byte sniffing, size/dimension limits, WebP re-encode stripping metadata, disguised files rejected (integration).
- TV display: 16:9 layout, Jerusalem clock, connection status, rotating council notices; the official iframe is the same DOM node across rotations (E2E). No site navigation.
- Daily schedule video: admin upload (progress/cancel/validation), replace, delete, shared by /program and /display with the upload-date heading, live updates, autoplay fallback (E2E); midnight expiry incl. DST, stale-cleanup race, retry, cron auth (unit + integration).
- Responsive: no horizontal overflow on all public routes + admin login at 375, 390, 768, 1366, 1440, 1920 px; screenshots reviewed (E2E).
- Accessibility: axe-core WCAG 2.2 AA scans with zero serious/critical issues on `/`, `/bagrut`, `/league`, `/verify`, `/admin` (E2E).
- PWA: manifest, icons, service worker with network-first navigation and no caching of `/api`, admin, verify or schedule videos; first-install reload bug found by E2E and fixed.

## 🟡 Implemented but not fully verified
- **Production mode with Firebase** (FirebaseStore, live `onValue` subscription, Firebase Storage uploads): code complete and type-checked, but no Firebase project was available. Needs a run against a real/emulated project.
- **Database & storage rules tests**: `tests/rules/` written; run `npm run test:rules` with the emulator.
- **Daily video sources**: upload (MP4/WebM) or external link (direct MP4/WebM, YouTube, Vimeo); muted autoplay + loop on /program and /display; link validation without server fetches. YouTube/Vimeo verified against stubbed provider pages in E2E, not against the real providers.
- **Bagrut**: Hebrew names + `מספר שאלון` fields, search and admin editing done. **No questionnaire number is filled in**: the Ministry's Winter 2027 timetable is still a draft and its PDF text could not be read reliably, so all numbers show «بانتظار التحقّق». Hebrew names are filled only where the Ministry draft uses them (מתמטיקה, אנגלית, עברית לערבים) or were already present; Arabic language and Arabic literature still need their official Hebrew names.
- **Firebase `mjlis-26-27` / Netlify**: configuration, function adapter and scheduled clean-up prepared and unit-tested locally; no service-account credentials were provided, so no authenticated read/write against the real project was possible; nothing deployed (`docs/netlify.md`).
- **Daily video in production**: signed-URL upload to Firebase Storage and `finalize` are type-checked but untested without a project. **The scheduled clean-up (Netlify Scheduled Function) is NOT deployed**, so automatic midnight deletion in production is not active yet (reads already hide expired videos; an in-process 60 s sweep runs while an instance is up). Setup: `docs/schedule-video.md`.
- **PWA install & update prompts**: service worker registers in the built app (E2E runs the built client); installation itself was not exercised in a real device.
- **Cloud Run / Firebase Hosting deployment**: Dockerfile and docs written; nothing deployed.

## 🔑 Waiting for credentials
`ADMIN_PIN`, `SESSION_SECRET`, `CRON_SECRET`, `PUBLIC_SITE_URL`, Firebase project (RTDB URL, web config, storage bucket), Cloud Run service account roles. See `docs/deployment.md`.

## 🏫 Waiting for school-approved content
Approved logo and app icons (placeholders are marked), teams and fixtures, final match rules and tie-breakers, verified Bagrut dates/eligibility (written dates still unverified — `docs/bagrut.md`), benefits/discounts, service locations/hours/contacts, activity texts and photos with publication approval, official footer links.

## ⛔ Not implemented, with reason
- Claude Code plugins/skills installation (`claude plugin …`, `npx skills add …`) — these change the user's local Claude Code configuration and the build sandbox could not reach their registries; exact commands are in the README to run once.

## Known limitations
- Rate-limit counters live in memory per server instance (fine for 1–2 instances; documented).
- Demo mode syncs only between browsers connected to the same server; it is clearly labelled.
- `npm audit --omit=dev`: 6 moderate advisories in transitive `glob`/`minimatch` (inside `firebase-admin`'s Google Cloud client) — no untrusted glob input reaches them. Dev-only tooling (ESLint 9) has further moderate advisories. The `@grpc/grpc-js` advisory is resolved through an `overrides` entry.

## Final E2E run (31 Oct 2026, Windows 11, Chromium)
33 passed: admin (wrong PIN, announcement lifecycle incl. live update, league bracket + results,
certificate issue/PDF/verify/revoke, logout), TV display iframe stability, program embed,
8 public routes without console errors, homepage areas, navigation, mobile menu, Bagrut
filters/calendar/preferences, league views, verify noindex, 404, 5 axe-core scans,
6 responsive viewports. Screenshots: `test-results/screens/` (regenerated on each run).

Defects found and fixed during testing: service-worker first-install reload wiping form
input; Vite HMR port clash in development; search icon overlapping placeholders; duplicated
"eligibility unconfirmed" label; toasts covering the admin sidebar; certificate code wrapping;
duplicate teams allowed in the same grade (now rejected with 409).
