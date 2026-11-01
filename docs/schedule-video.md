# Daily schedule video (البرنامج المدرسي اليومي)

The council admin publishes **one** daily source, either
- **رفع فيديو من الجهاز** — an MP4/WebM file uploaded to Firebase Storage, or
- **إضافة رابط فيديو خارجي** — a link: direct public `https://…mp4|m4v|webm`, YouTube
  (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`) or Vimeo (public or unlisted `vimeo.com/<id>[/<hash>]`).

`/program` and `/display` show it from the same record. The old `dsp.shahaf.info` display is
rejected as a link and never framed.

## Playback
- Native `<video>` (uploaded file, direct link): muted autoplay through one `play()` call,
  `loop`, `playsInline`; `/program` has controls (pause, resume, unmute); the TV has none.
  If autoplay is blocked, an Arabic «تشغيل البرنامج» button calls `play()` again.
- YouTube: `youtube-nocookie.com/embed/<id>?autoplay=1&mute=1&loop=1&playlist=<id>&playsinline=1`.
  Vimeo: `player.vimeo.com/video/<id>?autoplay=1&muted=1&loop=1`. Errors (private, removed,
  embedding disabled) arrive via the providers' postMessage APIs, accepted only from that
  iframe and origin, and are shown in Arabic. If a provider blocks autoplay, its own play
  button is shown.
- Players are keyed by the video id: a new source starts from the beginning; clocks, notice
  rotation and other re-renders never restart it. Navigating away and back mounts a new player.

## External link validation (no SSRF)
`shared/video-source.ts` (same code in browser and server): HTTPS only, no credentials,
no custom port, no IP literals / localhost / intranet names, provider allowlist, and a
direct link must end in .mp4/.m4v/.webm. The server never requests the URL. The admin
must preview it; publishing is enabled only after the preview loads.

## Data
| Path | Contents |
|---|---|
| `content/scheduleVideo/current` | private record: `id, source, uploadedAt, scheduleDate, expiresAt, status`; `source` is `{type:'uploaded', objectPath, originalName, mimeType, size}` or `{type:'external', provider, externalUrl, playUrl, videoId?, mimeType?}` |
| `public/scheduleVideo` | public projection: `id, provider, url, videoId?, mimeType?, scheduleDate, expiresAt, uploadedAt` |
| `private/scheduleVideoTrash/<id>` | storage objects waiting to be deleted (retried until done) |
| `private/scheduleVideoPending/<id>` | signed uploads not yet finalised (abandoned after 6 h) |

Files: production `public-media/schedule-video/<uuid>.<mp4|webm>` in Firebase Storage;
demo `.data/uploads/schedule-video/<uuid>.<ext>`. Every upload gets a new random name,
so browsers/CDNs never serve an old video under a new record.

## Upload flow
1. Admin picks a file → browser checks type (MP4/WebM), size (`SCHEDULE_VIDEO_MAX_MB`,
   default 250) and that the file actually plays (preview `loadedmetadata`).
2. `POST /api/admin/schedule-video/upload-target` (session + CSRF) validates name/size/type.
   * **Production:** returns a V4 signed `PUT` URL (30 min) for a new object path; the
     browser uploads straight to Storage with progress/cancel (Cloud Run's 32 MB request
     limit makes proxying large videos through the server impossible). Then
     `POST /finalize` checks the object exists, its size, and its real container
     signature (first 64 bytes) — otherwise the object is deleted and nothing changes.
   * **Demo:** multipart `POST /upload`, streamed to a temp file on disk (never buffered
     in memory), signature-checked, then moved into place.
3. Publishing is one atomic multi-path update: new private record + public projection +
   audit entry + the previous file queued in the trash. The old file is deleted only
   after that commit. A failed/cancelled upload never touches the current video.

No recompression is done — the file is stored exactly as uploaded.

## Date and expiry
* `scheduleDate` = the upload day in **Asia/Jerusalem** (server clock), not the visitor's.
  The heading reads e.g. `يوم الأحد | 1 نوفمبر 2026`.
* `expiresAt` = `endOfSchoolDay(scheduleDate)` = 00:00 of the next calendar day in
  Asia/Jerusalem, computed from the real zone offset (DST days are 23/25 h; it is **not**
  `uploadedAt + 24h`). Upload 07:00 Sunday → expires Monday 00:00.

## Server-side deletion
`ScheduleVideoService.cleanup(now)` is idempotent and retry-safe:
* if `now >= expiresAt`, the file is queued, then the private and public records are
  removed with **transactions that check the video id** — a cleanup that started before
  a replacement can never delete the newer video;
* the trash deletes queued objects; failures stay queued (`attempts`, `lastError`) and
  are retried next run; the active video's path is never deleted;
* abandoned signed uploads (> 6 h) are deleted.

External links follow the same expiry; at clean-up the record is removed and **nothing** is
deleted at YouTube/Vimeo/the external host (we only own the reference).

It runs from:
1. **Netlify Scheduled Function** `schedule-video-cleanup`, cron `*/10 * * * *` (UTC). It does
   not try to hit Israeli midnight: it acts on records whose exact `expiresAt` has passed, so
   physical deletion happens within ~10 minutes after midnight. **Not deployed yet** — see
   `docs/netlify.md`.
2. The protected endpoint `POST /api/cron/schedule-video-cleanup`
   (`Authorization: Bearer <CRON_SECRET>`) for a manual run or an optional external
   scheduler (e.g. Cloud Scheduler with time zone Asia/Jerusalem).
3. On a long-running server (`npm start` / Cloud Run), an in-process sweep every 60 s.

**Public expiry ≠ physical deletion:** visitors stop seeing a source at `expiresAt` exactly
(server read check + client re-render); the file deletion follows on the next sweep.

Independently of deletion, every read is expiry-checked on the server
(`/api/schedule-video`, the demo snapshot/stream) and in the client (it re-renders at
`expiresAt`, display only), so an expired video is never shown even if a job is late.

## Production setup (needs authorisation; nothing here has been run)
```sh
# 1. Secret for the cron endpoint (≥ 32 chars), mounted on Cloud Run as CRON_SECRET
openssl rand -hex 32 | gcloud secrets create amal-cron-secret --data-file=-
gcloud run services update amal-council --update-secrets CRON_SECRET=amal-cron-secret:latest

# 2. Midnight job, Asia/Jerusalem, with retries
gcloud scheduler jobs create http amal-schedule-video-cleanup \
  --location europe-west1 --schedule "0 0 * * *" --time-zone "Asia/Jerusalem" \
  --http-method POST --uri "https://<domain>/api/cron/schedule-video-cleanup" \
  --headers "Authorization=Bearer <CRON_SECRET>" \
  --max-retry-attempts 5 --min-backoff 30s --attempt-deadline 120s
# Optional safety net: a second job at "*/15 0-1 * * *" (harmless — idempotent).
```
3. **Signing:** the Cloud Run service account needs `roles/iam.serviceAccountTokenCreator`
   on itself (V4 signed URLs without a key file) plus Storage Object Admin.
4. **Bucket CORS** for the browser `PUT`:
   ```json
   [{"origin":["https://<domain>"],"method":["PUT"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]
   ```
   `gsutil cors set cors.json gs://<bucket>`
5. Deploy `storage.rules` (adds public read for `public-media/schedule-video/*` video files).

## Service worker
`/uploads/schedule-video/*` and `/api/*` are never cached; Range requests are not cached.
Firebase Storage URLs are cross-origin and not handled by the service worker.

## TV behaviour
Muted autoplay, `loop`, `playsInline`; if the browser blocks autoplay, a large
"تشغيل البرنامج" button appears. No reload or refresh timers; new/removed videos arrive
through the existing live subscription.
