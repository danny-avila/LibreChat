# Using LibreChat with LiteLLM Proxy 
Use LiteLLM Proxy for: 
* Calling 100+ LLMs Huggingface/Bedrock/TogetherAI/etc. in the OpenAI ChatCompletions & Completions format
* Load balancing - between Multiple Models + Deployments of the same model LiteLLM proxy can handle 1k+ requests/second during load tests
* Authentication & Spend Tracking Virtual Keys

## Start LiteLLM Proxy Server 
### Pip install litellm 
```shell
pip install litellm
```

### Create a config.yaml for litellm proxy 
More information about configs here: https://docs.litellm.ai/docs/simple_proxy#proxy-configs 

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

#### 3. Save fake OpenAI key in Librechat's `.env` 

Copy Librechat's `.env.example` to `.env` and overwrite the default OPENAI_API_KEY (by default it requires the user to pass a key).
```env
OPENAI_API_KEY=sk-1234
```

#### 4. Run LibreChat: 
```shell
docker compose up
```