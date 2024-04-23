# v0.7.1

# Base node image
FROM node:18-alpine3.18 AS node

RUN apk add g++ make py3-pip
RUN npm install -g node-gyp
RUN apk --no-cache add curl

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

USER node

COPY --chown=node:node . .

# Allow mounting of these files, which have no default
# values.
RUN touch .env
RUN npm config set fetch-retry-maxtimeout 600000
RUN npm config set fetch-retries 5
RUN npm config set fetch-retry-mintimeout 15000
RUN npm install --no-audit

# React client build
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run frontend

# Create directories for the volumes to inherit
# the correct permissions
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
