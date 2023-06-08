# User/Auth System

**First Time Setup**

In order for the auth system to function properly, there are some environment variables that are needed. Note that this information is also included in the [/.env.example](https://github.com/danny-avila/chatgpt-clone/blob/main/.env.example) file.

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

The first time you run the application, you should register a new account by clicking the "Sign up" link on the login page. The first account registered will receive an admin role. The admin account does not currently have extended functionality, but is valuable should you choose to create an admin dashboard for user management. 

**Migrating Previous Conversations and Presets to new User Account**

When the first account is registered, the application will automatically migrate any conversations and presets that you created before the user system was implemented to that account. 

⚠️**IMPORTANT**: if you use login for the first time with a social login account (eg. Google, facebook, etc.), the conversations and presets that you created before the user system was implemented will NOT be migrated to that account. You should register and login with a local account (email and password) for the first time. 

**OAuth2/Social Login**

The application is setup to support OAuth2/Social Login with Google. All of the code is in place for Facebook login as well, but this has not been tested because the setup process with Facebook was honestly just too painful for me to deal with. I plan to add support for other OAuth2 providers including Github and Discord at a later time.

To enable Google login, you must create an application in the [Google Cloud Console](https://cloud.google.com) and provide the client ID and client secret in the [/.env](https://github.com/danny-avila/chatgpt-clone/blob/main/.env.example) file, then set `VITE_SHOW_GOOGLE_LOGIN_OPTION=true`. 

*Instructions for setting up Google login are provided below.*
```
1. Go to "APIs and Services" in your Google Cloud account and click on "Credentials".
2. Click on "Configure consent screen" and select "External" as the user type.
3. Add "profile", "email" and "openid" as the scopes for your app. These are the first three checkboxes when you click on "Add or remove scopes".
4. Click on "Save and continue" and then "Back to dashboard".
5. Click on "Create Credentials" and then "OAuth client ID".
6. Select "Web application" as the application type and give it a name.
7. Add "http://localhost" "http://localhost:3080" and "http://localhost:3090" to the authorized JavaScript origins.
8. Add "http://localhost:3080/oauth/google/callback" to the authorized redirect URIs.
9. Click on "Create" and copy your client ID and client secret.
10. Paste them into your /.env file.
11. Enable the feature in the /.env file
```

**Email and Password Reset** 

Most of the code is in place for sending password reset emails, but is not yet feature-complete as I have not setup an email server to test it. Currently, submitting a password reset request will then display a link with the one-time reset token that can then be used to reset the password. Understanding that this is a considerable security hazard, email integration will be included in the next release.

**Disable User Registration**

To disable or re-enable registration, open up the root `.env` file and set `ALLOW_REGISTRATION=true` or `ALLOW_REGISTRATION=false` depending on if you want registration open or closed.

***Warning***

If you previously implemented your own user system using the original scaffolding that was provided, you will no longer see conversations and presets by switching to the new user system. This is because of a design flaw in the scaffolding implementation that was problematic for the inclusion of social login.

##

## [Go Back to ReadMe](../../README.md)
