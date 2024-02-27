---
title: ✅ Compatible AI Endpoints
description: List of known, compatible AI Endpoints with example setups for the `librechat.yaml` AKA the LibreChat Custom Config file.
weight: -9
---

# Compatible AI Endpoints

## Intro

This page lists known, compatible AI Endpoints with example setups for the `librechat.yaml` file, also known as the [Custom Config](./custom_config.md#custom-endpoint-object-structure) file.

In all of the examples, arbitrary environment variable names are defined but you can use any name you wish, as well as changing the value to `user_provided` to allow users to submit their own API key from the web UI.

Some of the endpoints are marked as **Known,** which means they might have special handling and/or an icon already provided in the app for you.

## Groq

**Notes:**

- **Known:** icon provided.

- **Temperature:** If you set a temperature value of 0, it will be converted to 1e-8. If you run into any issues, please try setting the value to a float32 > 0 and <= 2.

- Groq is currently free but rate limited: 10 queries/minute, 100/hour.

```yaml
    - name: "groq"
      apiKey: "${GROQ_API_KEY}"
      baseURL: "https://api.groq.com/openai/v1/"
      models:
        default: [
          "llama2-70b-4096",
          "mixtral-8x7b-32768"
          ]
        fetch: false
      titleConvo: true
      titleMethod: "completion"
      titleModel: "mixtral-8x7b-32768"
      modelDisplayLabel: "groq"
      iconURL: "https://raw.githubusercontent.com/fuegovic/lc-config-yaml/main/icons/groq.png"
```

![image](https://github.com/danny-avila/LibreChat/assets/110412045/cc4f0710-7e27-4f82-8b4f-81f788a6cb13)


## Mistral AI

**Notes:**

- **Known:** icon provided, special handling of message roles: system message is only allowed at the top of the messages payload.

- API is strict with unrecognized parameters and errors are not descriptive (usually "no body")

    - The use of [`dropParams`](./custom_config.md#dropparams) to drop "stop", "user", "frequency_penalty", "presence_penalty" params is required.

- Allows fetching the models list, but be careful not to use embedding models for chat.

```yaml
    - name: "Mistral"
      apiKey: "${MISTRAL_API_KEY}"
      baseURL: "https://api.mistral.ai/v1"
      models:
        default: ["mistral-tiny", "mistral-small", "mistral-medium", "mistral-large-latest"]
        fetch: true
      titleConvo: true
      titleMethod: "completion"
      titleModel: "mistral-tiny"
      modelDisplayLabel: "Mistral"
      # Drop Default params parameters from the request. See default params in guide linked below.
      # NOTE: For Mistral, it is necessary to drop the following parameters or you will encounter a 422 Error:
      dropParams: ["stop", "user", "frequency_penalty", "presence_penalty"]
```

![image](https://github.com/danny-avila/LibreChat/assets/110412045/ddb4b2f3-608e-4034-9a27-3e94fc512034)


## Openrouter

**Notes:**

- **Known:** icon provided, fetching list of models is recommended as API token rates and pricing used for token credit balances when models are fetched.

- API may be strict for some models, and may not allow fields like `stop`, in which case, you should use [`dropParams`.](./custom_config.md#dropparams)

- Known issue: you should not use `OPENROUTER_API_KEY` as it will then override the `openAI` endpoint to use OpenRouter as well.

```yaml
    - name: "OpenRouter"
      # For `apiKey` and `baseURL`, you can use environment variables that you define.
      # recommended environment variables:
      # Known issue: you should not use `OPENROUTER_API_KEY` as it will then override the `openAI` endpoint to use OpenRouter as well.
      apiKey: "${OPENROUTER_KEY}"
      models:
        default: ["gpt-3.5-turbo"]
        fetch: true
      titleConvo: true
      titleMethod: "completion"
      titleModel: "gpt-3.5-turbo" # change to your preferred model
      modelDisplayLabel: "OpenRouter"
```

![image](https://github.com/danny-avila/LibreChat/assets/110412045/c4a0415e-732c-46af-82a6-3598663b7f42)
