---
title: 🥷 Ninja (ChatGPT reverse proxy)
description: How to deploy Ninja, and enable the `CHATGPT_REVERSE_PROXY` for use with LibreChat.
weight: -3
---

# Ninja Deployment Guide

If you're looking to use the ChatGPT Endpoint in LibreChat **(not to be confused with [OpenAI's Official API](../install/configuration/ai_setup.md#openai))**, setting up a reverse proxy is an essential. Ninja offers a solution for this purpose, and this guide will walk you through deploying Ninja to enable the `CHATGPT_REVERSE_PROXY` for use with LibreChat. See their official GitHub for more info: [https://github.com/gngpp/ninja](https://github.com/gngpp/ninja)

> Using this method you will only be able to use `text-davinci-002-render-sha` with Ninja in LibreChat. Other models offered with a `plus` subscription will not work.

You can use it locally in Docker or deploy it on the web for remote access.

---

## Deploy Locally Using Docker:

For local deployment using Docker, the steps are as follows:

### 1. **Create a Ninja folder and a docker-compose.yml file inside it:**
- Edit the docker-compose file like this:

```yaml
version: '3.4'

services:
  ninja:
    image: gngpp/ninja:latest
    container_name: ninja
    restart: unless-stopped
    command: run
    ports:
      - "7999:7999"
```

### 2. **Set Up the LibreChat `.env` File:**
In the `.env` file within your LibreChat directory, you'll need to set the `CHATGPT_REVERSE_PROXY` variable:

```bash
CHATGPT_REVERSE_PROXY=http://host.docker.internal:7999/backend-api/conversation
```

### 3. **Start Docker Containers:**
From the Ninja directory, run the following command to launch the Docker containers:

```bash
docker compose up -d
```

---

## Alternate Docker Method:

You can add it to the LibreChat override file if you prefer

### 1. **Edit or Create the override file:**
In the LibreChat folder, find the `docker-compose.override.yml` file. (If you haven't created it yet you can either rename the `docker-compose.override.yml.example` to `docker-compose.override.yml`, or create a new one)

The override file should contain this:

```yaml
version: '3.4'

services:

  ninja:
    image: gngpp/ninja:latest
    container_name: ninja
    restart: unless-stopped
    command: run
    ports:
      - "7999:7999"
```

### 2. **Set Up the LibreChat `.env` File:**
In the `.env` file within your LibreChat directory, you'll need to set the `CHATGPT_REVERSE_PROXY` variable:

```bash
CHATGPT_REVERSE_PROXY=http://host.docker.internal:7999/backend-api/conversation
```

---

## Deploy Online on Hugging Face:

To deploy Ninja online by duplicating the Hugging Face Space, follow these steps:

### 1. **Hugging Face Space:**
Visit the [Ninja LibreChat Space](https://huggingface.co/spaces/LibreChat/Ninja) on Hugging Face.

### 2. **Duplicate the Space:**
Utilize the available options to duplicate or fork the space into your own Hugging Face account.

### 3. **Configure LibreChat:**
In the .env file (or secrets settings if you host LibreChat on Hugging Face), set the `CHATGPT_REVERSE_PROXY` variable using the following format:

```bash
CHATGPT_REVERSE_PROXY=http://your_hf_space_url.com/backend-api/conversation
```

- Replace `your_hf_space_url.com` with the domain of your deployed space.
    - Note: you can use this format: `https://your_username-ninja.hf.space` (replace `your_username` with your Huggingface username).
- The resulting URL should look similar to:
`https://your_username-ninja.hf.space/backend-api/conversation`
