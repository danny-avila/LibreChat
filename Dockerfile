FROM node:19-alpine AS react-client
WORKDIR /client
# copy package.json into the container at /client
COPY /client/package*.json /client/
# install dependencies
RUN npm ci
# Copy the current directory contents into the container at /client
COPY /client/ /client/
# Set the memory limit for Node.js
ENV NODE_OPTIONS="--max-old-space-size=2048"
# Build webpack artifacts
RUN npm run build

FROM node:19-alpine AS node-api
WORKDIR /api
# copy package.json into the container at /api
COPY /api/package*.json /api/
# install dependencies
RUN npm ci
# Copy the current directory contents into the container at /api
COPY /api/ /api/
# Copy the client side code
COPY --from=react-client /client/dist /client/dist
# Make port 3080 available to the world outside this container
EXPOSE 3080
# Expose the server to 0.0.0.0
ENV HOST=0.0.0.0
# Run the app when the container launches
CMD ["npm", "start"]

# Optional: for client with nginx routing
FROM nginx:stable-alpine AS nginx-client
WORKDIR /usr/share/nginx/html
COPY --from=react-client /client/dist /usr/share/nginx/html
# Add your nginx.conf
COPY /client/nginx.conf /etc/nginx/conf.d/default.conf
ENTRYPOINT ["nginx", "-g", "daemon off;"]
