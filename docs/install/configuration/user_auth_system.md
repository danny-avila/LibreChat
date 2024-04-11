---
title: 🛂 Authentication System
description: This guide explains how to use the user authentication system of LibreChat, which offers secure and easy email and social logins. You will learn how to set up sign up, log in, password reset, and more.
weight: -5
--- 

# User Authentication System

LibreChat has a user authentication system that allows users to sign up and log in securely and easily. The system is scalable and can handle a large number of concurrent users without compromising performance or security.

By default, we have email signup and login enabled, which means users can create an account using their email address and a password. They can also reset their password if they forget it.

Additionally, our system can integrate social logins from various platforms such as Google, GitHub, Discord, OpenID, and more. This means users can log in using their existing accounts on these platforms, without having to create a new account or remember another password.

>❗**Important:** When you run the app for the first time, you need to create a new account by clicking on "Sign up" on the login page. The first account you make will be the admin account. The admin account doesn't have any special features right now, but it might be useful if you want to make an admin dashboard to manage other users later. 

>> **Note:** The first account created should ideally be a local account (email and password).

## Basic Configuration:

### General

Here's an overview of the general configuration, located in the `.env` file at the root of the LibreChat folder.

  - `ALLOW_EMAIL_LOGIN`: Email login. Set to `true` or `false` to enable or disable ONLY email login.
  - `ALLOW_REGISTRATION`: Email registration of new users. Set to `true` or `false` to enable or disable Email registration.
  - `ALLOW_SOCIAL_LOGIN`: Allow users to connect to LibreChat with various social networks, see below. Set to `true` or `false` to enable or disable.
  - `ALLOW_SOCIAL_REGISTRATION`: Enable or disable registration of new user using various social network. Set to `true` or `false` to enable or disable.

> **Note:** OpenID does not support the ability to disable only registration.

>> **Quick Tip:** Even with registration disabled, add users directly to the database using `npm run create-user`. If you can't get npm to work, try `sudo docker exec -ti LibreChat sh` first to "ssh" into the container.
>> **Quick Tip:** To delete a user, you can run `docker-compose exec api npm run delete-user email@domain.com` 

