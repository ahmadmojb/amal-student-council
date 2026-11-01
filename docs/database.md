# Database schema (Firebase Realtime Database)

```
public/                      READ: everyone   WRITE: nobody (server Admin SDK only)
  announcements/<id>         published, unexpired announcements
  scheduleNotices/<id>       council notes shown next to the official program / on TVs
  teams/<id>  matches/<id>   published league data (brackets derive from match wiring)
  exams/<id>                 published Bagrut records (adminNotes stripped)
  benefits/<id>  services/<id>  activities/<id>
  leagueConfig               rules, points, tie-breakers, champion overrides
  settings                   welcome text, approved logo, official links, TV rotation
  meta/updatedAt, meta/schemaVersion

content/                     READ/WRITE: nobody from clients
  <collection>/<id>          full records incl. drafts & archived, private notes
  leagueConfig, settings

private/                     READ/WRITE: nobody from clients
  certificates/<sha256>      { studentName, activityTitle, issueDate, issuer, status, createdAt, revokedAt, codeHint }
  adminAudit/<timeKey>       { at, action, collection?, recordId?, summary?, client? }
  revokedSessions/<sid>      expiry timestamp (pruned daily)

system/schemaVersion
```

Every content record has `id`, `createdAt`, `updatedAt` (server-assigned) and
`visibility: draft | published | archived`. Deletion is a hard delete (with a confirmation
dialog and an audit entry); archive keeps the record privately.

Record shapes are defined once in `shared/schemas.ts`.

## Rules

`database.rules.json` denies everything at the root, then allows **read** of `public`
only. No client can write anywhere. `content/`, `private/`, `system/` are unreadable.
`storage.rules` allows public read of `public-media/**` only; no client writes.

Rules tests: `tests/rules/database.rules.test.ts` (`npm run test:rules`, needs the
Firebase Emulator — see `docs/testing.md`).

## Initialisation

```
npm run seed                                   # demo store
npm run seed -- --production --confirm         # production (once)
firebase deploy --only database,storage        # rules (needs explicit authorisation)
```
The seed inserts the 12 provisional Winter-2027 Bagrut records and default settings, and
never overwrites existing records.
