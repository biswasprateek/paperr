#!/bin/sh
# One-click paperr for Linux. Installs to ~/paperr on the first run and just
# launches on every run after. Pass --dev for the dev servers.
#
# Mark it executable once so file managers will run it on double-click:
#   chmod +x paperr-linux.sh

for tool in node git curl; do
  command -v "$tool" >/dev/null || {
    echo "paperr needs $tool (Node.js 22.5+). Install it with your package manager"
    echo "or from https://nodejs.org/en/download, then run this file again."
    exit 1
  }
done

# Pull the bootstrap from the repo rather than npm: this file then never goes
# stale, and a new release needs no npm publish.
BOOT="${TMPDIR:-/tmp}/paperr-install.js"
curl -fsSL -o "$BOOT" https://raw.githubusercontent.com/biswasprateek/paperr/main/npm/bin/paperr.js || {
  echo "Could not download the paperr installer — check your internet connection."
  exit 1
}

exec node "$BOOT" "$HOME/paperr" "$@"
