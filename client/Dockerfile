# Stage 1
FROM node:19-alpine as builder
WORKDIR /client
# copy package.json into the container at /client
COPY package*.json /client/
# install dependencies
RUN npm install
# Copy the current directory contents into the container at /client
COPY . /client/
# Run the app when the container launches
CMD ["npm", "run", "build"]

# Stage 2
FROM nginx:stable-alpine
WORKDIR /usr/share/nginx/html
RUN rm -rf ./*
COPY --from=builder /client/public /usr/share/nginx/html
ENTRYPOINT ["nginx", "-g", "daemon off;"]
