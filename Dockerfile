# Base node image
FROM node:19-alpine AS node
COPY . /app
# Install dependencies
WORKDIR /app
RUN npm ci

# Frontend variables as build args
ARG VITE_APP_TITLE
ARG VITE_SHOW_GOOGLE_LOGIN_OPTION

# You will need to add your VITE variables to the docker-compose file
ENV VITE_APP_TITLE=$VITE_APP_TITLE
ENV VITE_SHOW_GOOGLE_LOGIN_OPTION=$VITE_SHOW_GOOGLE_LOGIN_OPTION

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
