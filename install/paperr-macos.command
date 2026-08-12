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
                  ..+########+.     ####   ###  ####  ##### ####  ####
             .:+###########++:      #   # #   # #   # #     #     #
        .:+###############+++       ####  ##### ####  ####  #     #
   .:+##################++++.       #     #   # #     #     #     #
.:+++##################++++.        #     #   # #     ##### #     #
               ....:+++++++         #           #
                  ...:++++          #           #
                    ..+++.
                      .+:
                       :

 A private, self-hosted platform for you, your household or team — tasks, projects, 
 calendar, notes, routines,focus tools, a shared wall dashboard, 
 and a built-in AI assistant & agents, all running on your own network.

BANNER

for tool in node git; do
  command -v "$tool" >/dev/null || {
    echo "paperr needs $tool."
    echo "  node : https://nodejs.org/en/download"
    echo "  git  : xcode-select --install"
    exit 1
  }
done

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
