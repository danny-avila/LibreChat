---
title: Google
description: Learn how to configure LibreChat to use Google for user authentication.
weight: -9
---

# Google

## Create a Google Application

- Visit: **[Google Cloud Console](https://cloud.google.com)** and open the `Console`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/a7d290ea-6031-43b3-b367-36ce00e46f20)

- Create a New Project and give it a name

![image](https://github.com/danny-avila/LibreChat/assets/138638445/ce71c9ca-7ddd-4021-9133-a872c64c20c4)

![image](https://github.com/danny-avila/LibreChat/assets/138638445/8abbd41e-8332-4851-898d-9cddb373c527)

## Google Application Configuration

- Select the project you just created and go to `APIs and Services`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/c6265582-2cf6-430f-ae51-1edbdd9f2c48)

![image](https://github.com/danny-avila/LibreChat/assets/138638445/006e16ba-56b8-452d-b324-5f2d202637ab)

- Select `Credentials` and click `CONFIGURE CONSENT SCREEN`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/e4285cbb-833f-4366-820d-addf04a2ad77)

- Select `External` then click `CREATE`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/232d46c0-dd00-4637-b538-3ba3bdbdc0b2)

- Fill in your App information

> Note: You can get a logo from your LibreChat folder here: `docs\assets\favicon_package\android-chrome-192x192.png`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/e6c4c8ec-2f02-4af5-9458-c72394d0b7c5)

- Configure your `App domain` and add your `Developer contact information` then click `SAVE AND CONTINUE`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/6c2aa557-9b9b-412d-bc2b-76a0dc11f394)

- Configure the `Sopes`
    - Add `email`,`profile` and `openid`
    - Click `UPDATE` and `SAVE AND CONTINUE`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/46af2fb9-8cfd-41c5-a763-814b308e45c3)

![image](https://github.com/danny-avila/LibreChat/assets/138638445/4e832970-d392-4c67-bb38-908a5c51660a)

- Click `SAVE AND CONTINUE`
- Review your app and go back to dashboard

- Go back to the `Credentials` tab, click on `+ CREATE CREDENTIALS` and select `OAuth client ID`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/beef1982-55a3-4837-8e8c-20bad8d846ba)

- Select `Web application` and give it a name

![image](https://github.com/danny-avila/LibreChat/assets/138638445/badde864-f6b5-468f-a72f-bac93326ffa5)

- Configure the `Authorized JavaScript origins`, you can add both your domain and localhost if you desire
    - Example for localhost: `http://localhost:3080`
    - Example for a domain: `https://example.com`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/f7e3763a-5f74-4850-8638-44f81693b9ac)

- Add a valid `Authorized redirect URIs`
    - Example for localhost: `http://localhost:3080/oauth/google/callback`
    - Example for a domain: `https://example.com/oauth/google/callback`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/0db34b19-d780-4651-9c2f-d33e24a74d55)

## .env Configuration

- Click `CREATE` and copy your `Client ID` and `Client secret`

![image](https://github.com/danny-avila/LibreChat/assets/138638445/fa8572bf-f482-457a-a285-aec7d41af76b)

- Add them to your `.env` file:

```bash
DOMAIN_CLIENT=https://your-domain.com # use http://localhost:3080 if not using a custom domain
DOMAIN_SERVER=https://your-domain.com # use http://localhost:3080 if not using a custom domain

GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=/oauth/google/callback
```

- Save the `.env` file

> Note: If using docker, run `docker compose up -d` to apply the .env configuration changes
