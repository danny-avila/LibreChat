FROM node:24-alpine AS build
WORKDIR /build
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund
RUN npm run build:data-provider && npm run build:channel-gateway

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /build/packages/channel-gateway/dist/*.cjs ./
USER node
EXPOSE 3091
CMD ["node", "main.cjs"]
