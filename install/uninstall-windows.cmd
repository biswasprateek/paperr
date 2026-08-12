@echo off
REM Uninstall paperr. Windows also lists it under Settings -> Installed apps;
REM this file does exactly the same thing.
setlocal

set "PAPERR=%USERPROFILE%\paperr"

if not exist "%PAPERR%\scripts\uninstall.js" (
  echo No paperr install found at "%PAPERR%".
  echo If you installed it somewhere else, run this from that folder instead:
  echo     npm run uninstall
  pause
  exit /b 1
)

echo This stops the paperr server and removes its shortcuts.
echo.
set "PURGE="
set /p "ANS=Also delete your paperr data - notes, tasks, uploads? [y/N] "
if /i "%ANS%"=="y" set "PURGE=--purge"

node "%PAPERR%\scripts\uninstall.js" %PURGE%
pause
