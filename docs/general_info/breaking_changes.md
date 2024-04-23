---
title: ⚠️ Breaking Changes
description: This doc lists the breaking changes that affect the functionality and compatibility of LibreChat. You should read this doc before updating to a new version of LibreChat, and follow the instructions to resolve any issues.
weight: -10
---
# ⚠️ Breaking Changes

!!! warning

    **If you experience any issues after updating, we recommend clearing your browser cache and cookies.**
    Certain changes in the updates may impact cookies, leading to unexpected behaviors if not cleared properly.

---

## v0.7.0+

!!! failure "Error Messages (UI)"
    ![image](https://github.com/danny-avila/LibreChat/assets/32828263/0ab27798-5515-49b4-ac29-e4ad83d73d7c)

    Client-facing error messages now display this warning asking to contact the admin. For the full error consult the console logs or the additional logs located in `./logs`

!!! warning "🪵Logs Location"

    - The full logs are now in `./logs` (they are still in `./api/logs` for local, non-docker installations)

!!! warning "🔍 Google Search Plugin"

    - **[Google Search Plugin](../features/plugins/google_search.md)**: Changed the environment variable for this plugin from `GOOGLE_API_KEY` to `GOOGLE_SEARCH_API_KEY` due to a conflict with the Google Generative AI library pulling this variable automatically. If you are using this plugin, please update your `.env` file accordingly.

!!! info "🗃️ RAG API (Chat with Files)"

    - **RAG API Update**: The default Docker compose files now include a Python API and Vector Database for RAG (Retrieval-Augmented Generation). Read more about this in the [RAG API page](../features/rag_api.md)

??? warning "⚙️ .env variables changes v0.6.10 → v0.7.0"
    - ➕ JSON Logging
    ```sh
    #===============#
    # JSON Logging  #
    #===============#

    # Use when process console logs in cloud deployment like GCP/AWS
    CONSOLE_JSON=false
    ```

    - ➕ LibreChat.yaml path
    ```sh
    #===============#
    # Configuration #
    #===============#
    # Use an absolute path, a relative path, or a URL

    # CONFIG_PATH="/alternative/path/to/librechat.yaml"
    ```
    
    - ❌ "chatGPTBrowser" was removed
    ```sh
    # ENDPOINTS=openAI,assistants,azureOpenAI,bingAI,google,gptPlugins,anthropic
    ```

    - ➕ Added placeholders for Known Endpoints
    ```sh
    #===================================#
    # Known Endpoints - librechat.yaml  #
    #===================================#
    # https://docs.librechat.ai/install/configuration/ai_endpoints.html

    # GROQ_API_KEY=
    # SHUTTLEAI_KEY=
    # OPENROUTER_KEY=
    # MISTRAL_API_KEY=
    # ANYSCALE_API_KEY=
    # FIREWORKS_API_KEY=
    # PERPLEXITY_API_KEY=
    # TOGETHERAI_API_KEY=
    ```
    
    - ✨ Update Anthropic models
    ```sh
    # ANTHROPIC_MODELS=claude-3-opus-20240229,claude-3-sonnet-20240229,claude-3-haiku-20240307,claude-2.1,claude-2,claude-1.2,claude-1,claude-1-100k,claude-instant-1,claude-instant-1-100k
    ```

    - ❌ Azure env config now deprecated
    ```sh
    #============#
    # Azure      #
    #============#


    # Note: these variables are DEPRECATED
    # Use the `librechat.yaml` configuration for `azureOpenAI` instead
    # You may also continue to use them if you opt out of using the `librechat.yaml` configuration

    # AZURE_OPENAI_DEFAULT_MODEL=gpt-3.5-turbo # Deprecated
    # AZURE_OPENAI_MODELS=gpt-3.5-turbo,gpt-4 # Deprecated
    # AZURE_USE_MODEL_AS_DEPLOYMENT_NAME=TRUE # Deprecated
    # AZURE_API_KEY= # Deprecated
    # AZURE_OPENAI_API_INSTANCE_NAME= # Deprecated
    # AZURE_OPENAI_API_DEPLOYMENT_NAME= # Deprecated
    # AZURE_OPENAI_API_VERSION= # Deprecated
    # AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME= # Deprecated
    # AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME= # Deprecated
    # PLUGINS_USE_AZURE="true" # Deprecated
    ## v0.6.10+ (-dev build)
    ```

    - ❌ Removed ChatGPT
    ```sh
    #============#
    # ChatGPT    #
    #============#

    CHATGPT_TOKEN=
    CHATGPT_MODELS=text-davinci-002-render-sha
    # CHATGPT_REVERSE_PROXY=
    ```

    - ✨ Assistants now set to "user_provided" by default
    ```sh
    ASSISTANTS_API_KEY=user_provided
    ```

    - ⚠️ `GOOGLE_API_KEY` renamed `GOOGLE_SEARCH_API_KEY=`
    ```sh
    GOOGLE_SEARCH_API_KEY=
    ```

    - ➕ Tavily and Traversaal API keys
    ```
    # Tavily
    #-----------------
    TAVILY_API_KEY=

    # Traversaal
    #-----------------
    TRAVERSAAL_API_KEY=
    ```
    - ➕ Moderation, illegal model request score
    ```sh
    ILLEGAL_MODEL_REQ_SCORE=5
    ```

    - ➕ OpenID Auth update
    ```sh
    OPENID_REQUIRED_ROLE=
    OPENID_REQUIRED_ROLE_TOKEN_KIND=
    OPENID_REQUIRED_ROLE_PARAMETER_PATH=
    ```


!!! info "🔎Meilisearch v1.7"

    - **Meilisearch Update**: Following the recent update to Meilisearch, an unused folder named `meili_data_v1.6` may be present in your root directory. This folder is no longer required and **can be safely deleted** to free up space.
    - **New Indexing Data Location**: With the current Meilisearch version `1.7.3`, the new indexing data location folder will be `meili_data_v1.7`.

!!! info "🔎Meilisearch v1.6"

    - **Meilisearch Update**: Following the recent update to Meilisearch, an unused folder named `meili_data_v1.5` may be present in your root directory. This folder is no longer required and **can be safely deleted** to free up space.
    - **New Indexing Data Location**: With the current Meilisearch version `1.6`, the new indexing data location folder will be `meili_data_v1.6`.

!!! failure "🥷🪦 Ninja"

    - Following to the shut down of "Ninja", the ChatGPTbrowser endpoint is no longer available in LibreChat.

!!! warning "🐋 `docker-compose.yml` Update"

    We have made changes to the `docker-compose.yml` file to enhance the default behavior. Starting now, the file uses the pre-built image by default. If you prefer to build the image yourself, you'll need to utilize the override file to specify your custom build configuration.

    Here's an example of the `docker-compose.override.yml`:

    ```yaml
    version: '3.4'

    services:
      api:
        image: librechat
        build:
          context: .
          target: node
    ```

    For more detailed information on using the `docker-compose.override.yaml`, please refer to our documentation: [docker_override](https://docs.librechat.ai/install/configuration/docker_override.html)

---

## v0.6.10 

!!! danger "Söhne Font Licensing Issue"

    During a recent license review, it was discovered that the Söhne fonts used in LibreChat require proper licensing for legal use. These fonts were added early in the project by a community contribution to mirror ChatGPT's aesthetic, but it was an oversight to allow them without proper knowledge.

    To address this issue, the Söhne fonts have been removed from the project and replaced with open-source alternatives, effective immediately in the latest version of the repository on GitHub. The relevant font foundry has been contacted to resolve the matter.

    All users and those who have forked LibreChat are required to update to the latest version to comply with font licensing laws. If you prefer to continue using the fonts, please follow the instructions provided [here](https://gist.github.com/danny-avila/e1d623e51b24cf0989865197bb788102).

    LibreChat remains committed to ensuring compliance, accessibility, and continuous improvement. The effort to match OpenAI's ChatGPT styling was well-intentioned but poorly executed, and moving forward, all aspects of the project will meet legal and permissive standards.

    We appreciate your understanding and cooperation in making these necessary adjustments. For updates or guidance on implementing these changes, please reach out.

    Thank you for your continued support of LibreChat.

---

## v0.6.9 

!!! info "⚙️ Environment Variables - v0.6.6 -> v0.6.9"

    see [⚙️ Environment Variables](../install/configuration/dotenv.md) for more info

!!! abstract "Endpoints"

    ```sh
    # ENDPOINTS=openAI,assistants,azureOpenAI,bingAI,chatGPTBrowser,google,gptPlugins,anthropic
    ```

!!! abstract "OpenAI models"

    ```sh
    # OPENAI_MODELS=gpt-3.5-turbo-0125,gpt-3.5-turbo-0301,gpt-3.5-turbo,gpt-4,gpt-4-0613,gpt-4-vision-preview,gpt-3.5-turbo-0613,gpt-3.5-turbo-16k-0613,gpt-4-0125-preview,gpt-4-turbo-preview,gpt-4-1106-preview,gpt-3.5-turbo-1106,gpt-3.5-turbo-instruct,gpt-3.5-turbo-instruct-0914,gpt-3.5-turbo-16k
    ```

!!! abstract "Assistants API"

    ```sh
    #====================#
    #   Assistants API   #
    #====================#

    ASSISTANTS_API_KEY=user_provided
    # ASSISTANTS_BASE_URL=
    # ASSISTANTS_MODELS=gpt-3.5-turbo-0125,gpt-3.5-turbo-16k-0613,gpt-3.5-turbo-16k,gpt-3.5-turbo,gpt-4,gpt-4-0314,gpt-4-32k-0314,gpt-4-0613,gpt-3.5-turbo-0613,gpt-3.5-turbo-1106,gpt-4-0125-preview,gpt-4-turbo-preview,gpt-4-1106-preview
    ```

!!! abstract "Plugin models"

    ```sh
    # PLUGIN_MODELS=gpt-4,gpt-4-turbo-preview,gpt-4-0125-preview,gpt-4-1106-preview,gpt-4-0613,gpt-3.5-turbo,gpt-3.5-turbo-0125,gpt-3.5-turbo-1106,gpt-3.5-turbo-0613
    ```

!!! abstract "Birthday Hat"

    ```sh
    # SHOW_BIRTHDAY_ICON=true
    ```

!!! abstract "DALL·E"

    ```sh
    # DALL·E
    #----------------
    # DALLE_API_KEY=
    # DALLE3_API_KEY=
    # DALLE2_API_KEY=
    # DALLE3_SYSTEM_PROMPT=
    # DALLE2_SYSTEM_PROMPT=
    # DALLE_REVERSE_PROXY=
    # DALLE3_BASEURL=
    # DALLE2_BASEURL=

    # DALL·E (via Azure OpenAI)
    # Note: requires some of the variables above to be set
    #----------------
    # DALLE3_AZURE_API_VERSION=
    # DALLE2_AZURE_API_VERSION=
    ```

!!! success "🥷 Ninja"

    - A new method to use the ChatGPT endpoint is now documented. It uses "Ninja"
    - For more info:
        - ~~[Ninja Deployment Guide](../general_info/breaking_changes.md)~~
        - [Ninja GitHub repo](https://github.com/gngpp/ninja/tree/main)

!!! failure "🪦 PandoraNext"

    - Since PandoraNext has shut down, the ChatGPTbrowser endpoint is no longer available in LibreChat.
    - For more info:
        - [https://github.com/danny-avila/LibreChat/discussions/1663](https://github.com/danny-avila/LibreChat/discussions/1663#discussioncomment-8314025)
        - [https://linux.do/t/topic/1051](https://linux.do/t/topic/1051)

---

## v0.6.6

!!! abstract "v0.6.6"

    - **DALL-E Update**: user-provided keys for DALL-E are now specific to each DALL-E version, i.e.: `DALLE3_API_KEY` and `DALLE2_API_KEY`
    - Note: `DALLE_API_KEY` will work for both DALL-E-3 and DALL-E-2 when the admin provides the credential; in other words, this may only affect your users if DALLE_API_KEY is not set in the `.env` file. In this case, they will simply have to "uninstall" the plugin, and provide their API key again.

---

## v0.6.x

!!! info "Meilisearch" 

    - **Meilisearch Update**: Following the recent update to Meilisearch, an unused folder named `meili_data` may be present in your root directory. This folder is no longer required and can be **safely deleted** to free up space.
    - **New Indexing Data Location**: The indexing data has been relocated. It will now be stored in a new folder named `meili_data_v1.x`, where `1.x` represents the version of Meilisearch. For instance, with the current Meilisearch version `1.5`, the folder will be `meili_data_v1.5`.

---

## v0.5.9

!!! warning "JWT Secret"

    - It's now required to set a **JWT_REFRESH_SECRET** in your .env file as of [#927](https://github.com/danny-avila/LibreChat/pull/927)
      - It's also recommended you update your `SESSION_EXPIRY` to a lower value and set `REFRESH_TOKEN_EXPIRY`

      - Default values: session expiry: 15 minutes, refresh token expiry: 7 days

      - *See **[.env.example](https://github.com/danny-avila/LibreChat/blob/1378eb5097b666a4add27923e47be73919957e5b/.env.example#L314)** for exact values in millisecond calculation*

---

## v0.5.8

!!! info "manifest JSON files"

    - It's now required to name manifest JSON files (for [ChatGPT Plugins](../features/plugins/chatgpt_plugins_openapi.md)) in the `api\app\clients\tools\.well-known` directory after their `name_for_model` property should you add one yourself.
        - This was a recommended convention before, but is now required.

---

## v0.5.7

!!! tip "Update LibreChat"

    Now, we have an easier and safer way to update LibreChat. You can simply run `npm run update` from the project directory for a clean update.
    If you want to skip the prompt you can use

    for a docker install:
    - `npm run update:docker`

    for a local install:
    - `npm run update:local`

---

## v0.5.5

!!! warning "Possible Error and Solution"

    Some users have reported an error after updating their docker containers.

    ![image](https://github.com/fuegovic/LibreChat/assets/32828263/1265d664-5a9c-47d2-b405-47bc0d029a8d)

    - To fix this error, you need to:
      - Delete the LibreChat image in docker 🗑️

        **(leave mongo intact to preserve your profiles and history)**
        ![image](https://github.com/fuegovic/LibreChat/assets/32828263/acf15682-435e-44bd-8873-a5dceb3121cc)
      - Repeat the docker update process: 🚀
        - `docker compose build`
        - `docker compose up -d`

---

## v0.5.4

!!! abstract ".env file"

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

---

## v0.5.3

!!! warning "Azure API Key variable"

    Changed **AZURE_OPENAI_API_KEY** to **AZURE_API_KEY**:

    I had to change the environment variable from AZURE_OPENAI_API_KEY to AZURE_API_KEY, because the former would be read by langchain and cause issues when a user has both Azure and OpenAI keys set. This is a [known issue in the langchain library](https://github.com/hwchase17/langchainjs/issues/1687)

---

## v0.5.0

!!! warning "Summary"
    **Note: These changes only apply to users who are updating from a previous version of the app.**

    - In this version, we have simplified the configuration process, improved the security of your credentials, and updated the docker instructions. 🚀
    - Please read the following sections carefully to learn how to upgrade your app and avoid any issues. 🙏
    - **Note:** If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.librechat.ai) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/new?category=troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.


!!! info "Configuration"

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


!!! info "docker"

    - The docker-compose file had some change. Review the [new docker instructions](../install/installation/docker_compose_install.md) to make sure you are setup properly. This is still the simplest and most effective method.

!!! info "Local Install"

    - If you had installed a previous version, you can run `npm run upgrade` to automatically copy the content of both files to the new `.env` file and backup the old ones in the root dir.
    - If you are installing the project for the first time, it's recommend you run the installation script `npm run ci` to guide your local setup (otherwise continue to use docker)
    - The upgrade script requires both `/api/.env` and `/client/.env` files to run properly. If you get an error about a missing client env file, just rename the `/client/.env.example` file to `/client/.env` and run the script again.
    - After running the upgrade script, the `OPENAI_API_KEY` variable might be placed in a different section in the new `.env` file than before. This does not affect the functionality of the app, but if you want to keep it organized, you can look for it near the bottom of the file and move it to its usual section.



We apologize for any inconvenience caused by these changes. We hope you enjoy the new and improved version of our app!
