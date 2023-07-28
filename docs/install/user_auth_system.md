# User/Auth System

## **First Time Setup**

In order for the auth system to function properly, there are some environment variables that are needed. Note that this information is also included in the [/.env.example](/.env.example) file.

In /.env, you will need to set the following variables:
```bash
# Change this to a secure string
JWT_SECRET=secret
# Set the expiration delay for the secure cookie with the JWT token
# Delay is in millisecond e.g. 7 days is 1000*60*60*24*7
SESSION_EXPIRY=1000 * 60 * 60 * 24 * 7
DOMAIN_SERVER=http://localhost:3080
DOMAIN_CLIENT=http://localhost:3080
```

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
7. Add `http://yourdomain`, `http://localhost:3080` and `http://localhost:3090` to the authorized JavaScript origins.
8. Add `http://your-domain/oauth/google/callback` to the authorized redirect URIs. (if you use localhost then use this `http://localhost:3080/oauth/google/callback`)
9. Click on "Create" and copy your client ID and client secret.
10. Paste them into your `/.env` file.
11. Enable the feature in the `/.env` file

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

## Github Authentication

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

Most of the code is in place for sending password reset emails, but is not yet feature-complete as I have not setup an email server to test it. Currently, submitting a password reset request will then display a link with the one-time reset token that can then be used to reset the password. Understanding that this is a considerable security hazard, email integration will be included in the next release.

## **Disable User Registration**

To disable or re-enable registration, open up the root `.env` file and set `ALLOW_REGISTRATION=true` or `ALLOW_REGISTRATION=false` depending on if you want registration open or closed.

### ⚠️***Warning***

If you previously implemented your own user system using the original scaffolding that was provided, you will no longer see conversations and presets by switching to the new user system. This is because of a design flaw in the scaffolding implementation that was problematic for the inclusion of social login.

### For user updating from an older version of the app:

When the first account is registered, the application will automatically migrate any conversations and presets that you created before the user system was implemented to that account. 
if you use login for the first time with a social login account (eg. Google, facebook, etc.), the conversations and presets that you created before the user system was implemented will NOT be migrated to that account.
