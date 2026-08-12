# v0.8.7

# Base node image
#
# glibc (Debian slim), not Alpine: the BAML native bridge's musl artifact
# (`@boundaryml/baml-bridge-linux-x64-musl`) is an upstream packaging defect —
# it is actually glibc-linked (NEEDED: ld-linux-x86-64.so.2, libc.so.6,
# libgcc_s.so.1), not a real musl build. Tracked as AF-o4v; filed upstream at
# https://github.com/BoundaryML/baml/issues/4355. Alpine + gcompat (a partial
# glibc ABI shim) loads the binary in local Docker but fails on Railway's
# container runtime with "Error loading shared library ld-linux-x86-64.so.2:
# No such file or directory" even though gcompat's copy of that file is
# present in the image — a runtime dynamic-linker behavior difference (likely
# a sandboxed runtime such as gVisor) that no Dockerfile-level shim can close.
# On glibc, the bridge's isMusl() check returns false and npm/the loader
# select the correctly-built `-gnu` package instead, so the buggy musl
# artifact is never touched.
FROM node:24.16.0-bookworm-slim AS node

RUN apt-get update && apt-get install -y --no-install-recommends \
    libjemalloc2 \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Set environment variable to use jemalloc (Debian multi-arch path, not
# Alpine's /usr/lib/libjemalloc.so.2)
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /uvx /bin/
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

RUN \
    # Allow mounting of these files, which have no default
    touch .env ; \
    # Create directories for the volumes to inherit the correct permissions
    mkdir -p /app/client/public/images /app/logs /app/uploads /app/skill ; \
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

RUN \
    # React client build with configurable memory
    NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" npm run frontend; \
    npm prune --production; \
    npm cache clean --force

# Optional build metadata surfaced in Settings -> About for support triage.
# Declared here (after the heavy install/build steps) so that commit/date
# changing on every CI run does not bust the cache for dependency install
# and frontend build layers. When unset, the backend falls back to local
# git resolution (if .git is present), and finally to empty values.
ARG BUILD_COMMIT=
ARG BUILD_BRANCH=
ARG BUILD_DATE=
ENV BUILD_COMMIT=${BUILD_COMMIT}
ENV BUILD_BRANCH=${BUILD_BRANCH}
ENV BUILD_DATE=${BUILD_DATE}

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
