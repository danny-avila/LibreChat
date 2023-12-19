# User/Auth System


>⚠️ Note: If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.

## **First Time Setup**

In order for the auth system to function properly, there are some environment variables that are needed. Note that this information is also included in the [/.env.example](/.env.example) file.

In /.env, you will need to set the following variables:
```bash
# Change the secrets to a secure, random string
JWT_SECRET=secret
JWT_REFRESH_SECRET=refresh_secret

# Set the expiration delay for the secure cookie with the JWT token
# Delay is in milliseconds e.g. 7 days is 1000*60*60*24*7

# Recommended session expiry is 15 minutes. Make it longer if you want the user to be able to revist the page without logging in for a longer duration of time.

# Recommended refresh token expiry is 7 days
SESSION_EXPIRY=1000 * 60 * 15
REFRESH_TOKEN_EXPIRY=(1000 * 60 * 60 * 24) * 7

DOMAIN_SERVER=http://localhost:3080
DOMAIN_CLIENT=http://localhost:3080
```

## Automated Moderation System (optional)

The Automated Moderation System uses a scoring mechanism to track user violations. As users commit actions like excessive logins, registrations, or messaging, they accumulate violation scores. Upon reaching a set threshold, the user and their IP are temporarily banned. This system ensures platform security by monitoring and penalizing rapid or suspicious activities.

To set up the mod system, review [the setup guide](../features/mod_system.md).

*Please Note: If you are wanting this to work in development mode, you will need to create a file called `.env.development` in the root directory and set `DOMAIN_CLIENT` to `http://localhost:3090` or whatever port  is provided by vite when runnning `npm run frontend-dev`*

Important: When you run the app for the first time, you need to create a new account by clicking on "Sign up" on the login page. The first account you make will be the admin account. The admin account doesn't have any special features right now, but it might be useful if you want to make an admin dashboard to manage other users later.

⚠️ **__For the first time, you should use a local account (email and password) to sign up and log in.__**

---

## **OAuth2/Social Login**

## Before enabling Social Authentication, set ALLOW_SOCIAL_LOGIN=true in the .env file

## Google Authentication

