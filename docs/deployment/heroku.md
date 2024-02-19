---
title: 🌈 Heroku
description: Instructions for deploying LibreChat on Heroku
weight: -1
---
# Heroku Deployment

*To run LibreChat on a server, you can use cloud hosting platforms like Heroku, DigitalOcean, or AWS. In this response, I'll provide instructions for deploying the project on Heroku. Other platforms will have slightly different deployment processes.*

Heroku only supports running a single process within a Docker container. The Dockerfile for this project has two different processes - one is for serving your Node API and the other for serving your client with Nginx. In the context of Heroku, these should be considered two separate apps.

If you want to deploy both these services to Heroku, you will need to create two separate Dockerfiles: one for the API and one for the client. The heroku.yml should be configured separately for each app, and then you need to create and deploy two different Heroku apps.

  - Sign up for a Heroku account: If you don't already have a Heroku account, sign up at: **[https://signup.heroku.com](https://signup.heroku.com)**
  - Install the Heroku CLI: Download and install the Heroku CLI from: **[https://devcenter.heroku.com/articles/heroku-cli](https://devcenter.heroku.com/articles/heroku-cli)**

Here are the steps to deploy on Heroku:

## 1. **Create a new Dockerfile for your API named `Dockerfile-api`:**

```
# Base node image
FROM node:19-alpine AS base
WORKDIR /api
COPY /api/package*.json /api/
WORKDIR /
COPY /config/ /config/
COPY /package*.json /
RUN npm ci

# Node API setup
FROM base AS node-api
WORKDIR /api
COPY /api/ /api/
EXPOSE $PORT
ENV HOST=0.0.0.0
CMD ["npm", "start"]
```

## 2. **Create a new Dockerfile for your Client named `Dockerfile-client`:**

```
# Base node image
FROM node:19-alpine AS base
WORKDIR /client
COPY /client/package*.json /client/
WORKDIR /
COPY /config/ /config/
COPY /package*.json /

WORKDIR /packages/data-provider
COPY /packages/data-provider ./
RUN npm install && npm run build

WORKDIR /
RUN npm ci

# React client build
FROM base AS react-client
WORKDIR /client
COPY /client/ /client/
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build

# Nginx setup
FROM nginx:stable-alpine AS nginx-client
WORKDIR /usr/share/nginx/html
COPY --from=react-client /client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
ENTRYPOINT ["nginx", "-g", "daemon off;"]
```

## 3. **Build and deploy your apps using the Heroku CLI:**

### Login to Heroku:

```
heroku login
```

### Login to the Heroku Container Registry:

```
heroku container:login
```

### Create a Heroku app for your API:

```
heroku create your-api-app-name
```

### Set environment variables for your API app:

```
heroku config:set HOST=0.0.0.0 --app your-api-app-name
```

### Build and deploy your API app:

```
heroku container:push web --app your-api-app-name -f Dockerfile-api
heroku container:release web --app your-api-app-name
```

### Create a Heroku app for your client:

```
heroku create your-client-app-name
```

### Build and deploy your client app:

```
heroku container:push web --app your-client-app-name -f Dockerfile-client
heroku container:release web --app your-client-app-name
```

## 4. **Open your apps in a web browser:**

```
heroku open --app your-api-app-name
heroku open --app your-client-app-name
```

Remember to replace `your-api-app-name` and `your-client-app-name` with the actual names of your Heroku apps.

---

 ⚠️ If you have issues, see this discussion first: **[https://github.com/danny-avila/LibreChat/discussions/339](https://github.com/danny-avila/LibreChat/discussions/339)**
 

## Using Heroku Dashboard:
  - Open the app: After the deployment is complete, you can open the app in your browser by running heroku open or by visiting the app's URL.

*NOTE: If the heroku docker image process still needs an external mongodb/meilisearch, here are the instructions for setting up MongoDB Atlas and deploying MeiliSearch on Heroku:*

## Setting up MongoDB Atlas:

Sign up for a MongoDB Atlas account: If you don't have an account, sign up at: **[https://www.mongodb.com/cloud/atlas/signup](https://www.mongodb.com/cloud/atlas/signup)**

Create a new cluster: After signing in, create a new cluster by following the on-screen instructions. For a free tier cluster, select the "Shared" option and choose the "M0 Sandbox" tier.

Configure database access: Go to the "Database Access" section and create a new database user. Set a username and a strong password, and grant the user the "Read and Write to any database" privilege.

Configure network access: Go to the "Network Access" section and add a new IP address. For testing purposes, you can allow access from anywhere by entering 0.0.0.0/0. For better security, whitelist only the specific IP addresses that need access to the database.

Get the connection string: Once the cluster is created, click the "Connect" button. Select the "Connect your application" option and choose "Node.js" as the driver. Copy the connection string and replace and with the credentials you created earlier.

## Deploying MeiliSearch on Heroku:

Install the Heroku CLI: If you haven't already, download and install the Heroku CLI from: **[https://devcenter.heroku.com/articles/heroku-cli](https://devcenter.heroku.com/articles/heroku-cli)**
Login to Heroku: Open Terminal and run heroku login. Follow the instructions to log in to your Heroku account.

## Create a new Heroku app for MeiliSearch:

```
heroku create your-meilisearch-app-name
```
Replace your-meilisearch-app-name with a unique name for your MeiliSearch app.

### Set the buildpack:

```
heroku buildpacks:set meilisearch/meilisearch-cloud-buildpack --app your-meilisearch-app-name
```

### Set the master key for MeiliSearch:

```
heroku config:set MEILI_MASTER_KEY=your-master-key --app your-meilisearch-app-name
```

### Replace your-master-key with a secure master key.

### Deploy MeiliSearch:

```
git init
heroku git:remote -a your-meilisearch-app-name
git add .
git commit -m "Initial commit"
git push heroku master
```
### Get the MeiliSearch URL: After deployment, you can find the MeiliSearch URL by visiting your app's settings page in the Heroku Dashboard. The URL will be displayed under the "Domains" section.

## Update environment variables in LibreChat:

  - Now that you have your MongoDB Atlas connection string and MeiliSearch URL, update the following environment variables in your Heroku app for LibreChat:

  - `MONGODB_URI`: Set the value to the MongoDB Atlas connection string you obtained earlier.
  - `MEILISEARCH_URL`: Set the value to the MeiliSearch URL you obtained from your MeiliSearch app on Heroku.
  - `MEILISEARCH_KEY`: Set the value to the MeiliSearch master key you used when setting up the MeiliSearch app.
  - You can set these environment variables using the Heroku CLI or through the Heroku Dashboard, as described in the previous response.

  - Once you've updated the environment variables, LibreChat should be able to connect to MongoDB Atlas and MeiliSearch on Heroku.

```
heroku config:set KEY_NAME=KEY_VALUE --app your-app-name
```

  - Replace KEY_NAME and KEY_VALUE with the appropriate key names and values from your .env file. Repeat this command for each environment variable.


  
### Note: If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.librechat.ai) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.

