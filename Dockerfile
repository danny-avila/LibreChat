# v0.8.0

# Base node image (Debian-based for mongodb-memory-server compatibility)
FROM node:20-bookworm-slim AS node

# Install runtime and build prerequisites
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     libjemalloc2 \
     python3 \
     make \
     g++ \
     ca-certificates \
     curl \
     gnupg \
     tini \
     gosu \
  && rm -rf /var/lib/apt/lists/*

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.6.13 /uv /uvx /bin/
RUN uv --version

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

# Install MongoDB Server (embedded DB option)
USER root
RUN set -eux; \
  arch="$(dpkg --print-architecture)"; \
  curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg; \
  echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg arch=${arch} ] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" > /etc/apt/sources.list.d/mongodb-org-7.0.list; \
  apt-get update; \
  apt-get install -y --no-install-recommends mongodb-org; \
  rm -rf /var/lib/apt/lists/*; \
  # Remove systemd unit files we don't need in containers
  rm -f /etc/init.d/mongod /lib/systemd/system/mongod.service || true; \
  mkdir -p /data/db /app/client/public/images /app/api/logs /app/uploads; \
  chown -R node:node /data/db /app

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
    mkdir -p /app/client/public/images /app/api/logs /app/uploads ; \
    npm config set fetch-retry-maxtimeout 600000 ; \
    npm config set fetch-retries 5 ; \
    npm config set fetch-retry-mintimeout 15000 ; \
    npm ci --no-audit

COPY --chown=node:node . .

RUN \
    # React client build
    NODE_OPTIONS="--max-old-space-size=2048" npm run frontend; \
    npm prune --production; \
    npm cache clean --force

RUN mkdir -p /app/client/public/images /app/api/logs

# Provide sane defaults to boot without external config
RUN cp -n librechat.example.yaml librechat.yaml || true
ENV JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef \
    JWT_REFRESH_SECRET=eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418 \
    ALLOW_SOCIAL_LOGIN=false \
    ALLOW_PASSWORD_RESET=false
# Node API setup
EXPOSE 3080
ENV HOST=0.0.0.0

# Volumes for persistence across container updates
VOLUME ["/data/db", "/app/uploads", "/app/client/public/images", "/app/api/logs"]

# Entrypoint runs mongod (if needed) and the server
COPY --chown=node:node docker/entrypoint.sh /app/docker/entrypoint.sh
RUN sed -i 's/su-exec/gosu/g' /app/docker/entrypoint.sh && chmod +x /app/docker/entrypoint.sh
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/docker/entrypoint.sh"]

# Optional: for client with nginx routing
# FROM nginx:stable-alpine AS nginx-client
# WORKDIR /usr/share/nginx/html
# COPY --from=node /app/client/dist /usr/share/nginx/html
# COPY client/nginx.conf /etc/nginx/conf.d/default.conf
# ENTRYPOINT ["nginx", "-g", "daemon off;"]
