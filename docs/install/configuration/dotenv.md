---
title: ⚙️ Environment Variables
description: Comprehensive guide for configuring your application's environment with the `.env` file. This document is your one-stop resource for understanding and customizing the environment variables that will shape your application's behavior in different contexts.
weight: -12
---

# .env File Configuration
Welcome to the comprehensive guide for configuring your application's environment with the `.env` file. This document is your one-stop resource for understanding and customizing the environment variables that will shape your application's behavior in different contexts.

While the default settings provide a solid foundation for a standard `docker` installation, delving into this guide will unveil the full potential of LibreChat. This guide empowers you to tailor LibreChat to your precise needs. Discover how to adjust language model availability, integrate social logins, manage the automatic moderation system, and much more. It's all about giving you the control to fine-tune LibreChat for an optimal user experience.

> **Reminder: Please restart LibreChat for the configuration changes to take effect**

Alternatively, you can create a new file named `docker-compose.override.yml` in the same directory as your main `docker-compose.yml` file for LibreChat, where you can set your .env variables as needed under `environment`, or modify the default configuration provided by the main `docker-compose.yml`, without the need to directly edit or duplicate the whole file.

For more info see: 

- Our quick guide: 
    - **[Docker Override](./docker_override.md)**

- The official docker documentation: 
    - **[docker docs - understanding-multiple-compose-files](https://docs.docker.com/compose/multiple-compose-files/extends/#understanding-multiple-compose-files)**
    - **[docker docs - merge-compose-files](https://docs.docker.com/compose/multiple-compose-files/merge/#merge-compose-files)**
    - **[docker docs - specifying-multiple-compose-files](https://docs.docker.com/compose/reference/#specifying-multiple-compose-files)**

- You can also view an example of an override file for LibreChat in your LibreChat folder and on GitHub: 
    - **[docker-compose.override.example](https://github.com/danny-avila/LibreChat/blob/main/docker-compose.override.yml.example)**

---

## Server Configuration

### Port

- The server will listen to localhost:3080 by default. You can change the target IP as you want. If you want to make this server available externally, for example to share the server with others or expose this from a Docker container, set host to 0.0.0.0 or your external IP interface. 

> Tips: Setting host to 0.0.0.0 means listening on all interfaces. It's not a real IP.

- Use localhost:port rather than 0.0.0.0:port to access the server.

```bash
HOST=localhost
PORT=3080
```

### MongoDB Database

- Change this to your MongoDB URI if different. You should also add `LibreChat` or your own `APP_TITLE` as the database name in the URI. For example:
  - if you are using docker, the URI format is `mongodb://<ip>:<port>/<database>`. Your `MONGO_URI` should look like this: `mongodb://127.0.0.1:27018/LibreChat`
  - if you are using an online db, the URI format is `mongodb+srv://<username>:<password>@<host>/<database>?<options>`. Your `MONGO_URI` should look like this: `mongodb+srv://username:password@host.mongodb.net/LibreChat?retryWrites=true` (`retryWrites=true` is the only option you need when using the online db)
- Instruction on how to create an online MongoDB database (useful for use without docker):
    - [Online MongoDB](./mongodb.md)
- Securely access your docker MongoDB database:
    - [Manage your database](../../features/manage_your_database.md)

```bash
MONGO_URI=mongodb://127.0.0.1:27018/LibreChat
```

### Application Domains

- To use LibreChat locally, set `DOMAIN_CLIENT` and `DOMAIN_SERVER` to `http://localhost:3080` (3080 being the port previously configured)
- When deploying LibreChat to a custom domain, set `DOMAIN_CLIENT` and `DOMAIN_SERVER` to your deployed URL, e.g. `https://librechat.example.com` 

```bash
DOMAIN_CLIENT=http://localhost:3080
DOMAIN_SERVER=http://localhost:3080
```

### Prevent Public Search Engines Indexing
By default, your website will not be indexed by public search engines (e.g. Google, Bing, …). This means that people will not be able to find your website through these search engines. If you want to make your website more visible and searchable, you can change the following setting to `false`

```bash
NO_INDEX=true
```

> ❗**Note:** This method is not guaranteed to work for all search engines, and some search engines may still index your website or web page for other purposes, such as caching or archiving. Therefore, you should not rely solely on this method to protect sensitive or confidential information on your website or web page.

### JSON Logging

When handling console logs in cloud deployments (such as GCP or AWS), enabling this will duump the logs with a UTC timestamp and format them as JSON. See: [feat: Add CONSOLE_JSON](https://github.com/danny-avila/LibreChat/pull/2146)

```
CONSOLE_JSON=false
```

### Logging

LibreChat has built-in central logging, see [Logging System](../../features/logging_system.md) for more info.

- Debug logging is enabled by default and crucial for development.
- To report issues, reproduce the error and submit logs from `./api/logs/debug-%DATE%.log` at: **[LibreChat GitHub Issues](https://github.com/danny-avila/LibreChat/issues)**
- Error logs are stored in the same location.
- Keep debug logs active by default or disable them by setting `DEBUG_LOGGING=false` in the environment variable.
- For more information about this feature, read our docs: **[Logging System](../../features/logging_system.md)**

- Enable verbose file logs with `DEBUG_LOGGING=TRUE`.
- Note: can be used with either `DEBUG_CONSOLE` or `CONSOLE_JSON` but not both.

```bash
DEBUG_LOGGING=true
```

- Enable verbose console/stdout logs with `DEBUG_CONSOLE=TRUE` in the same format as file debug logs.
- Note: can be used in conjunction with `DEBUG_LOGGING` but not `CONSOLE_JSON`.

```bash
DEBUG_CONSOLE=false
```

- Enable verbose JSON console/stdout logs suitable for cloud deployments like GCP/AWS
- Note: can be used in conjunction with `DEBUG_LOGGING` but not `DEBUG_CONSOLE`.

```bash
CONSOLE_JSON=false
```

This is not recommend, however, as the outputs can be quite verbose, and so it's disabled by default.

### Permission
> UID and GID are numbers assigned by Linux to each user and group on the system. If you have permission problems, set here the UID and GID of the user running the docker compose command. The applications in the container will run with these uid/gid.

```bash
UID=1000
GID=1000
```

### Configuration Path - `librechat.yaml`
Specify an alternative location for the LibreChat configuration file. 
You may specify an **absolute path**, a **relative path**, or a **URL**. The filename in the path is flexible and does not have to be `librechat.yaml`; any valid configuration file will work.

> **Note**: If you prefer LibreChat to search for the configuration file in the root directory (which is the default behavior), simply leave this option commented out.

```sh
# To set an alternative configuration path or URL, uncomment the line below and replace it with your desired path or URL.
# CONFIG_PATH="/your/alternative/path/to/config.yaml"
```

## Endpoints
In this section you can configure the endpoints and models selection, their API keys, and the proxy and reverse proxy settings for the endpoints that support it. 

### General Config
- Uncomment `ENDPOINTS` to customize the available endpoints in LibreChat
- `PROXY` is to be used by all endpoints (leave blank by default)

```bash
ENDPOINTS=openAI,assistants,azureOpenAI,bingAI,chatGPTBrowser,google,gptPlugins,anthropic
PROXY=
```

- Titling is enabled by default for all Endpoints when initiating a conversation (proceeding the first AI response).
    - Set to `false` to disable this feature.
    - Not all endpoints support titling.
    - You can configure this feature on an Endpoint-level using [the `librechat.yaml` config file](./custom_config.md)

```bash
TITLE_CONVO=true
```

### Known Endpoints - librechat.yaml
- see: [AI Endpoints](./ai_endpoints.md)
- see also: [Custom Configuration](./custom_config.md)

```sh
GROQ_API_KEY=
SHUTTLEAI_KEY=
OPENROUTER_KEY=
MISTRAL_API_KEY=
ANYSCALE_API_KEY=
FIREWORKS_API_KEY=
PERPLEXITY_API_KEY=
TOGETHERAI_API_KEY=
```

### Anthropic
see: [Anthropic Endpoint](./ai_setup.md#anthropic)
- You can request an access key from https://console.anthropic.com/
- Leave `ANTHROPIC_API_KEY=` blank to disable this endpoint
- Set `ANTHROPIC_API_KEY=` to "user_provided" to allow users to provide their own API key from the WebUI
- If you have access to a reverse proxy for `Anthropic`, you can set it with `ANTHROPIC_REVERSE_PROXY=`
    - leave blank or comment it out to use default base url

```bash
ANTHROPIC_API_KEY=user_provided
ANTHROPIC_MODELS=claude-3-opus-20240229,claude-3-sonnet-20240229,claude-2.1,claude-2,claude-1.2,claude-1,claude-1-100k,claude-instant-1,claude-instant-1-100k
ANTHROPIC_REVERSE_PROXY=
```

- Titling is enabled by default but is configured with the environment variable 
`TITLE_CONVO` for all Endpoints. The default model used for Anthropic titling is "claude-3-haiku-20240307". You can change it by uncommenting the following and setting the desired model. **(Optional)** 

> **Note:** Must be compatible with the Anthropic Endpoint. Also, Claude 2 and Claude 3 models perform best at this task, with `claude-3-haiku` models being the cheapest.

```bash
ANTHROPIC_TITLE_MODEL=claude-3-haiku-20240307
```

### Azure
**Important:** See [the complete Azure OpenAI setup guide](./ai_setup.md#azure-openai) for thorough instructions on enabling Azure OpenAI

- To use Azure with this project, set the following variables. These will be used to build the API URL.

```bash
AZURE_API_KEY=
AZURE_OPENAI_API_INSTANCE_NAME=
AZURE_OPENAI_API_DEPLOYMENT_NAME=
AZURE_OPENAI_API_VERSION=
AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME=
AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME=
```
> Note: As of 2023-11-10, the Azure API only allows one model per deployment,

- Chat completion: `https://{AZURE_OPENAI_API_INSTANCE_NAME}.openai.azure.com/openai/deployments/{AZURE_OPENAI_API_DEPLOYMENT_NAME}/chat/completions?api-version={AZURE_OPENAI_API_VERSION}`
- You should also consider changing the `OPENAI_MODELS` variable to the models available in your instance/deployment.

> Note: `AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME` and `AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME` are optional but might be used in the future

- It's recommended to name your deployments after the model name, e.g. `gpt-35-turbo,` which allows for fast deployment switching and `AZURE_USE_MODEL_AS_DEPLOYMENT_NAME` **enabled**. However, you can use non-model deployment names and setting the `AZURE_OPENAI_DEFAULT_MODEL` to ensure it works as expected.

- Identify the available models, separated by commas *without spaces*. The first will be default. Leave it blank or as is to use internal settings.

- **The base URL for Azure OpenAI API requests can be dynamically configured.**

```bash
# .env file
AZURE_OPENAI_BASEURL=https://${INSTANCE_NAME}.openai.azure.com/openai/deployments/${DEPLOYMENT_NAME}

# Cloudflare example
AZURE_OPENAI_BASEURL=https://gateway.ai.cloudflare.com/v1/ACCOUNT_TAG/GATEWAY/azure-openai/${INSTANCE_NAME}/${DEPLOYMENT_NAME}
```
- Sets the base URL for Azure OpenAI API requests.
- Can include `${INSTANCE_NAME}` and `${DEPLOYMENT_NAME}` placeholders or specific credentials.
- Example: "https://gateway.ai.cloudflare.com/v1/ACCOUNT_TAG/GATEWAY/azure-openai/${INSTANCE_NAME}/${DEPLOYMENT_NAME}"
- [More info about `AZURE_OPENAI_BASEURL` here](./ai_setup.md#using-a-specified-base-url-with-azure)

> Note: as deployment names can't have periods, they will be removed when the endpoint is generated.

```bash
AZURE_OPENAI_MODELS=gpt-3.5-turbo,gpt-4
```

- This enables the use of the model name as the deployment name, e.g. "gpt-3.5-turbo" as the deployment name **(Advanced)**

```bash
AZURE_USE_MODEL_AS_DEPLOYMENT_NAME=TRUE
```

- To use Azure with the Plugins endpoint, you need the variables above, and uncomment the following variable:

> Note: This may not work as expected and Azure OpenAI may not support OpenAI Functions yet
> Omit/leave it commented to use the default OpenAI API

```bash 
PLUGINS_USE_AZURE="true"
```
** Generate images with Azure OpenAI Service**

- For DALL-E-3:

```bash
DALLE3_AZURE_API_VERSION=the-api-version # e.g.: 2023-12-01-preview
DALLE3_BASEURL=https://<AZURE_OPENAI_API_INSTANCE_NAME>.openai.azure.com/openai/deployments/<DALLE3_DEPLOYMENT_NAME>/
DALLE3_API_KEY=your-azure-api-key-for-dall-e-3
```

- For DALL-E-2:

```bash
DALLE2_AZURE_API_VERSION=the-api-version # e.g.: 2023-12-01-preview
DALLE2_BASEURL=https://<AZURE_OPENAI_API_INSTANCE_NAME>.openai.azure.com/openai/deployments/<DALLE2_DEPLOYMENT_NAME>/
DALLE2_API_KEY=your-azure-api-key-for-dall-e-2
```

### BingAI
Bing, also used for Sydney, jailbreak, and Bing Image Creator, see: [Bing Access token](./ai_setup.md#bingai) and [Bing Jailbreak](../../features/bing_jailbreak.md)

- Follow these instructions to get your bing access token (it's best to use the full cookie string for that purpose): **[Bing Access Token](./ai_setup.md#bingai)**  
- Leave `BINGAI_TOKEN=` blank to disable this endpoint
- Set `BINGAI_TOKEN=` to "user_provided" to allow users to provide their own API key from the WebUI

> Note: It is recommended to leave it as "user_provided" and provide the token from the WebUI.

- `BINGAI_HOST` can be necessary for some people in different countries, e.g. China (`https://cn.bing.com`). Leave it blank or commented out to use default server.

```bash
BINGAI_TOKEN=user_provided
BINGAI_HOST=
```

### Google
Follow these instructions to setup the [Google Endpoint](./ai_setup.md#google)

```bash
GOOGLE_KEY=user_provided
GOOGLE_REVERSE_PROXY=
```

- Customize the available models, separated by commas, **without spaces**.
    - The first will be default.
    - Leave it blank or commented out to use internal settings (default: all listed below).

```bash
# all available models as of 12/16/23
GOOGLE_MODELS=gemini-pro,gemini-pro-vision,chat-bison,chat-bison-32k,codechat-bison,codechat-bison-32k,text-bison,text-bison-32k,text-unicorn,code-gecko,code-bison,code-bison-32k
```

### OpenAI

- To get your OpenAI API key, you need to:
    - Go to https://platform.openai.com/account/api-keys
    - Create an account or log in with your existing one
    - Add a payment method to your account (this is not free, sorry 😬)
    - Copy your secret key (sk-...) to `OPENAI_API_KEY`

- Leave `OPENAI_API_KEY=` blank to disable this endpoint
- Set `OPENAI_API_KEY=` to "user_provided" to allow users to provide their own API key from the WebUI

```bash
OPENAI_API_KEY=user_provided
```

- You can specify which organization to use for each API request to OpenAI. However, it is not required if you are only part of a single organization or intend to use your default organization. You can check your [default organization here](https://platform.openai.com/account/api-keys). This can also help you limit your LibreChat instance from allowing API keys outside of your organization to be used, as a mismatch between key and organization will throw an API error.

```bash
# Optional
OPENAI_ORGANIZATION=org-Y6rfake63IhVorgqfPQmGmgtId
```

- Set to true to enable debug mode for the OpenAI endpoint

```bash
DEBUG_OPENAI=false
```

- Customize the available models, separated by commas, **without spaces**.
    - The first will be default.
    - Leave it blank or commented out to use internal settings.

```bash
OPENAI_MODELS=gpt-3.5-turbo-0125,gpt-3.5-turbo-0301,gpt-3.5-turbo,gpt-4,gpt-4-0613,gpt-4-vision-preview,gpt-3.5-turbo-0613,gpt-3.5-turbo-16k-0613,gpt-4-0125-preview,gpt-4-turbo-preview,gpt-4-1106-preview,gpt-3.5-turbo-1106,gpt-3.5-turbo-instruct,gpt-3.5-turbo-instruct-0914,gpt-3.5-turbo-16k
```

- Titling is enabled by default but is configured with the environment variable 
`TITLE_CONVO` for all Endpoints. The default model used for OpenAI titling is gpt-3.5-turbo. You can change it by uncommenting the following and setting the desired model. **(Optional)** 

> **Note:** Must be compatible with the OpenAI Endpoint.

```bash
OPENAI_TITLE_MODEL=gpt-3.5-turbo
```

- Enable message summarization by uncommenting the following **(Optional/Experimental)** 

> **Note:** this may affect response time when a summary is being generated.

```bash
OPENAI_SUMMARIZE=true
```

> **Experimental**: We are using the ConversationSummaryBufferMemory method to summarize messages. To learn more about this, see this article: [https://www.pinecone.io/learn/series/langchain/langchain-conversational-memory/](https://www.pinecone.io/learn/series/langchain/langchain-conversational-memory/)

- Reverse proxy settings for OpenAI:
    - see: [LiteLLM](./litellm.md) 
    - see also: [Free AI APIs](./free_ai_apis.md#nagaai)

**Important**: As of v0.6.6, it's recommend you use the `librechat.yaml` [Configuration file (guide here)](./custom_config.md) to add Reverse Proxies as separate endpoints.

```bash
OPENAI_REVERSE_PROXY=
```

- Sometimes when using Local LLM APIs, you may need to force the API to be called with a `prompt` payload instead of a `messages` payload; to mimic the `/v1/completions` request instead of `/v1/chat/completions`. This may be the case for LocalAI with some models. To do so, uncomment the following **(Advanced)** 

```bash
OPENAI_FORCE_PROMPT=true
```

### Assistants

- The [Assistants API by OpenAI](https://platform.openai.com/docs/assistants/overview) has a dedicated endpoint.
- To get your OpenAI API key, you need to:
    - Go to [https://platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)
    - Create an account or log in with your existing one
    - Add a payment method to your account (this is not free, sorry 😬)
    - Copy your secret key (sk-...) to `ASSISTANTS_API_KEY`

- Leave `ASSISTANTS_API_KEY=` blank to disable this endpoint
- Set `ASSISTANTS_API_KEY=` to `user_provided` to allow users to provide their own API key from the WebUI

```bash
ASSISTANTS_API_KEY=user_provided
```

- Customize the available models, separated by commas, **without spaces**.
    - The first will be default.
    - Leave it blank or commented out to use internal settings:
        - The models list will be fetched from OpenAI but only Assistants-API-compatible models will be shown; at the time of writing, they are as shown in the example below.

```bash
ASSISTANTS_MODELS=gpt-3.5-turbo-0125,gpt-3.5-turbo-16k-0613,gpt-3.5-turbo-16k,gpt-3.5-turbo,gpt-4,gpt-4-0314,gpt-4-32k-0314,gpt-4-0613,gpt-3.5-turbo-0613,gpt-3.5-turbo-1106,gpt-4-0125-preview,gpt-4-turbo-preview,gpt-4-1106-preview
```

- If necessary, you can also set an alternate base URL instead of the official one with `ASSISTANTS_BASE_URL`, which is similar to the OpenAI counterpart `OPENAI_REVERSE_PROXY`

```bash
ASSISTANTS_BASE_URL=http://your-alt-baseURL:3080/
```

- If you have previously set the [`ENDPOINTS` value in your .env file](#endpoints), you will need to add the value `assistants`

- There is additional, optional configuration, depending on your needs, such as disabling the assistant builder UI, and determining which assistants can be used, that are available via the [`librechat.yaml` custom config file](./custom_config.md#assistants-endpoint-object-structure).

### OpenRouter
See [OpenRouter](./free_ai_apis.md#openrouter-preferred) for more info.

- OpenRouter is a legitimate proxy service to a multitude of LLMs, both closed and open source, including: OpenAI models, Anthropic models, Meta's Llama models, pygmalionai/mythalion-13b and many more open source models. Newer integrations are usually discounted, too!

> Note: this overrides the OpenAI and Plugins Endpoints.

```bash
OPENROUTER_API_KEY=
```

### Plugins
Here are some useful documentation about plugins:

- [Introduction](../../features/plugins/introduction.md)
- [Make Your Own](../../features/plugins/make_your_own.md)
- [Using official ChatGPT Plugins](../../features/plugins/chatgpt_plugins_openapi.md)

#### General Configuration:
- Identify the available models, separated by commas **without spaces**. The first model in the list will be set as default. Leave it blank or commented out to use internal settings.

```bash
PLUGIN_MODELS=gpt-4,gpt-4-turbo-preview,gpt-4-0125-preview,gpt-4-1106-preview,gpt-4-0613,gpt-3.5-turbo,gpt-3.5-turbo-0125,gpt-3.5-turbo-1106,gpt-3.5-turbo-0613
```

- Set to false or comment out to disable debug mode for plugins

```bash
DEBUG_PLUGINS=true
```

- For securely storing credentials, you need a fixed key and IV. You can set them here for prod and dev environments.
    - You need a 32-byte key (64 characters in hex) and 16-byte IV (32 characters in hex) You can use this replit to generate some quickly: **[Key Generator](https://replit.com/@daavila/crypto#index.js)**

> Warning: If you don't set them, the app will crash on startup.

```bash
CREDS_KEY=f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0
CREDS_IV=e2341419ec3dd3d19b13a1a87fafcbfb
```

#### Azure AI Search
This plugin supports searching Azure AI Search for answers to your questions. See: [Azure AI Search](../../features/plugins/azure_ai_search.md)

```bash
AZURE_AI_SEARCH_SERVICE_ENDPOINT=
AZURE_AI_SEARCH_INDEX_NAME=
AZURE_AI_SEARCH_API_KEY=

AZURE_AI_SEARCH_API_VERSION=
AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE=
AZURE_AI_SEARCH_SEARCH_OPTION_TOP=
AZURE_AI_SEARCH_SEARCH_OPTION_SELECT=
```

#### DALL-E:

**Note:** Make sure the `gptPlugins` endpoint is set in the [`ENDPOINTS`](#endpoints) environment variable if it was configured before.

**API Keys:**
- `DALLE_API_KEY`: This environment variable is intended for storing the OpenAI API key that grants access to both DALL-E 2 and DALL-E 3 services. Typically, this key should be kept private. If you are distributing a plugin or software that integrates with DALL-E, you may choose to leave this commented out, requiring the end user to input their own API key. If you have a shared API key you want to distribute with your software (not recommended for security reasons), you can uncomment this and provide the key.

```bash
DALLE_API_KEY=
```

- `DALLE3_API_KEY` and `DALLE2_API_KEY`: These are similar to the above but are specific to each version of DALL-E. They allow for separate keys for DALL-E 2 and DALL-E 3, providing flexibility if you have different access credentials or subscription levels for each service.

```bash
DALLE3_API_KEY=
DALLE2_API_KEY=
```

**System Prompts:**
- `DALLE3_SYSTEM_PROMPT` and `DALLE2_SYSTEM_PROMPT`: These variables allow users to set system prompts that can preconfigure or guide the image generation process for DALL-E 3 and DALL-E 2, respectively. Use these to set default prompts or special instructions that affect how the AI interprets the user's input prompts.

```bash
DALLE3_SYSTEM_PROMPT="Your DALL-E-3 System Prompt here"
DALLE2_SYSTEM_PROMPT="Your DALL-E-2 System Prompt here"
```

**Reverse Proxy Settings:**
- `DALLE_REVERSE_PROXY`: This setting enables the specification of a reverse proxy for DALL-E API requests. This can be useful for routing traffic through a specific server, potentially for purposes like caching, logging, or adding additional layers of security. Ensure that the URL follows the required pattern and is appropriately configured to handle DALL-E requests.

```bash
DALLE_REVERSE_PROXY=
```

**Base URLs:**
- `DALLE3_BASEURL` and `DALLE2_BASEURL`: These variables define the base URLs for DALL-E 3 and DALL-E 2 API endpoints, respectively. These might need to be set if you are using a custom proxy or a specific regional endpoint provided by OpenAI.

```bash
DALLE3_BASEURL=
DALLE2_BASEURL=
```

**Azure OpenAI Integration (Optional):**
- `DALLE3_AZURE_API_VERSION` and `DALLE2_AZURE_API_VERSION`: If you are using Azure's OpenAI service to access DALL-E, these environment variables specify the API version for DALL-E 3 and DALL-E 2, respectively. Azure may have specific API version strings that need to be set to ensure compatibility with their services.

```bash
DALLE3_AZURE_API_VERSION=
DALLE2_AZURE_API_VERSION=
```

---

Remember to replace placeholder text such as "Your DALL-E-3 System Prompt here" with actual prompts or instructions and provide your actual API keys if you choose to include them directly in the file (though managing sensitive keys outside of the codebase is a best practice). Always review and respect OpenAI's usage policies when embedding API keys in software.
> Note: if you have PROXY set, it will be used for DALL-E calls also, which is universal for the app

#### Google Search
See detailed instructions here: [Google Search](../../features/plugins/google_search.md)

```bash
GOOGLE_SEARCH_API_KEY=
GOOGLE_CSE_ID=
```

#### SerpAPI
SerpApi is a real-time API to access Google search results (not as performant)

```bash
SERPAPI_API_KEY=
```

#### Stable Diffusion (Automatic1111)
See detailed instructions here: **[Stable Diffusion](../../features/plugins/stable_diffusion.md)**

- Use `http://127.0.0.1:7860` with local install and `http://host.docker.internal:7860` for docker

```bash
SD_WEBUI_URL=http://host.docker.internal:7860
```

### Tavily
Get your API key here: [https://tavily.com/#api](https://tavily.com/#api)

```bash
TAVILY_API_KEY=
```

### Traversaal
LLM-enhanced search tool.
Get API key here: https://api.traversaal.ai/dashboard

```bash
TRAVERSAAL_API_KEY=
```

#### WolframAlpha
See detailed instructions here: **[Wolfram Alpha](../../features/plugins/wolfram.md)**

```bash
WOLFRAM_APP_ID=
```

#### Zapier
- You need a Zapier account. Get your API key from here: **[Zapier](https://nla.zapier.com/credentials/)**
- Create allowed actions - Follow step 3 in this getting start guide from Zapier

> Note: zapier is known to be finicky with certain actions. Writing email drafts is probably the best use of it.

```bash
ZAPIER_NLA_API_KEY=
```

## Search (Meilisearch)

Enables search in messages and conversations:

```bash
SEARCH=true
```

> Note: If you're not using docker, it requires the installation of the free self-hosted Meilisearch or a paid remote plan

To disable anonymized telemetry analytics for MeiliSearch for absolute privacy, set to true:

```bash
MEILI_NO_ANALYTICS=true
```

For the API server to connect to the search server. Replace '0.0.0.0' with 'meilisearch' if serving MeiliSearch with docker-compose.

```bash
MEILI_HOST=http://0.0.0.0:7700
```

This master key must be at least 16 bytes, composed of valid UTF-8 characters. MeiliSearch will throw an error and refuse to launch if no master key is provided or if it is under 16 bytes. MeiliSearch will suggest a secure autogenerated master key. This is a ready made secure key for docker-compose, you can replace it with your own.

```bash
MEILI_MASTER_KEY=DrhYf7zENyR6AlUCKmnz0eYASOQdl6zxH7s7MKFSfFCt
```

## User System
This section contains the configuration for:

  - [Automated Moderation](#moderation)
  - [Balance/Token Usage](#balance)
  - [Registration and Social Logins](#registration-and-login)
  - [Email Password Reset](#email-password-reset)
     
### Moderation
The Automated Moderation System uses a scoring mechanism to track user violations. As users commit actions like excessive logins, registrations, or messaging, they accumulate violation scores. Upon reaching a set threshold, the user and their IP are temporarily banned. This system ensures platform security by monitoring and penalizing rapid or suspicious activities.

see: **[Automated Moderation](../../features/mod_system.md)**

#### Basic Moderation Settings

- `OPENAI_MODERATION`: Set to true or false, Whether or not to enable OpenAI moderation on the **OpenAI** and **Plugins** endpoints
- `OPENAI_MODERATION_API_KEY`: Your OpenAI API key
- `OPENAI_MODERATION_REVERSE_PROXY`: Note: Commented out by default, this is not working with all reverse proxys

```bash
OPENAI_MODERATION=false
OPENAI_MODERATION_API_KEY=
OPENAI_MODERATION_REVERSE_PROXY=
```

- `BAN_VIOLATIONS`: Whether or not to enable banning users for violations (they will still be logged)
- `BAN_DURATION`: How long the user and associated IP are banned for (in milliseconds)
- `BAN_INTERVAL`: The user will be banned everytime their score reaches/crosses over the interval threshold

```bash
BAN_VIOLATIONS=true
BAN_DURATION=1000 * 60 * 60 * 2
BAN_INTERVAL=20 
```

#### Score for each violation

```bash
LOGIN_VIOLATION_SCORE=1
REGISTRATION_VIOLATION_SCORE=1
CONCURRENT_VIOLATION_SCORE=1
MESSAGE_VIOLATION_SCORE=1
NON_BROWSER_VIOLATION_SCORE=20
ILLEGAL_MODEL_REQ_SCORE=5
```

> Note: Non-browser access and Illegal model requests are almost always nefarious as it means a 3rd party is attempting to access the server through an automated script.

#### Login and registration rate limiting.
- `LOGIN_MAX`: The max amount of logins allowed per IP per `LOGIN_WINDOW`
- `LOGIN_WINDOW`: In minutes, determines the window of time for `LOGIN_MAX` logins
- `REGISTER_MAX`: The max amount of registrations allowed per IP per `REGISTER_WINDOW`
- `REGISTER_WINDOW`: In minutes, determines the window of time for `REGISTER_MAX` registrations

```bash
LOGIN_MAX=7
LOGIN_WINDOW=5
REGISTER_MAX=5
REGISTER_WINDOW=60
```

#### Message rate limiting (per user & IP)

- `LIMIT_CONCURRENT_MESSAGES`: Whether to limit the amount of messages a user can send per request
- `CONCURRENT_MESSAGE_MAX`: The max amount of messages a user can send per request

```bash
LIMIT_CONCURRENT_MESSAGES=true
CONCURRENT_MESSAGE_MAX=2
```

#### Limiters

> Note: You can utilize both limiters, but default is to limit by IP only.

- **IP Limiter:**
- `LIMIT_MESSAGE_IP`: Whether to limit the amount of messages an IP can send per `MESSAGE_IP_WINDOW`
- `MESSAGE_IP_MAX`: The max amount of messages an IP can send per `MESSAGE_IP_WINDOW`
- `MESSAGE_IP_WINDOW`: In minutes, determines the window of time for `MESSAGE_IP_MAX` messages

```bash
LIMIT_MESSAGE_IP=true
MESSAGE_IP_MAX=40
MESSAGE_IP_WINDOW=1
```

- **User Limiter:**
- `LIMIT_MESSAGE_USER`: Whether to limit the amount of messages an IP can send per `MESSAGE_USER_WINDOW`
- `MESSAGE_USER_MAX`: The max amount of messages an IP can send per `MESSAGE_USER_WINDOW`
- `MESSAGE_USER_WINDOW`: In minutes, determines the window of time for `MESSAGE_USER_MAX` messages


```bash
LIMIT_MESSAGE_USER=false
MESSAGE_USER_MAX=40
MESSAGE_USER_WINDOW=1
```

### Balance
The following enables user balances for the OpenAI/Plugins endpoints, which you can add manually or you will need to build out a balance accruing system for users.

see: **[Token Usage](../../features/token_usage.md)**

- To manually add balances, run the following command:`npm run add-balance`
  - You can also specify the email and token credit amount to add, e.g.:`npm run add-balance example@example.com 1000`
  - To list the balance of every user: `npm run list-balances`

> **Note:** 1000 credits = $0.001 (1 mill USD)

- Set to `true` to enable token credit balances for the OpenAI/Plugins endpoints

```bash
CHECK_BALANCE=false
```

### Registration and Login
see: **[User/Auth System](./user_auth_system.md)**

![image](https://github.com/danny-avila/LibreChat/assets/81851188/52a37d1d-7392-4a9a-a79f-90ed2da7f841)

- General Settings: 
    - `ALLOW_EMAIL_LOGIN`: Email login. Set to `true` or `false` to enable or disable ONLY email login.
    - `ALLOW_REGISTRATION`: Email registration of new users. Set to `true` or `false` to enable or disable Email registration.
    - `ALLOW_SOCIAL_LOGIN`: Allow users to connect to LibreChat with various social networks, see below. Set to `true` or `false` to enable or disable.
    - `ALLOW_SOCIAL_REGISTRATION`: Enable or disable registration of new user using various social network. Set to `true` or `false` to enable or disable.

> **Quick Tip:** Even with registration disabled, add users directly to the database using `npm run create-user`.
> **Quick Tip:** With registration disabled, you can delete a user with `npm run delete-user email@domain.com`.

```bash
ALLOW_EMAIL_LOGIN=true
ALLOW_REGISTRATION=true
ALLOW_SOCIAL_LOGIN=false
ALLOW_SOCIAL_REGISTRATION=false
```

- Default values: session expiry: 15 minutes, refresh token expiry: 7 days
  - For more information: **[Refresh Token](https://github.com/danny-avila/LibreChat/pull/927)**

```bash
SESSION_EXPIRY=1000 * 60 * 15
REFRESH_TOKEN_EXPIRY=(1000 * 60 * 60 * 24) * 7
```

- You should use new secure values. The examples given are 32-byte keys (64 characters in hex). 
  - Use this replit to generate some quickly: **[JWT Keys](https://replit.com/@daavila/crypto#index.js)**

```bash
JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef
JWT_REFRESH_SECRET=eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418
```

### Social Logins

#### [Discord Authentication](./OAuth2-and-OIDC/discord.md)

for more information: **[Discord](./OAuth2-and-OIDC/discord.md)**

```bash
# Discord
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_CALLBACK_URL=/oauth/discord/callback
```

#### [Facebook Authentication](./OAuth2-and-OIDC/facebook.md)

for more information: **[Facebook Authentication](./OAuth2-and-OIDC/facebook.md)**

```bash
# Facebook
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
FACEBOOK_CALLBACK_URL=/oauth/facebook/callback

```
#### [GitHub Authentication](./OAuth2-and-OIDC/github.md)

for more information: **[GitHub Authentication](./OAuth2-and-OIDC/github.md)**

```bash
# GitHub
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=/oauth/github/callback
```

#### [Google Authentication](./OAuth2-and-OIDC/google.md)

for more information: **[Google Authentication](./OAuth2-and-OIDC/google.md)**

```bash
# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=/oauth/google/callback
```

#### [OpenID Authentication](./OAuth2-and-OIDC/aws.md)

for more information: **[Azure OpenID Authentication](./OAuth2-and-OIDC/azure.md)** or **[AWS Cognito OpenID Authentication](./OAuth2-and-OIDC/aws.md)**

```bash
# OpenID
OPENID_CLIENT_ID=
OPENID_CLIENT_SECRET=
OPENID_ISSUER=
OPENID_SESSION_SECRET=
OPENID_SCOPE="openid profile email"
OPENID_CALLBACK_URL=/oauth/openid/callback
OPENID_BUTTON_LABEL=
OPENID_IMAGE_URL=
OPENID_REQUIRED_ROLE_TOKEN_KIND=
OPENID_REQUIRED_ROLE=
OPENID_REQUIRED_ROLE_PARAMETER_PATH=
```

### Email Password Reset
Email is used for password reset. See: **[Email Password Reset](./user_auth_system.md#email-and-password-reset)**

- Note that all either service or host, username and password and the From address must be set for email to work.

> If using `EMAIL_SERVICE`, **do NOT** set the extended connection parameters:
> 
> `HOST`, `PORT`, `ENCRYPTION`, `ENCRYPTION_HOSTNAME`, `ALLOW_SELFSIGNED`
> 
> Failing to set valid values here will result in LibreChat using the unsecured password reset!

See: **[nodemailer well-known-services](https://community.nodemailer.com/2-0-0-beta/setup-smtp/well-known-services/)**

```bash
EMAIL_SERVICE=
```

If `EMAIL_SERVICE` is not set, connect to this server:

```bash
EMAIL_HOST=
```

Mail server port to connect to with EMAIL_HOST (usually 25, 465, 587, 2525):

```bash
EMAIL_PORT=25
```

Encryption valid values: `starttls` (force STARTTLS), `tls` (obligatory TLS), anything else (use STARTTLS if available):

```bash
EMAIL_ENCRYPTION=
```

Check the name in the certificate against this instead of `EMAIL_HOST`:

```bash
EMAIL_ENCRYPTION_HOSTNAME=
```

Set to true to allow self-signed, anything else will disallow self-signed:

```bash
EMAIL_ALLOW_SELFSIGNED=
```

Username used for authentication. For consumer services, this MUST usually match EMAIL_FROM:

```bash
EMAIL_USERNAME=
```

Password used for authentication:

```bash
EMAIL_PASSWORD=
```

The human-readable address in the From is constructed as `EMAIL_FROM_NAME <EMAIL_FROM>`. Defaults to `APP_TITLE`:

```bash
EMAIL_FROM_NAME=
```

Mail address for from field. It is **REQUIRED** to set a value here (even if it's not porperly working):

```bash
EMAIL_FROM=noreply@librechat.ai 
```
### UI

- **Help and FAQ button:** 

Empty or commented `HELP_AND_FAQ_URL`, button enabled

`HELP_AND_FAQ_URL=https://example.com`, button enabled and goes to `https://example.com`

`HELP_AND_FAQ_URL=/`, button disabled

```bash
HELP_AND_FAQ_URL=
```

- **App title and footer:**

Uncomment to add a custom footer

Uncomment and make empty "" to remove the footer

```bash
APP_TITLE=LibreChat
CUSTOM_FOOTER="My custom footer"
```

- **Birthday Hat:** Give the AI Icon a Birthday Hat 🥳

> Will show automatically on February 11th (LibreChat's birthday)
 
> Set this to `false` to disable the birthday hat

> Set to `true` to enable all the time.

```bash
SHOW_BIRTHDAY_ICON=true
```

### Other

- **Redis:** Redis support is experimental, you may encounter some problems when using it. 

> If using Redis, you should flush the cache after changing any LibreChat settings

```bash
REDIS_URI=
USE_REDIS=
```
