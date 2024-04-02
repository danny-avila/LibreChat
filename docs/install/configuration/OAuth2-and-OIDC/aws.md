---
title: AWS Cognito
description: Learn how to configure LibreChat to use AWS Cognito for user authentication.
weight: -7
---

# AWS Cognito

## Create a new User Pool in Cognito

- Visit: **[https://console.aws.amazon.com/cognito/](https://console.aws.amazon.com/cognito/)**
- Sign in as Root User
- Click on `Create user pool`

![image](https://github.com/danny-avila/LibreChat/assets/32828263/e9b412c3-2cf1-4f54-998c-d1d6c12581a5)

## Configure sign-in experience

Your Cognito user pool sign-in options should include `User Name` and `Email`.

![image](https://github.com/danny-avila/LibreChat/assets/32828263/d2cf362d-469e-4993-8466-10282da114c2)

## Configure Security Requirements

You can configure the password requirements now if you desire

![image](https://github.com/danny-avila/LibreChat/assets/32828263/e125e8f1-961b-4a38-a6b7-ed1faf29c4a3)

## Configure sign-up experience

Choose the attributes required at signup. The minimum required is `name`. If you want to require users to use their full name at sign up use: `given_name` and `family_name` as required attributes.

![image](https://github.com/danny-avila/LibreChat/assets/32828263/558b8e2c-afbd-4dd1-87f3-c409463b5f7c)

## Configure message delivery

Send email with Cognito can be used for free for up to 50 emails a day

![image](https://github.com/danny-avila/LibreChat/assets/32828263/fcb2323b-708e-488c-9420-7eb482974648)

## Integrate your app

Select `Use Cognitio Hosted UI` and chose a domain name

![image](https://github.com/danny-avila/LibreChat/assets/32828263/111b3dd4-3b20-4e3e-80e1-7167d2ad0f62)

Set the app type to `Confidential client`
Make sure `Generate a client secret` is set.
Set the `Allowed callback URLs` to `https://YOUR_DOMAIN/oauth/openid/callback`

![image](https://github.com/danny-avila/LibreChat/assets/32828263/1f92a532-7c4d-4632-a55d-9d00bf77fc4d)

Under `Advanced app client settings` make sure `Profile` is included in the `OpenID Connect scopes` (in the bottom)

![image](https://github.com/danny-avila/LibreChat/assets/32828263/5b035eae-4a8e-482c-abd5-29cee6502eeb)

## Review and create
You can now make last minute changes, click on `Create user pool` when you're done reviewing the configuration

![image](https://github.com/danny-avila/LibreChat/assets/32828263/dc8b2374-9adb-4065-85dc-a087d625372d)

![image](https://github.com/danny-avila/LibreChat/assets/32828263/67efb1e9-dfe3-4ebd-9ebb-92186c514b5c)

![image](https://github.com/danny-avila/LibreChat/assets/32828263/9f819175-ace1-44b1-ba68-af21ac9f6735)

![image](https://github.com/danny-avila/LibreChat/assets/32828263/3e7b8b17-4e12-49af-99cf-78981d6331df)

## Get your environment variables

1. Open your User Pool

![image](https://github.com/danny-avila/LibreChat/assets/32828263/b658ff2a-d252-4f3d-90a7-9fbde42c01db)

2. The `User Pool ID` and your AWS region will be used to construct the `OPENID_ISSUER` (see below)

![image](https://github.com/danny-avila/LibreChat/assets/32828263/dc8ae403-cbff-4aae-9eee-42d7cf3485e7)
![image](https://github.com/danny-avila/LibreChat/assets/32828263/d606f5c8-c60b-4d20-bdb2-d0d69e49ea1e)

3.  Go to the `App Integrations` tab

![image](https://github.com/danny-avila/LibreChat/assets/32828263/58713bdc-24bc-47de-bdca-020dc321e997)

4.  Open the app client

![image](https://github.com/danny-avila/LibreChat/assets/32828263/271bf7d2-3df2-43a7-87fc-e50294e49b2e)

5. Toggle `Show Client Secret`

![image](https://github.com/danny-avila/LibreChat/assets/32828263/a844fe65-313d-4754-81b4-380336e0e336)

- Use the `Client ID` for `OPENID_CLIENT_ID`

- Use the `Client secret` for `OPENID_CLIENT_SECRET`

- Generate a random string for the `OPENID_SESSION_SECRET`

> The `OPENID_SCOPE` and `OPENID_CALLBACK_URL` are pre-configured with the correct values

6. Open the `.env` file at the root of your LibreChat folder and add the following variables with the values you copied:

```bash
DOMAIN_CLIENT=https://your-domain.com # use http://localhost:3080 if not using a custom domain
DOMAIN_SERVER=https://your-domain.com # use http://localhost:3080 if not using a custom domain

OPENID_CLIENT_ID=Your client ID
OPENID_CLIENT_SECRET=Your client secret
OPENID_ISSUER=https://cognito-idp.[AWS REGION].amazonaws.com/[USER POOL ID]/.well-known/openid-configuration
OPENID_SESSION_SECRET=Any random string
OPENID_SCOPE=openid profile email
OPENID_CALLBACK_URL=/oauth/openid/callback
```
7. Save the .env file

> Note: If using docker, run `docker compose up -d` to apply the .env configuration changes
