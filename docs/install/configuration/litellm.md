---
title: 🚅 LiteLLM and Ollama
description: Using LibreChat with LiteLLM Proxy 
weight: -7
---

# Using LibreChat with LiteLLM Proxy 
Use **[LiteLLM Proxy](https://docs.litellm.ai/docs/simple_proxy)** for: 
* Calling 100+ LLMs Huggingface/Bedrock/TogetherAI/etc. in the OpenAI ChatCompletions & Completions format
* Load balancing - between Multiple Models + Deployments of the same model LiteLLM proxy can handle 1k+ requests/second during load tests
* Authentication & Spend Tracking Virtual Keys

## Start LiteLLM Proxy Server 
### Pip install litellm 
```shell
pip install litellm
```

### Create a config.yaml for litellm proxy 
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
```

### Start the proxy
```shell
litellm --config /path/to/config.yaml

#INFO: Proxy running on http://0.0.0.0:8000
```

## Use LiteLLM Proxy Server with LibreChat


#### 1. Clone the repo
```shell
git clone https://github.com/danny-avila/LibreChat.git
```


#### 2. Modify Librechat's `docker-compose.yml`
```yaml
OPENAI_REVERSE_PROXY=http://host.docker.internal:8000/v1/chat/completions
```

**Important**: As of v0.6.6, it's recommend you use the `librechat.yaml` [Configuration file (guide here)](./custom_config.md) to add Reverse Proxies as separate endpoints.

#### 3. Save fake OpenAI key in Librechat's `.env` 

Copy Librechat's `.env.example` to `.env` and overwrite the default OPENAI_API_KEY (by default it requires the user to pass a key).
```env
OPENAI_API_KEY=sk-1234
```

#### 4. Run LibreChat: 
```shell
docker compose up
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

## Ollama
Use [Ollama](https://ollama.ai/) for

* Run large language models on local hardware
* Host multiple models
* Dynamically load the model upon request

### GPU Acceleration

- **Linux**: Requires a Linux distrubution support by official Nvidia drivers. [Nvidia CUDA Toolkit](https://developer.nvidia.com/cuda-downloads?target_os=Linux)
- **Windows**: Requires Windows Subsytem for Linux. Follow Nvidia instructions at [Nvidia WSL User Guide](https://docs.nvidia.com/cuda/wsl-user-guide/index.html)
- **macOS**: [macOS Ollama Download](https://ollama.ai/download/mac)

### docker-compose.override.yml with GPU
```yaml
version: "3.8"
services:
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    volumes:
      - ./litellm/litellm-config.yaml:/app/config.yaml
    command: [ "--config", "/app/config.yaml", "--port", "8000", "--num_workers", "8" ]
  ollama:
    image: ollama/ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              capabilities: [compute, utility]
    ports:
      - "11434:11434"
    volumes:
      - ./ollama:/root/.ollama

```

### Loading Models in Ollama
1. Browse the available models at [Ollama Library](https://ollama.ai/library)
2. Run ```docker exec -it ollama /bin/bash```
3. Copy the text from the Tags tab from the library website. It should begin with 'ollama run'
4. Check model size. Models that can run in GPU memory perform the best.
5. Use /bye to exit the terminal

### Litellm Ollama Configuration
Add the below lines to the config to access the Ollama models
```yaml
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
```

## Caching with Redis
Litellm supports in-memory, redis, and s3 caching. Note: Caching currently only works with exact matching.

### Update docker-compose.override.yml to enable Redis
Add the below service to your docker-compose.override.yml
```yaml
  redis:
    image: redis:7-alpine
    command:
    - sh
    - -c # this is to evaluate the $REDIS_PASSWORD from the env
    - redis-server --appendonly yes --requirepass $$REDIS_PASSWORD ## $$ because of docker-compose
    environment:
      REDIS_PASSWORD: RedisChangeMe
    volumes:
    - ./redis:/data
```

Add the following to the environment variables in the litellm service inside the docker-compose.override.yml
```yaml
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    volumes:
      - ./litellm/litellm-config.yaml:/app/config.yaml
    command: [ "--config", "/app/config.yaml", "--port", "8000", "--num_workers", "8" ]
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: RedisChangeMe
```

### Update Litellm Config File
Add the below options to the litellm config file
```yaml
litellm_settings: # module level litellm settings - https://github.com/BerriAI/litellm/blob/main/litellm/__init__.py
  cache: True          # set cache responses to True, litellm defaults to using a redis cache
  cache_params:         # cache_params are optional
    type: "redis"  # The type of cache to initialize. Can be "local" or "redis". Defaults to "local".

    # Optional configurations
    supported_call_types: ["acompletion", "completion", "embedding", "aembedding"] # defaults to all litellm call types
```


## Performance Monitoring with Langfuse
Litellm supports various logging and observability options.  The settings below will enable Langfuse which will provide a cache_hit tag showing which conversations used cache.

### Update docker-compose.override.yml to enable Langfuse
Langfuse requires a postgres database, so add both postgres and langfuse services to the docker-compose.override.yml
```yaml
  langfuse-server:
    image: ghcr.io/langfuse/langfuse:latest
    depends_on:
      - db
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:PostgresChangeMe@db:5432/postgres
      - NEXTAUTH_SECRET=ChangeMe
      - SALT=ChangeMe
      - NEXTAUTH_URL=http://localhost:3000
      - TELEMETRY_ENABLED=${TELEMETRY_ENABLED:-true}
      - NEXT_PUBLIC_SIGN_UP_DISABLED=${NEXT_PUBLIC_SIGN_UP_DISABLED:-false}
      - LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=${LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES:-false}

  db:
    image: postgres
    restart: always
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=PostgresChangeMe
      - POSTGRES_DB=postgres
    volumes:
      - ./postgres:/var/lib/postgresql/data
```

Once Langfuse is running, create an account by accessing the web interface on port 3000. Create a new project to obtain the needed public and private key used by the litellm config
Add environement variable within the litellm service within docker-compose.override.yml
```yaml
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports:
      - "8000:8000"
    volumes:
      - /srv/litellm/config/litellm-config.yaml:/app/config.yaml
    command: [ "--config", "/app/config.yaml", "--port", "8000", "--num_workers", "8" ]
    environment:
      LANGFUSE_PUBLIC_KEY: pk-lf-RandomStringFromLangfuseWebInterface
      LANGFUSE_SECRET_KEY: sk-lf-RandomStringFromLangfuseWebInterface
      LANGFUSE_HOST: http://langfuse-server:3000
```

### Update litellm config file
```yaml
litellm_settings:
  success_callback: ["langfuse"]
```
