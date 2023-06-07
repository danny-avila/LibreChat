# Base node image
FROM node:19-alpine AS base
# Lets copy our application code
WORKDIR /
COPY . .
# Install dependencies
RUN npm ci

# React client build
FROM base AS react-client
WORKDIR /client
COPY /client/ /client/
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build

# Node API setup
FROM base AS node-api
WORKDIR /api
COPY /api/ /api/
COPY --from=react-client /client/dist /client/dist
EXPOSE 3080
ENV HOST=0.0.0.0
# Start the backend
WORKDIR /
RUN npm run backend

# Optional: for client with nginx routing
FROM nginx:stable-alpine AS nginx-client
WORKDIR /usr/share/nginx/html
COPY --from=react-client /client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
ENTRYPOINT ["nginx", "-g", "daemon off;"]
