@echo off
setlocal EnableDelayedExpansion
rem Runs typecheck, lint, unit+integration tests and the production build. Output: logs\check.log
cd /d "%~dp0.."
if not exist logs mkdir logs
(
  echo === typecheck ===
  call npm run typecheck
  echo [typecheck exit !ERRORLEVEL!]
  echo === lint ===
  call npm run lint
  echo [lint exit !ERRORLEVEL!]
  echo === test ===
  call npm test
  echo [test exit !ERRORLEVEL!]
  echo === build ===
  call npm run build
  echo [build exit !ERRORLEVEL!]
  echo === audit ===
  call npm audit --omit=dev
  echo [audit exit !ERRORLEVEL!]
  echo === DONE ===
) > logs\check.log 2>&1
