# Netlify deployment (prepared — NOT deployed)

Nothing in this document has been run against production. Deploying, connecting the
domain, deploying Firebase rules or writing to the live database all need explicit
authorisation from the school.

## What runs where
| Part | Netlify piece | Source |
|---|---|---|
| React client (`/`, `/program`, `/display`, `/bagrut`, `/admin`, …) | static files from `dist/` + SPA fallback | `npm run build:client` |
| Express API (`/api/*`, `/healthz`) | Function `api` (serverless-http) | `netlify/functions/api.ts` → `server/app.ts` |
| Daily video clean-up | Scheduled Function every 10 min (UTC cron) | `netlify/functions/schedule-video-cleanup.ts` |
| Security headers for static pages | `[[headers]]` | `netlify.toml` (CSP is unit-tested to equal the server CSP) |

`netlify.toml` routes `/api/*` and `/healthz` to the function **before** the `/* → /index.html`
fallback, so API calls never get the SPA.

Serverless notes:
- Admin sessions are HMAC-signed HttpOnly cookies (stateless); logouts are stored in the
  database, so all function instances agree. Login limits (8 failures / 15 min per client,
  30 / 15 min overall) are stored in the database too (`private/loginLimits`).
- Function request bodies are limited (~6 MB). The 250 MB daily video therefore never passes
  through a function: the function issues a 30-minute signed PUT URL, the browser uploads
  straight to Firebase Storage, and `/api/admin/schedule-video/finalize` verifies size and
  real container type before publishing. Admin image/PDF uploads stay small and use the function.
- External video links are validated by syntax + allowlist; the function never fetches them.

## Environment variables (Netlify → Project configuration → Environment variables)
Local `.env` values are **not** uploaded. Create these in the Netlify UI.

| Variable | Value | Scope | Secret |
|---|---|---|---|
| `NODE_ENV` | `production` | **Functions only** (in Builds it would skip dev dependencies and break `vite build`) | no |
| `DATA_MODE` | `production` | Functions | no |
| `PUBLIC_SITE_URL` | `https://<your-site>` (defaults to Netlify's `URL`) | Functions | no |
| `ADMIN_PIN` | ≥ 10 characters | Functions | **yes** |
| `SESSION_SECRET` | ≥ 32 random characters | Functions | **yes** |
| `CRON_SECRET` | ≥ 32 random characters (only for the optional external trigger) | Functions | **yes** |
| `FIREBASE_PROJECT_ID` | `mjlis-26-27` | Functions | no |
| `FIREBASE_DATABASE_URL` | `https://mjlis-26-27-default-rtdb.firebaseio.com` | Functions | no |
| `FIREBASE_STORAGE_BUCKET` | `mjlis-26-27.firebasestorage.app` | Functions | no |
| `FIREBASE_CLIENT_EMAIL` | service account e-mail | Functions | **yes** |
| `FIREBASE_PRIVATE_KEY` | service account private key (`\n` escapes are fine) | Functions | **yes** |
| `VITE_FIREBASE_API_KEY` | `AIzaSyDN9mAV7ImnPmSHWehF5iyVHHqV2P5m-Js` | Functions | no (public) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `mjlis-26-27.firebaseapp.com` | Functions | no |
| `VITE_FIREBASE_PROJECT_ID` | `mjlis-26-27` | Functions | no |
| `VITE_FIREBASE_DATABASE_URL` | `https://mjlis-26-27-default-rtdb.firebaseio.com` | Functions | no |
| `VITE_FIREBASE_STORAGE_BUCKET` | `mjlis-26-27.firebasestorage.app` | Functions | no |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `786348734775` | Functions | no |
| `VITE_FIREBASE_APP_ID` | `1:786348734775:web:e154be65461ee9c37a02b2` | Functions | no |
| `VITE_FIREBASE_MEASUREMENT_ID` | `G-PKKWM1CDP7` | Functions | no |

The web config is delivered to browsers at runtime by `/api/config` (it is not baked into the
bundle), so the `VITE_FIREBASE_*` values are needed by the function, not by the build.
Prefer `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` over `FIREBASE_SERVICE_ACCOUNT_JSON`:
AWS-based functions have a 4 KB limit for all environment variables together.

## Service account (Firebase console → Project settings → Service accounts)
Create a key for a service account with **Firebase Realtime Database Admin** and **Storage
Object Admin** on `mjlis-26-27`. With a private key the server signs upload URLs itself (no
Token Creator role needed). Never commit the key; paste it only into Netlify.

## Firebase Storage CORS (for the browser's direct upload)
```json
[{"origin":["https://<your-site>"],"method":["PUT"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]
```
`gsutil cors set cors.json gs://mjlis-26-27.firebasestorage.app`

## Steps (after authorisation)
1. Netlify → Add new project → import the Git repository (build settings come from `netlify.toml`).
2. Add the environment variables above, with the scopes shown.
3. Deploy; then check `https://<site>/healthz`, `/api/config` (must show project `mjlis-26-27`),
   `/program`, `/display`, `/admin` (log in), and a refresh on each route.
4. Deploy the rules: `firebase deploy --only database,storage --project mjlis-26-27`.
5. Seed once: `npm run seed -- --production --confirm` with the production env locally.
6. Netlify → Functions → `schedule-video-cleanup` → **Run now**; check the log line
   `[schedule-video-cleanup] {...}`. Scheduled functions run only on the published deploy.
7. Set the bucket CORS above; upload a test video in /admin and watch it appear on /display.

## Local checks
- `npx vitest run tests/unit/netlify.test.ts` — netlify.toml routing/CSP + the Express API through the function handler.
- `npx netlify dev` (Netlify CLI) serves dist + functions locally; it does not run scheduled
  functions on their schedule — use `npx netlify functions:invoke schedule-video-cleanup`.
