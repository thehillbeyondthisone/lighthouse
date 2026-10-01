@echo off
setlocal
cd /d "%~dp0"

where node >/dev/null 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required. Install it from https://nodejs.org and re-run.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

echo Building...
call npm run build
if errorlevel 1 ( pause & exit /b 1 )

echo Starting at http://127.0.0.1:5189 (WebGPU browser required, e.g. Chrome/Edge)
start "" http://127.0.0.1:5189
call npm run dev
pause
