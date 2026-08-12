#!/bin/sh
# Uninstall paperr on macOS. Double-click it.
#
# Downloading strips the execute bit, so the first time:
#   chmod +x uninstall-macos.command

PAPERR="$HOME/paperr"

if [ ! -f "$PAPERR/scripts/uninstall.js" ]; then
  echo "No paperr install found at $PAPERR."
  echo "If you installed it somewhere else, run this from that folder instead:"
  echo "    npm run uninstall"
  exit 1
fi

echo "This stops the paperr server and removes ~/Applications/paperr.app."
echo
# Default is no: the data is a household's notes and uploads, none of it
# recoverable once deleted.
printf "Also delete your paperr data - notes, tasks, uploads? [y/N] "
read -r ANS
case "$ANS" in
  [Yy]*) PURGE="--purge" ;;
  *)     PURGE="" ;;
esac

exec node "$PAPERR/scripts/uninstall.js" $PURGE
