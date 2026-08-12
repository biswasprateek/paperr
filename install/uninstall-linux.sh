#!/bin/sh
# Uninstall paperr on Linux.
#
# Mark it executable once so file managers will run it on double-click:
#   chmod +x uninstall-linux.sh

PAPERR="$HOME/paperr"

if [ ! -f "$PAPERR/scripts/uninstall.js" ]; then
  echo "No paperr install found at $PAPERR."
  echo "If you installed it somewhere else, run this from that folder instead:"
  echo "    npm run uninstall"
  exit 1
fi

echo "This stops the paperr server and removes its desktop entry."
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
