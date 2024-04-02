---
title: Discord
description: Learn how to configure LibreChat to use Discord for user authentication.
weight: -11
---

# Discord

## Create a new Discord Application

- Go to **[Discord Developer Portal](https://discord.com/developers)**

- Create a new Application and give it a name

![image](https://github.com/danny-avila/LibreChat/assets/32828263/7e7cdfa0-d1d6-4b6b-a8a9-905aaa40d135)

## Discord Application Configuration

- In the OAuth2 general settings add a valid redirect URL:
    - Example for localhost: `http://localhost:3080/oauth/discord/callback`
    - Example for a domain: `https://example.com/oauth/discord/callback`

![image](https://github.com/danny-avila/LibreChat/assets/32828263/6c56fb92-f4ab-43b9-981b-f98babeeb19d)

- In `Default Authorization Link`, select `In-app Authorization` and set the scopes to `applications.commands`

![image](https://github.com/danny-avila/LibreChat/assets/32828263/2ce94670-9422-48d2-97e9-ec40bd331573)

- Save changes and reset the Client Secret

![image](https://github.com/danny-avila/LibreChat/assets/32828263/3af164fc-66ed-4e5e-9f5a-9bcab3df37b4)
![image](https://github.com/danny-avila/LibreChat/assets/32828263/2ece3935-68e6-4f2e-8656-9721cba5388a)

## .env Configuration

- Paste your `Client ID` and `Client Secret` in the `.env` file:

```bash
DOMAIN_CLIENT=https://your-domain.com # use http://localhost:3080 if not using a custom domain
DOMAIN_SERVER=https://your-domain.com # use http://localhost:3080 if not using a custom domain

DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_CALLBACK_URL=/oauth/discord/callback
```

- Save the `.env` file

> Note: If using docker, run `docker compose up -d` to apply the .env configuration changes
