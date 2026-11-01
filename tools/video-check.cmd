@echo off
setlocal EnableDelayedExpansion
rem Daily schedule video change: removes obsolete schedule-iframe files, then runs typecheck, lint,
rem the targeted tests, the production build and the display E2E. Output: logs\video-check.log
cd /d "%~dp0.."
if not exist logs mkdir logs
for %%F in (server\schedule-proxy.ts src\features\schedule\OfficialScheduleFrame.tsx src\features\schedule\useScheduleStatus.ts tests\integration\schedule-proxy.test.ts docs\schedule-integration.md) do if exist "%%F" del /q "%%F"
(
  echo === install ===
  call npm install --no-audit --no-fund
  echo [install exit !ERRORLEVEL!]
  echo === typecheck ===
  call npm run typecheck
  echo [typecheck exit !ERRORLEVEL!]
  echo === lint ===
  call npm run lint
  echo [lint exit !ERRORLEVEL!]
  echo === targeted tests ===
  call npx vitest run tests/unit/dates.test.ts tests/unit/security.test.ts tests/integration/schedule-video.test.ts tests/integration/api.test.ts
  echo [test exit !ERRORLEVEL!]
  echo === build ===
  call npm run build
  echo [build exit !ERRORLEVEL!]
  echo === e2e display ===
  call npx playwright test tests/e2e/display.spec.ts
  echo [e2e exit !ERRORLEVEL!]
  echo === DONE ===
) > logs\video-check.log 2>&1
