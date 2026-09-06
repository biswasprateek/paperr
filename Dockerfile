# syntax=docker/dockerfile:1

# node:sqlite is only flagless from Node 22.13 / 23.4 on, and paperr uses it unflagged.
ARG NODE=24-bookworm-slim

# ── Build the React client ───────────────────────────────────────────────────
# Pinned to BUILDPLATFORM: vite's output is just static files, so there's no
# reason to run this stage under QEMU on the arm64 leg of a multi-arch build.
FROM --platform=$BUILDPLATFORM node:${NODE} AS client
WORKDIR /build
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:${NODE}

# Links the GHCR package to the repo, so the package page shows the README and
# can inherit the repo's visibility instead of defaulting to private.
LABEL org.opencontainers.image.source="https://github.com/biswasprateek/paperr" \
      org.opencontainers.image.description="Private, self-hosted household/team OS — tasks, calendar, notes, and a local AI assistant, all LAN-only" \
      org.opencontainers.image.licenses="Apache-2.0"

ENV NODE_ENV=production \
    PORT=3000 \
    PAPERR_DATA=/app/server/data \
    DB_PATH=/app/server/data/databases/paperr.db \
    UPLOADS_PATH=/app/server/data/uploads \
    LOG_PATH=/app/server/data/logs/paperr.log \
    LITERT_LM_DIR=/app/server/data/litert

WORKDIR /app/server

# Deps before source so this layer survives source edits. --ignore-scripts skips
# server/scripts/setupLiteRT.js, which provisions the venv built below instead —
# it can't run here anyway, since it requires ../ai/ before the source is copied.
# sharp ships prebuilt binaries as optional deps since 0.33, so it needs no
# install script; the smoke check fails the build if that stops being true.
COPY server/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && node -e "require('sharp')"

# ── paperrAi Server — dotAi's built-in backend ───────────────────────────────
# WITH_AI=1 builds the `:latest` image, WITH_AI=0 the `:slim` one — see
# .github/workflows/publish-docker.yml.
#
# x86_64 only. The litert-lm wheel is py3-none-any but ships a prebuilt x86_64
# liblitert-lm.so, so on arm64 it installs happily and then dies at import —
# hence the `list` smoke check, which fails the build instead. That's why :slim
# is the only variant published for arm64; it needs an external LLM_BASE_URL.
# libvulkan1 is needed even for CPU inference: the .so dlopens it on load.
# procps is for tree-kill, which shells out to `ps` on Linux — without it the
# supervisor throws an unhandled 'error' event when it reaps the serve process.
# The venv path is what server/ai/litertSupervisor.js looks for — don't move it.
ARG WITH_AI=1
RUN if [ "$WITH_AI" = "1" ]; then \
      apt-get update && \
      apt-get install -y --no-install-recommends python3 python3-venv libvulkan1 procps && \
      rm -rf /var/lib/apt/lists/* && \
      python3 -m venv ai/litert/venv && \
      ai/litert/venv/bin/pip install --no-cache-dir --quiet litert-lm==0.14.0 && \
      LITERT_LM_DIR=/tmp/probe ai/litert/venv/bin/litert-lm list > /dev/null; \
    fi

COPY server/ ./
COPY --from=client /build/dist /app/client/dist

# Named volumes inherit ownership from the image, so this is what lets the
# non-root user write to the data volume on first run. ai/litert holds the
# supervisor's PID file, so it has to be writable too.
RUN mkdir -p "$PAPERR_DATA" ai/litert && chown -R node:node "$PAPERR_DATA" ai/litert

# Generated JWT secrets live on the data volume, so logins survive a container
# recreate. Anything set in the environment wins over the generated pair.
COPY <<'SH' /entrypoint.sh
#!/bin/sh
set -e
gen() { node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))'; }

# A bind-mounted host folder (Synology's Container Manager does this by
# default) keeps whatever ownership it had on the host — usually root — while
# an empty named volume inherits the image's `node` ownership instead. Without
# this check, a root-owned mount fails deep inside `mkdir -p` or the secrets
# read below with an opaque "Permission denied", not a fix.
[ -d "$PAPERR_DATA" ] || mkdir -p "$PAPERR_DATA" 2>/dev/null || true
if [ ! -w "$PAPERR_DATA" ]; then
  echo "==========================================================" >&2
  echo "paperr (uid $(id -u)) can't write to $PAPERR_DATA." >&2
  echo "The mounted folder is owned by someone else on the host —" >&2
  echo "common on Synology/NAS bind mounts, which default to root." >&2
  echo >&2
  echo "Fix, on the host: chown -R 1000:1000 <that folder>" >&2
  echo "Or add to docker-compose.yml:  user: \"0:0\"" >&2
  echo "==========================================================" >&2
  exit 1
fi

mkdir -p "$PAPERR_DATA/databases" "$PAPERR_DATA/logs" "$PAPERR_DATA/backups" \
         "$PAPERR_DATA/uploads" "$LITERT_LM_DIR"

SECRETS="$PAPERR_DATA/secrets.env"
if [ -z "$JWT_SECRET" ] || [ -z "$JWT_REFRESH_SECRET" ]; then
  if [ ! -f "$SECRETS" ]; then
    printf 'JWT_SECRET=%s\nJWT_REFRESH_SECRET=%s\n' "$(gen)" "$(gen)" > "$SECRETS"
    chmod 600 "$SECRETS"
  fi
  . "$SECRETS"
  export JWT_SECRET JWT_REFRESH_SECRET
fi

exec "$@"
SH
RUN chmod +x /entrypoint.sh

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD \
  node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "index.js"]
