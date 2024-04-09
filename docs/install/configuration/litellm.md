---
title: 🚅 LiteLLM
description: Using LibreChat with LiteLLM Proxy 
weight: -7
---

# Using LibreChat with LiteLLM Proxy 
Use **[LiteLLM Proxy](https://docs.litellm.ai/docs/simple_proxy)** for: 

* Calling 100+ LLMs Huggingface/Bedrock/TogetherAI/etc. in the OpenAI ChatCompletions & Completions format
* Load balancing - between Multiple Models + Deployments of the same model LiteLLM proxy can handle 1k+ requests/second during load tests
* Authentication & Spend Tracking Virtual Keys

## Start LiteLLM Proxy Server 
### 1. Uncomment desired sections in docker-compose.override.yml
The override file contains sections for the below LiteLLM features

Minimum working `docker-compose.override.yml` Example:
```
litellm:
    image: ghcr.io/berriai/litellm:main-latest
    volumes:
      - ./litellm/litellm-config.yaml:/app/config.yaml
      # NOTE: For Google - required auth "GOOGLE_APPLICATION_CREDENTIALS" envronment and volume mount
      # This also means you need to add the `application_default_credentaials.json` file within ~/litellm
      - ./litellm/application_default_credentials.json:/app/application_default_credentials.json
    ports:
      - "4000:8000"
    command: [ "--config", "/app/config.yaml", "--port", "8000", "--num_workers", "8" ]
    For Google - see above about required auth "GOOGLE_APPLICATION_CREDENTIALS" envronment and volume mount
    environment:
      GOOGLE_APPLICATION_CREDENTIALS: /app/application_default_credentials.json
```

#### Caching with Redis
Litellm supports in-memory, redis, and s3 caching. Note: Caching currently only works with exact matching.

#### Performance Monitoring with Langfuse
Litellm supports various logging and observability options.  The settings below will enable Langfuse which will provide a cache_hit tag showing which conversations used cache.

### 2. Create a Config for LiteLLM proxy 
LiteLLM requires a configuration file in addition to the override file. Within LibreChat, this will be `litellm/litellm-config.yml`. The file 
below has the options to enable llm proxy to various providers, load balancing, Redis caching, and Langfuse monitoring. Review documentation for other configuration options.
More information on LiteLLM configurations here: **[docs.litellm.ai/docs/simple_proxy](https://docs.litellm.ai/docs/simple_proxy)**

#### Working Example of incorporating OpenAI, Azure OpenAI, AWS Bedrock, and GCP

Please note the `...` being a secret or a value you should not share (API key, custom tenant endpoint, etc)
You can potentially use env variables for these too, ex: `api_key: "os.environ/AZURE_API_KEY" # does os.getenv("AZURE_API_KEY")`
```yaml
model_list:
  # https://litellm.vercel.app/docs/proxy/quick_start
  - model_name: claude-3-haiku
    litellm_params:
      model: bedrock/anthropic.claude-3-haiku-20240307-v1:0
      aws_region_name: us-east-1
      aws_access_key_id: A...
      aws_secret_access_key: ...

  - model_name: claude-3-sonnet
    litellm_params:
      model: bedrock/anthropic.claude-3-sonnet-20240229-v1:0
      aws_region_name: us-east-1
      aws_access_key_id: A...
      aws_secret_access_key: ...

  - model_name: claude-v2
    litellm_params:
      model: bedrock/anthropic.claude-v2:1
      aws_region_name: us-east-1
      aws_access_key_id: A...
      aws_secret_access_key: ...

  - model_name: claude-instant
    litellm_params:
      model: bedrock/anthropic.claude-instant-v1
      aws_region_name: us-east-1
      aws_access_key_id: A...
      aws_secret_access_key: ...

  - model_name: llama2-13b
    litellm_params:
      model: bedrock/meta.llama2-13b-chat-v1
      aws_region_name: us-east-1
      aws_access_key_id: A...
      aws_secret_access_key: ...

  - model_name: llama2-70b
    litellm_params:
      model: bedrock/meta.llama2-70b-chat-v1
      aws_region_name: us-east-1
      aws_access_key_id: A...
      aws_secret_access_key: ...

  - model_name: mistral-7b-instruct
    litellm_params:
      model: bedrock/mistral.mistral-7b-instruct-v0:2
      aws_region_name: us-east-1
      aws_access_key_id: A...
      aws_secret_access_key: ...

  - model_name: mixtral-8x7b-instruct
    litellm_params:
      model: bedrock/mistral.mixtral-8x7b-instruct-v0:1
      aws_region_name: us-east-1
      aws_access_key_id: A...
      aws_secret_access_key: ...


  - model_name: azure-gpt-4-turbo-preview
    litellm_params:
      model: azure/gpt-4-turbo-preview
      api_base: https://tenant.openai.azure.com/
      api_key: ...

  - model_name: azure-gpt-3.5-turbo
    litellm_params:
      model: azure/gpt-35-turbo
      api_base: https://tenant.openai.azure.com/
      api_key: ...

  - model_name: azure-gpt-4
    litellm_params:
      model: azure/gpt-4
      api_base: https://tenant.openai.azure.com/
      api_key: ...

  - model_name: azure-gpt-3.5-turbo-16k
    litellm_params:
      model: azure/gpt-35-turbo-16k
      api_base: https://tenant.openai.azure.com/
      api_key: ...

  - model_name: azure-gpt-4-32k
    litellm_params:
      model: azure/gpt-4-32k
      api_base: https://tenant.openai.azure.com/
      api_key: ...


  - model_name: openai-gpt-4-turbo-preview
    litellm_params:
      model: gpt-4-turbo-preview
      api_key: sk-...

  - model_name: openai-gpt-3.5-turbo
    litellm_params:
      model: gpt-3.5-turbo
      api_key: sk-...

  - model_name: openai-gpt-4
    litellm_params:
      model: gpt-4
      api_key: sk-...

  - model_name: openai-gpt-3.5-turbo-16k
    litellm_params:
      model: gpt-3.5-turbo-16k
      api_key: sk-...

  - model_name: openai-gpt-4-32k
    litellm_params:
      model: gpt-4-32k
      api_key: sk-...

  - model_name: openai-gpt-4-vision-preview
    litellm_params:
      model: gpt-4-vision-preview
      api_key: sk-...

  # NOTE: For Google - see above about required auth "GOOGLE_APPLICATION_CREDENTIALS" envronment and volume mount
  - model_name: google-chat-bison
    litellm_params:
      model: vertex_ai/chat-bison
      vertex_project: ...
      vertex_location: us-central1

  # NOTE: For Google - see above about required auth "GOOGLE_APPLICATION_CREDENTIALS" envronment and volume mount
  - model_name: google-chat-bison-32k
    litellm_params:
      model: vertex_ai/chat-bison-32k
      vertex_project: ...
      vertex_location: us-central1

  # NOTE: For Google - see above about required auth "GOOGLE_APPLICATION_CREDENTIALS" envronment and volume mount
  - model_name: google-gemini-pro
    litellm_params:
      model: vertex_ai/gemini-pro
      vertex_project: ...
      vertex_location: us-central1

litellm_settings:
  success_callback: ["langfuse"]
  cache: True
  cache_params:
    type: "redis"
    supported_call_types: ["acompletion", "completion", "embedding", "aembedding"]
general_settings:
  master_key: sk_live_SetToRandomValue
```

#### Example of a few Different Options (ex: rpm, stream, ollama)
```yaml

model_list:
  - model_name: gpt-3.5-turbo
    litellm_params:
      model: azure/gpt-turbo-small-eu
      api_base: https://my-endpoint-europe-berri-992.openai.azure.com/
      api_key: 
      rpm: 6      # Rate limit for this deployment: in requests per minute (rpm)
  - model_name: gpt-3.5-turbo
    litellm_params:
      model: azure/gpt-turbo-small-ca
      api_base: https://my-endpoint-canada-berri992.openai.azure.com/
      api_key: 
      rpm: 6
  - model_name: gpt-3.5-turbo
    litellm_params:
      model: azure/gpt-turbo-large
      api_base: https://openai-france-1234.openai.azure.com/
      api_key: 
      rpm: 1440
  - model_name: mixtral
    litellm_params:
      model: openai/mixtral:8x7b-instruct-v0.1-q5_K_M      # use openai/* for ollama's openai api compatibility
      api_base: http://ollama:11434/v1
      stream: True
  - model_name: mistral
    litellm_params:
      model: openai/mistral                                # use openai/* for ollama's openai api compatibility
      api_base: http://ollama:11434/v1
      stream: True
litellm_settings:
  success_callback: ["langfuse"]
  cache: True
  cache_params:
    type: "redis"
    supported_call_types: ["acompletion", "completion", "embedding", "aembedding"]
general_settings:
  master_key: sk_live_SetToRandomValue
```



### 3. Configure LibreChat

Use `librechat.yaml` [Configuration file (guide here)](./ai_endpoints.md) to add Reverse Proxies as separate endpoints.

Here is an example config:

```
custom:
    - name: "Lite LLM"
      # A place holder - otherwise it becomes the default (OpenAI) key
      # Provide the key instead in each "model" block within "litellm/litellm-config.yaml"
      apiKey: "sk-from-config-file"
      # See the required changes above in "Start LiteLLM Proxy Server" step.
      baseURL: "http://host.docker.internal:4000"
      # A "default" model to start new users with. The "fetch" will pull the rest of the available models from LiteLLM
      # More or less this is "irrelevant", you can pick any model. Just pick one you have defined in LiteLLM.
      models:
        default: ["gpt-3.5-turbo"]
        fetch: true
      titleConvo: true
      titleModel: "gpt-3.5-turbo"
      summarize: false
      summaryModel: "gpt-3.5-turbo"
      forcePrompt: false
      modelDisplayLabel: "Lite LLM"
```
---

### Why use LiteLLM?

1. **Access to Multiple LLMs**: It allows calling over 100 LLMs from platforms like Huggingface, Bedrock, TogetherAI, etc., using OpenAI's ChatCompletions and Completions format.

2. **Load Balancing**: Capable of handling over 1,000 requests per second during load tests, it balances load across various models and deployments.

3. **Authentication & Spend Tracking**: The server supports virtual keys for authentication and tracks spending.

Key components and features include:

- **Installation**: Easy installation.
- **Testing**: Testing features to route requests to specific models.
- **Server Endpoints**: Offers multiple endpoints for chat completions, completions, embeddings, model lists, and key generation.
- **Supported LLMs**: Supports a wide range of LLMs, including AWS Bedrock, Azure OpenAI, Huggingface, AWS Sagemaker, Anthropic, and more.
- **Proxy Configurations**: Allows setting various parameters like model list, server settings, environment variables, and more.
- **Multiple Models Management**: Configurations can be set up for managing multiple models with fallbacks, cooldowns, retries, and timeouts.
- **Embedding Models Support**: Special configurations for embedding models.
- **Authentication Management**: Features for managing authentication through virtual keys, model upgrades/downgrades, and tracking spend.
- **Custom Configurations**: Supports setting model-specific parameters, caching responses, and custom prompt templates.
- **Debugging Tools**: Options for debugging and logging proxy input/output.
- **Deployment and Performance**: Information on deploying LiteLLM Proxy and its performance metrics.
- **Proxy CLI Arguments**: A wide range of command-line arguments for customization.

Overall, LiteLLM Server offers a comprehensive suite of tools for managing, deploying, and interacting with a variety of LLMs, making it a versatile choice for large-scale AI applications.