To enable Google login, you must create an application in the [Google Cloud Console](https://cloud.google.com) and provide the client ID and client secret in the `/.env` file.

1. Go to "APIs and Services" in your Google Cloud account and click on "Credentials".
2. Click on "Configure consent screen" and select "External" as the user type.
3. Add "profile", "email" and "openid" as the scopes for your app. These are the first three checkboxes when you click on "Add or remove scopes".
4. Click on "Save and continue" and then "Back to dashboard".
5. Click on "Create Credentials" and then "OAuth client ID".
6. Select "Web application" as the application type and give it a name.
7. Add `https://yourdomain`, `http://localhost:3080` and `http://localhost:3090` to the authorized JavaScript origins.
8. Add `https://your-domain/oauth/google/callback` to the authorized redirect URIs. (if you use localhost then use this `http://localhost:3080/oauth/google/callback`)
9. Click on "Create" and copy your client ID and client secret.
10. Paste them into your `/.env` file.
11. Enable the feature in the `/.env` file

---

## Facebook Authentication
### (It only works with a domain, not with localhost)

1. Go to the [Facebook Developer Portal](https://developers.facebook.com/).
2. Create a new application and select "Authenticate and request data from users with Facebook Login."
3. Choose "No, I'm not creating a game" and provide a name for your application.
4. In the Dashboard tab, go to "Use cases" and click "Customize" under "Authentication and account creation." Add the email permission by clicking "add" under email's permission.
5. In the settings section, click "go to settings." Ensure that "Client OAuth login," "Web OAuth login," and "Enforce HTTPS" are **enabled**.
6. Add `your-domain/oauth/facebook/callback` to the Valid OAuth Redirect URIs (e.g., https://example.com/oauth/facebook/callback).
7. Save changes. In the "App settings" tab, click "show" next to the App secret.
8. Copy the Client ID and Client Secret and paste them into the .env file as follows: (`App ID=Client ID`  &  `App secret=Client Secret`)

```bash
FACEBOOK_CLIENT_ID=your_client_id
FACEBOOK_CLIENT_SECRET=your_client_secret
FACEBOOK_CALLBACK_URL=/oauth/facebook/callback # this should be the same for everyone
```
9. Save the .env file.

Make sure to replace "your_client_id" and "your_client_secret" with the actual values from your Facebook Developer Portal

---

## OpenID Authentication with Azure AD

1. Go to the [Azure Portal](https://portal.azure.com/) and sign in with your account.
2. In the search box, type "Azure Active Directory" and click on it.
3. On the left menu, click on App registrations and then on New registration.
4. Give your app a name and select Web as the platform type.
5. In the Redirect URI field, enter `http://localhost:3080/oauth/openid/callback` and click on Register.
6. You will see an Overview page with some information about your app. Copy the Application (client) ID and the Directory (tenant) ID and save them somewhere.
7. On the left menu, click on Authentication and check the boxes for Access tokens and ID tokens under Implicit grant and hybrid flows.
8. On the left menu, click on Certificates & Secrets and then on New client secret. Give your secret a name and an expiration date and click on Add.
9. You will see a Value column with your secret. Copy it and save it somewhere. Don't share it with anyone!
10. Open the .env file in your project folder and add the following variables with the values you copied:

```
OPENID_CLIENT_ID=Your Application (client) ID
OPENID_CLIENT_SECRET=Your client secret
OPENID_ISSUER=https://login.microsoftonline.com/Your Directory (tenant ID)/v2.0/
OPENID_SESSION_SECRET=Any random string
OPENID_SCOPE=openid profile email #DO NOT CHANGE THIS
OPENID_CALLBACK_URL=/oauth/openid/callback # this should be the same for everyone
```
11. Save the .env file and you're done! You have successfully set up OpenID authentication with Azure AD for your app.

## OpenID Authentication with AWS Cognito

1. Create a new User Pool in Cognito:
   1. Ensure your Cognito user pool sign-in options include `User Name` and `Email`.
   2. Ensure that `given_name` and `family_name` are required attributes.
   3. Add an initial app client:
      1. Set the app type to `Confidential client`
      2. Select `Use Cognitio Hosted UI` and chose a domain name
      3. Make sure `Generate a client secret` is set.
      4. Set the `Allowed callback URLs` to `https://YOUR_DOMAIN/oauth/openid/callback`
      5. Under advanced settings make sure `Profile` is included in the `OpenID Connect scopes`
2. Open your User Pool
3. Go to the `App Integrations` tab
4. Open the app client we created above.
5. Use the `User Pool ID`and your AWS region to construct the OPENID_ISSUER (see below)
6. Toggle `Show Client Secret`
6. Use the `Client ID` for `OPENID_CLIENT_ID`
7. Use the `Client secret` for `OPENID_CLIENT_SECRET`
8. Open the .env file in your project folder and add the following variables with the values you copied:

```
OPENID_CLIENT_ID=Your client ID
OPENID_CLIENT_SECRET=Your client secret
OPENID_ISSUER=https://cognito-idp.[AWS REGION].amazonaws.com/[USER POOL ID]/.well-known/openid-configuration
OPENID_SESSION_SECRET=Any random string
OPENID_SCOPE=openid profile email
OPENID_CALLBACK_URL=/oauth/openid/callback
```
9. Save the .env file and you're done! You have successfully set up OpenID authentication with Cognito for your app.

---

## GitHub Authentication

1. Go to your [Github Developer settings](https://github.com/settings/apps)
2. Create a new Github app
3. Give it a GitHub App name and set in the Homepage URL "your-domain")    (example: http://localhost:3080)
4. Add a callback URL and set it as "your-domain/oauth/github/callback" (example: http://localhost:3080/oauth/github/callback)
5. Remove the Active checkbox in the Webhook section
6. Save changes and generate a Client Secret
7. In the Permissions & events tab select, open the Account Permissions and set Email addresses to Read-only
8. Put the Client ID and Client Secret in the .env file:
```
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=/oauth/github/callback # this should be the same for everyone
```
9. Save the .env file
---

## Discord Authentication

1. Go to [Discord Developer Portal](https://discord.com/developers)
2. Create a new Application and give it a name
4. In the OAuth2 general settings add a redirect URL and set it as "your-domain/oauth/discord/callback" (example: http://localhost:3080/oauth/discord/callback)
5. in the Default Authorization Link set applications.commands
6. Save changes and reset the Client Secret
7. Put the Client ID and Client Secret in the .env file:
```
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_CALLBACK_URL=/oauth/discord/callback # this should be the same for everyone
```
8. Save the .env file

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

NOTE: ⚠️ **Failing to perform either of the below setups will result in LibreChat using the unsecured password reset! This allows anyone to reset any password on your server immediately, without mail being sent at all!** The variable EMAIL\_FROM does not support all email providers **but is still required**. To stay updated, check the bug fixes [here](https://github.com/danny-avila/LibreChat/tags).

### Setup with Gmail

1. Create a Google Account and enable 2-step verification.
2. In the [Google Account settings](https://myaccount.google.com/), click on the "Security" tab and open "2-step verification."
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

## **Disable User Registration**

To disable or re-enable registration, open up the root `.env` file and set `ALLOW_REGISTRATION=true` or `ALLOW_REGISTRATION=false` depending on if you want registration open or closed.

To disable or re-enable social registration, open up the root `.env` file and set `ALLOW_SOCIAL_REGISTRATION=true` or `ALLOW_SOCIAL_REGISTRATION=false` depending on if you want social registration open or closed.

**NOTE: OpenID does not support the ability to disable only registration.**

### ⚠️***Warning***

If you previously implemented your own user system using the original scaffolding that was provided, you will no longer see conversations and presets by switching to the new user system. This is because of a design flaw in the scaffolding implementation that was problematic for the inclusion of social login.

### For user updating from an older version of the app:

When the first account is registered, the application will automatically migrate any conversations and presets that you created before the user system was implemented to that account.
if you use login for the first time with a social login account (eg. Google, facebook, etc.), the conversations and presets that you created before the user system was implemented will NOT be migrated to that account.

## **Manual User Registration**
You can use `npm run create-user` to create a user. If you can't get npm to work, try `sudo docker exec -ti LibreChat sh` first to "ssh" into the container.
