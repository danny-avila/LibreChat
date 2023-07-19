# How to setup various tokens and APIs for the project

This doc explains how to setup various tokens and APIs for the project. You will need some of these tokens and APIs to run the app and use its features. You must set up at least one of these tokens or APIs to run the app.

## OpenAI API key

To get your OpenAI API key, you need to:

- Go to [https://platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)
- Create an account or log in with your existing one
- Add a payment method to your account (this is not free, sorry 😬)
- Copy your secret key (sk-...) and save it in ./.env as OPENAI_API_KEY

## ChatGPT Free Access token

To get your Access token for ChatGPT 'Free Version', you need to:

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

## Google's PaLM 2

To setup PaLM 2 (via Google Cloud Vertex AI API), you need to:

### Enable the Vertex AI API on Google Cloud:
  - Go to [https://console.cloud.google.com/vertex-ai](https://console.cloud.google.com/vertex-ai)
  - Click on "Enable API" if prompted
### Create a Service Account:
  - Go to [https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts/create?walkthrough_id=iam--create-service-account#step_index=1](https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts/create?walkthrough_id=iam--create-service-account#step_index=1)
  - Select or create a project
  - Enter a service account name and description
  - Click on "Create and Continue" to give at least the "Vertex AI User" role
  - Click on "Done"
### Create a JSON key, rename as 'auth.json' and save it in /api/data/:
  - Go back to [https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts](https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts)
  - Select your service account
  - Click on "Keys"
  - Click on "Add Key" and then "Create new key"
  - Choose JSON as the key type and click on "Create"
  - Download the key file and rename it as 'auth.json'
  - Save it in `/api/data/`

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

### Optional Variables

* `AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME`: The deployment name for completion. This is currently not in use but may be used in future.
* `AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME`: The deployment name for embedding. This is currently not in use but may be used in future.

These two variables are optional but may be used in future updates of this project.

### Plugin Endpoint Variables

Note: The Plugins endpoint may not work as expected with Azure OpenAI, which may not support OpenAI Functions yet. Even when results were generated, they were not great compared to the regular OpenAI endpoint. You should set the "Functions" off in the Agent settings, and it's recommend to not skip completion with functions off.

To use Azure with the Plugins endpoint, there are some extra steps to take as the langchain library is particular with envrionment variables:

* `PLUGINS_USE_AZURE`: If set to "true" or any truthy value, this will enable the program to use Azure with the Plugins endpoint. 
* `AZURE_OPENAI_API_KEY`: Your Azure API key must be set to this environment variable, not to be confused with `AZURE_API_KEY`, which can remain as before.
* `OPENAI_API_KEY`: Must be omitted or commented to use Azure with Plugins

These steps are quick workarounds as other solutions would require renaming environment variables. This is due to langchain overriding environment variables, and will have to be solved with a later solution.


## That's it! You're all set. 🎉

---

### Note: If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.

