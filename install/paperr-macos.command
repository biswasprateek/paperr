#!/bin/sh
# One-click paperr for macOS. Installs to ~/paperr on the first run and just
# launches on every run after. Pass --dev for the dev servers.
#
# Downloading strips the execute bit, so the first time:
#   chmod +x paperr-macos.command
# then right-click -> Open (Gatekeeper only asks once, for the download).

for tool in node git curl; do
  command -v "$tool" >/dev/null || {
    echo "paperr needs $tool."
    echo "  node : https://nodejs.org/en/download"
    echo "  git  : xcode-select --install"
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
