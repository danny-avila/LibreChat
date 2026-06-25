# syntax=docker/dockerfile:1
# v0.8.6-rc1

# Base node image
FROM node:22-alpine AS node

RUN apk upgrade --no-cache
RUN apk add --no-cache jemalloc
RUN apk add --no-cache python3 py3-pip uv

RUN pip3 install --break-system-packages \
    pymupdf pdfplumber \
    python-docx python-pptx \
    openpyxl xlsxwriter \
    reportlab

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.9.5-python3.12-alpine /usr/local/bin/uv /usr/local/bin/uvx /bin/
RUN uv --version

# Set configurable max-old-space-size with default
ARG NODE_MAX_OLD_SPACE_SIZE=6144
ARG NPM_CI_TIMEOUT_SECONDS=1500
ARG NPM_CI_ATTEMPTS=2

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node api/package.json ./api/package.json
COPY --chown=node:node client/package.json ./client/package.json
COPY --chown=node:node packages/data-provider/package.json ./packages/data-provider/package.json
COPY --chown=node:node packages/data-schemas/package.json ./packages/data-schemas/package.json
COPY --chown=node:node packages/api/package.json ./packages/api/package.json
COPY --chown=node:node config/patch-agents.js ./config/patch-agents.js

# Persist the npm download cache across builds (BuildKit cache mount, owned by
# the `node` user). Keeps `npm ci` fast even when package files change and it
# has to re-run; the cache lives outside the image layer so it doesn't bloat it.
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    # Allow mounting of these files, which have no default
    touch .env ; \
    # Create directories for the volumes to inherit the correct permissions
    mkdir -p /app/client/public/images /app/logs /app/uploads ; \
    npm config set fetch-retry-maxtimeout 600000 ; \
    npm config set fetch-retries 5 ; \
    npm config set fetch-retry-mintimeout 15000 ; \
    attempt=1 ; \
    until timeout "$NPM_CI_TIMEOUT_SECONDS" npm ci --no-audit ; do \
        status=$? ; \
        if [ "$attempt" -ge "$NPM_CI_ATTEMPTS" ]; then \
            exit "$status" ; \
        fi ; \
        echo "npm ci --no-audit failed with exit code $status; retrying attempt $((attempt + 1))/$NPM_CI_ATTEMPTS" ; \
        attempt=$((attempt + 1)) ; \
        npm cache clean --force || true ; \
        sleep 10 ; \
    done

COPY --chown=node:node . .

# Build via Turborepo (parallel + content-hash cached) instead of the sequential
# `npm run frontend`. The `.turbo` cache mount persists across builds, so a push
# that doesn't change a given package's inputs is a cache hit and that package's
# build is skipped — a backend-only change skips the (slow) client build entirely.
# `--no-daemon` avoids a background turbo process inside the container build.
RUN --mount=type=cache,target=/app/.turbo,uid=1000,gid=1000 \
    --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" \
    npx turbo run build --no-daemon --cache-dir=/app/.turbo/cache ; \
    npm prune --production

# Node API setup
EXPOSE 3080
ENV HOST=0.0.0.0
CMD ["npm", "run", "backend"]

# Optional: for client with nginx routing
# FROM nginx:stable-alpine AS nginx-client
# WORKDIR /usr/share/nginx/html
# COPY --from=node /app/client/dist /usr/share/nginx/html
# COPY client/nginx.conf /etc/nginx/conf.d/default.conf
# ENTRYPOINT ["nginx", "-g", "daemon off;"]
