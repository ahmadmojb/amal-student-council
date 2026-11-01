@echo off
rem Starts the site in demo mode at http://localhost:3000 (close this window to stop).
cd /d "%~dp0.."
title Amal Council dev server
call npm run dev
pause
