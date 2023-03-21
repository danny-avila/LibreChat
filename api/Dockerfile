FROM node:19-alpine
WORKDIR /api
# copy package.json into the container at /api
COPY package*.json /api/
# install dependencies
RUN npm ci
# Copy the current directory contents into the container at /api
COPY . /api/
# Make port 3080 available to the world outside this container
EXPOSE 3080
# Expose the server to 0.0.0.0
ENV HOST=0.0.0.0
# Run the app when the container launches
CMD ["npm", "start"]

# docker build -t node-api .
