---
title: 🅰️ Azure OpenAI
description: Comprehensive guide for configuring Azure OpenAI through the `librechat.yaml` file AKA the LibreChat Config file. This document is your one-stop resource for understanding and customizing Azure settings and models.
weight: -10
---

# Azure OpenAI

**Azure OpenAI Integration for LibreChat**

LibreChat boasts compatibility with Azure OpenAI API services, treating the endpoint as a first-class citizen. To properly utilize Azure OpenAI within LibreChat, it's crucial to configure the [`librechat.yaml` file](./custom_config.md#azure-openai-object-structure) according to your specific needs. This document guides you through the essential setup process which allows seamless use of multiple deployments and models with as much flexibility as needed.

## Setup

1. **Open `librechat.yaml` for Editing**: Use your preferred text editor or IDE to open and edit the `librechat.yaml` file.

2. **Configure Azure OpenAI Settings**: Follow the detailed structure outlined below to populate your Azure OpenAI settings appropriately. This includes specifying API keys, instance names, model groups, and other essential configurations.

3. **Save Your Changes**: After accurately inputting your settings, save the `librechat.yaml` file.

4. **Restart LibreChat**: For the changes to take effect, restart your LibreChat application. This ensures that the updated configurations are loaded and utilized.

Here's a working example configured according to the specifications of the [Azure OpenAI Endpoint Configuration Docs:](./custom_config.md#azure-openai-object-structure)

## Required Fields

To properly integrate Azure OpenAI with LibreChat, specific fields must be accurately configured in your `librechat.yaml` file. These fields are validated through a combination of custom and environmental variables to ensure the correct setup. Here are the detailed requirements based on the validation process:

### Group-Level Configuration

