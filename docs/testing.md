# Testing

| Command | What it covers |
|---|---|
| `npm run typecheck` | strict TypeScript for client, server/scripts and tests |
| `npm run lint` | ESLint (typescript-eslint, react-hooks) |
| `npm test` | Vitest: unit (dates, league, bagrut, visibility, schemas, security) + integration (supertest against the real Express app with an in-memory store: auth, CSRF, sessions, rate limits, content lifecycle, league propagation & conflicts, certificates, uploads, daily schedule video: upload/validation/replace/expiry/stale-cleanup race/retry/cron auth) |
| `npm run test:e2e` | Playwright (Chromium) against `npm run dev` in demo mode with an isolated `.data-e2e/`: every public route, console errors, navigation, mobile menu, homepage areas, Bagrut filters/calendar/preferences, league views, admin login/CRUD/preview/publish/delete-confirm, real-time update of an open public page, bracket generation & results, certificate issue/print-to-PDF/verify/revoke, daily video upload with progress → live update of open /display and /program with the upload-date heading, autoplay fallback, delete → empty state, axe-core WCAG 2.2 AA scans, no horizontal overflow at 375/390/768/1366/1440/1920 px with full-page screenshots in `test-results/screens/` |
| `npm run test:rules` | Realtime Database rules in the Firebase Emulator (`npm i -g firebase-tools`, Java 11+) |
| `npm run build` | production client + server build |
| `npm run audit:deps` | `npm audit --omit=dev` |

On Windows, `tools\check.cmd` and `tools\e2e.cmd` run these and write `logs\*.log`.

Video expiry is tested without waiting for midnight by passing `now` to
`ScheduleVideoService.cleanup(now)` / `getActivePublic(now)` and mocking `Date.now`.
