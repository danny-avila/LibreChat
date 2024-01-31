---
title: 🖥️ Custom Endpoints & Config
description: Comprehensive guide for configuring the `librechat.yaml` file AKA the LibreChat Config file. This document is your one-stop resource for understanding and customizing endpoints & other integrations.
weight: -10
---

<!-- # Table of Contents

 - [Intro](#librechat-configuration-guide)
    - [Setup](#setup)
    - [Docker Setup](#docker-setup)
    - [Config Structure](#config-structure)
        - [1. Version](#1-version)
        - [2. Cache Settings](#2-cache-settings)
        - [3. Endpoints](#3-endpoints)
            - [Endpoint Object Structure](#endpoint-object-structure)
    - [Additional Notes](#additional-notes)
    - [Default Parameters](#default-parameters)
        - [Breakdown of Default Params](#breakdown-of-default-params)
    - [Example Config](#example-config) -->

# LibreChat Configuration Guide

Welcome to the guide for configuring the **librechat.yaml** file in LibreChat.

This file enables the integration of custom AI endpoints, enabling you to connect with any AI provider compliant with OpenAI API standards.

This includes providers like [Mistral AI](https://docs.mistral.ai/platform/client/), as well as reverse proxies that facilitate access to OpenAI servers, adding them alongside existing endpoints like Anthropic.

![image](https://github.com/danny-avila/LibreChat/assets/110412045/fd0d2307-008f-4e1d-b75b-4f141070ce71)

Future updates will streamline configuration further by migrating some settings from [your `.env` file](./dotenv.md) to `librechat.yaml`.

Stay tuned for ongoing enhancements to customize your LibreChat instance!

<!-- # Table of Contents

- [LibreChat Configuration Guide](#librechat-configuration-guide)
- [Table of Contents](#table-of-contents)
  - [Setup](#setup)
  - [Docker Setup](#docker-setup)
  - [Config Structure](#config-structure)
    - [Version](#version)
    - [Cache Settings](#cache-settings)
    - [File Strategy](#file-strategy)
    - [Endpoints](#endpoints)
  - [Endpoint Object Structure](#endpoint-object-structure)
    - [**name**:](#name)
    - [**apiKey**:](#apikey)
    - [**baseURL**:](#baseurl)
    - [**iconURL**:](#iconurl)
    - [**models**:](#models)
    - [**titleConvo**:](#titleconvo)
    - [**titleMethod**:](#titlemethod)
    - [**titleModel**:](#titlemodel)
    - [**summarize**:](#summarize)
    - [**summaryModel**:](#summarymodel)
    - [**forcePrompt**:](#forceprompt)
    - [**modelDisplayLabel**:](#modeldisplaylabel)
    - [**addParams**:](#addparams)
    - [**dropParams**:](#dropparams)
    - [**headers**:](#headers)
  - [Additional Notes](#additional-notes)
  - [Default Parameters](#default-parameters)
    - [Breakdown of Default Params](#breakdown-of-default-params)
  - [Example Config](#example-config) -->

## Setup

**The `librechat.yaml` file should be placed in the root of the project where the .env file is located.**

You can copy the [example config file](#example-config) as a good starting point while reading the rest of the guide.

The example config file has some options ready to go for Mistral AI and Openrouter.

## Docker Setup

For Docker, you need to make use of an [override file](./docker_override.md), named `docker-compose.override.yml`, to ensure the config file works for you.

- First, make sure your containers stop running with `docker-compose down`
- Create or edit existing `docker-compose.override.yml` at the root of the project:

```yaml
# For more details on the override file, see the Docker Override Guide:
# https://docs.librechat.ai/install/configuration/docker_override.html

version: '3.4'

services:
  api:
    volumes:
      - ./librechat.yaml:/app/librechat.yaml
```

- Start docker again, and you should see your config file settings apply
```bash
docker-compose up # no need to rebuild
```

## Config Structure

**Note:** Fields not specifically mentioned as required are optional.

### Version
- **Key**: `version`
- **Type**: String
- **Description**: Specifies the version of the configuration file.
- **Example**: `version: 1.0.1`
- **Required**

### Cache Settings
- **Key**: `cache`
- **Type**: Boolean
- **Description**: Toggles caching on or off. Set to `true` to enable caching.
- **Example**: `cache: true`

### File Strategy
- **Key**: `fileStrategy`
- **Type**: String = "local" | ["firebase"](../../features/firebase.md)
- **Description**: Determines where to save user uploaded/generated files. Defaults to `"local"` if omitted.
- **Example**: `fileStrategy: "firebase"`

### Endpoints
- **Key**: `endpoints`
- **Type**: Object
- **Description**: Defines custom API endpoints for the application.
  - **Sub-Key**: `custom`
  - **Type**: Array of Objects
  - **Description**: Each object in the array represents a unique endpoint configuration.
- **Required**

## Endpoint Object Structure
Each endpoint in the `custom` array should have the following structure:

```yaml
# Example Endpoint Object Structure
endpoints:
  custom:
      # Example using Mistral AI API
    - name: "Mistral"
      apiKey: "${YOUR_ENV_VAR_KEY}"
      baseURL: "https://api.mistral.ai/v1"
      models: 
        default: ["mistral-tiny", "mistral-small", "mistral-medium"]
      titleConvo: true
      titleModel: "mistral-tiny" 
      summarize: false
      summaryModel: "mistral-tiny" 
      forcePrompt: false 
      modelDisplayLabel: "Mistral"
      addParams:
        safe_prompt: true
      # NOTE: For Mistral, it is necessary to drop the following parameters or you will encounter a 422 Error:
      dropParams: ["stop", "user", "frequency_penalty", "presence_penalty"]
```

### **name**:

  > A unique name for the endpoint.

  - Type: String
  - Example: `name: "Mistral"`
  - **Required**
  - **Note**: Will be used as the "title" in the Endpoints Selector

### **apiKey**: 

  > Your API key for the service. Can reference an environment variable, or allow user to provide the value.

  - Type: String (apiKey | `"user_provided"`)
  - Example: `apiKey: "${MISTRAL_API_KEY}"` | `apiKey: "your_api_key"` | `apiKey: "user_provided"`
  - **Required**
  - **Note**: It's highly recommended to use the env. variable reference for this field, i.e. `${YOUR_VARIABLE}`

### **baseURL**: 

  > Base URL for the API. Can reference an environment variable, or allow user to provide the value.

  - Type: String (baseURL | `"user_provided"`)
  - Example: `baseURL: "https://api.mistral.ai/v1"` | `baseURL: "${MISTRAL_BASE_URL}"` | `baseURL: "user_provided"`
  - **Required**
  - **Note**: It's highly recommended to use the env. variable reference for this field, i.e. `${YOUR_VARIABLE}`

### **iconURL**:

  > The URL to use as the Endpoint Icon.

  - Type: Boolean
  - Example: `iconURL: https://github.com/danny-avila/LibreChat/raw/main/docs/assets/LibreChat.svg`
  - **Note**: The following are "known endpoints" (case-insensitive), which have icons provided for them. If your endpoint `name` matches the following names, you should omit this field:
    - "Mistral"
    - "OpenRouter"

### **models**:

  > Configuration for models.

  - **Required**
  - **default**: An array of strings indicating the default models to use. At least one value is required.
    - Type: Array of Strings
    - Example: `default: ["mistral-tiny", "mistral-small", "mistral-medium"]`
    - **Note**: If fetching models fails, these defaults are used as a fallback.
  - **fetch**: When set to `true`, attempts to fetch a list of models from the API.
    - Type: Boolean
    - Example: `fetch: true`
    - **Note**: May cause slowdowns during initial use of the app if the response is delayed. Defaults to `false`.

### **titleConvo**:

  > Enables title conversation when set to `true`.

  - Type: Boolean
  - Example: `titleConvo: true`

### **titleMethod**: 

  > Chooses between "completion" or "functions" for title method.

  - Type: String (`"completion"` | `"functions"`)
  - Example: `titleMethod: "completion"`
  - **Note**: Defaults to "completion" if omitted.

### **titleModel**: 

  > Specifies the model to use for titles.

  - Type: String
  - Example: `titleModel: "mistral-tiny"`
  - **Note**: Defaults to "gpt-3.5-turbo" if omitted. May cause issues if "gpt-3.5-turbo" is not available.

### **summarize**: 

  > Enables summarization when set to `true`.

  - Type: Boolean
  - Example: `summarize: false`
  - **Note**: This feature requires an OpenAI Functions compatible API

### **summaryModel**:

  > Specifies the model to use if summarization is enabled.

  - Type: String
  - Example: `summaryModel: "mistral-tiny"`
  - **Note**: Defaults to "gpt-3.5-turbo" if omitted. May cause issues if "gpt-3.5-turbo" is not available.

### **forcePrompt**:

  > If `true`, sends a `prompt` parameter instead of `messages`.

  - Type: Boolean
  - Example: `forcePrompt: false`
  - **Note**: This combines all messages into a single text payload, [following OpenAI format](https://github.com/pvicente/openai-python/blob/main/chatml.md), and

 uses the `/completions` endpoint of your baseURL rather than `/chat/completions`.

### **modelDisplayLabel**:

  > The label displayed in messages next to the Icon for the current AI model.

  - Type: String
  - Example: `modelDisplayLabel: "Mistral"`
  - **Note**: The display order is:
    - 1. Custom name set via preset (if available) 
    - 2. Label derived from the model name (if applicable)
    - 3. This value, `modelDisplayLabel`, is used if the above are not specified. Defaults to "AI".

### **addParams**:

  > Adds additional parameters to requests.

  - Type: Object/Dictionary
  - **Description**: Adds/Overrides parameters. Useful for specifying API-specific options.
  - **Example**: 
```yaml
    addParams:
      safe_prompt: true
```

### **dropParams**:

  > Removes [default parameters](#default-parameters) from requests.

  - Type: Array/List of Strings
  - **Description**: Excludes specified [default parameters](#default-parameters). Useful for APIs that do not accept or recognize certain parameters.
  - **Example**: `dropParams: ["stop", "user", "frequency_penalty", "presence_penalty"]`
  - **Note**: For a list of default parameters sent with every request, see the ["Default Parameters"](#default-parameters) Section below.

### **headers**:

  > Adds additional headers to requests. Can reference an environment variable

  - Type: Object/Dictionary
  - **Description**: The `headers` object specifies custom headers for requests. Useful for authentication and setting content types.
  - **Example**: 
  - **Note**: Supports dynamic environment variable values, which use the format: `"${VARIABLE_NAME}"`
```yaml
    headers:
      x-api-key: "${ENVIRONMENT_VARIABLE}"
      Content-Type: "application/json"
```

## Additional Notes
- Ensure that all URLs and keys are correctly specified to avoid connectivity issues.

## Default Parameters

Custom endpoints share logic with the OpenAI endpoint, and thus have default parameters tailored to the OpenAI API.

```json
{
  "model": "your-selected-model",
  "temperature": 1,
  "top_p": 1,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "stop": [
    "||>",
    "\nUser:",
    "<|diff_marker|>",
  ],
  "user": "LibreChat_User_ID",
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "hi how are you",
    },
  ],
}
```
### Breakdown of Default Params
- `model`: The selected model from list of models.
- `temperature`: Defaults to `1` if not provided via preset,
- `top_p`: Defaults to `1` if not provided via preset,
- `presence_penalty`: Defaults to `0` if not provided via preset,
- `frequency_penalty`: Defaults to `0` if not provided via preset,
- `stop`: Sequences where the AI will stop generating further tokens. By default, uses the start token (`||>`), the user label (`\nUser:`), and end token (`<|diff_marker|>`). Up to 4 sequences can be provided to the [OpenAI API](https://platform.openai.com/docs/api-reference/chat/create#chat-create-stop)
- `user`: A unique identifier representing your end-user, which can help OpenAI to [monitor and detect abuse](https://platform.openai.com/docs/api-reference/chat/create#chat-create-user).
- `stream`: If set, partial message deltas will be sent, like in ChatGPT. Otherwise, generation will only be available when completed.
- `messages`: [OpenAI format for messages](https://platform.openai.com/docs/api-reference/chat/create#chat-create-messages); the `name` field is added to messages with `system` and `assistant` roles when a custom name is specified via preset.

**Note:** The `max_tokens` field is not sent to use the maximum amount of tokens available, which is default OpenAI API behavior. Some alternate APIs require this field, or it may default to a very low value and your responses may appear cut off; in this case, you should add it to `addParams` field as shown in the [Endpoint Object Structure](#endpoint-object-structure).

## Example Config

```yaml
version: 1.0.1
cache: true
endpoints:
  custom:
    # Mistral AI API
    - name: "Mistral"
      apiKey: "your_api_key"
      baseURL: "https://api.mistral.ai/v1"
      models: 
        default: ["mistral-tiny", "mistral-small", "mistral-medium"]
      titleConvo: true
      titleModel: "mistral-tiny" 
      summarize: false
      summaryModel: "mistral-tiny" 
      forcePrompt: false 
      modelDisplayLabel: "Mistral"
      addParams:
        safe_prompt: true
      # NOTE: For Mistral, it is necessary to drop the following parameters or you will encounter a 422 Error:
      dropParams: ["stop", "user", "frequency_penalty", "presence_penalty"]

     # OpenRouter.ai API
    - name: "OpenRouter"
      # Known issue: you should not use `OPENROUTER_API_KEY` as it will then override the `openAI` endpoint to use OpenRouter as well.
      apiKey: "${OPENROUTER_KEY}"
      baseURL: "https://openrouter.ai/api/v1"
      models:
        default: ["gpt-3.5-turbo"]
        fetch: true
      titleConvo: true
      titleModel: "gpt-3.5-turbo"
      summarize: false
      summaryModel: "gpt-3.5-turbo"
      forcePrompt: false
      modelDisplayLabel: "OpenRouter"
```
