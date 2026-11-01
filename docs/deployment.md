# Deployment (chosen architecture)

**Firebase Hosting → Cloud Run (Express container) + Firebase Realtime Database + Firebase Storage.**

* Cloud Run runs the `Dockerfile` image: it serves the built React app, `/api/*`, and
  and receives the midnight Cloud Scheduler call for the daily video cleanup.
* Firebase Hosting rewrites all paths to the Cloud Run service (`firebase.json`), giving a
  single origin for site + API (simple cookies/CSRF, PWA scope).
* Firebase RTDB holds data; browsers read `public/` directly with live listeners.
* Secrets (ADMIN_PIN, SESSION_SECRET) live in **Secret Manager**, mounted as env vars.
  The Admin SDK authenticates with the Cloud Run service account — no key files.

## One-time setup (requires explicit authorisation from the school)
1. Create a Firebase project; enable Realtime Database (region e.g. `europe-west1`) and Storage.
2. Register a Web app; note apiKey, authDomain, databaseURL, projectId, appId.
3. Grant the Cloud Run service account **Firebase Realtime Database Admin** and
   **Storage Object Admin** on the project.
4. `firebase deploy --only database,storage` (rules from this repo).
5. Create secrets: `amal-admin-pin`, `amal-session-secret` (48+ random chars).
6. Build & deploy:
   ```
   gcloud run deploy amal-council --source . --region europe-west1 --allow-unauthenticated \
     --set-env-vars NODE_ENV=production,DATA_MODE=production,PUBLIC_SITE_URL=https://<domain>,\
FIREBASE_PROJECT_ID=<id>,FIREBASE_DATABASE_URL=<url>,FIREBASE_STORAGE_BUCKET=<bucket>,\
PUBLIC_FIREBASE_API_KEY=<key>,PUBLIC_FIREBASE_AUTH_DOMAIN=<d>,PUBLIC_FIREBASE_PROJECT_ID=<id>,PUBLIC_FIREBASE_APP_ID=<app> \
     --set-secrets ADMIN_PIN=amal-admin-pin:latest,SESSION_SECRET=amal-session-secret:latest
   ```
7. `firebase deploy --only hosting` and attach the custom domain.
8. Initialise data once: run `npm run seed -- --production --confirm` locally with the
   production env + `gcloud auth application-default login`.
9. Daily schedule video: `CRON_SECRET` secret, Cloud Scheduler job at 00:00 Asia/Jerusalem,
   Token Creator role and bucket CORS — exact commands in `schedule-video.md`.

Rate-limit counters are per instance (in memory). With the expected
traffic one instance (`--max-instances 2`) is sufficient; documented as a known limitation.

Nothing has been deployed and no live Firebase rules were changed during development.
