# v0.7.8

# Base node image
FROM node:20-alpine AS node

# Install system dependencies
RUN apk add --no-cache \
    jemalloc \
    vips \
    vips-cpp \
    vips-dev \
    python3 \
    py3-pip \
    make \
    g++ \
    gcc \
    build-base \
    python3-dev

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.6.13 /uv /uvx /bin/
RUN uv --version

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

USER node

# Copy package files first for better caching
COPY --chown=node:node package*.json ./
COPY --chown=node:node client/package*.json ./client/
COPY --chown=node:node api/package*.json ./api/
COPY --chown=node:node packages/data-provider/package*.json ./packages/data-provider/
COPY --chown=node:node packages/data-schemas/package*.json ./packages/data-schemas/
COPY --chown=node:node packages/mcp/package*.json ./packages/mcp/

# Force cache invalidation for dependencies
ARG CACHE_BUST
ENV CACHE_BUST=${CACHE_BUST:-1}

# Install dependencies with platform-specific optimizations
RUN \
    # Allow mounting of these files, which have no default
    touch .env ; \
    # Create directories for the volumes to inherit the correct permissions
    mkdir -p /app/client/public/images /app/api/logs ; \
    # Configure npm
    npm config set fetch-retry-maxtimeout 600000 ; \
    npm config set fetch-retries 5 ; \
    npm config set fetch-retry-mintimeout 15000 ; \
    # Clean npm cache
    npm cache clean --force ; \
    # Install dependencies without scripts first
    npm install --no-audit --frozen-lockfile --ignore-scripts ; \
    # Install rollup platform-specific dependency
    npm install @rollup/rollup-linux-x64-musl --save-optional --no-audit ; \
    # Install sharp specifically for Alpine
    cd api && npm install --no-audit sharp@^0.33.5 --platform=linuxmusl --arch=x64 --libc=musl && cd .. ; \
    # Rebuild all native modules
    npm rebuild ; \
    # Run postinstall scripts
    npm run postinstall || true ; \
    # Install client dev dependencies
    cd client && npm install --include=dev && cd ..

# Copy the rest of the application code
COPY --chown=node:node . .

# Build the application
RUN \
    # Build frontend with increased memory
    NODE_OPTIONS="--max-old-space-size=3072" npm run frontend:docker; \
    # Save built artifacts
    mkdir -p /tmp/build-artifacts ; \
    cp -r packages/data-provider/dist /tmp/build-artifacts/data-provider-dist || true ; \
    cp -r packages/data-schemas/dist /tmp/build-artifacts/data-schemas-dist || true ; \
    cp -r packages/mcp/dist /tmp/build-artifacts/mcp-dist || true ; \
    cp -r client/dist /tmp/build-artifacts/client-dist || true ; \
    # Prune dev dependencies
    npm prune --production ; \
    cd client && npm prune --production && cd .. ; \
    # Ensure sharp is installed in production mode
    cd api && npm install --production --no-audit sharp@^0.33.5 --platform=linuxmusl --arch=x64 --libc=musl && cd .. ; \
    # Restore built artifacts
    mkdir -p packages/data-provider/dist packages/data-schemas/dist packages/mcp/dist client/dist ; \
    cp -r /tmp/build-artifacts/data-provider-dist/* packages/data-provider/dist/ || true ; \
    cp -r /tmp/build-artifacts/data-schemas-dist/* packages/data-schemas/dist/ || true ; \
    cp -r /tmp/build-artifacts/mcp-dist/* packages/mcp/dist/ || true ; \
    cp -r /tmp/build-artifacts/client-dist/* client/dist/ || true ; \
    # Clean up
    rm -rf /tmp/build-artifacts ; \
    npm cache clean --force

# Ensure directories exist with correct permissions
RUN mkdir -p /app/client/public/images /app/api/logs

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