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
> groq API key: [wow.groq.com](https://wow.groq.com/)

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
      titleModel: "mixtral-8x7b-32768"
      modelDisplayLabel: "groq"
```

![image](https://github.com/danny-avila/LibreChat/assets/110412045/cc4f0710-7e27-4f82-8b4f-81f788a6cb13)


## Mistral AI
> Mistral API key: [console.mistral.ai](https://console.mistral.ai/)

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
      titleModel: "mistral-tiny"
      modelDisplayLabel: "Mistral"
      # Drop Default params parameters from the request. See default params in guide linked below.
      # NOTE: For Mistral, it is necessary to drop the following parameters or you will encounter a 422 Error:
      dropParams: ["stop", "user", "frequency_penalty", "presence_penalty"]
```

![image](https://github.com/danny-avila/LibreChat/assets/110412045/ddb4b2f3-608e-4034-9a27-3e94fc512034)


## Openrouter
> OpenRouter API key: [openrouter.ai/keys](https://openrouter.ai/keys)

**Notes:**

- **Known:** icon provided, fetching list of models is recommended as API token rates and pricing used for token credit balances when models are fetched.

- It's recommended, and for some models required, to use [`dropParams`](./custom_config.md#dropparams) to drop the `stop` parameter as Openrouter models use a variety of stop tokens.

- **Known issue:** you should not use `OPENROUTER_API_KEY` as it will then override the `openAI` endpoint to use OpenRouter as well.

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
      titleModel: "gpt-3.5-turbo" # change to your preferred model
      modelDisplayLabel: "OpenRouter"
      # Recommended: Drop the stop parameter from the request as Openrouter models use a variety of stop tokens.
      dropParams: ["stop"]
```

![image](https://github.com/danny-avila/LibreChat/assets/110412045/c4a0415e-732c-46af-82a6-3598663b7f42)

## Anyscale
> Anyscale API key: [anyscale.com/credentials](https://app.endpoints.anyscale.com/credentials)

**Notes:**

- **Known:** icon provided, fetching list of models is recommended.

```yaml
    - name: "Anyscale"
      apiKey: "${ANYSCALE_API_KEY}"
      baseURL: "https://api.endpoints.anyscale.com/v1"
      models:
        default: [
          "meta-llama/Llama-2-7b-chat-hf",
          ]
        fetch: true
      titleConvo: true
      titleModel: "meta-llama/Llama-2-7b-chat-hf"
      summarize: false
      summaryModel: "meta-llama/Llama-2-7b-chat-hf"
      forcePrompt: false
      modelDisplayLabel: "Anyscale"
```

![image](https://github.com/danny-avila/LibreChat/assets/32828263/9f2d8ad9-3f49-4fe3-a3ed-c85994c1c85f)

## Fireworks
> Fireworks API key: [fireworks.ai/api-keys](https://fireworks.ai/api-keys)

**Notes:**

- **Known:** icon provided, fetching list of models is recommended.
- - API may be strict for some models, and may not allow fields like `user`, in which case, you should use [`dropParams`.](./custom_config.md#dropparams)

```yaml
    - name: "Fireworks"
      apiKey: "${FIREWORKS_API_KEY}"
      baseURL: "https://api.fireworks.ai/inference/v1"
      models:
        default: [
          "accounts/fireworks/models/mixtral-8x7b-instruct",
          ]
        fetch: true
      titleConvo: true
      titleModel: "accounts/fireworks/models/llama-v2-7b-chat"
      summarize: false
      summaryModel: "accounts/fireworks/models/llama-v2-7b-chat"
      forcePrompt: false
      modelDisplayLabel: "Fireworks"
      dropParams: ["user"]
```

![image](https://github.com/danny-avila/LibreChat/assets/32828263/e9254681-d4d8-43c7-a3c5-043c32a625a0)

## Perplexity
> Perplexity API key: [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)

**Notes:**

- **Known:** icon provided.
- **Known issue:** fetching list of models is not supported.
- API may be strict for some models, and may not allow fields like `stop` and `frequency_penalty` may cause an error when set to 0, in which case, you should use [`dropParams`.](./custom_config.md#dropparams)
- The example includes a model list, which was last updated on February 27, 2024, for your convenience.

```yaml
    - name: "Perplexity"
      apiKey: "${PERPLEXITY_API_KEY}"
      baseURL: "https://api.perplexity.ai/"
      models:
        default: [
          "mistral-7b-instruct",
          "sonar-small-chat",
          "sonar-small-online",
          "sonar-medium-chat",
          "sonar-medium-online"
          ]
        fetch: false # fetching list of models is not supported
      titleConvo: true
      titleModel: "sonar-medium-chat"
      summarize: false
      summaryModel: "sonar-medium-chat"
      forcePrompt: false
      dropParams: ["stop", "frequency_penalty"]
      modelDisplayLabel: "Perplexity"
```

![image](https://github.com/danny-avila/LibreChat/assets/32828263/6bf6c121-0895-4210-a1dd-e5e957992fd4)

## together.ai
> together.ai API key: [api.together.xyz/settings/api-keys](https://api.together.xyz/settings/api-keys)

**Notes:**

- **Known:** icon provided.
- **Known issue:** fetching list of models is not supported.
- The example includes a model list, which was last updated on February 27, 2024, for your convenience.

```yaml
    - name: "together.ai"
      apiKey: "${TOGETHERAI_API_KEY}"
      baseURL: "https://api.together.xyz"
      models:
        default: [
          "zero-one-ai/Yi-34B-Chat",
          "Austism/chronos-hermes-13b",
          "DiscoResearch/DiscoLM-mixtral-8x7b-v2",
          "Gryphe/MythoMax-L2-13b",
          "lmsys/vicuna-13b-v1.5",
          "lmsys/vicuna-7b-v1.5",
          "lmsys/vicuna-13b-v1.5-16k",
          "codellama/CodeLlama-13b-Instruct-hf",
          "codellama/CodeLlama-34b-Instruct-hf",
          "codellama/CodeLlama-70b-Instruct-hf",
          "codellama/CodeLlama-7b-Instruct-hf",
          "togethercomputer/llama-2-13b-chat",
          "togethercomputer/llama-2-70b-chat",
          "togethercomputer/llama-2-7b-chat",
          "NousResearch/Nous-Capybara-7B-V1p9",
          "NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO",
          "NousResearch/Nous-Hermes-2-Mixtral-8x7B-SFT",
          "NousResearch/Nous-Hermes-Llama2-70b",
          "NousResearch/Nous-Hermes-llama-2-7b",
          "NousResearch/Nous-Hermes-Llama2-13b",
          "NousResearch/Nous-Hermes-2-Yi-34B",
          "openchat/openchat-3.5-1210",
          "Open-Orca/Mistral-7B-OpenOrca",
          "togethercomputer/Qwen-7B-Chat",
          "snorkelai/Snorkel-Mistral-PairRM-DPO",
          "togethercomputer/alpaca-7b",
          "togethercomputer/falcon-40b-instruct",
          "togethercomputer/falcon-7b-instruct",
          "togethercomputer/GPT-NeoXT-Chat-Base-20B",
          "togethercomputer/Llama-2-7B-32K-Instruct",
          "togethercomputer/Pythia-Chat-Base-7B-v0.16",
          "togethercomputer/RedPajama-INCITE-Chat-3B-v1",
          "togethercomputer/RedPajama-INCITE-7B-Chat",
          "togethercomputer/StripedHyena-Nous-7B",
          "Undi95/ReMM-SLERP-L2-13B",
          "Undi95/Toppy-M-7B",
          "WizardLM/WizardLM-13B-V1.2",
          "garage-bAInd/Platypus2-70B-instruct",
          "mistralai/Mistral-7B-Instruct-v0.1",
          "mistralai/Mistral-7B-Instruct-v0.2",
          "mistralai/Mixtral-8x7B-Instruct-v0.1",
          "teknium/OpenHermes-2-Mistral-7B",
          "teknium/OpenHermes-2p5-Mistral-7B",
          "upstage/SOLAR-10.7B-Instruct-v1.0"
          ]
        fetch: false # fetching list of models is not supported
      titleConvo: true
      titleModel: "togethercomputer/llama-2-7b-chat"
      summarize: false
      summaryModel: "togethercomputer/llama-2-7b-chat"
      forcePrompt: false
      modelDisplayLabel: "together.ai"
```
## LiteLLM
> LiteLLM API key: master_key value [LiteLLM](./litellm.md)

**Notes:**

- Reference [LiteLLM](./litellm.md) for configuration.

```yaml
    - name: "LiteLLM"
      apiKey: "sk-from-config-file"
      baseURL: "http://localhost:8000/v1"
      models:
        default: ["gpt-3.5-turbo"]
        fetch: true
      titleConvo: true
      titleModel: "gpt-3.5-turbo"
      summarize: false
      summaryModel: "gpt-3.5-turbo"
      forcePrompt: false
      modelDisplayLabel: "LiteLLM"
```

## Ollama
> Ollama API key: Required but ignored - [Ollama OpenAI Compatibility](https://github.com/ollama/ollama/blob/main/docs/openai.md)

**Notes:**

- **Known:** icon provided.
- **Known issue:** fetching list of models is not supported. See [Pull Request 2728](https://github.com/ollama/ollama/pull/2728).
- Download models with ollama run command. See [Ollama Library](https://ollama.com/library)
- The example includes a top 5 popular model list from the Ollama Library, which was last updated on March 1, 2024, for your convenience.

```yaml
    - name: "Ollama"
      apiKey: "ollama"
      baseURL: "http://localhost:11434/v1/"
      models:
        default: [
          "llama2",
          "mistral",
          "codellama",
          "dolphin-mixtral",
          "mistral-openorca"
          ]
        fetch: false # fetching list of models is not supported
      titleConvo: true
      titleModel: "llama2"
      summarize: false
      summaryModel: "llama2"
      forcePrompt: false
      modelDisplayLabel: "Ollama"
```
