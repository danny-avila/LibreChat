---
title: 🐳 Docker Compose ✨(Recommended)
description: "Docker Compose Installation Guide: Docker Compose installation is recommended for most use cases. It's the easiest, simplest, and most reliable method to get started."
weight: -10
---

# Docker Compose Installation Guide

Docker Compose installation is recommended for most use cases. It's the easiest, simplest, and most reliable method to get started.

If you prefer to watch a video, we have video guides for [Windows](./windows_install.md#recommended) and [Ubuntu 22.04 LTS](./linux_install.md#recommended)

## Installation and Configuration

### Preparation
Start by cloning the repository or downloading it to your desired location:

```bash
  git clone https://github.com/danny-avila/LibreChat.git
```

### Docker Installation
Install Docker on your system. **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** is recommended for managing your Docker containers.

### LibreChat Configuration
Before running LibreChat with Docker, you need to configure some settings:

- Provide all necessary credentials in the `.env` file before the next step.
   - Docker will read this env file. See the **[/.env.example](https://github.com/danny-avila/LibreChat/blob/main/.env.example)** file for reference.
- If you want to change the `docker-compose.yml` file, please create a `docker-compose.override.yml` file based on the `docker-compose.override.yml.example`.
  This allows you to update without having to modify `docker-compose.yml`.
- Either create an empty `librechat.yaml` file or use the example from `librechat.example.yaml`.

#### [AI Setup](../configuration/ai_setup.md) (Required)
At least one AI endpoint should be setup for use.

#### [Custom Endpoints & Configuration](../configuration/custom_config.md#docker-setup) (Optional)
Allows you to customize AI endpoints, such as Mistral AI, and other settings to suit your specific needs.

#### [Manage Your MongoDB Database](../../features/manage_your_database.md) (Optional)
Safely access and manage your MongoDB database using Mongo Express

#### [User Authentication System Setup](../configuration/user_auth_system.md) (Optional)
How to set up the user/auth system and Google login.

### Running LibreChat
Once you have completed all the setup, you can start the LibreChat application by running the command `docker compose up` in your terminal. After running this command, you can access the LibreChat application at `http://localhost:3080`.

**Note:** MongoDB does not support older ARM CPUs like those found in Raspberry Pis. However, you can make it work by setting MongoDB’s version to mongo:4.4.18 in docker-compose.yml, the most recent version compatible with

That's it! If you need more detailed information on configuring your compose file, see my notes below.

## Updating LibreChat
The following commands will fetch the latest code of LibreChat and build a new docker image.

```bash
git pull
docker compose down
docker compose up --build
```

If you're having issues running this command, you can try running what the script does manually:

Prefix commands with `sudo` according to your environment permissions.

```bash
# Stop the container (if running)
docker compose down
# Switch to the repo's main branch
git checkout main
# Pull the latest changes to the main branch from Github
git pull 
# Prune all LibreChat Docker images
docker rmi librechat:latest
# Remove all unused dangling Docker images.
# Be careful, as this will delete all dangling docker images on your
# computer, also those not created by LibreChat!
docker image prune -f
# Building a new LibreChat image without cache
docker compose build --no-cache

# Start LibreChat
docker compose up
```

## Advanced Settings

### Config notes for docker-compose.yml file

Modification to the `docker-compose.yml` should be made with `docker-compose.override.yml` whenever possible to prevent conflicts when updating. You can create a new file named `docker-compose.override.yml` in the same directory as your main `docker-compose.yml` file for LibreChat, where you can set your .env variables as needed under `environment`, or modify the default configuration provided by the main `docker-compose.yml`, without the need to directly edit or duplicate the whole file.
The file `docker-compose.override.yml.example` gives some examples of the most common reconfiguration options used.

For more info see: 

- Our quick guide: 
    - **[Docker Override](../configuration/docker_override.md)**

- The official docker documentation: 
    - **[docker docs - understanding-multiple-compose-files](https://docs.docker.com/compose/multiple-compose-files/extends/#understanding-multiple-compose-files)**
    - **[docker docs - merge-compose-files](https://docs.docker.com/compose/multiple-compose-files/merge/#merge-compose-files)**
    - **[docker docs - specifying-multiple-compose-files](https://docs.docker.com/compose/reference/#specifying-multiple-compose-files)**

- Any environment variables set in your compose file will override variables with the same name in your .env file. Note that the following variables are necessary to include in the compose file so they work in the docker environment, so they are included for you.

```yaml
    env_file:
      - .env
    environment:
      - HOST=0.0.0.0
      - MONGO_URI=mongodb://mongodb:27017/LibreChat
# ...
      - MEILI_HOST=http://meilisearch:7700
# ...
    env_file:
      - .env
    environment:
      - MEILI_HOST=http://meilisearch:7700
```

- If for some reason you're not able to build the app image, you can pull the latest image from **Dockerhub**.
- Create a new file named `docker-compose.override.yml` in the same directory as your main `docker-compose.yml` with this content:

```yaml
version: '3.4'

services:
  api:
    image: ghcr.io/danny-avila/librechat-dev:latest
```

- Then use `docker compose build` as you would normally

- **Note:** There are different Dockerhub images. the `librechat:latest` image is only updated with new release tags, so it may not have the latest changes to the main branch. To get the latest changes you can use `librechat-dev:latest` instead


### **[LibreChat on Docker Hub](https://hub.docker.com/r/chatgptclone/app/tags)**

### **[Create a MongoDB database](../configuration/mongodb.md)** (Not required if you'd like to use the local database installed by Docker)

---

>⚠️ Note: If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
