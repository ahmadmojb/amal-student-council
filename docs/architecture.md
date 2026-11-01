# Architecture

```
┌──────────────── Browser ────────────────┐        ┌──────────── Server (Express, Node 20+) ────────────┐
│ React 19 + React Router (Vite build)     │  HTTPS │ /api/config           runtime config (no secrets)  │
│  public pages ── read ──────────────┐    │ ─────► │ /api/verify           certificate check (rate-ltd) │
│                                      │    │        │ /api/admin/*          session + CSRF + zod         │
│  /admin ── fetch /api/admin/* ───────┼──► │        │ /api/public/stream    demo-mode SSE only           │
│                                      │    │        │ /api/cron/*           scheduled cleanup (bearer)   │
└──────────────────────────────────────┼────┘        └──────────────┬──────────────────────────────────────┘
                                       │ onValue('public')           │ Admin SDK (service account / ADC)
                                       ▼                              ▼
                         Firebase Realtime Database: public/ (read-only)  content/ private/ system/ (server only)
                         Firebase Storage: public-media/ (read-only, written by server)
```

* **One process, one port.** In development `server/index.ts` mounts Vite as middleware,
  so `npm run dev` starts frontend + API together. In production the same server serves
  `dist/`.
* **Shared code** in `shared/` (schemas, league logic, Bagrut filters, dates) is imported
  by both server and client. Business rules exist once.
* **Reads vs writes.** Visitors read only the `public/` projection (live Firebase listener
  in production; SSE from the local store in demo mode). Every write goes through
  `/api/admin/*`, which validates with the shared zod schemas and writes the private
  record, its public projection and an audit entry in **one atomic multi-path update**.
* **Public projection.** `server/services/content.ts › toPublic()` keeps only
  `visibility === 'published'` records that are not past `expiresOn`, and strips private
  fields (`adminNotes`, team notes). A daily job (and an admin button) rebuilds `public/`.
  The client re-checks expiry at render time as well.

## Folders

```
shared/        schemas (zod), constants, defaults, league + bagrut logic, dates, visibility
server/        config, app factory, routes (public/admin), services (content, league, media),
               security (session, CSRF, certificate codes), store (file | firebase)
src/           app shell & routes, components (ui, layout), features/*, lib (api, data, pwa), styles
tests/         unit, integration (supertest), e2e (Playwright), rules (Firebase emulator)
scripts/       seed, demo samples (demo only), republish
tools/         Windows helper scripts (setup / check / e2e / dev) writing to logs/
docs/          this documentation
```

## Modes

| | demo | production |
|---|---|---|
| Store | `.data/demo-db.json` on this machine | Firebase Realtime Database |
| Uploads | `.data/uploads/` served at `/uploads/` | Firebase Storage `public-media/` |
| Live updates | SSE from this server (same server only) | Firebase `onValue` (all devices) |
| Admin PIN | `ADMIN_PIN` or the demo PIN `demo-1234` | `ADMIN_PIN` (≥10 chars) required |
| Banner | "وضع تجريبي" on every page and in admin | none |

There is no fallback between modes: a production database error is shown as an error.
`NODE_ENV=production` requires an explicit `DATA_MODE`.

## Dates

Date-only fields are `YYYY-MM-DD` strings, never parsed with `new Date('YYYY-MM-DD')`.
They are formatted by anchoring at 12:00 UTC and formatting with `timeZone: 'UTC'`;
"today" is computed in `Asia/Jerusalem`. Arabic with Latin digits (`ar-u-nu-latn`).

## Performance

* Route-level code splitting; the homepage is in the main chunk, the admin is a separate
  chunk (with its own CSS). zod is kept out of public pages (`shared/constants.ts`,
  `shared/defaults.ts`).
* Firebase web SDK is loaded lazily and only in production mode.
* One realtime listener for the whole (small) public tree, unsubscribed on unmount.
* Fonts are self-hosted (IBM Plex Sans Arabic via Fontsource) with `unicode-range` subsets.
