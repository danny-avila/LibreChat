# v0.7.8-rc1

# Base node image
FROM node:20-alpine AS node

# Install jemalloc
RUN apk add --no-cache jemalloc

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.6.13 /uv /uvx /bin/
RUN uv --version

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

USER node

COPY --chown=node:node . .

RUN \
    # Allow mounting of these files, which have no default
    touch .env ; \
    # Create directories for the volumes to inherit the correct permissions
    mkdir -p /app/client/public/images /app/api/logs ; \
    npm config set fetch-retry-maxtimeout 600000 ; \
    npm config set fetch-retries 5 ; \
    npm config set fetch-retry-mintimeout 15000 ; \
    npm install --no-audit; \
    # React client build
    NODE_OPTIONS="--max-old-space-size=2048" npm run frontend; \
    npm prune --production; \
    npm cache clean --force

RUN mkdir -p /app/client/public/images /app/api/logs

# NNI UI sed modifications
# Hide Assistants Builder Knowledge Block
RUN sed -i 's/<Knowledge/<Knowledge style={{ display: "none" }}/' /app/client/src/components/SidePanel/Builder/AssistantPanel.tsx
# Hide Speech Options STT non-External options
RUN sed -i  's/options={endpointOptions}/options={[{ value: "external", label: localize("com_nav_external") },]} /' /app/client/src/components/Nav/SettingsTabs/Speech/STT/EngineSTTDropdown.tsx
# Hide Speech Options TTS non-External options
RUN sed -i  's/options={endpointOptions}/options={[{ value: "external", label: localize("com_nav_external") },]} /' /app/client/src/components/Nav/SettingsTabs/Speech/TTS/EngineTTSDropdown.tsx
# Alter Base Case Error Message, recommending a refresh to user
RUN sed -i 's/Please contact the Admin./Please refresh the page and retry your request. If the problem persists, please contact an Admin. /' /app/api/server/middleware/abortMiddleware.js

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