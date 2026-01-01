# ---------------------------
# Stage 1: Node Build
# ---------------------------
FROM node:20-bullseye AS node

# Install system dependencies
RUN apt-get update && \
    apt-get install -y libjemalloc2 python3 python3-pip curl && \
    rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.6.13 /uv /uvx /bin/
RUN uv --version

# Create app directory
RUN mkdir -p /app && chown node:node /app
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node api/package.json ./api/package.json
COPY --chown=node:node client/package.json ./client/package.json
COPY --chown=node:node packages/data-provider/package.json ./packages/data-provider/package.json
COPY --chown=node:node packages/data-schemas/package.json ./packages/data-schemas/package.json
COPY --chown=node:node packages/api/package.json ./packages/api/package.json

# Install all dependencies (include optional deps to avoid Rollup issues)
RUN npm install

# Copy full source code
COPY --chown=node:node . .

# Build frontend & packages
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run frontend

# Optional: verify frontend build
RUN if [ ! -d "client/dist" ]; then echo "Error: client/dist not found" && exit 1; fi

# Remove dev dependencies to reduce image size
RUN npm prune --production && npm cache clean --force
