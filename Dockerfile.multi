# Build API, Client and Data Provider
FROM node:20-alpine AS base

# Build data-provider
FROM base AS data-provider-build
WORKDIR /app/packages/data-provider
COPY ./packages/data-provider ./
RUN npm install
RUN npm run build

# React client build
FROM data-provider-build AS client-build
WORKDIR /app/client
COPY ./client/ ./
# Copy data-provider to client's node_modules
RUN mkdir -p /app/client/node_modules/librechat-data-provider/
RUN cp -R /app/packages/data-provider/* /app/client/node_modules/librechat-data-provider/
RUN npm install
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build

# Node API setup
FROM data-provider-build AS api-build
WORKDIR /app/api
COPY api/package*.json ./
COPY api/ ./
# Copy data-provider to API's node_modules
RUN mkdir -p /app/api/node_modules/librechat-data-provider/
RUN cp -R /app/packages/data-provider/* /app/api/node_modules/librechat-data-provider/
RUN npm install
COPY --from=client-build /app/client/dist /app/client/dist
EXPOSE 3080
ENV HOST=0.0.0.0
CMD ["node", "server/index.js"]

# Nginx setup
FROM nginx:1.21.1-alpine AS prod-stage
COPY ./client/nginx.conf /etc/nginx/conf.d/default.conf
CMD ["nginx", "-g", "daemon off;"]
