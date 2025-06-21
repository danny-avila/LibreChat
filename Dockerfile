# ────────────────────────────────────────────────────────────────────
# LibreChat  v0.7.8  – Dockerfile
# ────────────────────────────────────────────────────────────────────

# ---------- 1. base image & runtime deps ---------------------------
FROM node:20-alpine AS node

RUN apk add --no-cache \
      jemalloc \
      python3 \
      py3-pip \
      uv       \
  &&  uv --version

# Use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

# ---------- 2. create workspace ------------------------------------
RUN mkdir -p /app && chown node:node /app
WORKDIR /app
USER node

# ---------- 3. copy source & install deps --------------------------
COPY --chown=node:node . .

RUN \
    # placeholder .env so scripts don’t fail
    touch .env && \
    # dirs that will be mounted as volumes
    mkdir -p /app/client/public/images /app/api/logs && \
    # npm resilience for CI
    npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 15000 && \
    # install & build
    npm install --no-audit && \
    NODE_OPTIONS="--max-old-space-size=2048" npm run frontend && \
    npm prune --production && \
    npm cache clean --force

RUN mkdir -p /app/client/public/images /app/api/logs
USER root
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

ENV CONFIG_PATH=/app/librechat.yaml

EXPOSE 3080
ENV HOST=0.0.0.0

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "backend"]
