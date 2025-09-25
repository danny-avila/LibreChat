# v0.8.0-rc4 - OpenRouter Enhanced Edition

# Stage 1: Use the pre-downloaded LibreChat image as base to avoid Docker Hub auth
FROM ghcr.io/danny-avila/librechat-dev:latest AS base

# Stage 2: Build environment with git for GitHub packages
FROM base AS builder

USER root

# Install git and build dependencies for GitHub packages
RUN apk add --no-cache git python3 make g++ bash

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY --chown=node:node package*.json ./
COPY --chown=node:node api/package*.json ./api/
COPY --chown=node:node client/package*.json ./client/
COPY --chown=node:node packages/data-provider/package*.json ./packages/data-provider/
COPY --chown=node:node packages/data-schemas/package*.json ./packages/data-schemas/
COPY --chown=node:node packages/api/package*.json ./packages/api/

# Configure npm for GitHub packages
RUN npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 15000

# Switch to node user for npm operations
USER node

# Install dependencies including GitHub packages
# The @librechat/agents from GitHub needs git available
RUN npm install --legacy-peer-deps --no-audit

# Copy all source code
COPY --chown=node:node . .

# Build the application
ENV NODE_ENV=production
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run frontend && \
    npm prune --production --legacy-peer-deps && \
    npm cache clean --force

# Stage 3: Production image
FROM base AS production

USER node
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/api/node_modules ./api/node_modules
COPY --from=builder --chown=node:node /app/client/dist ./client/dist
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/api ./api
COPY --from=builder --chown=node:node /app/config ./config
COPY --from=builder --chown=node:node /app/package*.json ./

# OpenRouter documentation is in the main repository docs folder

# Create necessary directories
RUN mkdir -p /app/client/public/images /app/api/logs /app/uploads

# Environment setup
ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start the application
CMD ["npm", "run", "backend"]