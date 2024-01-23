# Base node image
FROM node:18-alpine AS node

COPY . /app
WORKDIR /app

# Allow mounting of these files, which have no default
# values.
RUN touch .env
# Install call deps - Install curl for health check
RUN apk --no-cache add curl && \
    npm ci

# React client build
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run frontend

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
