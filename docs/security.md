# Security and privacy

## Administrator authentication
* Shared secret `ADMIN_PIN` read from the server environment only; never in the bundle,
  never returned by any API, never logged. Production refuses to start without it
  (≥10 chars) and refuses the demo PIN.
* Comparison: `timingSafeEqual` over SHA-256 digests.
* Session: HMAC-signed token `{sid, iat, exp}` in cookie `amal_admin`
  (`HttpOnly`, `SameSite=Strict`, `Secure` in production, absolute expiry
  `SESSION_TTL_MINUTES`, default 4 h). Logout writes the `sid` to
  `private/revokedSessions` so the cookie is dead everywhere.
* Brute force: 8 failed logins / 15 min per IP (`express-rate-limit`) + a global lockout
  after 30 failures / 15 min. Failed attempts are audited (without the attempted value).
* CSRF: `SameSite=Strict` + mandatory `x-amal-request: 1` header + `Origin`/`Referer`
  must equal `PUBLIC_SITE_URL` on every non-GET admin request (including login).
* Every admin route: session check → zod validation → 400/401/403/404/409 responses
  without stack traces.

## Data
* No public writes anywhere (database and storage rules).
* Admin SDK uses Application Default Credentials (Cloud Run service account). No JSON
  key in `.env`, the repo, or the frontend.
* Public projection strips private fields; drafts never reach `public/`.

## Certificates
* Code: 20 Crockford-base32 characters from `crypto.randomBytes` (100 bits).
* Stored: only `sha256("amal-cert:v1:" + code)`; the raw code exists on the printout/QR.
* `/api/verify`: 20 requests/min/IP, `Cache-Control: no-store`, `X-Robots-Tag: noindex`;
  returns only `valid` (+ name, activity, date, issuer), `revoked`, or `unknown`.
  `/verify` page adds `<meta name="robots" content="noindex">`; robots.txt disallows it.
  There is no listing or name search endpoint for the public.

## Uploads (admin only)
Magic-byte sniffing (JPEG/PNG/WebP/PDF), size limits (8 MB images, 10 MB PDF),
full decode with sharp, dimension limits, re-encode to WebP (strips EXIF/GPS),
random UUID names, `nosniff`. Activity photos require an explicit
"school approval" checkbox per photo (enforced by the schema).

## HTTP
Helmet with a strict CSP (`frame-ancestors 'self'`, `frame-src` limited to the schedule
provider / proxy host, `object-src 'none'`), HSTS in production, `Referrer-Policy`,
`Permissions-Policy`, JSON body limit 200 kB, `trust proxy` in production.

## Audit log
`private/adminAudit`: logins, failures, create/update/publish/archive/delete, results and
bracket changes (incl. downstream resets), certificate issue/revoke, uploads, republish.
Stores a 10-char salted hash instead of IP addresses; never PINs, cookies or certificate
codes; certificate entries carry only the activity title.

## Student privacy
No student accounts, profiles, uploads or comments. Bagrut grade/class preference is kept
in the browser's localStorage only.

## Dependency audit
Run `npm audit --omit=dev`. See `docs/STATUS.md` for the last result and any accepted risk.
