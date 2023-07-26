# ⚠️ **Breaking Changes** ⚠️

## v0.5.5
Some users have reported an error after updating their docker containers.

![image](https://github.com/fuegovic/LibreChat/assets/32828263/1265d664-5a9c-47d2-b405-47bc0d029a8d)

- To fix this error, you need to:
  - Delete the LibreChat image in docker 🗑️
    
    **(leave mongo intact to preserve your profiles and history)** 
    ![image](https://github.com/fuegovic/LibreChat/assets/32828263/acf15682-435e-44bd-8873-a5dceb3121cc)
  - Repeat the docker update process: 🚀
    - `docker-compose build`
    - `docker-compose up -d`

## v0.5.4
Some changes were made in the .env file  
**Look at the .env.example for reference.**

- If you previously used social login, you need to:
  - Add this to your .env file: 👇

```env
##########################
# User System:
##########################

# Allow Public Registration
ALLOW_REGISTRATION=true

# Allow Social Registration
ALLOW_SOCIAL_LOGIN=false
```

  - Set ALLOW_SOCIAL_LOGIN to true if you want to enable social login 🔥

- If you want to enable the Anthropic Endpoint (Claude), you need to:
  - Add this part in your .env file: 👇

```env
##########################
# Anthropic Endpoint: 
##########################
# Access key from https://console.anthropic.com/
# Leave it blank to disable this feature.
# Set to "user_provided" to allow the user to provide their API key from the UI.
# Note that access to claude-1 may potentially become unavailable with the release of claude-2.
ANTHROPIC_API_KEY="user_provided"
ANTHROPIC_MODELS=claude-1,claude-instant-1,claude-2
```

  - Choose from ANTHROPIC_MODELS which models you want to enable 🤖

## v0.5.3

Changed **AZURE_OPENAI_API_KEY** to **AZURE_API_KEY**:

I had to change the environment variable from AZURE_OPENAI_API_KEY to AZURE_API_KEY, because the former would be read by langchain and cause issues when a user has both Azure and OpenAI keys set. This is a [known issue in the langchain library](https://github.com/hwchase17/langchainjs/issues/1687)

## v0.5.0

**Note: These changes only apply to users who are updating from a previous version of the app.**

### Summary
- In this version, we have simplified the configuration process, improved the security of your credentials, and updated the docker instructions. 🚀
- Please read the following sections carefully to learn how to upgrade your app and avoid any issues. 🙏
- **Note:** If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/new?category=troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.

---

### Configuration
- We have simplified the configuration process by using a single `.env` file in the root folder instead of separate `/api/.env` and `/client/.env` files.
- We have renamed the `OPENAI_KEY` variable to `OPENAI_API_KEY` to match the official documentation. The upgrade script should do this automatically for you, but please double-check that your key is correct in the new `.env` file.
- We have removed the `VITE_SHOW_GOOGLE_LOGIN_OPTION` variable, since it is no longer needed. The app will automatically enable Google Login if you provide the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` variables. 🔑
- We have changed the variable name for setting the app title from `VITE_APP_TITLE` to `APP_TITLE`. If you had set a custom app title before, you need to update the variable name in the `.env` file to keep it. Otherwise, the app might revert to the default title.
- For enhanced security, we are now asking for crypto keys for securely storing credentials in the `.env` file. Crypto keys are used to encrypt and decrypt sensitive data such as passwords and access keys. If you don't set them, the app will crash on startup. 🔒
- You need to fill the following variables in the `.env` file with 32-byte (64 characters in hex) or 16-byte (32 characters in hex) values:
  - `CREDS_KEY` (32-byte)
  - `CREDS_IV` (16-byte)
  - `JWT_SECRET` (32-byte) optional but recommended
- The upgrade script will do it for you, otherwise you can use this replit to generate some crypto keys quickly: https://replit.com/@daavila/crypto#index.js
- Make sure you keep your crypto keys safe and don't share them with anyone. 🙊

---

### Docker
- The docker-compose file had some change. Review the [new docker instructions](../install/docker_install.md) to make sure you are setup properly. This is still the simplest and most effective method.

---

### Local Install
- If you had installed a previous version, you can run `npm run upgrade` to automatically copy the content of both files to the new `.env` file and backup the old ones in the root dir.
- If you are installing the project for the first time, it's recommend you run the installation script `npm run ci` to guide your local setup (otherwise continue to use docker)
- The upgrade script requires both `/api/.env` and `/client/.env` files to run properly. If you get an error about a missing client env file, just rename the `/client/.env.example` file to `/client/.env` and run the script again.
- After running the upgrade script, the `OPENAI_API_KEY` variable might be placed in a different section in the new `.env` file than before. This does not affect the functionality of the app, but if you want to keep it organized, you can look for it near the bottom of the file and move it to its usual section.

---

We apologize for any inconvenience caused by these changes. We hope you enjoy the new and improved version of our app!
