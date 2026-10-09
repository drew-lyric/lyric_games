@echo off
cd /d "%~dp0"
node server.js
if errorlevel 1 (
  echo.
  echo The Lyric Games server could not start. Check the message above.
  echo Node.js 22 or newer must be installed.
  pause
)
