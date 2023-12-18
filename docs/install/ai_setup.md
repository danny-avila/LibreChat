# Table of Contents

1. [AI Setup](#ai-setup)
    - [General Information](#general)
        - [Free AI APIs](#free-ai-apis)
        - [Setting a Default Endpoint](#setting-a-default-endpoint)
        - [Setting a Default Preset](#setting-a-default-preset)
    - [OpenAI](#openai)
    - [Anthropic](#anthropic)
    - [Google](#google)
        - [Generative Language API (Gemini)](#generative-language-api-gemini)
        - [Vertex AI (PaLM 2 & Codey)](#vertex-ai-palm-2--codey)
    - [Azure OpenAI](#azure-openai)
        - [Required Variables](#required-variables)
        - [Model Deployments](#model-deployments)
        - [Setting a Default Model for Azure](#setting-a-default-model-for-azure)
        - [Enabling Auto-Generated Titles with Azure](#enabling-auto-generated-titles-with-azure)
        - [Using GPT-4 Vision with Azure](#using-gpt-4-vision-with-azure)
        - [Setting Azure OpenAI as the Default Endpoint](#setting-azure-openai-as-the-default-endpoint)
        - [Optional Variables](#optional-variables)
        - [Using Plugins with Azure](#using-plugins-with-azure)
    - [Unofficial APIs](#unofficial-apis)
        - [ChatGPTBrowser](#chatgptbrowser)
        - [BingAI](#bingai)
2. [Conclusion](#conclusion)

---

# AI Setup

This doc explains how to setup your AI providers, their APIs and credentials.

**"Endpoints"** refer to the AI provider, configuration or API to use, which determines what models and settings are available for the current chat request.

For example, OpenAI, Google, Plugins, Azure OpenAI, Anthropic, are all different "endpoints". Since OpenAI was the first supported endpoint, it's listed first by default.

Using the default environment values from `.env.example` will enable several endpoints, with credentials to be provided on a per-user basis from the web app. Alternatively, you can provide credentials for all users of your instance.

This guide will walk you through setting up each Endpoint as needed.

**Reminder: If you use docker, you should [rebuild the docker image (here's how)](dotenv.md) each time you update your credentials**

*Note: Configuring pre-made Endpoint/model/conversation settings as singular options for your users is a planned feature. See the related discussion here: [System-wide custom model settings (lightweight GPTs) #1291](https://github.com/danny-avila/LibreChat/discussions/1291)*

## General

### [Free AI APIs](free_ai_apis.md)

### Setting a Default Endpoint

In the case where you have multiple endpoints setup, but want a specific one to be first in the order, you need to set the following environment variable.

```bash
# .env file
# No spaces between values
ENDPOINTS=azureOpenAI,openAI,google 
```

Note that LibreChat will use your last selected endpoint when creating a new conversation. So if Azure OpenAI is first in the order, but you used or view an OpenAI conversation last, when you hit "New Chat," OpenAI will be selected with its default conversation settings.

To override this behavior, you need a preset and you need to set that specific preset as the default one to use on every new chat.

### Setting a Default Preset

A preset refers to a specific Endpoint/Model/Conversation Settings that you can save.

The default preset will always be used when creating a new conversation.

Here's a video to demonstrate: 

https://github.com/danny-avila/LibreChat/assets/110412045/bbde830f-18d9-4884-88e5-1bd8f7ac585d

--- 

## OpenAI

To get your OpenAI API key, you need to:

- Go to [https://platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)
- Create an account or log in with your existing one
- Add a payment method to your account (this is not free, sorry 😬)
- Copy your secret key (sk-...) and save it in ./.env as OPENAI_API_KEY

Notes:
- Selecting a vision model for messages with attachments is not necessary as it will be switched behind the scenes for you. If you didn't outright select a vision model, it will only be used for the vision request and you should still see the non-vision model you had selected after the request is successful
- OpenAI Vision models allow for messages without attachments

---

## Anthropic

- Create an account at [https://console.anthropic.com/](https://console.anthropic.com/)
- Go to [https://console.anthropic.com/account/keys](https://console.anthropic.com/account/keys) and get your api key
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

<p><a class="button button-primary" href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Get an API key here</a></p>

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

To setup Google LLMs (via Google Cloud Vertex AI), first, signup for Google Cloud: https://cloud.google.com/

You can usually get **$300 starting credit**, which makes this option free for 90 days.

### 1. Once signed up, Enable the Vertex AI API on Google Cloud:
  - Go to [Vertex AI page on Google Cloud console](https://console.cloud.google.com/vertex-ai)
  - Click on "Enable API" if prompted
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

Overriding the construction of the API URL will be possible but is not yet implemented. Follow progress on this feature here: [Issue #1266](https://github.com/danny-avila/LibreChat/issues/1266)

### Model Deployments

*Note: a change will be developed to improve current configuration settings, to allow multiple deployments/model configurations setup with ease: [#1390](https://github.com/danny-avila/LibreChat/issues/1390)*

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

### Enabling Auto-Generated Titles with Azure

The default titling model is set to `gpt-3.5-turbo`.

If you're using `AZURE_USE_MODEL_AS_DEPLOYMENT_NAME` and have "gpt-35-turbo" setup as a deployment name, this should work out-of-the-box.

In any case, you can adjust the title model as such: `OPENAI_TITLE_MODEL=your-title-model`

### Using GPT-4 Vision with Azure

Currently, the best way to setup Vision is to use your deployment names as the model names, as [shown here](#model-deployments)

This will work seamlessly as it does with the [OpenAI endpoint](#openai) (no need to select the vision model, it will be switched behind the scenes)

Alternatively, you can set the [required variables](#required-variables) to explicitly use your vision deployment, but this may limit you to exclusively using your vision deployment for all Azure chat settings.

As of December 18th, 2023, Vision models seem to have degraded performance with Azure OpenAI when compared to [OpenAI](#openai)

![image](https://github.com/danny-avila/LibreChat/assets/110412045/7306185f-c32c-4483-9167-af514cc1c2dd)


*Note: a change will be developed to improve current configuration settings, to allow multiple deployments/model configurations setup with ease: [#1390](https://github.com/danny-avila/LibreChat/issues/1390)*

### Optional Variables

*These variables are currently not used by LibreChat*

* `AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME`: The deployment name for completion. This is currently not in use but may be used in future.
* `AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME`: The deployment name for embedding. This is currently not in use but may be used in future.

These two variables are optional but may be used in future updates of this project.

### Using Plugins with Azure

Note: To use the Plugins endpoint with Azure OpenAI, you need a deployment supporting [function calling](https://techcommunity.microsoft.com/t5/azure-ai-services-blog/function-calling-is-now-available-in-azure-openai-service/ba-p/3879241). Otherwise, you need to set "Functions" off in the Agent settings. When you are not using "functions" mode, it's recommend to have "skip completion" off as well, which is a review step of what the agent generated.

To use Azure with the Plugins endpoint, make sure the following environment variables are set:

* `PLUGINS_USE_AZURE`: If set to "true" or any truthy value, this will enable the program to use Azure with the Plugins endpoint.
* `AZURE_API_KEY`: Your Azure API key must be set with an environment variable.

---

## Unofficial APIs

**Important:** Stability for Unofficial APIs are not guaranteed. Access methods to these APIs are hacky, prone to errors, and patching, and are marked lowest in priority in LibreChat's development.

### ChatGPTBrowser

**Backend Access to https://chat.openai.com/api**

This is not to be confused with [OpenAI's Official API](#openai)!

> Note that this is disabled by default and requires additional configuration to work. 
> Also, using this may have your data exposed to 3rd parties if using a proxy, and OpenAI may flag your account.
> See: [ChatGPT Reverse Proxy](../features/pandoranext.md)

To get your Access token for ChatGPT Browser Access, you need to:

- Go to [https://chat.openai.com](https://chat.openai.com)
- Create an account or log in with your existing one
- Visit [https://chat.openai.com/api/auth/session](https://chat.openai.com/api/auth/session)
- Copy the value of the "accessToken" field and save it in ./.env as CHATGPT_ACCESS_TOKEN

Warning: There may be a chance of your account being banned if you deploy the app to multiple users with this method. Use at your own risk. 😱

---

### BingAI

To get your Bing Access Token, you have a few options:

- You can try leaving it blank and see if it works (fingers crossed 🤞)

- You can follow these [new instructions](https://github.com/danny-avila/LibreChat/issues/370#issuecomment-1560382302) (thanks @danny-avila for sharing 🙌)

- You can use MS Edge, navigate to bing.com, and do the following:
  - Make sure you are logged in
  - Open the DevTools by pressing F12 on your keyboard
  - Click on the tab "Application" (On the left of the DevTools)
  - Expand the "Cookies" (Under "Storage")
  - Copy the value of the "\_U" cookie and save it in ./.env as BING_ACCESS_TOKEN

---

## Conclusion

<h3>That's it! You're all set. 🎉</h3>

---

>⚠️ Note: If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.

