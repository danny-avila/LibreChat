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

#### Caching with Redis
Litellm supports in-memory, redis, and s3 caching. Note: Caching currently only works with exact matching.

#### Performance Monitoring with Langfuse
Litellm supports various logging and observability options.  The settings below will enable Langfuse which will provide a cache_hit tag showing which conversations used cache.

### 2. Create a config.yaml for LiteLLM proxy 
LiteLLM requires a configuration file in addition to the override file. The file 
below has the options to enable llm proxy to various providers, load balancing, Redis caching, and Langfuse monitoring. Review documentation for other configuration options.
More information on LiteLLM configurations here: **[docs.litellm.ai/docs/simple_proxy](https://docs.litellm.ai/docs/simple_proxy)**

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
      model: ollama/mixtral:8x7b-instruct-v0.1-q5_K_M
      api_base: http://ollama:11434
      stream: True
  - model_name: mistral
    litellm_params:
      model: ollama/mistral
      api_base: http://ollama:11434
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