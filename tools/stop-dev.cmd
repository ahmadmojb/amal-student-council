@echo off
rem Stops this project's dev server (the process listening on port 3000, and Vite's legacy HMR port 24678).
for %%P in (3000 24678) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do (
    echo Stopping PID %%I on port %%P
    taskkill /PID %%I /T /F
  )
)
