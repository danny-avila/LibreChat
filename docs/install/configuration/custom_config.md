---
title: 🖥️ Custom Config
description: Comprehensive guide for configuring the `librechat.yaml` file AKA the LibreChat Config file. This document is your one-stop resource for understanding and customizing endpoints & other integrations.
weight: -11
---

# LibreChat Configuration Guide

## Intro

Welcome to the guide for configuring the **librechat.yaml** file in LibreChat.

This file enables the integration of custom AI endpoints, enabling you to connect with any AI provider compliant with OpenAI API standards.

This includes providers like [Mistral AI](https://docs.mistral.ai/platform/client/), as well as reverse proxies that facilitate access to OpenAI servers, adding them alongside existing endpoints like Anthropic.

**[INSERT UPDATED IMAGE HERE]**

Future updates will streamline configuration further by migrating some settings from [your `.env` file](./dotenv.md) to `librechat.yaml`.

Stay tuned for ongoing enhancements to customize your LibreChat instance!

**Note:** To verify your YAML config, you can use online tools like [yamlchecker.com](https://yamlchecker.com/)

## Compatible Endpoints

Any API designed to be compatible with OpenAI's should be supported

Here is a list of **[known compatible endpoints](./ai_endpoints.md) including example setups.**

## Setup

**The `librechat.yaml` file should be placed in the root of the project where the .env file is located.**

You can copy the [example config file](#example-config) as a good starting point while reading the rest of the guide.

The example config file has some options ready to go for Mistral AI and Openrouter.

**Note:** You can set an alternate filepath for the `librechat.yaml` file through an environment variable:

```bash
CONFIG_PATH="/alternative/path/to/librechat.yaml"
```

## Docker Setup

For Docker, you need to make use of an [override file](./docker_override.md), named `docker-compose.override.yml`, to ensure the config file works for you.

- First, make sure your containers stop running with `docker compose down`
- Create or edit existing `docker-compose.override.yml` at the root of the project:

!!! tip "docker-compose.override.yml"

    ```yaml
    # For more details on the override file, see the Docker Override Guide:
    # https://docs.librechat.ai/install/configuration/docker_override.html

    version: '3.4'

    services:
      api:
        volumes:
          - ./librechat.yaml:/app/librechat.yaml # local/filepath:container/filepath
    ```

- **Note:** If you are using `CONFIG_PATH` for an alternative filepath for this file, make sure to specify it accordingly.

- Start docker again, and you should see your config file settings apply
```bash
# no need to rebuild
docker compose up
```

## Example Config

??? tip "Click here to expand/collapse example"

    ```yaml
    version: 1.0.5
    cache: true
    # fileStrategy: "firebase"  # If using Firebase CDN
    fileConfig:
      endpoints:
        assistants:
          fileLimit: 5
          # Maximum size for an individual file in MB
          fileSizeLimit: 10
          # Maximum total size for all files in a single request in MB
          totalSizeLimit: 50 
          # In case you wish to limit certain filetypes
          # supportedMimeTypes: 
          #   - "image/.*"
          #   - "application/pdf"
        openAI:
        # Disables file uploading to the OpenAI endpoint
          disabled: true
        default:
          totalSizeLimit: 20
        # Example for custom endpoints
        # YourCustomEndpointName:
        #   fileLimit: 2
        #   fileSizeLimit: 5
      # Global server file size limit in MB
      serverFileSizeLimit: 100  
      # Limit for user avatar image size in MB, default: 2 MB
      avatarSizeLimit: 4 
    rateLimits:
      fileUploads:
        ipMax: 100
        # Rate limit window for file uploads per IP
        ipWindowInMinutes: 60 
        userMax: 50
        # Rate limit window for file uploads per user
        userWindowInMinutes: 60  
    registration:
      socialLogins: ["google", "facebook", "github", "discord", "openid"]
      allowedDomains:
        - "example.com"
        - "anotherdomain.com"
    endpoints:
      assistants:
        # Disable Assistants Builder Interface by setting to `true`
        disableBuilder: false 
        # Polling interval for checking assistant updates
        pollIntervalMs: 750  
        # Timeout for assistant operations
        timeoutMs: 180000  
        # Should only be one or the other, either `supportedIds` or `excludedIds`
        supportedIds: ["asst_supportedAssistantId1", "asst_supportedAssistantId2"]
        # excludedIds: ["asst_excludedAssistantId"]
        # (optional) Models that support retrieval, will default to latest known OpenAI models that support the feature
        # retrievalModels: ["gpt-4-turbo-preview"]
        # (optional) Assistant Capabilities available to all users. Omit the ones you wish to exclude. Defaults to list below.
        # capabilities: ["code_interpreter", "retrieval", "actions", "tools", "image_vision"]
      custom:
        - name: "Mistral"
          apiKey: "${MISTRAL_API_KEY}"
          baseURL: "https://api.mistral.ai/v1"
          models:
            default: ["mistral-tiny", "mistral-small", "mistral-medium", "mistral-large-latest"]
            # Attempt to dynamically fetch available models
            fetch: true  
            userIdQuery: false
          iconURL: "https://example.com/mistral-icon.png"
          titleConvo: true
          titleModel: "mistral-tiny"
          modelDisplayLabel: "Mistral AI"
          # addParams:
          # Mistral API specific value for moderating messages
          #   safe_prompt: true 
          dropParams:
            - "stop"
            - "user"
            - "presence_penalty"
            - "frequency_penalty"
          # headers:
          #    x-custom-header: "${CUSTOM_HEADER_VALUE}"
        - name: "OpenRouter"
          apiKey: "${OPENROUTER_API_KEY}"
          baseURL: "https://openrouter.ai/api/v1"
          models:
            default: ["gpt-3.5-turbo"]
            fetch: false
          titleConvo: true
          titleModel: "gpt-3.5-turbo"
          modelDisplayLabel: "OpenRouter"
          dropParams:
            - "stop"
            - "frequency_penalty"
    ```

    This example configuration file sets up LibreChat with detailed options across several key areas:

    - **Caching**: Enabled to improve performance.
    - **File Handling**:
        - **File Strategy**: Commented out but hints at possible integration with Firebase for file storage.
        - **File Configurations**: Customizes file upload limits and allowed MIME types for different endpoints, including a global server file size limit and a specific limit for user avatar images.
    - **Rate Limiting**: Defines thresholds for the maximum number of file uploads allowed per IP and user within a specified time window, aiming to prevent abuse.
    - **Registration**:
        - Allows registration from specified social login providers and email domains, enhancing security and user management.
    - **Endpoints**:
        - **Assistants**: Configures the assistants' endpoint with a polling interval and a timeout for operations, and provides an option to disable the builder interface.
        - **Custom Endpoints**:
            - Configures two external AI service endpoints, Mistral and OpenRouter, including API keys, base URLs, model handling, and specific feature toggles like conversation titles, summarization, and parameter adjustments.
            - For Mistral, it enables dynamic model fetching, applies additional parameters for safe prompts, and explicitly drops unsupported parameters.
            - For OpenRouter, it sets up a basic configuration without dynamic model fetching and specifies a model for conversation titles.

## Config Structure

**Note:** Fields not specifically mentioned as required are optional.

### version
!!! tip "version"
    - **Key**: `version`

        - **Type**: String
        - **Description**: Specifies the version of the configuration file.
        - **Example**: `version: 1.0.5`
        - **Required**

### cache
!!! tip "cache"
    - **Key**: `cache`

        - **Type**: Boolean
        - **Description**: Toggles caching on or off. Set to `true` to enable caching (default).
        - **Example**: `cache: true`

### fileStrategy
!!! tip "fileStrategy"
    - **Key**: `fileStrategy`
        - **Type**: String
        - **Options**: "local" | ["firebase"](../../features/firebase.md)
        - **Description**: Determines where to save user uploaded/generated files. Defaults to `"local"` if omitted.
        - **Example**: `fileStrategy: "firebase"`

### filteredTools
!!! tip "filteredTools"
    - **Key**: `filteredTools`
    - Type: Array of Strings
    - Example: 
      ```yaml
      filteredTools: ["scholarai", "calculator"]
      ```
    - **Description**: Filters out specific tools from both Plugins and OpenAI Assistants endpoints
    - **Notes**:
        - Affects both `gptPlugins` and `assistants` endpoints
        - You can find the names of the tools to filter in [`api/app/clients/tools/manifest.json`](https://github.com/danny-avila/LibreChat/blob/main/api/app/clients/tools/manifest.json)
            - Use the `pluginKey` value
        - Also, any listed under the ".well-known" directory [`api/app/clients/tools/.well-known`](https://github.com/danny-avila/LibreChat/blob/main/api/app/clients/tools/.well-known)
            - Use the `name_for_model` value

### secureImageLinks
!!! tip "secureImageLinks"
    - **Key**: `secureImageLinks`
        - **Type**: Boolean
        - **Description**: Whether or not to secure access to image links that are hosted locally by the app. Default: false.
        - **Example**: `secureImageLinks: true`

### imageOutputType
!!! tip "imageOutputType"
    - **Key**: `imageOutputType`
        - **Type**: String
        - **Options**: "png" | "webp" | "jpeg"
        - **Description**: The image output type for image responses. Defaults to "png" if omitted.
        - **Note**: Case-sensitive. Google endpoint only supports "jpeg" and "png" output types.
        - **Example**: `imageOutputType: "webp"`

### fileConfig
!!! tip "fileConfig"

    - **Key**: `fileConfig`

        - **Type**: Object
        - **Description**: Configures file handling settings for the application, including size limits and MIME type restrictions.
        - <u>**Sub-keys:**</u>
        - `endpoints`
            - **Type**: Record/Object
            - **Description**: Specifies file handling configurations for individual endpoints, allowing customization per endpoint basis.
        
        - `serverFileSizeLimit`
            - **Type**: Number
            - **Description**: The maximum file size (in MB) that the server will accept. Applies globally across all endpoints unless overridden by endpoint-specific settings.
        
        - `avatarSizeLimit`
            - **Type**: Number
            - **Description**: Maximum size (in MB) for user avatar images.

    - [File Config Object Structure](#file-config-object-structure)

### rateLimits
!!! tip "rateLimits"

    - **Key**: `rateLimits`
        - **Type**: Object
        - **Description**: Defines rate limiting policies to prevent abuse by limiting the number of requests.
        - <u>**Sub-keys:**</u>
        - `fileUploads`
            - **Type**: Object
            - **Description**: Configures rate limits specifically for file upload operations.
            - **Sub-keys:**
            - `ipMax`
                - **Type**: Number
                - **Description**: Maximum number of uploads allowed per IP address per window.
            - `ipWindowInMinutes`
                - **Type**: Number
                - **Description**: Time window in minutes for the IP-based upload limit.
            - `userMax`
                - **Type**: Number
                - **Description**: Maximum number of uploads allowed per user per window.
            - `userWindowInMinutes`
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

### registration
!!! tip "registration"
    - **Key**: `registration`
        - **Type**: Object
        - **Description**: Configures registration-related settings for the application.
        - <u>**Sub-keys:**</u>
        - `socialLogins`: [More info](#socialLogins)
        - `allowedDomains`: [More info](#allowedDomains)
    - [Registration Object Structure](#registration-object-structure)

### interface
!!! tip "interface"

    - **Key**: `interface`
    
        - **Type**: Object
        - **Description**: Configures user interface elements within the application, allowing for customization of visibility and behavior of various components.
        - <u>**Sub-keys:**</u>
        - `privacyPolicy`
            - **Type**: Object
            - **Description**: Contains settings related to the privacy policy link provided in the user interface.
        
        - `termsOfService`
            - **Type**: Object
            - **Description**: Contains settings related to the terms of service link provided in the user interface.

        - `endpointsMenu`
            - **Type**: Boolean
            - **Description**: Controls the visibility of the endpoints dropdown menu in the interface.

        - `modelSelect`
            - **Type**: Boolean
            - **Description**: Determines whether the model selection feature is available in the UI.
            - **Note**: Also disables the model and assistants selection dropdown from the right-most side panel.

        - `parameters`
            - **Type**: Boolean
            - **Description**: Toggles the visibility of parameter configuration options AKA conversation settings.

        - `sidePanel`
            - **Type**: Boolean
            - **Description**: Controls the visibility of the right-most side panel in the application's interface.

        - `presets`
            - **Type**: Boolean
            - **Description**: Enables or disables the presets menu in the application's UI.

    - [Interface Object Structure](#interface-object-structure)

### modelSpecs
!!! tip "modelSpecs"

    - **Key**: `modelSpecs`
    
        - **Type**: Object
        - **Description**: Configures model specifications, allowing for detailed setup and customization of AI models and their behaviors within the application.
        - <u>**Sub-keys:**</u>
        - `enforce`
            - **Type**: Boolean
            - **Description**: Determines whether the model specifications should strictly override other configuration settings.
        
        - `prioritize`
            - **Type**: Boolean
            - **Description**: Specifies if model specifications should take priority over the default configuration when both are applicable.
        
        - `list`
            - **Type**: Array of Objects
            - **Description**: Contains a list of individual model specifications detailing various configurations and behaviors.

    - [Model Specs Object Structure](#model-specs-object-structure)

### endpoints
!!! tip "endpoints"
    - **Key**: `endpoints`
        - **Type**: Object
        - **Description**: Defines custom API endpoints for the application.
        - <u>**Sub-keys:**</u>
        - `custom`
            - **Type**: Array of Objects
            - **Description**: Each object in the array represents a unique endpoint configuration.
            - [Full Custom Endpoint Object Structure](#custom-endpoint-object-structure)
        - `azureOpenAI`
            - **Type**: Object
            - **Description**: Azure OpenAI endpoint-specific configuration
            - [Full Azure OpenAI Endpoint Object Structure](#azure-openai-object-structure)
        - `assistants`
            - **Type**: Object
            - **Description**: Assistants endpoint-specific configuration.
            - [Full Assistants Endpoint Object Structure](#assistants-endpoint-object-structure)

## File Config Object Structure

### **Overview**

The `fileConfig` object allows you to configure file handling settings for the application, including size limits and MIME type restrictions. This section provides a detailed breakdown of the `fileConfig` object structure.

There are 3 main fields under `fileConfig`:

  - `endpoints`
  - `serverFileSizeLimit`
  - `avatarSizeLimit`

**Notes:**

- At the time of writing, the Assistants endpoint [supports filetypes from this list](https://platform.openai.com/docs/assistants/tools/supported-files).
- OpenAI, Azure OpenAI, Google, and Custom endpoints support files through the [RAG API.](../../features/rag_api.md)
- Any other endpoints not mentioned, like Plugins, do not support file uploads (yet).
- The Assistants endpoint has a defined endpoint value of `assistants`. All other endpoints use the defined value `default`
  - For non-assistants endpoints, you can adjust file settings for all of them under `default`
  - If you'd like to adjust settings for a specific endpoint, you can list their corresponding endpoint names:
    - `assistants`
        - does not use "default" as it has defined defaults separate from the others.
    - `openAI`
    - `azureOpenAI`
    - `google`
    - `YourCustomEndpointName`
- You can omit values, in which case, the app will use the default values as defined per endpoint type listed below.
- LibreChat counts 1 megabyte as follows: `1 x 1024 x 1024`

### Example

??? tip "Click here to expand/collapse example"
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

### **serverFileSizeLimit**

!!! tip "fileConfig / serverFileSizeLimit"

    > The global maximum size for any file uploaded to the server, specified in megabytes (MB).

    - Type: Integer
    - Example: 
      ```yaml
      fileConfig:
        serverFileSizeLimit: 1000
      ```
    - **Note**: Acts as an overarching limit for file uploads across all endpoints, ensuring that no file exceeds this size server-wide.

### **avatarSizeLimit**

!!! tip "fileConfig / avatarSizeLimit"

    > The maximum size allowed for avatar images, specified in megabytes (MB).

    - Type: Integer
    - Example: 
      ```yaml
      fileConfig:
        avatarSizeLimit: 2
      ```
    - **Note**: Specifically tailored for user avatar uploads, allowing for control over image sizes to maintain consistent quality and loading times.

### **endpoints**

!!! tip "fileConfig / endpoints"

    > Configures file handling settings for individual endpoints, allowing customization per endpoint basis.

    - Type: Record/Object
    - **Description**: Specifies file handling configurations for individual endpoints, allowing customization per endpoint basis.

Each object under endpoints is a record that can have the following settings:

#### **Overview**

  - `disabled`
      - Whether file handling is disabled for the endpoint.
  - `fileLimit`
      - The maximum number of files allowed per upload request.
  - `fileSizeLimit`
      - The maximum size for a single file. In units of MB (e.g. use `20` for 20 megabytes)
  - `totalSizeLimit`
      - The total maximum size for all files in a single request. In units of MB (e.g. use `20` for 20 megabytes)
  - `supportedMimeTypes`
      - A list of [Regular Expressions](https://en.wikipedia.org/wiki/Regular_expression) specifying what MIME types are allowed for upload. This can be customized to restrict file types.

### **disabled**

!!! tip "fileConfig / endpoints / {endpoint_record} / disabled"

    > Indicates whether file uploading is disabled for a specific endpoint.

    - Type: Boolean
    - Default: `false` (i.e., uploading is enabled by default)
    - Example: 
      ```yaml
      openAI:
        disabled: true
      ```
    - **Note**: Setting this to `true` prevents any file uploads to the specified endpoint, overriding any other file-related settings.

### **fileLimit**

!!! tip "fileConfig / endpoints / {endpoint_record} / fileLimit"

    > The maximum number of files allowed in a single upload request.

    - Type: Integer
    - Default: Varies by endpoint
    - Example: 
      ```yaml
      assistants:
        fileLimit: 5
      ```
    - **Note**: Helps control the volume of uploads and manage server load.

### **fileSizeLimit**

!!! tip "fileConfig / endpoints / {endpoint_record} / fileSizeLimit"

    > The maximum size allowed for each individual file, specified in megabytes (MB).

    - Type: Integer
    - Default: Varies by endpoint
    - Example: 
      ```yaml
      YourCustomEndpointName:
        fileSizeLimit: 1000
      ```
    - **Note**: This limit ensures that no single file exceeds the specified size, allowing for better resource allocation and management.

### **totalSizeLimit**

!!! tip "fileConfig / endpoints / {endpoint_record} / totalSizeLimit"

    > The total maximum size allowed for all files in a single request, specified in megabytes (MB).

    - Type: Integer
    - Default: Varies by endpoint
    - Example: 
      ```yaml
      assistants:
        totalSizeLimit: 50
      ```
    - **Note**: This setting is crucial for preventing excessive bandwidth and storage usage by any single upload request.

### **supportedMimeTypes**

!!! tip "fileConfig / endpoints / {endpoint_record} / supportedMimeTypes"

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

## Interface Object Structure

### **Overview**

The `interface` object allows for customization of various user interface elements within the application, including visibility and behavior settings for components such as menus, panels, and links. This section provides a detailed breakdown of the `interface` object structure.

There are 7 main fields under `interface`:

  - `privacyPolicy`
  - `termsOfService`
  - `endpointsMenu`
  - `modelSelect`
  - `parameters`
  - `sidePanel`
  - `presets`

**Notes:**

- The `interface` configurations are applied globally within the application.
- Default values are provided for most settings but can be overridden based on specific requirements or conditions.
- Conditional logic in the application can further modify these settings based on other configurations like model specifications.

### Example

??? tip "Click here to expand/collapse example"
    ```yaml
    interface:
      privacyPolicy:
        externalUrl: "https://example.com/privacy"
        openNewTab: true
      termsOfService:
        externalUrl: "https://example.com/terms"
        openNewTab: true
      endpointsMenu: true
      modelSelect: false
      parameters: true
      sidePanel: true
      presets: false
    ```

### **privacyPolicy**

!!! tip "interface / privacyPolicy"

    > Contains settings related to the privacy policy link provided in the user interface.

    - Type: Object
    - **Description**: Allows for the specification of a custom URL and the option to open it in a new tab.
    - **Sub-keys**:
        - `externalUrl`
            - Type: String (URL)
            - Description: The URL pointing to the privacy policy document.
        - `openNewTab`
            - Type: Boolean
            - Description: Specifies whether the link should open in a new tab.

### **termsOfService**

!!! tip "interface / termsOfService"

    > Contains settings related to the terms of service link provided in the user interface.

    - Type: Object
    - **Description**: Allows for the specification of a custom URL and the option to open it in a new tab.
    - **Sub-keys**:
        - `externalUrl`
            - Type: String (URL)
            - Description: The URL pointing to the terms of service document.
        - `openNewTab`
            - Type: Boolean
            - Description: Specifies whether the link should open in a new tab.

### **endpointsMenu**

!!! tip "interface / endpointsMenu"

    > Controls the visibility of the endpoints menu in the interface.

    - Type: Boolean
    - Default: `true`
    - Example: 
      ```yaml
      interface:
        endpointsMenu: false
      ```
    - **Note**: Toggling this setting allows administrators to customize the availability of endpoint selections within the application.

### **modelSelect**

!!! tip "interface / modelSelect"

    > Determines whether the model selection feature is available in the UI.

    - Type: Boolean
    - Default: `true`
    - Example:
      ```yaml
      interface:
        modelSelect: true
      ```
    - **Note**: Enabling this feature allows users to select different models directly from the interface.

### **parameters**

!!! tip "interface / parameters"

    > Toggles the visibility of parameter configuration options within the interface.

    - Type: Boolean
    - Default: `true`
    - Example:
      ```yaml
      interface:
        parameters: false
      ```
    - **Note**: This setting is crucial for users who need to adjust parameters for specific functionalities within the application.

### **sidePanel**

!!! tip "interface / sidePanel"

    > Controls the visibility of the side panel in the application's interface.

    - Type: Boolean
    - Default: `true`
    - Example:
      ```yaml
      interface:
        sidePanel: true
      ```
    - **Note**: The side panel typically contains additional navigation or information relevant to the application's context.

### **presets**

!!! tip "interface / presets"

    > Enables or disables the use of presets in the application's UI.

    - Type: Boolean
    - Default: `true`
    - Example:
      ```yaml
      interface:
        presets: true
      ```
    - **Note**: Presets can simplify user interactions by providing pre-configured settings or operations, enhancing user experience and efficiency.


## Model Specs Object Structure

### **Overview**

The `modelSpecs` object helps you provide a simpler UI experience for AI models within your application.

There are 3 main fields under `modelSpecs`:

  - `enforce` (optional; default: false)
  - `prioritize` (optional; default: true)
  - `list` (required)

**Notes:**

- If `enforce` is set to true, model specifications can potentially conflict with other interface settings such as `endpointsMenu`, `modelSelect`, `presets`, and `parameters`.
- The `list` array contains detailed configurations for each model, including presets that dictate specific behaviors, appearances, and capabilities.
- If interface fields are not specified, having a list of model specs will disable the following interface elements:
    - `endpointsMenu`
    - `modelSelect`
    - `parameters`
    - `presets`
- If you would like to enable these interface elements along with model specs, you can set them to `true` in the `interface` object.

### Example

??? tip "Click here to expand/collapse example"
    ```yaml
    modelSpecs:
      enforce: true
      prioritize: true
      list:
        - name: "commander_01"
          label: "Commander in Chief"
          description: "An AI roleplaying as the 50th President."
          iconURL: "https://example.com/icon.jpg"
          preset: {Refer to the detailed preset configuration example below}
    ```

### **enforce**

!!! tip "modelSpecs / enforce"

    > Determines whether the model specifications should strictly override other configuration settings.

    - Type: Boolean
    - Default: `false`
    - Example: 
      ```yaml
      modelSpecs:
        enforce: true
      ```
    - **Note**: Setting this to `true` can lead to conflicts with interface options if not managed carefully.

### **prioritize**

!!! tip "modelSpecs / prioritize"

    > Specifies if model specifications should take priority over the default configuration when both are applicable.

    - Type: Boolean
    - Default: `true`
    - Example:
      ```yaml
      modelSpecs:
        prioritize: false
      ```
    - **Note**: When set to `true`, it ensures that a modelSpec is always selected in the UI. Doing this may prevent users from selecting different endpoints for the selected spec.

### **list**

!!! tip "modelSpecs / list"

    > Contains a list of individual model specifications detailing various configurations and behaviors.

    - Type: Array of Objects
    - **Description**: Each object in the list details the configuration for a specific model, including its behaviors, appearance, and capabilities related to the application's functionality.

Each spec object in the `list` can have the following settings:

#### **Overview**

  - `name`
      - Unique identifier for the model.
  - `label`
      - A user-friendly name or label for the model, shown in the header dropdown.
  - `description`
      - A brief description of the model and its intended use or role, shown in the header dropdown menu.
  - `iconURL`
      - URL or a predefined endpoint name for the model's icon.
  - `default`
      - Specifies if this model spec is the default selection, to be auto-selected on every new chat.
  - `showIconInMenu`
      - Controls whether the model's icon appears in the header dropdown menu.
  - `showIconInHeader`
      - Controls whether the model's icon appears in the header dropdown button, left of its name.
  - `preset`
      - Detailed preset configurations that define the behavior and capabilities of the model (see preset object structure section below for more details).

### Preset Object Structure

The preset field for a modelSpec list item is made up of a comprehensive configuration blueprint for AI models within the system. It is designed to specify the operational settings of AI models, tailoring their behavior, outputs, and interactions with other system components and endpoints.

#### **modelLabel**

!!! tip "modelSpecs / list / {spec_item} / preset / modelLabel"

    > The label used to identify the model in user interfaces or logs. It provides a human-readable name for the model, which is displayed in the UI, as well as made aware to the AI.

    - Type: String (nullable, optional)
    - Default: None
    - Example:
      ```yaml
      preset:
        modelLabel: "Customer Support Bot"
      ```

#### **endpoint**

!!! tip "modelSpecs / list / {spec_item} / preset / endpoint"

    > Specifies the endpoint the model communicates with to execute operations. This setting determines the external or internal service that the model interfaces with.

    - Type: Enum (`EModelEndpoint`) or String (nullable)
    - Example:
      ```yaml
      preset:
        endpoint: "openAI"
      ```

#### **greeting**

!!! tip "modelSpecs / list / {spec_item} / preset / greeting"

    > A predefined message that is visible in the UI before a new chat is started.

    - Type: String (optional)
    - Example:
      ```yaml
      preset:
        greeting: "Hello! How can I assist you today?"
      ```

#### **promptPrefix**

!!! tip "modelSpecs / list / {spec_item} / preset / promptPrefix"

    > A static text prepended to every prompt sent to the model, setting a consistent context for responses.

    - Type: String (nullable, optional)
    - Example:
      ```yaml
      preset:
        promptPrefix: "As a financial advisor, ..."
      ```
    - **Note**: When using "assistants" as the endpoint, this becomes the OpenAI field `additional_instructions`

#### **model_options**

!!! tip "modelSpecs / list / {spec_item} / preset / {model_option}"

    > These settings control the stochastic nature and behavior of model responses, affecting creativity, relevance, and variability.

    - Types:
      - `temperature`: Number (optional)
      - `top_p`: Number (optional)
      - `top_k`: Number (optional)
      - `frequency_penalty`: Number (optional)
      - `presence_penalty`: Number (optional)
      - `stop`: Array of Strings (optional)

    - Examples:
      ```yaml
      preset:
        temperature: 0.7
        top_p: 0.9
      ```

#### **resendFiles**

!!! tip "modelSpecs / list / {spec_item} / preset / resendFiles"

    > Indicates whether files should be resent in scenarios where persistent sessions are not maintained.

    - Type: Boolean (optional)
    - Example:
      ```yaml
      preset:
        resendFiles: true
      ```

#### **imageDetail**

!!! tip "modelSpecs / list / {spec_item} / preset / imageDetail"

    > Specifies the level of detail required in image analysis tasks, applicable to models with vision capabilities (OpenAI spec).

    - Type: `eImageDetailSchema` (optional)
    - Example:
      ```yaml
      preset:
        imageDetail: "high"
      ```

#### **agentOptions**

!!! tip "modelSpecs / list / {spec_item} / preset / agentOptions"

    > Specific to `gptPlugins` endpoint. Can be omitted either partially or completely for default settings

    - Type: Record/Object (optional)
    - Sub-fields include:
      - `agent`: Type of agent (either "functions" or "classic"; default: "functions")
      - `skipCompletion`: Whether to skip automatic completion suggestions (default: true)
      - `model`: Model version or identifier (default: "gpt-4-turbo")
      - `temperature`: Randomness in the model's responses (default: 0)

    - Example:
      ```yaml
      preset:
        agentOptions:
          agent: "functions"
          skipCompletion: false
          model: "gpt-4-turbo"
          temperature: 0.5
      ```

#### **tools**

!!! tip "modelSpecs / list / {spec_item} / preset / tools"

    > Specific to `gptPlugins` endpoint. List of tool/plugin names.

    - Type: Array of Strings
    - Optional
    - Example:
      ```yaml
      preset:
        tools: ["dalle", "tavily_search_results_json", "azure-ai-search", "traversaal_search"]
      ```

      **Notes**:

      - At the moment, only tools that have credentials provided for them via .env file can be used with modelSpecs, unless the user already had the tool installed.
      - You can find the names of the tools to filter in [`api/app/clients/tools/manifest.json`](https://github.com/danny-avila/LibreChat/blob/main/api/app/clients/tools/manifest.json)
          - Use the `pluginKey` value
      - Also, any listed under the ".well-known" directory [`api/app/clients/tools/.well-known`](https://github.com/danny-avila/LibreChat/blob/main/api/app/clients/tools/.well-known)
          - Use the `name_for_model` value

#### **assistant_options**

!!! tip "modelSpecs / list / {spec_item} / preset / {assistant_option}"

    > Configurations specific to assistants, such as identifying an assistant, overriding the assistant's instructions.

    - Types:
      - `assistant_id`: String (optional)
      - `instructions`: String (optional)

    - Examples:
      ```yaml
      preset:
        assistant_id: "asst_98765"
        # Overrides the assistant's default instructions
        instructions: "Please handle customer queries regarding order status."
      ```

## Registration Object Structure

### Example

??? tip "Click here to expand/collapse example"
    ```yaml
    # Example Registration Object Structure
    registration:
      socialLogins: ["google", "facebook", "github", "discord", "openid"]
      allowedDomains:
        - "gmail.com"
        - "protonmail.com"
    ```

### **socialLogins**

!!! tip "registration / socialLogins"

      > Defines the available social login providers and their display order.

      - Type: Array of Strings
      - Example: 
        ```yaml
        socialLogins: ["google", "facebook", "github", "discord", "openid"]
        ```
      - **Note**: The order of the providers in the list determines their appearance order on the login/registration page. Each provider listed must be [properly configured](./user_auth_system.md#social-authentication-setup-and-configuration) within the system to be active and available for users. This configuration allows for a tailored authentication experience, emphasizing the most relevant or preferred social login options for your user base.

### **allowedDomains**

!!! tip "registration / allowedDomains"

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

## Assistants Endpoint Object Structure

### Example

??? tip "Click here to expand/collapse example"
    ```yaml
    endpoints:
      assistants:
        disableBuilder: false
        pollIntervalMs: 500
        timeoutMs: 10000
        # Use either `supportedIds` or `excludedIds` but not both
        supportedIds: ["asst_supportedAssistantId1", "asst_supportedAssistantId2"]
        # excludedIds: ["asst_excludedAssistantId"]
        # (optional) Models that support retrieval, will default to latest known OpenAI models that support the feature
        # retrievalModels: ["gpt-4-turbo-preview"]
        # (optional) Assistant Capabilities available to all users. Omit the ones you wish to exclude. Defaults to list below.
        # capabilities: ["code_interpreter", "retrieval", "actions", "tools", "image_vision"]
    ```
    > This configuration enables the builder interface for assistants, sets a polling interval of 500ms to check for run updates, and establishes a timeout of 10 seconds for assistant run operations.

### **disableBuilder**

!!! tip "endpoints / assistants / disableBuilder"

    > Controls the visibility and use of the builder interface for assistants.

    - **Type**: Boolean
    - **Example**: `disableBuilder: false`
    - **Description**: When set to `true`, disables the builder interface for the assistant, limiting direct manual interaction.
    - **Note**: Defaults to `false` if omitted.

### **pollIntervalMs**

!!! tip "endpoints / assistants / pollIntervalMs"

    > Specifies the polling interval in milliseconds for checking run updates or changes in assistant run states.

    - **Type**: Integer
    - **Example**: `pollIntervalMs: 500`
    - **Description**: Specifies the polling interval in milliseconds for checking assistant run updates.
    - **Note**: Defaults to `750` if omitted.

### **timeoutMs**

!!! tip "endpoints / assistants / timeoutMs"

    > Defines the maximum time in milliseconds that an assistant can run before the request is cancelled.

    - **Type**: Integer
    - **Example**: `timeoutMs: 10000`
    - **Description**: Sets a timeout in milliseconds for assistant runs. Helps manage system load by limiting total run operation time.
    - **Note**: Defaults to 3 minutes (180,000 ms). Run operation times can range between 50 seconds to 2 minutes but also exceed this. If the `timeoutMs` value is exceeded, the run will be cancelled.

### **supportedIds**

!!! tip "endpoints / assistants / supportedIds"

    > List of supported assistant Ids

    - Type: Array/List of Strings
    - **Description**: List of supported assistant Ids. Use this or `excludedIds` but not both (the `excludedIds` field will be ignored if so).
    - **Example**: `supportedIds: ["asst_supportedAssistantId1", "asst_supportedAssistantId2"]`

### **excludedIds**

!!! tip "endpoints / assistants / excludedIds"

      > List of excluded assistant Ids

      - Type: Array/List of Strings
      - **Description**: List of excluded assistant Ids. Use this or `supportedIds` but not both (the `excludedIds` field will be ignored if so).
      - **Example**: `excludedIds: ["asst_excludedAssistantId1", "asst_excludedAssistantId2"]`

### **retrievalModels**

!!! tip "endpoints / assistants / retrievalModels"

    > Specifies the models that support retrieval for the assistants endpoint.

    - **Type**: Array/List of Strings
    - **Example**: `retrievalModels: ["gpt-4-turbo-preview"]`
    - **Description**: Defines the models that support retrieval capabilities for the assistants endpoint. By default, it uses the latest known OpenAI models that support the official Retrieval feature.
    - **Note**: This field is optional. If omitted, the default behavior is to use the latest known OpenAI models that support retrieval.

### **capabilities**

!!! tip "endpoints / assistants / capabilities"

    > Specifies the assistant capabilities available to all users for the assistants endpoint.

    - **Type**: Array/List of Strings
    - **Example**: `capabilities: ["code_interpreter", "retrieval", "actions", "tools", "image_vision"]`
    - **Description**: Defines the assistant capabilities that are available to all users for the assistants endpoint. You can omit the capabilities you wish to exclude from the list. The available capabilities are:
      - `code_interpreter`: Enables code interpretation capabilities for the assistant.
      - `image_vision`: Enables unofficial vision support for uploaded images.
      - `retrieval`: Enables retrieval capabilities for the assistant.
      - `actions`: Enables action capabilities for the assistant.
      - `tools`: Enables tool capabilities for the assistant.
    - **Note**: This field is optional. If omitted, the default behavior is to include all the capabilities listed in the example.

## Custom Endpoint Object Structure
Each endpoint in the `custom` array should have the following structure:

### Example 

??? tip "Click here to expand/collapse example"
    ```yaml
    # Example Endpoint Object Structure
    endpoints:
      custom:
          # Example using Mistral AI API
        - name: "Mistral"
          apiKey: "${YOUR_ENV_VAR_KEY}"
          baseURL: "https://api.mistral.ai/v1"
          models: 
            default: ["mistral-tiny", "mistral-small", "mistral-medium", "mistral-large-latest"]
          titleConvo: true
          titleModel: "mistral-tiny" 
          modelDisplayLabel: "Mistral"
          # addParams:
          #   safe_prompt: true # Mistral specific value for moderating messages
          # NOTE: For Mistral, it is necessary to drop the following parameters or you will encounter a 422 Error:
          dropParams: ["stop", "user", "frequency_penalty", "presence_penalty"]
    ```

### **name**

!!! tip "endpoints / custom / name"

    > A unique name for the endpoint.

    - Type: String
    - Example: `name: "Mistral"`
    - **Required**
    - **Note**: Will be used as the "title" in the Endpoints Selector

### **apiKey**

!!! tip "endpoints / custom / apiKey"

    > Your API key for the service. Can reference an environment variable, or allow user to provide the value.

    - Type: String (apiKey | `"user_provided"`)
    - Example: `apiKey: "${MISTRAL_API_KEY}"` | `apiKey: "your_api_key"` | `apiKey: "user_provided"`
    - **Required**
    - **Note**: It's highly recommended to use the env. variable reference for this field, i.e. `${YOUR_VARIABLE}`

### **baseURL**

!!! tip "endpoints / custom / baseURL"

    > Base URL for the API. Can reference an environment variable, or allow user to provide the value.

    - Type: String (baseURL | `"user_provided"`)
    - Example: `baseURL: "https://api.mistral.ai/v1"` | `baseURL: "${MISTRAL_BASE_URL}"` | `baseURL: "user_provided"`
    - **Required**
    - **Note**: It's highly recommended to use the env. variable reference for this field, i.e. `${YOUR_VARIABLE}`

### **iconURL**

!!! tip "endpoints / custom / iconURL"

    > The URL to use as the Endpoint Icon.

    - Type: Boolean
    - Example: `iconURL: https://github.com/danny-avila/LibreChat/raw/main/docs/assets/LibreChat.svg`
    - **Notes**:
        - If you want to use existing project icons, define the endpoint `name` as one of the main endpoints (case-sensitive):
            - "openAI" | "azureOpenAI" | "google" | "anthropic" | "assistants" | "gptPlugins"
        - There are also "known endpoints" (case-insensitive), which have icons provided. If your endpoint `name` matches the following names, you should omit this field:
            - "Mistral"
            - "OpenRouter"
            - "Groq"
            - APIpie
            - "Anyscale"
            - "Fireworks"
            - "Perplexity"
            - "together.ai"
            - "Ollama"

### **models**

!!! tip "endpoints / custom / models"

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

### **titleConvo**

!!! tip "endpoints / custom / titleConvo"

    > Enables title conversation when set to `true`.

    - Type: Boolean
    - Example: `titleConvo: true`

### **titleMethod**

!!! tip "endpoints / custom / titleMethod"

    > Chooses between "completion" or "functions" for title method.

    - Type: String (`"completion"` | `"functions"`)
    - Example: `titleMethod: "completion"`
    - **Note**: Defaults to "completion" if omitted.

### **titleModel**

!!! tip "endpoints / custom / titleModel"

    > Specifies the model to use for titles.

    - Type: String
    - Example: `titleModel: "mistral-tiny"`
    - **Note**: Defaults to "gpt-3.5-turbo" if omitted. May cause issues if "gpt-3.5-turbo" is not available.
    - **Note**: You can also dynamically use the current conversation model by setting it to "current_model".

### **summarize**

!!! tip "endpoints / custom / summarize"

    > Enables summarization when set to `true`.

    - Type: Boolean
    - Example: `summarize: false`
    - **Note**: This feature requires an OpenAI Functions compatible API

### **summaryModel**

!!! tip "endpoints / custom / summaryModel"

    > Specifies the model to use if summarization is enabled.

    - Type: String
    - Example: `summaryModel: "mistral-tiny"`
    - **Note**: Defaults to "gpt-3.5-turbo" if omitted. May cause issues if "gpt-3.5-turbo" is not available.

### **forcePrompt**

!!! tip "endpoints / custom / forcePrompt"

    > If `true`, sends a `prompt` parameter instead of `messages`.

    - Type: Boolean
    - Example: `forcePrompt: false`
    - **Note**: Combines all messages into a single text payload or "prompt", [following OpenAI format](https://github.com/pvicente/openai-python/blob/main/chatml.md), which uses the `/completions` endpoint of your baseURL rather than `/chat/completions`.

### **modelDisplayLabel**

!!! tip "endpoints / custom / modelDisplayLabel"

    > The label displayed in messages next to the Icon for the current AI model.

    - Type: String
    - Example: `modelDisplayLabel: "Mistral"`
    - **Note**: The display order is:
      - 1. Custom name set via preset (if available) 
      - 2. Label derived from the model name (if applicable)
      - 3. This value, `modelDisplayLabel`, is used if the above are not specified. Defaults to "AI".

### **addParams**

!!! tip "endpoints / custom / addParams"

    > Adds additional parameters to requests.

    - Type: Object/Dictionary
    - **Description**: Adds/Overrides parameters. Useful for specifying API-specific options.
    - **Example**: 
    ```yaml
        addParams:
          safe_prompt: true
    ```

### **dropParams**

!!! tip "endpoints / custom / dropParams"

    > Removes [default parameters](#default-parameters) from requests.

    - Type: Array/List of Strings
    - **Description**: Excludes specified [default parameters](#default-parameters). Useful for APIs that do not accept or recognize certain parameters.
    - **Example**: `dropParams: ["stop", "user", "frequency_penalty", "presence_penalty"]`
    - **Note**: For a list of default parameters sent with every request, see the ["Default Parameters"](#default-parameters) Section below.

### **headers**

!!! tip "endpoints / custom / headers"

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

## Azure OpenAI Object Structure

Integrating Azure OpenAI Service with your application allows you to seamlessly utilize multiple deployments and region models hosted by Azure OpenAI. This section details how to configure the Azure OpenAI endpoint for your needs. 

**[For a detailed guide on setting up Azure OpenAI configurations, click here](./azure_openai.md)**

### Example Configuration

??? tip "Click here to expand/collapse example"
    ```yaml
    # Example Azure OpenAI Object Structure
    endpoints:
      azureOpenAI:
        titleModel: "gpt-4-turbo"
        plugins: true
        groups:
          - group: "my-westus" # arbitrary name
            apiKey: "${WESTUS_API_KEY}"
            instanceName: "actual-instance-name" # name of the resource group or instance
            version: "2023-12-01-preview"
            # baseURL: https://prod.example.com
            # additionalHeaders:
            #   X-Custom-Header: value
            models:
              gpt-4-vision-preview:
                deploymentName: gpt-4-vision-preview
                version: "2024-02-15-preview"
              gpt-3.5-turbo:
                deploymentName: gpt-35-turbo
              gpt-3.5-turbo-1106:
                deploymentName: gpt-35-turbo-1106
              gpt-4:
                deploymentName: gpt-4
              gpt-4-1106-preview:
                deploymentName: gpt-4-1106-preview
          - group: "my-eastus"
            apiKey: "${EASTUS_API_KEY}"
            instanceName: "actual-eastus-instance-name"
            deploymentName: gpt-4-turbo
            version: "2024-02-15-preview"
            baseURL: "https://gateway.ai.cloudflare.com/v1/cloudflareId/azure/azure-openai/${INSTANCE_NAME}/${DEPLOYMENT_NAME}" # uses env variables
            additionalHeaders:
              X-Custom-Header: value
            models:
              gpt-4-turbo: true
    ```

### **plugins**

!!! tip "endpoints / azureOpenAI / plugins"

    > Enables or disables plugins for the Azure OpenAI endpoint.

    - Type: Boolean
    - **Example**: `plugins: true`
    - **Description**: When set to `true`, activates plugins associated with this endpoint.
    - **Note**: You can only use either the official OpenAI API or Azure OpenAI API for plugins, not both.

### **assistants**

!!! tip "endpoints / azureOpenAI / assistants"

    > Enables or disables assistants for the Azure OpenAI endpoint.

    - Type: Boolean
    - **Example**: `assistants: true`
    - **Description**: When set to `true`, activates assistants associated with this endpoint.
    - **Note**: You can only use either the official OpenAI API or Azure OpenAI API for assistants, not both.

### **groups**

!!! tip "endpoints / azureOpenAI / groups"

    > Configuration for groups of models by geographic location or purpose.

    - Type: Array
    - **Description**: Each item in the `groups` array configures a set of models under a certain grouping, often by geographic region or distinct configuration.
    - **Example**: [See example above.](#example-configuration)

### Group Object Structure

Each item under `groups` is part of a list of records, each with the following fields:

#### **group**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / group"

    > Identifier for a group of models.

    - Type: String
    - **Required**
    - **Example**: `"my-westus"`

#### **apiKey**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / apiKey"

    > The API key for accessing the Azure OpenAI Service.

    - Type: String
    - **Required**
    - **Example**: `"${WESTUS_API_KEY}"`
    - **Note**: It's highly recommended to use a custom env. variable reference for this field, i.e. `${YOUR_VARIABLE}`

#### **instanceName**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / instanceName"

    > Name of the Azure instance.

    - Type: String
    - **Required**
    - **Example**: `"my-westus"`
    - **Note**: It's recommended to use a custom env. variable reference for this field, i.e. `${YOUR_VARIABLE}`


#### **version**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / version"

    > API version.

    - Type: String
    - **Optional**
    - **Example**: `"2023-12-01-preview"`
    - **Note**: It's recommended to use a custom env. variable reference for this field, i.e. `${YOUR_VARIABLE}`

#### **baseURL**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / baseURL"

    > The base URL for the Azure OpenAI Service.

    - Type: String
    - **Optional**
    - **Example**: `"https://prod.example.com"`
    - **Note**: It's recommended to use a custom env. variable reference for this field, i.e. `${YOUR_VARIABLE}`

#### **additionalHeaders**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / additionalHeaders"

    > Additional headers for API requests.

    - Type: Dictionary
    - **Optional**
    - **Example**:
      ```yaml
      additionalHeaders:
        X-Custom-Header: ${YOUR_SECRET_CUSTOM_VARIABLE}
      ```
    - **Note**: It's recommended to use a custom env. variable reference for the values of field, as shown in the example.
    - **Note**: `api-key` header value is sent on every request

#### **serverless**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / serverless"

    > Indicates the use of a serverless inference endpoint for Azure OpenAI chat completions.

    - Type: Boolean
    - **Optional**
    - **Description**: When set to `true`, specifies that the group is configured to use serverless inference endpoints as an Azure "Models as a Service" model.
    - **Example**: `serverless: true`
    - **Note**: [More info here](./azure_openai.md#serverless-inference-endpoints)

#### **addParams**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / addParams"

    > Adds additional parameters to requests.

    - Type: Object/Dictionary
    - **Description**: Adds/Overrides parameters. Useful for specifying API-specific options.
    - **Example**: 
    ```yaml
        addParams:
          safe_prompt: true
    ```

#### **dropParams**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / apiKey"

    > Removes [default parameters](#default-parameters) from requests.

    - Type: Array/List of Strings
    - **Description**: Excludes specified [default parameters](#default-parameters). Useful for APIs that do not accept or recognize certain parameters.
    - **Example**: `dropParams: ["stop", "user", "frequency_penalty", "presence_penalty"]`
    - **Note**: For a list of default parameters sent with every request, see the ["Default Parameters"](#default-parameters) Section below.

#### **forcePrompt**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / forcePrompt"

    > If `true`, sends a `prompt` parameter instead of `messages`.

    - Type: Boolean
    - Example: `forcePrompt: false`
    - **Note**: This combines all messages into a single text payload, [following OpenAI format](https://github.com/pvicente/openai-python/blob/main/chatml.md), and uses the `/completions` endpoint of your baseURL rather than `/chat/completions`.

#### **models**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / models"

    > Configuration for individual models within a group.

    - **Description**: Configures settings for each model, including deployment name and version. Model configurations can adopt the group's deployment name and/or version when configured as a boolean (set to `true`) or an object for detailed settings of either of those fields.
    - **Example**: See above example configuration.

    Within each group, models are records, either set to true, or set with a specific `deploymentName` and/or `version` where the key MUST be the matching OpenAI model name; for example, if you intend to use gpt-4-vision, it must be configured like so:

    ```yaml
    models:
      gpt-4-vision-preview: # matching OpenAI Model name
        deploymentName: "arbitrary-deployment-name"
        version: "2024-02-15-preview" # version can be any that supports vision
    ```

### Model Config Structure

Each item under `models` is part of a list of records, either a boolean value or Object:

**When specifying a model as an object:**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / models / {model_item=Object}"

    An object allows for detailed configuration of the model, including its `deploymentName` and/or `version`. This mode is used for more granular control over the models, especially when working with multiple versions or deployments under one instance or resource group.

    **Example**:
    ```yaml
    models:
      gpt-4-vision-preview:
        deploymentName: "gpt-4-vision-preview"
        version: "2024-02-15-preview"
    ```

    Notes:

    - **Deployment Names** and **Versions** are critical for ensuring that the correct model is used.
        - Double-check these values for accuracy to prevent unexpected behavior.

#### **deploymentName**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / models / {model_item=Object} / deploymentName"

    > The name of the deployment for the model.

    - Type: String
    - **Required**
    - **Example**: `"gpt-4-vision-preview"`
    - **Description**: Identifies the deployment of the model within Azure.
    - **Note**: This does not have to be the matching OpenAI model name as is convention, but must match the actual name of your deployment on Azure.

#### **version**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / models / {model_item=Object} / version"

    > Specifies the version of the model.

    - Type: String
    - **Required**
    - **Example**: `"2024-02-15-preview"`
    - **Description**: Defines the version of the model to be used.

**When specifying a model as a boolean (`true`):**

!!! tip "endpoints / azureOpenAI / groups / {group_item} / models / {model_item=true}"

    When a model is enabled (`true`) without using an object, it uses the group's configuration values for deployment name and version.

    **Example**:
    ```yaml
    models:
      gpt-4-turbo: true
    ```

### Default Parameters

Custom endpoints share logic with the OpenAI endpoint, and thus have default parameters tailored to the OpenAI API.

```json
{
  "model": "your-selected-model",
  "temperature": 1,
  "top_p": 1,
  "presence_penalty": 0,
  "frequency_penalty": 0,
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
#### Breakdown
- `model`: The selected model from list of models.
- `temperature`: Defaults to `1` if not provided via preset,
- `top_p`: Defaults to `1` if not provided via preset,
- `presence_penalty`: Defaults to `0` if not provided via preset,
- `frequency_penalty`: Defaults to `0` if not provided via preset,
- `user`: A unique identifier representing your end-user, which can help OpenAI to [monitor and detect abuse](https://platform.openai.com/docs/api-reference/chat/create#chat-create-user).
- `stream`: If set, partial message deltas will be sent, like in ChatGPT. Otherwise, generation will only be available when completed.
- `messages`: [OpenAI format for messages](https://platform.openai.com/docs/api-reference/chat/create#chat-create-messages); the `name` field is added to messages with `system` and `assistant` roles when a custom name is specified via preset.

**Note:** The `max_tokens` field is not sent to use the maximum amount of tokens available, which is default OpenAI API behavior. Some alternate APIs require this field, or it may default to a very low value and your responses may appear cut off; in this case, you should add it to `addParams` field as shown in the [Endpoint Object Structure](#endpoint-object-structure).

### Additional Notes

- Ensure that all URLs and keys are correctly specified to avoid connectivity issues.
