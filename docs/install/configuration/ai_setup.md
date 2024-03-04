---
title: 🤖 AI Setup
description: This doc explains how to setup your AI providers, their APIs and credentials.
weight: -8
---

<!-- # Table of Contents

- [Table of Contents](#table-of-contents)
- [AI Setup](#ai-setup)
  - [General](#general)
    - [Free AI APIs](#free-ai-apis)
    - [Setting a Default Endpoint](#setting-a-default-endpoint)
    - [Setting a Default Preset](#setting-a-default-preset)
  - [OpenAI](#openai)
  - [Anthropic](#anthropic)
  - [Google](#google)
    - [Generative Language API (Gemini)](#generative-language-api-gemini)
    - [Vertex AI (PaLM 2 \& Codey)](#vertex-ai-palm-2--codey)
    - [1. Once signed up, Enable the Vertex AI API on Google Cloud:](#1-once-signed-up-enable-the-vertex-ai-api-on-google-cloud)
    - [2. Create a Service Account with Vertex AI role:](#2-create-a-service-account-with-vertex-ai-role)
    - [3. Create a JSON key to Save in your Project Directory:](#3-create-a-json-key-to-save-in-your-project-directory)
  - [Azure OpenAI](#azure-openai)
    - [Required Variables](#required-variables)
    - [Model Deployments](#model-deployments)
    - [Setting a Default Model for Azure](#setting-a-default-model-for-azure)
    - [Enabling Auto-Generated Titles with Azure](#enabling-auto-generated-titles-with-azure)
    - [Using GPT-4 Vision with Azure](#using-gpt-4-vision-with-azure)
    - [Optional Variables](#optional-variables)
    - [Using Plugins with Azure](#using-plugins-with-azure)
  - [OpenRouter](#openrouter)
  - [Unofficial APIs](#unofficial-apis)
    - [BingAI](#bingai)
  - [Conclusion](#conclusion) -->

---

# AI Setup

This doc explains how to setup your AI providers, their APIs and credentials.

**"Endpoints"** refer to the AI provider, configuration or API to use, which determines what models and settings are available for the current chat request.

For example, OpenAI, Google, Plugins, Azure OpenAI, Anthropic, are all different "endpoints". Since OpenAI was the first supported endpoint, it's listed first by default.

Using the default environment values from [/.env.example](https://github.com/danny-avila/LibreChat/blob/main/.env.example) will enable several endpoints, with credentials to be provided on a per-user basis from the web app. Alternatively, you can provide credentials for all users of your instance.

This guide will walk you through setting up each Endpoint as needed.

For **custom endpoint** configuration, such as adding [Mistral AI](https://docs.mistral.ai/platform/client/) or [Openrouter](https://openrouter.ai/) refer to the **[librechat.yaml configuration guide](./custom_config.md)**.

**Reminder: If you use docker, you should [rebuild the docker image (here's how)](dotenv.md) each time you update your credentials**

*Note: Configuring pre-made Endpoint/model/conversation settings as singular options for your users is a planned feature. See the related discussion here: [System-wide custom model settings (lightweight GPTs) #1291](https://github.com/danny-avila/LibreChat/discussions/1291)*

## General

### [Free AI APIs](free_ai_apis.md)

### Setting a Default Endpoint

In the case where you have multiple endpoints setup, but want a specific one to be first in the order, you need to set the following environment variable.

```bash
# .env file
# No spaces between values
ENDPOINTS=azureOpenAI,openAI,assistants,google 
```

Note that LibreChat will use your last selected endpoint when creating a new conversation. So if Azure OpenAI is first in the order, but you used or view an OpenAI conversation last, when you hit "New Chat," OpenAI will be selected with its default conversation settings.

To override this behavior, you need a preset and you need to set that specific preset as the default one to use on every new chat.

### Setting a Default Preset
See the **[Presets Guide](../../features/presets.md)** for more details

A preset refers to a specific Endpoint/Model/Conversation Settings that you can save.

The default preset will always be used when creating a new conversation.

Here's a video to demonstrate: **[Setting a Default Preset](https://github.com/danny-avila/LibreChat/assets/110412045/bbde830f-18d9-4884-88e5-1bd8f7ac585d)**

--- 

## OpenAI

To get your OpenAI API key, you need to:

- Go to **[https://platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)**
- Create an account or log in with your existing one
- Add a payment method to your account (this is not free, sorry 😬)
- Copy your secret key (sk-...) and save it in ./.env as OPENAI_API_KEY

**Notes:**

- Selecting a vision model for messages with attachments is not necessary as it will be switched behind the scenes for you. If you didn't outright select a vision model, it will only be used for the vision request and you should still see the non-vision model you had selected after the request is successful
- OpenAI Vision models allow for messages without attachments

---

## Assistants

- The [Assistants API by OpenAI](https://platform.openai.com/docs/assistants/overview) has a dedicated endpoint.
- The Assistants API enables the creation of AI assistants, offering functionalities like code interpreter, knowledge retrieval of files, and function execution.
    - [Read here for an in-depth documentation](https://platform.openai.com/docs/assistants/overview) of the feature, how it works, what it's capable of.
- As with the regular [OpenAI API](#openai), go to **[https://platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)** to get a key.
- You will need to set the following environment variable to your key or you can set it to `user_provided` for users to provide their own.

```bash
ASSISTANTS_API_KEY=your-key
```

- You can determine which models you would like to have available with `ASSISTANTS_MODELS`; otherwise, the models list fetched from OpenAI will be used (only Assistants API compatible models will be shown).

```bash
# without spaces
ASSISTANTS_MODELS=gpt-3.5-turbo-0125,gpt-3.5-turbo-16k-0613,gpt-3.5-turbo-16k,gpt-3.5-turbo,gpt-4,gpt-4-0314,gpt-4-32k-0314,gpt-4-0613,gpt-3.5-turbo-0613,gpt-3.5-turbo-1106,gpt-4-0125-preview,gpt-4-turbo-preview,gpt-4-1106-preview
```

- If necessary, you can also set an alternate base URL instead of the official one with `ASSISTANTS_BASE_URL`, which is similar to the OpenAI counterpart `OPENAI_REVERSE_PROXY`

```bash
ASSISTANTS_BASE_URL=http://your-alt-baseURL:3080/
```

- There is additional, optional configuration, depending on your needs, such as disabling the assistant builder UI, that are available via the [`librechat.yaml` custom config file](./custom_config.md#assistants-endpoint-object-structure):
    - Control the visibility and use of the builder interface for assistants. [More info](./custom_config.md#disablebuilder)
    - Specify the polling interval in milliseconds for checking run updates or changes in assistant run states. [More info](./custom_config.md#pollintervalms)
    - Set the timeout period in milliseconds for assistant runs. Helps manage system load by limiting total run operation time. [More info](./custom_config.md#timeoutMs)
    - Specify which assistant Ids are supported or excluded [More info](./custom_config.md#supportedIds)

**Notes:**

- At the time of writing, only the following models support the [Retrieval](https://platform.openai.com/docs/assistants/tools/knowledge-retrieval) capability:
    - gpt-3.5-turbo-0125
    - gpt-4-0125-preview
    - gpt-4-turbo-preview
    - gpt-4-1106-preview
    - gpt-3.5-turbo-1106
- Vision capability is not yet supported.
- If you have previously set the [`ENDPOINTS` value in your .env file](./dotenv.md#endpoints), you will need to add the value `assistants`

---

## Anthropic

- Create an account at **[https://console.anthropic.com/](https://console.anthropic.com/)**
- Go to **[https://console.anthropic.com/account/keys](https://console.anthropic.com/account/keys)** and get your api key
- add it to `ANTHROPIC_API_KEY=` in the `.env` file

---

## Google

For the Google Endpoint, you can either use the **Generative Language API** (for Gemini models), or the **Vertex AI API** (for PaLM2 & Codey models, Gemini support coming soon).

The Generative Language API uses an API key, which you can get from **Google AI Studio**.

For Vertex AI, you need a Service Account JSON key file, with appropriate access configured.

Instructions for both are given below.

### Generative Language API (Gemini)

**60 Gemini requests/minute are currently free until early next year when it enters general availability.**

⚠️ Google will be using that free input/output to help improve the model, with data de-identified from your Google Account and API key.
⚠️ During this period, your messages “may be accessible to trained reviewers.”

To use Gemini models, you'll need an API key. If you don't already have one, create a key in Google AI Studio.

Get an API key here: **[makersuite.google.com](https://makersuite.google.com/app/apikey)**

Once you have your key, provide the key in your .env file, which allows all users of your instance to use it.

```bash
GOOGLE_KEY=mY_SeCreT_w9347w8_kEY
```

Or, you can make users provide it from the frontend by setting the following:
```bash
GOOGLE_KEY=user_provided
```

Notes:
- PaLM2 and Codey models cannot be accessed through the Generative Language API, only through Vertex AI.
- Selecting `gemini-pro-vision` for messages with attachments is not necessary as it will be switched behind the scenes for you
- Since `gemini-pro-vision`does not accept non-attachment messages, messages without attachments are automatically switched to use `gemini-pro` (otherwise, Google responds with an error)

Setting `GOOGLE_KEY=user_provided` in your .env file will configure both the Vertex AI Service Account JSON key file and the Generative Language API key to be provided from the frontend like so:

![image](https://github.com/danny-avila/LibreChat/assets/110412045/728cbc04-4180-45a8-848c-ae5de2b02996)

### Vertex AI (PaLM 2 & Codey)

To setup Google LLMs (via Google Cloud Vertex AI), first, signup for Google Cloud: **[cloud.google.com](https://cloud.google.com/)**

You can usually get **$300 starting credit**, which makes this option free for 90 days.

### 1. Once signed up, Enable the Vertex AI API on Google Cloud:
  - Go to **[Vertex AI page on Google Cloud console](https://console.cloud.google.com/vertex-ai)**
  - Click on `Enable API` if prompted
### 2. Create a Service Account with Vertex AI role:
  - **[Click here to create a Service Account](https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts/create?walkthrough_id=iam--create-service-account#step_index=1)**
  - **Select or create a project**
  - ### Enter a service account ID (required), name and description are optional
      - ![image](https://github.com/danny-avila/LibreChat/assets/110412045/0c5cd177-029b-44fa-a398-a794aeb09de6)
  - ### Click on "Create and Continue" to give at least the "Vertex AI User" role
      - ![image](https://github.com/danny-avila/LibreChat/assets/110412045/22d3a080-e71e-446e-8485-bcc5bf558dbb)
  - **Click on "Continue/Done"**
### 3. Create a JSON key to Save in your Project Directory:
  - **Go back to [the Service Accounts page](https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts)**
  - **Select your service account**
  - ### Click on "Keys"
       - ![image](https://github.com/danny-avila/LibreChat/assets/110412045/735a7bbe-25a6-4b4c-9bb5-e0d8aa91be3d)
  - ### Click on "Add Key" and then "Create new key"
       - ![image](https://github.com/danny-avila/LibreChat/assets/110412045/cfbb20d3-94a8-4cd1-ac39-f9cd8c2fceaa)
  - **Choose JSON as the key type and click on "Create"**
  - **Download the key file and rename it as 'auth.json'**
  - **Save it within the project directory, in `/api/data/`**
       - ![image](https://github.com/danny-avila/LibreChat/assets/110412045/f5b8bcb5-1b20-4751-81a1-d3757a4b3f2f)

**Saving your JSON key file in the project directory which allows all users of your LibreChat instance to use it.**

Alternatively, you can make users provide it from the frontend by setting the following:

```bash
# Note: this configures both the Vertex AI Service Account JSON key file
# and the Generative Language API key to be provided from the frontend.
GOOGLE_KEY=user_provided
```

Note: Using Gemini models through Vertex AI is possible but not yet supported.

---

## Azure OpenAI

In order to use Azure OpenAI with this project, specific environment variables must be set in your `.env` file. These variables will be used for constructing the API URLs. 

The variables needed are outlined below:

### Required Variables

These variables construct the API URL for Azure OpenAI.

* `AZURE_API_KEY`: Your Azure OpenAI API key.
* `AZURE_OPENAI_API_INSTANCE_NAME`: The instance name of your Azure OpenAI API.
* `AZURE_OPENAI_API_DEPLOYMENT_NAME`: The deployment name of your Azure OpenAI API. 
* `AZURE_OPENAI_API_VERSION`: The version of your Azure OpenAI API.

For example, with these variables, the URL for chat completion would look something like:
```plaintext
https://{AZURE_OPENAI_API_INSTANCE_NAME}.openai.azure.com/openai/deployments/{AZURE_OPENAI_API_DEPLOYMENT_NAME}/chat/completions?api-version={AZURE_OPENAI_API_VERSION}
```
You should also consider changing the `AZURE_OPENAI_MODELS` variable to the models available in your deployment.

```bash
# .env file
AZURE_OPENAI_MODELS=gpt-4-1106-preview,gpt-4,gpt-3.5-turbo,gpt-3.5-turbo-1106,gpt-4-vision-preview
```

Overriding the construction of the API URL will be possible but is not yet implemented. Follow progress on this feature here: **[Issue #1266](https://github.com/danny-avila/LibreChat/issues/1266)**

### Model Deployments

> Note: a change will be developed to improve current configuration settings, to allow multiple deployments/model configurations setup with ease: **[#1390](https://github.com/danny-avila/LibreChat/issues/1390)**

As of 2023-12-18, the Azure API allows only one model per deployment.

**It's highly recommended** to name your deployments *after* the model name (e.g., "gpt-3.5-turbo") for easy deployment switching.

When you do so, LibreChat will correctly switch the deployment, while associating the correct max context per model, if you have the following environment variable set:

```bash
AZURE_USE_MODEL_AS_DEPLOYMENT_NAME=TRUE
```

For example, when you have set `AZURE_USE_MODEL_AS_DEPLOYMENT_NAME=TRUE`, the following deployment configuration provides the most seamless, error-free experience for LibreChat, including Vision support and tracking the correct max context tokens:

![Screenshot 2023-12-18 111742](https://github.com/danny-avila/LibreChat/assets/110412045/4aa8a61c-0317-4681-8262-a6382dcaa7b0)


Alternatively, you can use custom deployment names and set `AZURE_OPENAI_DEFAULT_MODEL` for expected functionality.

- **`AZURE_OPENAI_MODELS`**: List the available models, separated by commas without spaces. The first listed model will be the default. If left blank, internal settings will be used. Note that deployment names can't have periods, which are removed when generating the endpoint.

Example use:

```bash
# .env file
AZURE_OPENAI_MODELS=gpt-3.5-turbo,gpt-4,gpt-5

```

- **`AZURE_USE_MODEL_AS_DEPLOYMENT_NAME`**: Enable using the model name as the deployment name for the API URL.

Example use:

```bash
# .env file
AZURE_USE_MODEL_AS_DEPLOYMENT_NAME=TRUE

```

### Setting a Default Model for Azure

This section is relevant when you are **not** naming deployments after model names as shown above.

**Important:** The Azure OpenAI API does not use the `model` field in the payload but is a necessary identifier for LibreChat. If your deployment names do not correspond to the model names, and you're having issues with the model not being recognized, you should set this field to explicitly tell LibreChat to treat your Azure OpenAI API requests as if the specified model was selected.

If AZURE_USE_MODEL_AS_DEPLOYMENT_NAME is enabled, the model you set with `AZURE_OPENAI_DEFAULT_MODEL` will **not** be recognized and will **not** be used as the deployment name; instead, it will use the model selected by the user as the "deployment" name.

- **`AZURE_OPENAI_DEFAULT_MODEL`**: Override the model setting for Azure, useful if using custom deployment names.

Example use:

```bash
# .env file
# MUST be a real OpenAI model, named exactly how it is recognized by OpenAI API (not Azure)
AZURE_OPENAI_DEFAULT_MODEL=gpt-3.5-turbo # do include periods in the model name here

```

### Using a Specified Base URL with Azure

The base URL for Azure OpenAI API requests can be dynamically configured. This is useful for proxying services such as [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/providers/azureopenai/), or if you wish to explicitly override the baseURL handling of the app.

LibreChat will use the `AZURE_OPENAI_BASEURL` environment variable, which can include placeholders for the Azure OpenAI API instance and deployment names.

In the application's environment configuration, the base URL is set like this:

```bash
# .env file
AZURE_OPENAI_BASEURL=https://example.azure-api.net/${INSTANCE_NAME}/${DEPLOYMENT_NAME}

# OR
AZURE_OPENAI_BASEURL=https://${INSTANCE_NAME}.openai.azure.com/openai/deployments/${DEPLOYMENT_NAME}

# Cloudflare example
AZURE_OPENAI_BASEURL=https://gateway.ai.cloudflare.com/v1/ACCOUNT_TAG/GATEWAY/azure-openai/${INSTANCE_NAME}/${DEPLOYMENT_NAME}
```

The application replaces `${INSTANCE_NAME}` and `${DEPLOYMENT_NAME}` in the `AZURE_OPENAI_BASEURL`, processed according to the other settings discussed in the guide.

**You can also omit the placeholders completely and simply construct the baseURL with your credentials:**

```bash
# .env file
AZURE_OPENAI_BASEURL=https://instance-1.openai.azure.com/openai/deployments/deployment-1

# Cloudflare example
AZURE_OPENAI_BASEURL=https://gateway.ai.cloudflare.com/v1/ACCOUNT_TAG/GATEWAY/azure-openai/instance-1/deployment-1
```

Setting these values will override all of the application's internal handling of the instance and deployment names and use your specified base URL.

**Notes:**
- You should still provide the `AZURE_OPENAI_API_VERSION` and `AZURE_API_KEY` via the .env file as they are programmatically added to the requests.
- When specifying instance and deployment names in the `AZURE_OPENAI_BASEURL`, their respective environment variables can be omitted (`AZURE_OPENAI_API_INSTANCE_NAME` and `AZURE_OPENAI_API_DEPLOYMENT_NAME`) except for use with Plugins.
- Specifying instance and deployment names in the `AZURE_OPENAI_BASEURL` instead of placeholders creates conflicts with "plugins," "vision," "default-model," and "model-as-deployment-name" support.
- Due to the conflicts that arise with other features, it is recommended to use placeholder for instance and deployment names in the `AZURE_OPENAI_BASEURL`

### Enabling Auto-Generated Titles with Azure

The default titling model is set to `gpt-3.5-turbo`.

If you're using `AZURE_USE_MODEL_AS_DEPLOYMENT_NAME` and have "gpt-35-turbo" setup as a deployment name, this should work out-of-the-box.

In any case, you can adjust the title model as such: `OPENAI_TITLE_MODEL=your-title-model`

### Using GPT-4 Vision with Azure

Currently, the best way to setup Vision is to use your deployment names as the model names, as [shown here](#model-deployments)

This will work seamlessly as it does with the [OpenAI endpoint](#openai) (no need to select the vision model, it will be switched behind the scenes)

Alternatively, you can set the [required variables](#required-variables) to explicitly use your vision deployment, but this may limit you to exclusively using your vision deployment for all Azure chat settings.


**Notes:**

- If using `AZURE_OPENAI_BASEURL`, you should not specify instance and deployment names instead of placeholders as the vision request will fail.
- As of December 18th, 2023, Vision models seem to have degraded performance with Azure OpenAI when compared to [OpenAI](#openai)

![image](https://github.com/danny-avila/LibreChat/assets/110412045/7306185f-c32c-4483-9167-af514cc1c2dd)


> Note: a change will be developed to improve current configuration settings, to allow multiple deployments/model configurations setup with ease: **[#1390](https://github.com/danny-avila/LibreChat/issues/1390)**

### Generate images with Azure OpenAI Service (DALL-E)

| Model ID | Feature Availability | Max Request (characters) |
|----------|----------------------|-------------------------|
| dalle2   | East US              | 1000                    |
| dalle3   | Sweden Central       | 4000                    |

- First you need to create an Azure resource that hosts DALL-E
    - At the time of writing, dall-e-3 is available in the `SwedenCentral` region, dall-e-2 in the `EastUS` region.
- Then, you need to deploy the image generation model in one of the above regions.
    - Read the [Azure OpenAI Image Generation Quickstart Guide](https://learn.microsoft.com/en-us/azure/ai-services/openai/dall-e-quickstart) for further assistance
- Configure your environment variables based on Azure credentials:

**- For DALL-E-3:**

```bash
DALLE3_AZURE_API_VERSION=the-api-version # e.g.: 2023-12-01-preview
DALLE3_BASEURL=https://<AZURE_OPENAI_API_INSTANCE_NAME>.openai.azure.com/openai/deployments/<DALLE3_DEPLOYMENT_NAME>/
DALLE3_API_KEY=your-azure-api-key-for-dall-e-3
```

**- For DALL-E-2:**

```bash
DALLE2_AZURE_API_VERSION=the-api-version # e.g.: 2023-12-01-preview
DALLE2_BASEURL=https://<AZURE_OPENAI_API_INSTANCE_NAME>.openai.azure.com/openai/deployments/<DALLE2_DEPLOYMENT_NAME>/
DALLE2_API_KEY=your-azure-api-key-for-dall-e-2
```

**DALL-E Notes:**

- For DALL-E-3, the default system prompt has the LLM prefer the ["vivid" style](https://platform.openai.com/docs/api-reference/images/create#images-create-style) parameter, which seems to be the preferred setting for ChatGPT as "natural" can sometimes produce lackluster results.
- See official prompt for reference: **[DALL-E System Prompt](https://github.com/spdustin/ChatGPT-AutoExpert/blob/main/_system-prompts/dall-e.md)**
- You can adjust the system prompts to your liking:

```bash
DALLE3_SYSTEM_PROMPT="Your DALL-E-3 System Prompt here"
DALLE2_SYSTEM_PROMPT="Your DALL-E-2 System Prompt here"
```

- The `DALLE_REVERSE_PROXY` environment variable is ignored when Azure credentials (DALLEx_AZURE_API_VERSION and DALLEx_BASEURL) for DALL-E are configured.

### Optional Variables

*These variables are currently not used by LibreChat*

* `AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME`: The deployment name for completion. This is currently not in use but may be used in future.
* `AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME`: The deployment name for embedding. This is currently not in use but may be used in future.

These two variables are optional but may be used in future updates of this project.

### Using Plugins with Azure

Note: To use the Plugins endpoint with Azure OpenAI, you need a deployment supporting **[function calling](https://techcommunity.microsoft.com/t5/azure-ai-services-blog/function-calling-is-now-available-in-azure-openai-service/ba-p/3879241)**. Otherwise, you need to set "Functions" off in the Agent settings. When you are not using "functions" mode, it's recommend to have "skip completion" off as well, which is a review step of what the agent generated.

To use Azure with the Plugins endpoint, make sure the following environment variables are set:

* `PLUGINS_USE_AZURE`: If set to "true" or any truthy value, this will enable the program to use Azure with the Plugins endpoint.
* `AZURE_API_KEY`: Your Azure API key must be set with an environment variable.

**Important:**

- If using `AZURE_OPENAI_BASEURL`, you should not specify instance and deployment names instead of placeholders as the plugin request will fail.

---

## [OpenRouter](https://openrouter.ai/)

**[OpenRouter](https://openrouter.ai/)** is a legitimate proxy service to a multitude of LLMs, both closed and open source, including:

- OpenAI models (great if you are barred from their API for whatever reason)
- Anthropic Claude models (same as above)
- Meta's Llama models
- pygmalionai/mythalion-13b
- and many more open source models. Newer integrations are usually discounted, too!

> See their available models and pricing here: **[Supported Models](https://openrouter.ai/docs#models)**

OpenRouter is integrated to the LibreChat by overriding the OpenAI endpoint.

**Important**: As of v0.6.6, you can use OpenRouter as its own standalone endpoint:

### [Review the Custom Config Guide (click here)](./custom_config.md) to add an `OpenRouter` Endpoint

![image](https://github.com/danny-avila/LibreChat/assets/110412045/4955bfa3-7b6b-4602-933f-daef89c9eab3)

#### Setup (legacy):

- Signup to **[OpenRouter](https://openrouter.ai/)** and create a key. You should name it and set a limit as well.
- Set the environment variable `OPENROUTER_API_KEY` in your .env file to the key you just created.
- Set something in the `OPENAI_API_KEY`, it can be anyting, but **do not** leave it blank or set to `user_provided`  
- Restart your LibreChat server and use the OpenAI or Plugins endpoints.

#### Notes (legacy):

- This will override the official OpenAI API or your reverse proxy settings for both Plugins and OpenAI.
- On initial setup, you may need to refresh your page twice to see all their supported models populate automatically.
- Plugins: Functions Agent works with OpenRouter when using OpenAI models.
- Plugins: Turn functions off to try plugins with non-OpenAI models (ChatGPT plugins will not work and others may not work as expected).
- Plugins: Make sure `PLUGINS_USE_AZURE` is not set in your .env file when wanting to use OpenRouter and you have Azure configured.

---

## Unofficial APIs

**Important:** Stability for Unofficial APIs are not guaranteed. Access methods to these APIs are hacky, prone to errors, and patching, and are marked lowest in priority in LibreChat's development.

### ChatGPTBrowser

**Backend Access to https://chat.openai.com/api**

This is not to be confused with [OpenAI's Official API](#openai)!

> Note that this is disabled by default and requires additional configuration to work. 
> Also, using this may have your data exposed to 3rd parties if using a proxy, and OpenAI may flag your account.
> See: [ChatGPT Reverse Proxy](../../features/ninja.md)

To get your Access token for ChatGPT Browser Access, you need to:

- Go to **[https://chat.openai.com](https://chat.openai.com)**
- Create an account or log in with your existing one
- Visit **[https://chat.openai.com/api/auth/session](https://chat.openai.com/api/auth/session)**
- Copy the value of the "accessToken" field and save it in ./.env as CHATGPT_ACCESS_TOKEN

Warning: There may be a chance of your account being banned if you deploy the app to multiple users with this method. Use at your own risk.

---

### BingAI
I recommend using Microsoft Edge for this:

- Navigate to **[Bing Chat](https://www.bing.com/chat)**
- **Login** if you haven't already
- Initiate a conversation with Bing
- Open `Dev Tools`, usually with `F12` or `Ctrl + Shift + C`
- Navigate to the `Network` tab
- Look for `lsp.asx` (if it's not there look into the other entries for one with a **very long** cookie) 
- Copy the whole cookie value. (Yes it's very long 😉)
- Use this **"full cookie string"** for your "BingAI Token"
  - <p align="left">
    <img src="https://github.com/danny-avila/LibreChat/assets/32828263/d4dfd370-eddc-4694-ab16-076f913ff430" width="50%">
</p>

### copilot-gpt4-service
For this setup, an additional docker container will need to be setup.

***It is necessary to obtain your token first.***

Follow these instructions provided at **[copilot-gpt4-service#obtaining-token](https://github.com/aaamoon/copilot-gpt4-service#obtaining-copilot-token)** and keep your token for use within the service. Additionally, more detailed instructions for setting copilot-gpt4-service are available at the [GitHub repo](https://github.com/aaamoon/copilot-gpt4-service). 

It is *not* recommended to use the copilot token obtained directly, instead use the `SUPER_TOKEN` variable. (You can generate your own `SUPER_TOKEN` with the OpenSSL command `openssl rand -hex 16` and set the `ENABLE_SUPER_TOKEN` variable to `true`)

1. Once your Docker environment is ready and your tokens are generated, proceed with this Docker run command to start the service:
    ```
    docker run -d \
      --name copilot-gpt4-service \
      -e HOST=0.0.0.0 \
      -e COPILOT_TOKEN=ghp_xxxxxxx \
      -e SUPER_TOKEN=your_super_token \
      -e ENABLE_SUPER_TOKEN=true \
      --restart always \
      -p 8080:8080 \
      aaamoon/copilot-gpt4-service:latest
    ```

2. For Docker Compose users, use the equivalent yaml configuration provided below:
    ```yaml
    version: '3.8'
    services:
      copilot-gpt4-service:
        image: aaamoon/copilot-gpt4-service:latest
        environment:
          - HOST=0.0.0.0
          - COPILOT_TOKEN=ghp_xxxxxxx # Default GitHub Copilot Token, if this item is set, the Token carried with the request will be ignored. Default is empty.
          - SUPER_TOKEN=your_super_token # Super Token is a user-defined standalone token that can access COPILOT_TOKEN above. This allows you to share the service without exposing your COPILOT_TOKEN. Multiple tokens are separated by commas. Default is empty.
          - ENABLE_SUPER_TOKEN=true # Whether to enable SUPER_TOKEN, default is false. If false, but COPILOT_TOKEN is not empty, COPILOT_TOKEN will be used without any authentication for all requests.
        ports:
          - 8080:8080
        restart: unless-stopped
        container_name: copilot-gpt4-service
    ```

3. After setting up the Docker container for `copilot-gpt4-service`, you can add it to your `librechat.yaml` configuration. Here is an example configuration:
    ```yaml
    version: 1.0.1
    cache: true
    endpoints:
      custom:
        - name: "OpenAI via Copilot"
          apiKey: "your_super_token"
          baseURL: "http://[copilotgpt4service_host_ip]:8080/v1"
          models:
            default: ["gpt-4", "gpt-3.5-turbo"] # *See Notes
          titleConvo: true
          titleModel: "gpt-3.5-turbo"
          summarize: true
          summaryModel: "gpt-3.5-turbo"
          forcePrompt: false
          modelDisplayLabel: "OpenAI"
          dropParams: ["user"]
    ```
    Replace `your_super_token` with the token you obtained following the instructions highlighted above and `[copilotgpt4service_host_ip]` with the IP of your Docker host. *****See Notes***

    Restart Librechat after adding the needed configuration, and select `OpenAI via Copilot` to start using!

    >Notes: 
    > - *Only allowed models are `gpt-4` and `gpt-3.5-turbo`. 
    > - **Advanced users can add this to their existing docker-compose file/existing docker network and avoid having to expose port 8080 (or any port) to the copilot-gpt4-service container. 

---

## Conclusion

<h3>That's it! You're all set. 🎉</h3>

---

>⚠️ Note: If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.

