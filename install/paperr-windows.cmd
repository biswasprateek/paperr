@echo off
REM One-click paperr for Windows. Installs to %USERPROFILE%\paperr on the first
REM run and just launches on every run after. Pass --dev for the dev servers.
setlocal

echo.
echo                               .+:
echo                          .+####+
echo                    ..+########+.     ####   ###  ####  ##### ####  ####
echo               .:+###########++:      #   # #   # #   # #     #     #
echo          .:+###############+++       ####  ##### ####  ####  #     #
echo     .:+##################++++.       #     #   # #     #     #     #
echo  .:+++##################++++.        #     #   # #     ##### #     #
echo                 ....:+++++++         #           #
echo                    ...:++++          #           #
echo                      ..+++.
echo                        .+:
echo                         :
echo.
echo A private, self-hosted platform for you, your household or team — tasks, projects, 
echo calendar, notes, routines,focus tools, a shared wall dashboard, 
echo and a built-in AI assistant & agents, all running on your own network.
echo.

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

echo Setting up paperr in %USERPROFILE%\paperr - every run after this one just starts it.
echo.

REM Run from the home folder, never from wherever this file was saved: npx walks
REM up looking for a local package named "paperr", and the repo's own root
REM package.json is named exactly that but has no bin — which makes npx give up
REM with "could not determine executable to run".
cd /d "%USERPROFILE%"

REM Delivered through npm rather than a direct download so installs show up in
REM the package's download stats. @latest keeps testers off a stale cached copy.
call npx -y paperr@latest "%USERPROFILE%\paperr" %*
if errorlevel 1 pause