![image](https://github.com/danny-avila/LibreChat/assets/81851188/52a37d1d-7392-4a9a-a79f-90ed2da7f841)

```bash
ALLOW_EMAIL_LOGIN=true
ALLOW_REGISTRATION=true       
ALLOW_SOCIAL_LOGIN=false
ALLOW_SOCIAL_REGISTRATION=false
```

### Session Expiry and Refresh Token

- Default values: session expiry: 15 minutes, refresh token expiry: 7 days
  - For more information: **[GitHub PR #927 - Refresh Token](https://github.com/danny-avila/LibreChat/pull/927)**

```bash
SESSION_EXPIRY=1000 * 60 * 15
REFRESH_TOKEN_EXPIRY=(1000 * 60 * 60 * 24) * 7
```

``` mermaid
sequenceDiagram
    Client->>Server: Login request with credentials
    Server->>Passport: Use authentication strategy (e.g., 'local', 'google', etc.)
    Passport-->>Server: User object or false/error
    Note over Server: If valid user...
    Server->>Server: Generate access and refresh tokens
    Server->>Database: Store hashed refresh token
    Server-->>Client: Access token and refresh token
    Client->>Client: Store access token in HTTP Header and refresh token in HttpOnly cookie
    Client->>Server: Request with access token from HTTP Header
    Server-->>Client: Requested data
    Note over Client,Server: Access token expires
    Client->>Server: Request with expired access token
    Server-->>Client: Unauthorized
    Client->>Server: Request with refresh token from HttpOnly cookie
    Server->>Database: Retrieve hashed refresh token
    Server->>Server: Compare hash of provided refresh token with stored hash
    Note over Server: If hashes match...
    Server-->>Client: New access token and refresh token
    Client->>Server: Retry request with new access token
    Server-->>Client: Requested data
```

### JWT Secret and Refresh Secret

- You should use new secure values. The examples given are 32-byte keys (64 characters in hex). 
  - Use this replit to generate some quickly: **[JWT Keys](https://replit.com/@daavila/crypto#index.js)**

```bash
JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef
JWT_REFRESH_SECRET=eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418
```

---

## Automated Moderation System (optional)

The Automated Moderation System is enabled by default. It uses a scoring mechanism to track user violations. As users commit actions like excessive logins, registrations, or messaging, they accumulate violation scores. Upon reaching a set threshold, the user and their IP are temporarily banned. This system ensures platform security by monitoring and penalizing rapid or suspicious activities.

To set up the mod system, review [the setup guide](../../features/mod_system.md).

> *Please Note: If you want this to work in development mode, you will need to create a file called `.env.development` in the root directory and set `DOMAIN_CLIENT` to `http://localhost:3090` or whatever port  is provided by vite when runnning `npm run frontend-dev`*

---

## **Email and Password Reset**

### General setup

in the .env file modify these variables:

```
EMAIL_SERVICE=                  # eg. gmail - see https://community.nodemailer.com/2-0-0-beta/setup-smtp/well-known-services/
EMAIL_HOST=                     # eg. example.com - if EMAIL_SERVICE is not set, connect to this server.
EMAIL_PORT=25                   # eg. 25 - mail server port to connect to with EMAIL_HOST (usually 25, 465, 587)
EMAIL_ENCRYPTION=               # eg. starttls - valid values: starttls (force STARTTLS), tls (obligatory TLS), anything else (use STARTTLS if available)
EMAIL_ENCRYPTION_HOSTNAME=      # eg. example.com - check the name in the certificate against this instead of EMAIL_HOST
EMAIL_ALLOW_SELFSIGNED=         # eg. true - valid values: true (allow self-signed), anything else (disallow self-signed)
EMAIL_USERNAME=                 # eg. me@gmail.com - the username used for authentication. For consumer services, this MUST usually match EMAIL_FROM.
EMAIL_PASSWORD=                 # eg. password - the password used for authentication
EMAIL_FROM_NAME=                # eg. LibreChat - the human-readable address in the From is constructed as "EMAIL_FROM_NAME <EMAIL_FROM>". Defaults to APP_TITLE.
```

If you want to use one of the predefined services, configure only these variables:

EMAIL\_SERVICE is the name of the email service you are using (Gmail, Outlook, Yahoo Mail, ProtonMail, iCloud Mail, etc.) as defined in the NodeMailer well-known services linked above.
EMAIL\_USERNAME is the username of the email service (usually, it will be the email address, but in some cases, it can be an actual username used to access the account).
EMAIL\_PASSWORD is the password used to access the email service. This is not the password to access the email account directly, but a password specifically generated for this service.
EMAIL\_FROM is the email address that will appear in the "from" field when a user receives an email.
EMAIL\_FROM\_NAME is the name that will appear in the "from" field when a user receives an email. If left unset, it defaults to the app title.

If you want to use a generic SMTP service or need advanced configuration for one of the predefined providers, configure these variables:

EMAIL\_HOST is the hostname to connect to, or an IP address.
EMAIL\_PORT is the port to connect to. Be aware that different ports usually come with different requirements - 25 is for mailserver-to-mailserver, 465 requires encryption at the start of the connection, and 587 allows submission of mail as a user.
EMAIL\_ENCRYPTION defines if encryption is required at the start (`tls`) or started after the connection is set up (`starttls`). If either of these values are set, they are enforced. If they are not set, an encrypted connection is started if available.
EMAIL\_ENCRYPTION\_HOSTNAME allows specification of a hostname against which the certificate is validated. Use this if the mail server does have a valid certificate, but you are connecting with an IP or a different name for some reason.
EMAIL\_ALLOW\_SELFSIGNED defines whether self-signed certificates can be accepted from the server. As the mails being sent contain sensitive information, ONLY use this for testing.

NOTE: ⚠️ **Failing to perform either of the below setups will result in LibreChat using the unsecured password reset! This allows anyone to reset any password on your server immediately, without mail being sent at all!** The variable EMAIL\_FROM does not support all email providers **but is still required**. To stay updated, check the bug fixes: **[here](https://github.com/danny-avila/LibreChat/tags)**

### Setup with Gmail

1. Create a Google Account and enable 2-step verification.
2. In the **[Google Account settings](https://myaccount.google.com/)**, click on the "Security" tab and open "2-step verification."
3. Scroll down and open "App passwords." Choose "Mail" for the app and select "Other" for the device, then give it a random name.
4. Click on "Generate" to create a password, and copy the generated password.
5. In the .env file, modify the variables as follows:

```
EMAIL_SERVICE=gmail
EMAIL_USERNAME=your-email
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=email address for the from field, e.g., noreply@librechat.ai
EMAIL_FROM_NAME="My LibreChat Server"
```

### Setup with custom mail server

1. Gather your SMTP login data from your provider. The steps are different for each, but they will usually list values for all variables.
2. In the .env file, modify the variables as follows, assuming some sensible example values:

```
EMAIL_HOST=mail.example.com
EMAIL_PORT=587
EMAIL_ENCRYPTION=starttls
EMAIL_USERNAME=your-email
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=email address for the from field, e.g., noreply@librechat.ai
EMAIL_FROM_NAME="My LibreChat Server"
```

---

## Social Authentication

![image](https://github.com/danny-avila/LibreChat/assets/138638445/cacc2ee0-acf9-4d05-883a-ca9952de1165)

### OAuth2
  - [Discord](./OAuth2-and-OIDC/discord.md)
  - [GitHub](./OAuth2-and-OIDC/github.md)
  - [Google](./OAuth2-and-OIDC/google.md)
  - [Facebook](./OAuth2-and-OIDC/facebook.md)
### OpenID Connect
  - [AWS Cognito](./OAuth2-and-OIDC/aws.md)
  - [Azure Entra/AD](./OAuth2-and-OIDC/azure.md)
  - [Keycloak](./OAuth2-and-OIDC/keycloak.md)