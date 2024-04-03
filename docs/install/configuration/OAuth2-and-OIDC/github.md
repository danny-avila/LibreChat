---
title: GitHub
description: Learn how to configure LibreChat to use GitHub for user authentication.
weight: -10
---

# GitHub

## Create a GitHub Application

- Go to your **[Github Developer settings](https://github.com/settings/apps)**
- Create a new Github app

![image](https://github.com/danny-avila/LibreChat/assets/138638445/3a8b88e7-78f8-426e-bfc2-c5e3f8b21ccb)

## GitHub Application Configuration

-  Give it a `GitHub App name` and set your `Homepage URL`
    - Example for localhost: `http://localhost:3080`
    - Example for a domain: `https://example.com`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/f10d497d-460b-410f-9504-08735662648b)

- Add a valid `Callback URL`:
    - Example for localhost: `http://localhost:3080/oauth/github/callback`
    - Example for a domain: `https://example.com/oauth/github/callback`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/4e7e6dba-0afb-4ed8-94bf-4c61b0f29240)

- Uncheck the box labeled `Active` in the `Webhook` section

![image](https://github.com/danny-avila/LibreChat/assets/138638445/aaeb3ecb-2e76-4ea5-8264-edfbdd53de1a)

- Scroll down to `Account permissions` and set `Email addresses` to `Access: Read-only`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/3e561aa4-1f9e-4cb7-ace8-dbba8f0c0d55)

![image](https://github.com/danny-avila/LibreChat/assets/138638445/7b5f99af-7bde-43ee-9b43-6d3ce79ee00a)

- Click on `Create GitHub App`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/4cc48550-eac3-4970-939b-81a23fa9c7cf)

## .env Configuration

- Click `Generate a new client secret`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/484c7851-71dd-4167-a59e-9a56c4e08c36)

- Copy the `Client ID` and `Client Secret` in the `.env` file

![image](https://github.com/danny-avila/LibreChat/assets/138638445/aaf78840-48a9-44e1-9625-4109ed91d965)

```bash
DOMAIN_CLIENT=https://your-domain.com # use http://localhost:3080 if not using a custom domain
DOMAIN_SERVER=https://your-domain.com # use http://localhost:3080 if not using a custom domain

GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=/oauth/github/callback
```

- Save the `.env` file

> Note: If using docker, run `docker compose up -d` to apply the .env configuration changes
