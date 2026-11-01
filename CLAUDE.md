# CLAUDE.md — Amal School Student Council website

Arabic-first (RTL) public site + protected admin for the student council of
المدرسة الثانوية الشاملة عمال يوسف شاهين – الطيبة. Read `docs/architecture.md` first.

## Commands
- `npm run dev` — server + Vite on http://localhost:3000 (demo mode, data in `.data/`, admin PIN `demo-1234` unless `ADMIN_PIN` is set)
- `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:e2e` · `npm run build`
- `npm run seed` · `npm run seed:demo-samples` (demo only) · `npm run republish`
- Netlify: `netlify.toml`, `netlify/functions/api.ts` (Express via serverless-http), `netlify/functions/schedule-video-cleanup.ts` (`docs/netlify.md`)
- Windows helpers: `tools\setup.cmd`, `tools\check.cmd`, `tools\e2e.cmd`, `tools\dev.cmd` (write `logs\*.log`)

## Layout
`shared/` (zod schemas, league/bagrut/date logic — single source of business rules) ·
`server/` (Express: routes, services, security, store, schedule-video) ·
`src/` (React: app, components/ui+layout, features/*, lib, styles) · `tests/` · `docs/`.

## Rules that must not be broken
- **Never invent real-world data**: no teams, results, businesses, discounts, phone numbers,
  rooms, staff names, hours, exam times. Use empty states. Demo samples must say "تجريبي"
  and only run in demo mode.
- Bagrut records stay `provisional` until verified against the Ministry timetable (`docs/bagrut.md`).
  `questionnaireNumbers` (מספר שאלון) are strings; leave empty unless verified — never guess.
- All writes go through `/api/admin/*` → zod validation → `ContentService` (atomic
  multi-path update of `content/`, `public/` and the audit log). Never write `public/` directly.
- Database/storage rules: public read of `public/` only; no client writes. Do not loosen.
- Secrets only from env (`ADMIN_PIN`, `SESSION_SECRET`); never in client code or responses.
- Admin requests need the `x-amal-request: 1` header (use `src/lib/api.ts`).
- Date-only values are `YYYY-MM-DD` strings; use `shared/dates.ts`; never `new Date('YYYY-MM-DD')`.
  "Today" is Asia/Jerusalem.
- Daily schedule video (`docs/schedule-video.md`): one source — uploaded MP4/WebM or an
  allowlisted external link (direct MP4/WebM, YouTube, Vimeo; validated in `shared/video-source.ts`,
  never fetched by the server, never dsp.shahaf.info) — shared by /program and /display, valid until 00:00 Asia/Jerusalem ending its upload day. Deletion is
  server-side only (`ScheduleVideoService.cleanup`, id-checked transactions); never delete
  from browser timers. No reload/refresh timers on the TV.
- Keep zod out of public pages: import value constants from `shared/constants.ts`,
  defaults from `shared/defaults.ts`, and use `import type` for schema types.
- Activity photos need per-photo approval (`approved: true`); no student uploads.

## Conventions
- Arabic UI copy, sentence-style, active verbs ("حفظ ونشر" → toast "تم نشر …").
- Design tokens in `src/styles/tokens.css`; brand blue/lime are fills, darker partners carry text.
  Use logical CSS properties (`inline-start`) for RTL.
- Components: `components/ui` (Dialog, ConfirmDialog, toasts, states), feature folders own
  their pages. Admin sections use `CollectionManager` + declarative `FieldDef`s.
- Strict TypeScript, no `any`. Tests accompany logic changes (`tests/unit`), API changes
  (`tests/integration`), and UI flows (`tests/e2e`).

## Before finishing a change
`npm run typecheck && npm run lint && npm test && npm run build`, and `npm run test:e2e`
for UI changes. Don't disable rules or delete tests to get green.
