@echo off
setlocal EnableDelayedExpansion
rem Runs the Playwright browser tests (starts its own demo server). Output: logs\e2e.log, screenshots in test-results\screens
cd /d "%~dp0.."
if not exist logs mkdir logs
(
  call npx playwright test %*
  echo === DONE exit !ERRORLEVEL! ===
) > logs\e2e.log 2>&1
