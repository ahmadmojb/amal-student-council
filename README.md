# مجلس الطلاب — المدرسة الثانوية الشاملة عمال يوسف شاهين، الطيبة

The official website and practical portal of the **Amal School Student Council** (Taybeh):
announcements, the official daily program, corridor-TV display, the school football league,
a Bagrut exam calendar, verified student discounts, a school-services directory, an
activities archive and verifiable participation certificates — with one protected admin
dashboard. Students never need an account.

Stack: React 19 + TypeScript + Vite · Express 5 · Firebase Realtime Database & Storage
(Admin SDK on the server) · zod · Vitest · Playwright.

## Quick start (demo mode — no credentials needed)

Requirements: Node.js 20.19+ (tested on Node 24), npm.

```bash
npm install
npm run dev            # http://localhost:3000  — site + API in one process
```
Windows: double-click `tools\setup.cmd`, then `tools\dev.cmd`.

* Demo mode keeps data in `.data/` on this machine and shows a "وضع تجريبي" banner.
  It does **not** sync to other servers or devices.
* Admin: http://localhost:3000/admin — demo PIN `demo-1234` (set `ADMIN_PIN` in `.env` to change).
* Optional labelled sample content: `npm run seed:demo-samples`.

Copy `.env.example` to `.env` to configure. Production needs `DATA_MODE=production`,
`ADMIN_PIN`, `SESSION_SECRET`, `PUBLIC_SITE_URL` and the Firebase values — see
`docs/deployment.md`.

## Routes
`/` · `/program` · `/display` (TV) · `/league` · `/bagrut` · `/benefits` · `/services` ·
`/activities` · `/verify?code=…` · `/admin`

## Scripts
| | |
|---|---|
| `npm run dev` | dev server (Express + Vite middleware), one terminal |
| `npm run build` / `npm start` | production build / run |
| `npm run typecheck` · `npm run lint` · `npm test` | checks, unit + integration tests |
| `npm run test:e2e` | Playwright browser tests (starts its own server) |
| `npm run test:rules` | Firebase rules in the emulator |
| `npm run seed` | provisional Bagrut seed + defaults (`-- --production --confirm` for Firebase) |
| `npm run republish` | rebuild the public projection |

## Documentation
| File | Topic |
|---|---|
| `docs/STATUS.md` | **implementation status report** (what is done, tested, waiting) |
| `docs/architecture.md` | architecture, modes, folders, dates, performance |
| `docs/database.md` | schema, rules, initialisation |
| `docs/security.md` | auth, CSRF, certificates, uploads, privacy, audit |
| `docs/schedule-video.md` | daily schedule video: upload or external link, date, midnight expiry, clean-up |
| `docs/netlify.md` | Netlify deployment: functions, scheduled clean-up, environment variables, steps |
| `docs/bagrut.md` | exam data source & verification procedure |
| `docs/league.md` | competition model, corrections, tie-breaks |
| `docs/deployment.md` | Firebase Hosting + Cloud Run deployment |
| `docs/operations.md` | TV display, admin, certificates, branding |
| `docs/testing.md` | test suites and how to run them |
| `CLAUDE.md` | conventions for future Claude Code sessions |

## Development tools for Claude Code
The specification asks future Claude Code sessions to use these. Run once in this folder
(they modify your local Claude Code setup, so they are not run automatically):

```bash
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin install frontend-design@claude-plugins-official
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a claude-code -y
npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices -a claude-code -y
npx skills add vercel-labs/agent-skills --skill building-components -a claude-code -y
claude plugin marketplace add firebase/agent-skills && claude plugin install firebase@firebase
claude plugin marketplace add upstash/context7 && claude plugin install context7@context7-marketplace
claude mcp add playwright npx @playwright/mcp@latest
```
* **Frontend Design** — visual direction (used during this build via the equivalent built-in skill).
* **Web Design Guidelines / React Best Practices / Building Components** — UI review and component rules.
* **Firebase** — database rules, Admin SDK, deployment guidance.
* **Context7** — version-specific library docs.
* **Playwright MCP** — interactive browser checks (the repo also has Playwright Test).