This is a breakdown of the fields configurable as defined for the Custom Config (`librechat.yaml`) file. For more information on each field, see the [Azure OpenAI section in the Custom Config Docs](./custom_config.md#azure-openai-object-structure).

1. **group** (String, Required): Unique identifier name for a group of models. Duplicate group names are not allowed and will result in validation errors.
   
2. **apiKey** (String, Required): Must be a valid API key for Azure OpenAI services. It could be a direct key string or an environment variable reference (e.g., `${WESTUS_API_KEY}`).

3. **instanceName** (String, Required): Name of the Azure OpenAI instance. This field can also support environment variable references.

4. **deploymentName** (String, Optional): The deployment name at the group level is optional but required if any model within the group is set to `true`.

5. **version** (String, Optional): The version of the Azure OpenAI service at the group level is optional but required if any model within the group is set to `true`.

6. **baseURL** (String, Optional): Custom base URL for the Azure OpenAI API requests. Environment variable references are supported. This is optional and can be used for advanced routing scenarios.

7. **additionalHeaders** (Object, Optional): Specifies any extra headers for Azure OpenAI API requests as key-value pairs. Environment variable references can be included as values.

8. **serverless** (Boolean, Optional): Specifies if the group is a serverless inference chat completions endpoint from [Azure Model Catalog,](https://ai.azure.com/explore) for which only a model identifier, baseURL, and apiKey are needed. For more info, see [serverless inference endpoints.](#serverless-inference-endpoints)

9. **addParams** (Object, Optional): Adds or overrides additional parameters for Azure OpenAI API requests. Useful for specifying API-specific options as key-value pairs.

10. **dropParams** (Array/List, Optional): Allows for the exclusion of certain default parameters from Azure OpenAI API requests. Useful for APIs that do not accept or recognize specific parameters. This should be specified as a list of strings.

11. **forcePrompt** (Boolean, Optional): Dictates whether to send a `prompt` parameter instead of `messages` in the request body. This option is useful when needing to format the request in a manner consistent with OpenAI's API expectations, particularly for scenarios preferring a single text payload.

### Model-Level Configuration

Within each group, the `models` field must contain a mapping of records, or model identifiers to either boolean values or object configurations.

- The key or model identifier must match its corresponding OpenAI model name in order for it to properly reflect its known context limits and/or function in the case of vision. For example, if you intend to use gpt-4-vision, it must be configured like so:

```yaml
models:
  # Object setting: must include at least "deploymentName" and/or "version"
  gpt-4-vision-preview: # Must match OpenAI Model name
    deploymentName: "arbitrary-deployment-name"
    version: "2024-02-15-preview" # version can be any that supports vision
  # Boolean setting, must be "true"
  gpt-4-turbo: true
```

- See [Model Deployments](#model-deployments) for more examples.

- If a model is set to `true`, it implies using the group-level `deploymentName` and `version` for this model. Both must be defined at the group level in this case.
  
- If a model is configured as an object, it can specify its own `deploymentName` and `version`. If these are not provided, the model inherits the group's `deploymentName` and `version`.

- If the group represents a [serverless inference endpoint](#serverless-inference-endpoints), the singular model should be set to `true` to add it to the models list.

### Special Considerations

1. **Unique Names**: Both model and group names must be unique across the entire configuration. Duplicate names lead to validation failures.

2. **Missing Required Fields**: Lack of required `deploymentName` or `version` either at the group level (for boolean-flagged models) or within the models' configurations (if not inheriting or explicitly specified) will result in validation errors, unless the group represents a [serverless inference endpoint](#serverless-inference-endpoints).

3. **Environment Variable References**: The configuration supports environment variable references (e.g., `${VARIABLE_NAME}`). Ensure that all referenced variables are present in your environment to avoid runtime errors. The absence of defined environment variables referenced in the config will cause errors.`${INSTANCE_NAME}` and `${DEPLOYMENT_NAME}` are unique placeholders, and do not correspond to environment variables, but instead correspond to the instance and deployment name of the currently selected model. It is not recommended you use `INSTANCE_NAME` and `DEPLOYMENT_NAME` as environment variable names to avoid any potential conflicts.

4. **Error Handling**: Any issues in the config, like duplicate names, undefined environment variables, or missing required fields, will invalidate the setup and generate descriptive error messages aiming for prompt resolution. You will not be allowed to run the server with an invalid configuration.

5. **Model identifiers**: An unknown model (to the project) can be used as a model identifier, but it must match a known model to reflect its known context length, which is crucial for message/token handling; e.g., `gpt-7000` will be valid but default to a 4k token limit, whereas `gpt-4-turbo` will be recognized as having a 128k context limit.

Applying these setup requirements thoughtfully will ensure a correct and efficient integration of Azure OpenAI services with LibreChat through the `librechat.yaml` configuration. Always validate your configuration against the latest schema definitions and guidelines to maintain compatibility and functionality.


### Model Deployments

The list of models available to your users are determined by the model groupings specified in your [`azureOpenAI` endpoint config.](./custom_config.md#models-1)

For example:

```yaml
# Example Azure OpenAI Object Structure
endpoints:
  azureOpenAI:
    groups:
      - group: "my-westus" # arbitrary name
        apiKey: "${WESTUS_API_KEY}"
        instanceName: "actual-instance-name" # name of the resource group or instance
        version: "2023-12-01-preview"
        models:
          gpt-4-vision-preview:
            deploymentName: gpt-4-vision-preview
            version: "2024-02-15-preview"
          gpt-3.5-turbo: true
      - group: "my-eastus"
        apiKey: "${EASTUS_API_KEY}"
        instanceName: "actual-eastus-instance-name"
        deploymentName: gpt-4-turbo
        version: "2024-02-15-preview"
        models:
          gpt-4-turbo: true
```

The above configuration would enable `gpt-4-vision-preview`, `gpt-3.5-turbo` and `gpt-4-turbo` for your users in the order they were defined.

### Using Plugins with Azure

To use the Plugins endpoint with Azure OpenAI, you need a deployment supporting **[function calling](https://techcommunity.microsoft.com/t5/azure-ai-services-blog/function-calling-is-now-available-in-azure-openai-service/ba-p/3879241)**. Otherwise, you need to set "Functions" off in the Agent settings. When you are not using "functions" mode, it's recommend to have "skip completion" off as well, which is a review step of what the agent generated.

To use Azure with the Plugins endpoint, make sure the field `plugins` is set to `true` in your Azure OpenAI endpoing config:

```yaml
# Example Azure OpenAI Object Structure
endpoints:
  azureOpenAI:
    plugins: true # <------- Set this
    groups:
    # omitted for brevity
```

Configuring the `plugins` field will configure Plugins to use Azure models.

**NOTE**: The current configuration through `librechat.yaml` uses the primary model you select from the frontend for Plugin use, which is not usually how it works without Azure, where instead the "Agent" model is used. The Agent model setting can be ignored when using Plugins through Azure.

### Using a Specified Base URL with Azure

The base URL for Azure OpenAI API requests can be dynamically configured. This is useful for proxying services such as [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/providers/azureopenai/), or if you wish to explicitly override the baseURL handling of the app.

LibreChat will use the baseURL field for your Azure model grouping, which can include placeholders for the Azure OpenAI API instance and deployment names.

In the configuration, the base URL can be customized like so:

```yaml
# librechat.yaml file, under an Azure group:
endpoints:
  azureOpenAI:
    groups:
      - group: "group-with-custom-base-url"
      baseURL: "https://example.azure-api.net/${INSTANCE_NAME}/${DEPLOYMENT_NAME}"

# OR
      baseURL: "https://${INSTANCE_NAME}.openai.azure.com/openai/deployments/${DEPLOYMENT_NAME}"

# Cloudflare example
      baseURL: "https://gateway.ai.cloudflare.com/v1/ACCOUNT_TAG/GATEWAY/azure-openai/${INSTANCE_NAME}/${DEPLOYMENT_NAME}"
```

**NOTE**: `${INSTANCE_NAME}` and `${DEPLOYMENT_NAME}` are unique placeholders, and do not correspond to environment variables, but instead correspond to the instance and deployment name of the currently selected model. It is not recommended you use INSTANCE_NAME and DEPLOYMENT_NAME as environment variable names to avoid any potential conflicts.

**You can also omit the placeholders completely and simply construct the baseURL with your credentials:**

```yaml
      baseURL: "https://gateway.ai.cloudflare.com/v1/ACCOUNT_TAG/GATEWAY/azure-openai/my-secret-instance/my-deployment"
```
**Lastly, you can specify the entire baseURL through a custom environment variable**

```yaml
      baseURL: "${MY_CUSTOM_BASEURL}"
```


### Enabling Auto-Generated Titles with Azure

To enable titling for Azure, set `titleConvo` to `true`.

```yaml
# Example Azure OpenAI Object Structure
endpoints:
  azureOpenAI:
    titleConvo: true # <------- Set this
    groups:
    # omitted for brevity
```

**You can also specify the model to use for titling, with `titleModel`** provided you have configured it in your group(s).

```yaml
    titleModel: "gpt-3.5-turbo"
```

**Note**: "gpt-3.5-turbo" is the default value, so you can omit it if you want to use this exact model and have it configured. If not configured and `titleConvo` is set to `true`, the titling process will result in an error and no title will be generated.


### Using GPT-4 Vision with Azure

To use Vision (image analysis) with Azure OpenAI, you need to make sure `gpt-4-vision-preview` is a specified model [in one of your groupings](#model-deployments)

This will work seamlessly as it does with the [OpenAI endpoint](#openai) (no need to select the vision model, it will be switched behind the scenes)

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

### Serverless Inference Endpoints

Through the `librechat.yaml` file, you can configure Azure AI Studio serverless inference endpoints to access models from the [Azure Model Catalog.](https://ai.azure.com/explore) Only a model identifier, `baseURL`, and `apiKey` are needed along with the `serverless` field to indicate the special handling these endpoints need.

- You will need to follow the instructions in the compatible model cards to set up **MaaS** ("Models as a Service") access on Azure AI Studio.

    - For reference, here are 2 known compatible model cards:

    - [Mistral-large](https://aka.ms/aistudio/landing/mistral-large) | [Llama-2-70b-chat](https://aka.ms/aistudio/landing/Llama-2-70b-chat)

- You can also review [the technical blog for the "Mistral-large" model release](https://techcommunity.microsoft.com/t5/ai-machine-learning-blog/mistral-large-mistral-ai-s-flagship-llm-debuts-on-azure-ai/ba-p/4066996) for more info.

- Then, you will need to add them to your azureOpenAI config in the librechat.yaml file.

- Here are my example configurations for both Mistral-large and LLama-2-70b-chat:

```yaml
endpoints:
  azureOpenAI:
    groups:
# serverless examples
    - group: "mistral-inference"
      apiKey: "${AZURE_MISTRAL_API_KEY}" # arbitrary env var name
      baseURL: "https://Mistral-large-vnpet-serverless.region.inference.ai.azure.com/v1/chat/completions"
      serverless: true
      models:
        mistral-large: true
    - group: "llama-70b-chat"
      apiKey: "${AZURE_LLAMA2_70B_API_KEY}" # arbitrary env var name
      baseURL: "https://Llama-2-70b-chat-qmvyb-serverless.region.inference.ai.azure.com/v1/chat/completions"
      serverless: true
      models:
        llama-70b-chat: true
```

**Notes**:

- Make sure to add the appropriate suffix for your deployment, either "/v1/chat/completions" or "/v1/completions"
- If using "/v1/completions" (without "chat"), you need to set the `forcePrompt` field to `true` in your [group config.](#group-level-configuration)
- Compatibility with LibreChat relies on parity with OpenAI API specs, which at the time of writing, are typically **"Pay-as-you-go"** or "Models as a Service" (MaaS) deployments on Azure AI Studio, that are OpenAI-SDK-compatible with either v1/completions or v1/chat/completions endpoint handling.
- At the moment, only ["Mistral-large"](https://azure.microsoft.com/en-us/blog/microsoft-and-mistral-ai-announce-new-partnership-to-accelerate-ai-innovation-and-introduce-mistral-large-first-on-azure/) and [LLama-2 Chat models](https://techcommunity.microsoft.com/t5/ai-machine-learning-blog/announcing-llama-2-inference-apis-and-hosted-fine-tuning-through/ba-p/3979227) are compatible from the Azure model catalog. You can filter by "Chat completion" under inference tasks to see the full list; however, real time endpoint models have not been tested.
- These serverless inference endpoint/models are likely not compatible with OpenAI function calling, which enables the use of Plugins. As they have yet been tested, they are available on the Plugins endpoint, although they are not expected to work.


---

## ⚠️ Legacy Setup ⚠️

---

**Note:** The legacy instructions may be used for a simple setup but they are no longer recommended as of v0.7.0 and may break in future versions. This was done to improve upon legacy configuration settings, to allow multiple deployments/model configurations setup with ease: **[#1390](https://github.com/danny-avila/LibreChat/issues/1390)**

**Use the recommended [Setup](#setup) in the section above.**

**Required Variables (legacy)**

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

Overriding the construction of the API URL is possible as of implementing **[Issue #1266](https://github.com/danny-avila/LibreChat/issues/1266)**

**Model Deployments (legacy)**

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

**Setting a Default Model for Azure (legacy)**

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

**Using a Specified Base URL with Azure (legacy)**

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

**Enabling Auto-Generated Titles with Azure (legacy)**

The default titling model is set to `gpt-3.5-turbo`.

If you're using `AZURE_USE_MODEL_AS_DEPLOYMENT_NAME` and have "gpt-35-turbo" setup as a deployment name, this should work out-of-the-box.

In any case, you can adjust the title model as such: `OPENAI_TITLE_MODEL=your-title-model`

**Using GPT-4 Vision with Azure (legacy)**

Currently, the best way to setup Vision is to use your deployment names as the model names, as [shown here](#model-deployments)

This will work seamlessly as it does with the [OpenAI endpoint](#openai) (no need to select the vision model, it will be switched behind the scenes)

Alternatively, you can set the [required variables](#required-variables) to explicitly use your vision deployment, but this may limit you to exclusively using your vision deployment for all Azure chat settings.


**Notes:**

- If using `AZURE_OPENAI_BASEURL`, you should not specify instance and deployment names instead of placeholders as the vision request will fail.
- As of December 18th, 2023, Vision models seem to have degraded performance with Azure OpenAI when compared to [OpenAI](#openai)

![image](https://github.com/danny-avila/LibreChat/assets/110412045/7306185f-c32c-4483-9167-af514cc1c2dd)


> Note: a change will be developed to improve current configuration settings, to allow multiple deployments/model configurations setup with ease: **[#1390](https://github.com/danny-avila/LibreChat/issues/1390)**

**Optional Variables (legacy)**

*These variables are currently not used by LibreChat*

* `AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME`: The deployment name for completion. This is currently not in use but may be used in future.
* `AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME`: The deployment name for embedding. This is currently not in use but may be used in future.

These two variables are optional but may be used in future updates of this project.

**Using Plugins with Azure**

Note: To use the Plugins endpoint with Azure OpenAI, you need a deployment supporting **[function calling](https://techcommunity.microsoft.com/t5/azure-ai-services-blog/function-calling-is-now-available-in-azure-openai-service/ba-p/3879241)**. Otherwise, you need to set "Functions" off in the Agent settings. When you are not using "functions" mode, it's recommend to have "skip completion" off as well, which is a review step of what the agent generated.

To use Azure with the Plugins endpoint, make sure the following environment variables are set:

* `PLUGINS_USE_AZURE`: If set to "true" or any truthy value, this will enable the program to use Azure with the Plugins endpoint.
* `AZURE_API_KEY`: Your Azure API key must be set with an environment variable.

**Important:**

- If using `AZURE_OPENAI_BASEURL`, you should not specify instance and deployment names instead of placeholders as the plugin request will fail.

**Generate images with Azure OpenAI Service (DALL-E)**

See the [current Azure DALL-E guide](#generate-images-with-azure-openai-service-dall-e) as it applies to legacy configurations