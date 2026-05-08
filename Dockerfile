# v0.8.5

# Set configurable max-old-space-size with default
ARG NODE_MAX_OLD_SPACE_SIZE=6144

# Base for all builds
FROM node:20-alpine AS base-min
RUN apk upgrade --no-cache
RUN apk add --no-cache jemalloc
# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

WORKDIR /app
RUN apk --no-cache add curl
RUN npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 15000
RUN chown node:node /app
COPY --chown=node:node package*.json ./
COPY --chown=node:node packages/data-provider/package*.json ./packages/data-provider/
COPY --chown=node:node packages/api/package*.json ./packages/api/
COPY --chown=node:node packages/data-schemas/package*.json ./packages/data-schemas/
COPY --chown=node:node packages/client/package*.json ./packages/client/
COPY --chown=node:node client/package*.json ./client/
COPY --chown=node:node api/package*.json ./api/

# Install all dependencies for every build
FROM base-min AS base
WORKDIR /app
RUN npm ci

# Build `data-provider` package
FROM base AS data-provider-build
WORKDIR /app/packages/data-provider
COPY packages/data-provider ./
RUN npm run build

# Build `data-schemas` package
FROM base AS data-schemas-build
WORKDIR /app/packages/data-schemas
COPY packages/data-schemas ./
COPY --from=data-provider-build /app/packages/data-provider/dist /app/packages/data-provider/dist
RUN npm run build

# Build `api` package
FROM base AS api-package-build
WORKDIR /app/packages/api
COPY packages/api ./
COPY --from=data-provider-build /app/packages/data-provider/dist /app/packages/data-provider/dist
COPY --from=data-schemas-build /app/packages/data-schemas/dist /app/packages/data-schemas/dist
RUN npm run build

# Build `client` package
FROM base AS client-package-build
WORKDIR /app/packages/client
COPY packages/client ./
RUN npm run build

# Client build
FROM base AS client-build
WORKDIR /app/client
COPY client ./
COPY --from=data-provider-build /app/packages/data-provider/dist /app/packages/data-provider/dist
COPY --from=client-package-build /app/packages/client/dist /app/packages/client/dist
COPY --from=client-package-build /app/packages/client/src /app/packages/client/src
ARG NODE_MAX_OLD_SPACE_SIZE
ENV NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}"
RUN npm run build

# Node API setup (including client dist)
FROM base-min AS node
# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.6.13 /uv /uvx /bin/
RUN uv --version
WORKDIR /app
USER node
# Install only runtime workspaces so frontend-only packages stay out of the API image.
RUN npm ci --omit=dev --include-workspace-root=false \
    --workspace api \
    --workspace packages/api \
    --workspace packages/data-provider \
    --workspace packages/data-schemas && \
    npm cache clean --force
COPY --chown=node:node api ./api
COPY --chown=node:node config ./config
COPY --chown=node:node --from=data-provider-build /app/packages/data-provider/dist ./packages/data-provider/dist
COPY --chown=node:node --from=data-schemas-build /app/packages/data-schemas/dist ./packages/data-schemas/dist
COPY --chown=node:node --from=api-package-build /app/packages/api/dist ./packages/api/dist
COPY --chown=node:node --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /app/client/public/images /app/api/logs /app/uploads
WORKDIR /app/api
EXPOSE 3080
ENV HOST=0.0.0.0
CMD ["node", "server/index.js"]
