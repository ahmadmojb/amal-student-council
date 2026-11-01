@echo off
setlocal EnableDelayedExpansion
rem Installs dependencies and the Playwright browser. Output: logs\setup.log
cd /d "%~dp0.."
if not exist logs mkdir logs
(
  echo === node / npm ===
  node -v
  call npm -v
  echo === npm install ===
  call npm install --no-fund --no-audit
  echo [npm install exit !ERRORLEVEL!]
  echo === npm audit fix, non-breaking only ===
  call npm audit fix --no-fund
  echo === playwright install chromium ===
  call npx playwright install chromium
  echo === DONE exit !ERRORLEVEL! ===
) > logs\setup.log 2>&1
