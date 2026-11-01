@echo off
setlocal EnableDelayedExpansion
rem Video sources + bilingual Bagrut + Firebase/Netlify change: installs the two new packages,
rem runs a read-only Firebase check, typecheck, lint, targeted tests, the production build
rem and the related browser tests. Output: logs\feature-check.log
cd /d "%~dp0.."
if not exist logs mkdir logs
(
  echo === install ===
  call npm install --save serverless-http @netlify/functions --no-audit --no-fund
  echo [install exit !ERRORLEVEL!]
  echo === firebase read-only check ===
  call node scripts/maintenance/firebase-check.mjs
  echo [firebase exit !ERRORLEVEL!]
  echo === typecheck ===
  call npm run typecheck
  echo [typecheck exit !ERRORLEVEL!]
  echo === lint ===
  call npm run lint
  echo [lint exit !ERRORLEVEL!]
  echo === targeted tests ===
  call npx vitest run tests/unit/video-source.test.ts tests/unit/netlify.test.ts tests/unit/bagrut.test.ts tests/unit/dates.test.ts tests/integration/schedule-video.test.ts tests/integration/bagrut-bilingual.test.ts tests/integration/api.test.ts
  echo [test exit !ERRORLEVEL!]
  echo === build ===
  call npm run build
  echo [build exit !ERRORLEVEL!]
  echo === e2e ===
  call npx playwright test tests/e2e/display.spec.ts tests/e2e/video-sources.spec.ts
  echo [e2e exit !ERRORLEVEL!]
  echo === DONE ===
) > logs\feature-check.log 2>&1
