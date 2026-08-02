#!/usr/bin/env bash
# start-paperr.sh — Build + run paperr for the local network (macOS/Linux).
# Drives production via the process environment; dotenv won't override these,
# so .env can stay on NODE_ENV=development for normal dev work.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"

export NODE_ENV=production

# 1. Build the React client (skip with -NoBuild if dist/ is already current)
if [[ "${1:-}" != "-NoBuild" ]]; then
    echo -e "\n\033[36m[paperr] Building client...\033[0m"
    (cd "$root/client" && npm run build)
fi

# 2. Show the LAN address devices should use
ip=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^(192\.168\.|10\.)' | head -n1 || true)
if [[ -z "$ip" ]]; then
    ip=$(ifconfig 2>/dev/null | grep -E 'inet (192\.168\.|10\.)' | awk '{print $2}' | head -n1 || true)
fi
port="${PORT:-3000}"

echo -e "\n\033[32m[paperr] Starting server (production)...\033[0m"
echo "  This device : http://localhost:$port"
if [[ -n "$ip" ]]; then
    echo -e "  On network  : \033[33mhttp://$ip:$port\033[0m"
fi
echo ""

# 3. Run the server (foreground; Ctrl+C to stop)
cd "$root/server"
exec node index.js
