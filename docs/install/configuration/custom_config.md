---
title: 🖥️ Custom Endpoints & Config
description: Comprehensive guide for configuring the `librechat.yaml` file AKA the LibreChat Config file. This document is your one-stop resource for understanding and customizing endpoints & other integrations.
weight: -10
---

# LibreChat Configuration Guide

Welcome to the guide for configuring the **librechat.yaml** file in LibreChat.

This file enables the integration of custom AI endpoints, enabling you to connect with any AI provider compliant with OpenAI API standards.

This includes providers like [Mistral AI](https://docs.mistral.ai/platform/client/), as well as reverse proxies that facilitate access to OpenAI servers, adding them alongside existing endpoints like Anthropic.

![image](https://github.com/danny-avila/LibreChat/assets/110412045/fd0d2307-008f-4e1d-b75b-4f141070ce71)

Future updates will streamline configuration further by migrating some settings from [your `.env` file](./dotenv.md) to `librechat.yaml`.

Stay tuned for ongoing enhancements to customize your LibreChat instance!

> Note: To verify your YAML config, you can use online tools like [yamlchecker.com](https://yamlchecker.com/)

**Note:** To verify your YAML config, you can use online tools like [yamlchecker.com](https://yamlchecker.com/)

## Setup

**The `librechat.yaml` file should be placed in the root of the project where the .env file is located.**

You can copy the [example config file](#example-config) as a good starting point while reading the rest of the guide.

The example config file has some options ready to go for Mistral AI and Openrouter.

## Docker Setup

For Docker, you need to make use of an [override file](./docker_override.md), named `docker-compose.override.yml`, to ensure the config file works for you.

- First, make sure your containers stop running with `docker compose down`
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
docker compose up # no need to rebuild
```

## Example Config

```yaml
version: 1.0.2
cache: true
# Example Registration Object Structure
registration:
  allowedDomains:
    - "gmail.com"
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

## Example Config

```yaml
version: 1.0.2
cache: true
# Example Registration Object Structure
registration:
  allowedDomains:
    - "gmail.com"
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

### File Configuration
- **Key**: `fileConfig`
- **Type**: Object
- **Description**: Configures file handling settings for the application, including size limits and MIME type restrictions.
  
  - **Sub-Key**: `endpoints`
    - **Type**: Record/Object
    - **Description**: Specifies file handling configurations for individual endpoints, allowing customization per endpoint basis.
    - [Endpoint File Config Object Structure](#endpoint-file-config-object-structure)
  
  - **Sub-Key**: `serverFileSizeLimit`
    - **Type**: Number
    - **Description**: The maximum file size (in MB) that the server will accept. Applies globally across all endpoints unless overridden by endpoint-specific settings.
  
  - **Sub-Key**: `avatarSizeLimit`
    - **Type**: Number
    - **Description**: Maximum size (in MB) for user avatar images.

### Rate Limiting

- **Key**: `rateLimits`
- **Type**: Object
- **Description**: Defines rate limiting policies to prevent abuse by limiting the number of requests.
  - **Sub-Key**: `fileUploads`
  - **Type**: Object
  - **Description**: Configures rate limits specifically for file upload operations.
    - **Sub-Key**: `ipMax`
      - **Type**: Number
      - **Description**: Maximum number of uploads allowed per IP address per window.
    - **Sub-Key**: `ipWindowInMinutes`
      - **Type**: Number
      - **Description**: Time window in minutes for the IP-based upload limit.
    - **Sub-Key**: `userMax`
      - **Type**: Number
      - **Description**: Maximum number of uploads allowed per user per window.
    - **Sub-Key**: `userWindowInMinutes`
      - **Type**: Number
      - **Description**: Time window in minutes for the user-based upload limit.

- **Example**:
```yaml
rateLimits:
  fileUploads:
    ipMax: 100
    ipWindowInMinutes: 60
    userMax: 50
    userWindowInMinutes: 60
```

### Registration
- **Key**: `registration`
- **Type**: Object
- **Description**: Configures registration-related settings for the application.
  - **Sub-Key**: `socialLogins`
  - [More info](#socialLogins)
  - **Sub-Key**: `allowedDomains`
  - [More info](#allowedDomains)
- [Registration Object Structure](#registration-object-structure)

### Endpoints
- **Key**: `endpoints`
- **Type**: Object
- **Description**: Defines custom API endpoints for the application.
  - **Sub-Key**: `assistants`
  - **Type**: Object
  - **Description**: Assistants endpoint-specific configuration.
    - **Sub-Key**: `disableBuilder`
    - [More info](#disablebuilder)
  - **Sub-Key**: `pollIntervalMs`
    - [More info](#pollintervalms)
  - **Sub-Key**: `timeoutMs`
    - [More info](#timeoutMs)
  - [Full Assistants Endpoint Object Structure](#assistants-endpoint-object-structure)
  - **Sub-Key**: `custom`
  - **Type**: Array of Objects
  - **Description**: Each object in the array represents a unique endpoint configuration.
  - [Full Custom Endpoint Object Structure](#custom-endpoint-object-structure)
- **Required**

## Endpoint File Config Object Structure

### **Overview**

  - `disabled`: Whether file handling is disabled for the endpoint.
  - `fileLimit`: The maximum number of files allowed per upload request.
  - `fileSizeLimit`: The maximum size for a single file. In units of MB (e.g. use `20` for 20 megabytes)
  - `totalSizeLimit`: The total maximum size for all files in a single request. In units of MB (e.g. use `20` for 20 megabytes)
  - `supportedMimeTypes`: A list of [Regular Expressions](https://en.wikipedia.org/wiki/Regular_expression) specifying what MIME types are allowed for upload. This can be customized to restrict file types.

**Notes:**

- At the time of writing, the Assistants endpoint [supports filetypes from this list](https://platform.openai.com/docs/assistants/tools/supported-files).
- The OpenAI, Azure OpenAI, Google, and Custom endpoints only suppport images.
- Any other endpoints not mentioned, like Plugins, do not support file uploads (yet).
- The Assistants endpoint has a defined endpoint value of `assistants`. All other endpoints use the defined value `default`
  - For non-assistants endpoints, you can adjust file settings for all of them under `default`
  - If you'd like to adjust settings for a specific endpoint, you can list their corresponding endpoint names:
    - `assistants` (does not use `default` as it has defined defaults separate from the others.)
    - `openAI`
    - `azureOpenAI`
    - `google`
    - `YourCustomEndpointName`
- You can omit values, in which case, the app will use the default values as defined per endpoint type listed below.
- LibreChat counts 1 megabyte as follows: `1 x 1024 x 1024`

### Example

```yaml
fileConfig:
  endpoints:
    assistants:
      fileLimit: 5
      fileSizeLimit: 10
      totalSizeLimit: 50
      supportedMimeTypes:
        - "image/.*"
        - "application/pdf"
    openAI:
      disabled: true
    default:
      totalSizeLimit: 20
    YourCustomEndpointName:
      fileLimit: 5
      fileSizeLimit: 1000
      supportedMimeTypes:
        - "image/.*"
  serverFileSizeLimit: 1000
  avatarSizeLimit: 2
```

### **disabled**:

> Indicates whether file uploading is disabled for a specific endpoint.

- Type: Boolean
- Default: `false` (i.e., uploading is enabled by default)
- Example: 
  ```yaml
  openAI:
    disabled: true
  ```
- **Note**: Setting this to `true` prevents any file uploads to the specified endpoint, overriding any other file-related settings.

### **fileLimit**:

> The maximum number of files allowed in a single upload request.

- Type: Integer
- Default: Varies by endpoint
- Example: 
  ```yaml
  assistants:
    fileLimit: 5
  ```
- **Note**: Helps control the volume of uploads and manage server load.

### **fileSizeLimit**:

> The maximum size allowed for each individual file, specified in megabytes (MB).

- Type: Integer
- Default: Varies by endpoint
- Example: 
  ```yaml
  YourCustomEndpointName:
    fileSizeLimit: 1000
  ```
- **Note**: This limit ensures that no single file exceeds the specified size, allowing for better resource allocation and management.

### **totalSizeLimit**:

> The total maximum size allowed for all files in a single request, specified in megabytes (MB).

- Type: Integer
- Default: Varies by endpoint
- Example: 
  ```yaml
  assistants:
    totalSizeLimit: 50
  ```
- **Note**: This setting is crucial for preventing excessive bandwidth and storage usage by any single upload request.

### **supportedMimeTypes**:

> A list of regular expressions defining the MIME types permitted for upload.

- Type: Array of Strings
- Default: Varies by endpoint
- Example: 
  ```yaml
  assistants:
    supportedMimeTypes:
      - "image/.*"
      - "application/pdf"
  ```
- **Note**: This allows for precise control over the types of files that can be uploaded. Invalid regex is ignored.

### **serverFileSizeLimit**:

> The global maximum size for any file uploaded to the server, specified in megabytes (MB).

- Type: Integer
- Example: 
  ```yaml
  fileConfig:
    serverFileSizeLimit: 1000
  ```
- **Note**: Acts as an overarching limit for file uploads across all endpoints, ensuring that no file exceeds this size server-wide.

### **avatarSizeLimit**:

> The maximum size allowed for avatar images, specified in megabytes (MB).

- Type: Integer
- Example: 
  ```yaml
  fileConfig:
    avatarSizeLimit: 2
  ```
- **Note**: Specifically tailored for user avatar uploads, allowing for control over image sizes to maintain consistent quality and loading times.

## Registration Object Structure

```yaml
# Example Registration Object Structure
registration:
  socialLogins: ["google", "facebook", "github", "discord", "openid"]
  allowedDomains:
    - "gmail.com"
    - "protonmail.com"
```

### **socialLogins**:

  > Defines the available social login providers and their display order.

  - Type: Array of Strings
  - Example: 
    ```yaml
    socialLogins: ["google", "facebook", "github", "discord", "openid"]
    ```
  - **Note**: The order of the providers in the list determines their appearance order on the login/registration page. Each provider listed must be [properly configured](./user_auth_system.md#social-authentication-setup-and-configuration) within the system to be active and available for users. This configuration allows for a tailored authentication experience, emphasizing the most relevant or preferred social login options for your user base.

### **allowedDomains**:

  > A list specifying allowed email domains for registration.

  - Type: Array of Strings
  - Example: 
    ```yaml
    allowedDomains:
      - "gmail.com"
      - "protonmail.com"
    ```
  - **Required**
  - **Note**: Users with email domains not listed will be restricted from registering.

Given the additional details and correction regarding `supportedMimeTypes` being a list of regex strings and the omission of the `assistantEndpoint` configuration, let's revise and add the necessary documentation sections.

## Assistants Endpoint Object Structure

### Example

```yaml
endpoints:
  assistants:
    disableBuilder: false
    pollIntervalMs: 500
    timeoutMs: 10000
```
> This configuration enables the builder interface for assistants, sets a polling interval of 500ms to check for run updates, and establishes a timeout of 10 seconds for assistant run operations.

In addition to custom endpoints, you can configure settings specific to the assistants endpoint.

### **disableBuilder**:

> Controls the visibility and use of the builder interface for assistants.

- **Type**: Boolean
- **Example**: `disableBuilder: false`
- **Description**: When set to `true`, disables the builder interface for the assistant, limiting direct manual interaction.
- **Note**: Defaults to `false` if omitted.

### **pollIntervalMs**:

> Specifies the interval in milliseconds at which the system will poll for run updates or changes in assistant run states.

- **Type**: Integer
- **Example**: `pollIntervalMs: 500`
- **Description**: Specifies the polling interval in milliseconds for checking assistant run updates. Useful for adapting the responsiveness of assistant interactions.
- **Note**: Defaults to `750` if omitted.

### **timeoutMs**:

> Defines the maximum time in milliseconds that an assistant can run before the request is cancelled.

- **Type**: Integer
- **Example**: `timeoutMs: 10000`
- **Description**: Sets a timeout in milliseconds for assistant runs. Helps manage system load by limiting total run operation time. The default is 
- **Note**: Defaults to `180000` if omitted (3 minutes). Run operation times can range between 50 seconds to 2 minutes but also exceed this. If the `timeoutMs` value is exceeded, the run will be cancelled.

## Custom Endpoint Object Structure
Each endpoint in the `custom` array should have the following structure:

### Example 

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
  - **userIdQuery**: When set to `true`, adds the LibreChat user ID as a query parameter to the API models request.
    - Type: Boolean
    - Example: `userIdQuery: true`

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

### Additional Notes
- Ensure that all URLs and keys are correctly specified to avoid connectivity issues.

### Default Parameters

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

