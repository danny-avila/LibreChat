# v0.7.8

# Base node image
FROM node:20-alpine AS node

# Install jemalloc
RUN apk add --no-cache jemalloc
RUN apk add --no-cache python3 py3-pip

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

# Install dependencies with retry logic and ensure rollup platform dependencies are installed
RUN \
    # Allow mounting of these files, which have no default
    touch .env ; \
    # Create directories for the volumes to inherit the correct permissions
    mkdir -p /app/client/public/images /app/api/logs ; \
    npm config set fetch-retry-maxtimeout 600000 ; \
    npm config set fetch-retries 5 ; \
    npm config set fetch-retry-mintimeout 15000 ; \
    # Clean npm cache before install to avoid stale cache issues
    npm cache clean --force ; \
    # Install with --ignore-scripts first to get all dependencies
    npm install --no-audit --frozen-lockfile --ignore-scripts ; \
    # Manually install the rollup platform-specific dependency for Alpine
    npm install @rollup/rollup-linux-x64-musl --save-optional --no-audit ; \
    # Run postinstall scripts after ensuring all dependencies are present
    npm rebuild ; \
    npm run postinstall || true ; \
    # Install client dependencies with dev dependencies for build
    cd client && npm install --include=dev && cd ..

# Copy the rest of the application code
COPY --chown=node:node . .

RUN \
    # React client build (before pruning dev dependencies)
    NODE_OPTIONS="--max-old-space-size=3072" npm run frontend:docker; \
    # Keep the built packages before pruning
    mkdir -p /tmp/packages-dist ; \
    cp -r packages/data-provider/dist /tmp/packages-dist/data-provider-dist || true ; \
    cp -r packages/data-schemas/dist /tmp/packages-dist/data-schemas-dist || true ; \
    cp -r packages/mcp/dist /tmp/packages-dist/mcp-dist || true ; \
    # Keep the client build before pruning
    cp -r client/dist /tmp/client-dist || true ; \
    # Prune dev dependencies after build
    npm prune --production; \
    cd client && npm prune --production && cd .. ; \
    # Restore the built packages
    mkdir -p packages/data-provider/dist packages/data-schemas/dist packages/mcp/dist ; \
    cp -r /tmp/packages-dist/data-provider-dist/* packages/data-provider/dist/ || true ; \
    cp -r /tmp/packages-dist/data-schemas-dist/* packages/data-schemas/dist/ || true ; \
    cp -r /tmp/packages-dist/mcp-dist/* packages/mcp/dist/ || true ; \
    # Restore the client build
    mkdir -p client/dist ; \
    cp -r /tmp/client-dist/* client/dist/ || true ; \
    rm -rf /tmp/packages-dist /tmp/client-dist ; \
    npm cache clean --force

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