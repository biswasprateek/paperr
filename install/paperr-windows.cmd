@echo off
REM One-click paperr for Windows. Installs to %USERPROFILE%\paperr on the first
REM run and just launches on every run after. Pass --dev for the dev servers.
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo paperr needs Node.js 22.5 or newer.
  echo Install it from https://nodejs.org/en/download then run this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo paperr needs Git.
  echo Install it from https://git-scm.com/download/win then run this file again.
  start "" https://git-scm.com/download/win
  pause
  exit /b 1
)

REM Pull the bootstrap from the repo rather than npm: this file then never goes
REM stale, and a new release needs no npm publish. curl ships with Windows 10+.
set "BOOT=%TEMP%\paperr-install.js"
curl -fsSL -o "%BOOT%" https://raw.githubusercontent.com/biswasprateek/paperr/main/npm/bin/paperr.js
if errorlevel 1 (
  echo Could not download the paperr installer — check your internet connection.
  pause
  exit /b 1
)

node "%BOOT%" "%USERPROFILE%\paperr" %*
if errorlevel 1 pause
