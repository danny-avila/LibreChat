# v0.7.0

# Base node image
FROM node:18-alpine3.18 AS node

RUN apk add g++ make py3-pip
RUN npm install -g node-gyp
RUN apk --no-cache add curl

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

USER node

COPY --chown=node:node . .

ENV REACT_APP_TITLE=${REACT_APP_TITLE} \
    REACT_APP_DESCRIPTION=${REACT_APP_DESCRIPTION} \
    REACT_APP_KEYWORDS=${REACT_APP_KEYWORDS} \
    REACT_APP_AUTHOR=${REACT_APP_AUTHOR} \
    REACT_APP_URL=${REACT_APP_URL} \
    REACT_APP_OG_IMAGE=${REACT_APP_OG_IMAGE} \
    REACT_APP_TWITTER_IMAGE=${REACT_APP_TWITTER_IMAGE} \
    REACT_APP_FAVICON_32=${REACT_APP_FAVICON_32} \
    REACT_APP_FAVICON_16=${REACT_APP_FAVICON_16} \
    REACT_APP_GOOGLE_ANALYTICS_ID=${REACT_APP_GOOGLE_ANALYTICS_ID} \
    REACT_APP_GOOGLE_ADS_ID=${REACT_APP_GOOGLE_ADS_ID}

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