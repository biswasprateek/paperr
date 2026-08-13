@echo off
REM One-click paperr for Windows. Installs to %USERPROFILE%\paperr on the first
REM run and just launches on every run after. Pass --dev for the dev servers.
setlocal

echo.
echo                               .+:
echo                          .+####+
echo                    ..+########+.     ####    ####  ####    ###   # ##  # ##
echo               .:+###########++:      #   #      #  #   #  #   #  ##    ##
echo          .:+###############+++       #   #   ####  #   #  #####  #     #
echo     .:+##################++++.       #   #  #   #  #   #  #      #     #
echo  .:+++##################++++.        ####    ####  ####    ###   #     #
echo                 ....:+++++++         #             #
echo                    ...:++++          #             #
echo                      ..+++.
echo                        .+:
echo                         :
echo.
REM Plain ASCII and ^-escaped ampersands only: cmd renders this file in the OEM
REM code page, so an em dash arrives as mojibake, and a bare ^& ends the echo
REM and runs the rest of the line as a command.
echo A private, self-hosted platform for you, your household or team - tasks,
echo projects, calendar, notes, routines, focus tools, a shared wall dashboard,
echo and a built-in AI assistant ^& agents, all running on your own network.
echo.

REM Node and Git are what paperr runs on; Python only powers the built-in AI
REM server, so a missing one is offered here but never blocks the install.
set "NEED_NODE="
set "NEED_GIT="
set "NEED_PY="
set "MISSING="
where node >nul 2>nul || set "NEED_NODE=1"
where git >nul 2>nul || set "NEED_GIT=1"
py -3 --version >nul 2>nul || python --version >nul 2>nul || set "NEED_PY=1"
if defined NEED_NODE set "MISSING=1"
if defined NEED_GIT set "MISSING=1"
if defined NEED_PY set "MISSING=1"
if not defined MISSING goto prereqs_ok

echo These are required to run paperr and are not installed yet:
if defined NEED_NODE echo    Node.js 22.5+ - runs paperr itself
if defined NEED_GIT  echo    Git           - downloads and updates it
if defined NEED_PY   echo    Python 3      - powers the built-in AI server
echo.
echo Press any key to install them, or close this window to cancel.
pause >nul
echo.

where winget >nul 2>nul
if errorlevel 1 (
  echo winget isn't available on this PC, so install these by hand and run this
  echo file again:
  echo    Node.js : https://nodejs.org/en/download
  echo    Git     : https://git-scm.com/download/win
  echo    Python  : https://www.python.org/downloads/windows/
  if defined NEED_NODE start "" https://nodejs.org/en/download
  if defined NEED_GIT start "" https://git-scm.com/download/win
  if defined NEED_PY start "" https://www.python.org/downloads/windows/
  pause
  exit /b 1
)

if defined NEED_NODE winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
if defined NEED_GIT winget install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements
if defined NEED_PY winget install -e --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements

REM winget updates the machine PATH, not this window's already-loaded copy, so
REM add the default install folders here rather than making the user re-run.
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%LOCALAPPDATA%\Programs\Python\Launcher"

where node >nul 2>nul || goto relaunch
where git >nul 2>nul || goto relaunch
goto prereqs_ok

:relaunch
echo.
echo Installed - but this window is still running with the old PATH. Close it
echo and double-click this file again to finish.
pause
exit /b 0

:prereqs_ok

REM Only on a genuine first install: this file doubles as the launcher, and a
REM keypress before every start would be tiresome.
if not exist "%USERPROFILE%\paperr\scripts\launch.js" (
  echo This installs paperr into "%USERPROFILE%\paperr". It downloads dependencies
  echo and takes a few minutes. Close this window to cancel, or
  pause
  echo.
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
