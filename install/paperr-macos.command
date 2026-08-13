#!/bin/sh
# One-click paperr for macOS. Installs to ~/paperr on the first run and just
# launches on every run after. Pass --dev for the dev servers.
#
# Downloading strips the execute bit, so the first time:
#   chmod +x paperr-macos.command
# then right-click -> Open (Gatekeeper only asks once, for the download).

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
# Values are Homebrew formula names, so the list can be passed straight to it.
missing=''
command -v node    >/dev/null || missing="$missing node"
command -v git     >/dev/null || missing="$missing git"
command -v python3 >/dev/null || missing="$missing python"

if [ -n "$missing" ]; then
  echo "These are required to run paperr and are not installed yet:$missing"
  echo "  node   - runs paperr itself (22.5+)"
  echo "  git    - downloads and updates it"
  echo "  python - powers the built-in AI server"
  echo
  printf 'Press Enter to install them with Homebrew, or Ctrl+C to cancel... '
  read -r _
  echo

  if ! command -v brew >/dev/null; then
    echo "Homebrew isn't installed, so install these by hand and run this again:"
    echo "  node   : https://nodejs.org/en/download"
    echo "  python : https://www.python.org/downloads/macos/"
    echo "  git    : xcode-select --install"
    open https://nodejs.org/en/download
    exit 1
  fi

  # Word-splitting is the point here: $missing is a list of formula names.
  # shellcheck disable=SC2086
  brew install $missing || exit 1
  echo
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
