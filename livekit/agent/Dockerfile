# LiveKit voice agent worker for LibreChat.
# Build from the repo root so the `file:` dependency on packages/data-provider resolves:
#   docker build -f livekit/agent/Dockerfile -t librechat-livekit-agent:local .
FROM node:22-alpine AS builder
WORKDIR /app

RUN npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 15000

# Workspace manifests must all be present for `npm ci` to resolve the root lockfile.
COPY package*.json ./
COPY packages/data-provider/package*.json ./packages/data-provider/
COPY packages/data-schemas/package*.json ./packages/data-schemas/
COPY packages/api/package*.json ./packages/api/
COPY packages/client/package*.json ./packages/client/
COPY client/package*.json ./client/
COPY api/package*.json ./api/
RUN npm ci --ignore-scripts

# The worker consumes data-provider's built output, so it is built before the worker installs.
COPY packages/data-provider ./packages/data-provider
RUN npm run build --workspace packages/data-provider

COPY livekit/agent ./livekit/agent
WORKDIR /app/livekit/agent
RUN npm install && npm run build

FROM node:22-alpine
RUN addgroup -S app && adduser -S app -G app

# The layout is preserved across stages on purpose: node_modules/librechat-data-provider is a
# relative symlink into ../../packages/data-provider, which breaks if either side moves.
WORKDIR /app/livekit/agent
COPY --from=builder /app/packages/data-provider /app/packages/data-provider
COPY --from=builder /app/livekit/agent /app/livekit/agent

ENV NODE_ENV=production
USER app
ENTRYPOINT ["node", "dist/index.js"]
CMD ["start"]
