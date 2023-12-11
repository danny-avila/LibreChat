# How to setup various tokens and APIs for the project

This doc explains how to setup various tokens and APIs for the project. You will need some of these tokens and APIs to run the app and use its features. You must set up at least one of these tokens or APIs to run the app.

## OpenAI API key

To get your OpenAI API key, you need to:

- Go to [https://platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)
- Create an account or log in with your existing one
- Add a payment method to your account (this is not free, sorry 😬)
- Copy your secret key (sk-...) and save it in ./.env as OPENAI_API_KEY

## ChatGPT Free Access token

> Note that this is disabled by default and requires additional configuration to work. 
> See: [ChatGPT Reverse Proxy](../features/pandoranext.md)

To get your Access token for ChatGPT 'Web Version', you need to:

- Go to [https://chat.openai.com](https://chat.openai.com)
- Create an account or log in with your existing one
- Visit [https://chat.openai.com/api/auth/session](https://chat.openai.com/api/auth/session)
- Copy the value of the "accessToken" field and save it in ./.env as CHATGPT_ACCESS_TOKEN

Warning: There may be a chance of your account being banned if you deploy the app to multiple users with this method. Use at your own risk. 😱

## Bing Access Token

To get your Bing Access Token, you have a few options:

- You can try leaving it blank and see if it works (fingers crossed 🤞)

- You can follow these [new instructions](https://github.com/danny-avila/LibreChat/issues/370#issuecomment-1560382302) (thanks @danny-avila for sharing 🙌)

- You can use MS Edge, navigate to bing.com, and do the following:
  - Make sure you are logged in
  - Open the DevTools by pressing F12 on your keyboard
  - Click on the tab "Application" (On the left of the DevTools)
  - Expand the "Cookies" (Under "Storage")
  - Copy the value of the "\_U" cookie and save it in ./.env as BING_ACCESS_TOKEN

## Anthropic Endpoint (Claude)

- Create an account at [https://console.anthropic.com/](https://console.anthropic.com/)
- Go to [https://console.anthropic.com/account/keys](https://console.anthropic.com/account/keys) and get your api key
- add it to `ANTHROPIC_API_KEY=` in the `.env` file

## Google LLMs

To setup Google LLMs (via Google Cloud Vertex AI), first, signup for Google Cloud: https://cloud.google.com/

You can usually get $300 starting credit, which makes this option free for 90 days. 

### Once signed up, Enable the Vertex AI API on Google Cloud:
  - Go to [Vertex AI page on Google Cloud console](https://console.cloud.google.com/vertex-ai)
  - Click on "Enable API" if prompted
### Create a Service Account with Vertex AI role:
  - **[Click here to create a Service Account](https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts/create?walkthrough_id=iam--create-service-account#step_index=1)**
  - **Select or create a project**
  - ### Enter a service account ID (required), name and description are optional
      - ![image](https://github.com/danny-avila/LibreChat/assets/110412045/0c5cd177-029b-44fa-a398-a794aeb09de6)
  - ### Click on "Create and Continue" to give at least the "Vertex AI User" role
      - ![image](https://github.com/danny-avila/LibreChat/assets/110412045/22d3a080-e71e-446e-8485-bcc5bf558dbb)
  - **Click on "Continue/Done"**
### Create a JSON key to Save in Project Directory:
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


## Azure OpenAI

In order to use Azure OpenAI with this project, specific environment variables must be set in your `.env` file. These variables will be used for constructing the API URLs. 

The variables needed are outlined below:

### Required Variables

* `AZURE_API_KEY`: Your Azure OpenAI API key.
* `AZURE_OPENAI_API_INSTANCE_NAME`: The instance name of your Azure OpenAI API.
* `AZURE_OPENAI_API_DEPLOYMENT_NAME`: The deployment name of your Azure OpenAI API. 
* `AZURE_OPENAI_API_VERSION`: The version of your Azure OpenAI API.

For example, with these variables, the URL for chat completion would look something like:
```plaintext
https://{AZURE_OPENAI_API_INSTANCE_NAME}.openai.azure.com/openai/deployments/{AZURE_OPENAI_API_DEPLOYMENT_NAME}/chat/completions?api-version={AZURE_OPENAI_API_VERSION}
```
You should also consider changing the `AZURE_OPENAI_MODELS` variable to the models available in your deployment.

#### Additional Configuration Notes

- **Endpoint Construction**: The provided variables help customize the construction of the API URL for Azure.

- **Model Deployment Naming**: As of 2023-11-10, the Azure API allows only one model per deployment. It's advisable to name your deployments after the model name (e.g., "gpt-3.5-turbo") for easy deployment switching. This is facilitated by setting `AZURE_USE_MODEL_AS_DEPLOYMENT_NAME` to `TRUE`.

Alternatively, use custom deployment names and set `AZURE_OPENAI_DEFAULT_MODEL` for expected functionality.

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

Note: Azure API does not use the `model` in the payload and is more of an identifying field for the LibreChat App. If using non-model deployment names, but you're having issues with the model not being recognized, you should set this field. It will also not be used as the deployment name if AZURE_USE_MODEL_AS_DEPLOYMENT_NAME is enabled, which will prioritize what the user selects as the model.

- **`AZURE_OPENAI_DEFAULT_MODEL`**: Override the model setting for Azure, useful if using custom deployment names.

Example use:

```bash
# .env file
AZURE_OPENAI_DEFAULT_MODEL=gpt-3.5-turbo # do include periods in the model name here

```

### Optional Variables

* `AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME`: The deployment name for completion. This is currently not in use but may be used in future.
* `AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME`: The deployment name for embedding. This is currently not in use but may be used in future.

These two variables are optional but may be used in future updates of this project.

### Using Plugins with Azure

Note: To use the Plugins endpoint with Azure OpenAI, you need a deployment supporting [function calling](https://techcommunity.microsoft.com/t5/azure-ai-services-blog/function-calling-is-now-available-in-azure-openai-service/ba-p/3879241). Otherwise, you need to set "Functions" off in the Agent settings. When you are not using "functions" mode, it's recommend to have "skip completion" off as well, which is a review step of what the agent generated.

To use Azure with the Plugins endpoint, make sure the following environment variables are set:

* `PLUGINS_USE_AZURE`: If set to "true" or any truthy value, this will enable the program to use Azure with the Plugins endpoint.
* `AZURE_API_KEY`: Your Azure API key must be set with an environment variable.

## That's it! You're all set. 🎉

---
 ## [Free AI APIs](free_ai_apis.md)

---

>⚠️ Note: If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.

