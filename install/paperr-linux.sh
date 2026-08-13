#!/bin/sh
# One-click paperr for Linux. Installs to ~/paperr on the first run and just
# launches on every run after. Pass --dev for the dev servers.
#
# Mark it executable once so file managers will run it on double-click:
#   chmod +x paperr-linux.sh

cat <<'BANNER'

                             .+:
                        .+####+
                  ..+########+.     ####    ####  ####    ###   # ##  # ##
             .:+###########++:      #   #      #  #   #  #   #  ##    ##
        .:+###############+++       #   #   ####  #   #  #####  #     #
   .:+##################++++.       #   #  #   #  #   #  #      #     #
.:+++##################++++.        ####    ####  ####    ###   #     #
               ....:+++++++         #             #
                  ...:++++          #             #
                    ..+++.
                      .+:
                       :

 A private, self-hosted platform for you, your household or team — tasks, projects, 
 calendar, notes, routines, focus tools, a shared wall dashboard,
 and a built-in AI assistant & agents, all running on your own network.

BANNER

# node and git are what paperr runs on; python only powers the built-in AI
# server, so a missing one is offered here but never blocks the install.
need_node=''
need_git=''
need_py=''
command -v node    >/dev/null || need_node=1
command -v git     >/dev/null || need_git=1
command -v python3 >/dev/null || need_py=1

if [ -n "$need_node$need_git$need_py" ]; then
  echo "These are required to run paperr and are not installed yet:"
  [ -n "$need_node" ] && echo "  node   - runs paperr itself (22.5+)"
  [ -n "$need_git" ]  && echo "  git    - downloads and updates it"
  [ -n "$need_py" ]   && echo "  python - powers the built-in AI server"
  echo
  printf 'Press Enter to install them, or Ctrl+C to cancel... '
  read -r _
  echo

  # Debian keeps venv out of the base python3 package, and only Arch calls it
  # plain "python"; npm is separate from nodejs nearly everywhere.
  py_pkg=python3
  if command -v apt-get >/dev/null; then
    install='sudo apt-get install -y'
    py_pkg='python3 python3-venv'
  elif command -v dnf >/dev/null; then install='sudo dnf install -y'
  elif command -v zypper >/dev/null; then install='sudo zypper install -y'
  elif command -v pacman >/dev/null; then
    install='sudo pacman -S --noconfirm'
    py_pkg=python
  else
    echo "No apt/dnf/zypper/pacman here - install these yourself, then run this again:"
    echo "  Node.js 22.5+ : https://nodejs.org/en/download"
    echo "  git, python3  : your distribution's package manager"
    exit 1
  fi

  # Word-splitting is the point here: each variable holds a package list.
  # shellcheck disable=SC2086
  $install ${need_node:+nodejs npm} ${need_git:+git} ${need_py:+$py_pkg} || exit 1
  echo

  # Distro Node is often years behind, and paperr needs node:sqlite from 22.5.
  node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' 2>/dev/null || {
    echo "Node.js here is missing or older than paperr needs (22.5+)."
    echo "Install a current one from https://nodejs.org/en/download, then run this again."
    exit 1
  }
fi

# Only on a genuine first install: this file doubles as the launcher, and a
# keypress before every start would be tiresome.
if [ ! -f "$HOME/paperr/scripts/launch.js" ]; then
  echo "This installs paperr into ~/paperr. It downloads dependencies and takes"
  echo "a few minutes."
  echo
  printf 'Press Enter to continue, or Ctrl+C to cancel... '
  read -r _
  echo
fi

echo "Setting up paperr in ~/paperr — every run after this one just starts it."
echo

# Run from the home folder, never from wherever this file was saved: npx walks
# up looking for a local package named "paperr", and the repo's own root
# package.json is named exactly that but has no bin — which makes npx give up
# with "could not determine executable to run".
cd "$HOME" || exit 1

# Delivered through npm rather than a direct download so installs show up in the
# package's download stats. @latest keeps testers off a stale cached copy.
exec npx -y paperr@latest "$HOME/paperr" "$@"
