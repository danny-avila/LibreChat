# StackIT AI Model Serving Setup

This guide explains how to configure LibreChat to use STACKIT AI Model Serving as an AI provider.

## Overview

STACKIT AI Model Serving is a German cloud AI service by Schwarz IT that provides OpenAI-compatible API access to various open-source large language models. The service is hosted in the EU (eu01 region) and offers competitive pricing with generous rate limits.

## Available Models

### Agent-Capable Models (with Tool Calling Support)
These models support LibreChat Agents with tool calling capabilities:
- `cortecs/Llama-3.3-70B-Instruct-FP8-Dynamic` - Llama 3.3 70B (most capable, supports agents)
- `neuralmagic/Meta-Llama-3.1-8B-Instruct-FP8` - Llama 3.1 8B (fast, supports agents)

### Chat-Only Models (No Tool Calling)
These models are for regular chat conversations only:
- `google/gemma-3-27b-it` - Google Gemma 3 27B
- `neuralmagic/Mistral-Nemo-Instruct-2407-FP8` - Mistral Nemo

### Embedding Models
- `intfloat/e5-mistral-7b-instruct`

## Rate Limits

- **Tokens per Minute (TPM)**: 200,000
- **Requests per Minute (RPM)**: 80-600 (varies by model)

## Setup Instructions

### 1. Get Your StackIT Credentials

1. Log in to the [STACKIT Portal](https://portal.stackit.cloud/)
2. Navigate to **AI Model Serving**
3. Generate an API token/key
4. Copy your **Project ID** and **API Key/Token**

### 2. Configure Environment Variables

Add your StackIT API key to your `.env` file:

```bash
STACKIT_API_KEY=<your-stackit-api-key>
```

**IMPORTANT**: Never commit your actual API key to git. The `.env` file is gitignored.

### 3. Configuration in librechat.yaml

StackIT is configured with **two separate endpoints** in `librechat.yaml`:

1. **StackIT Agents** - For models that support tool calling (Agents)
2. **StackIT** - For regular chat models without agent support

This separation ensures that each model is used correctly based on its capabilities.

```yaml
endpoints:
  custom:
    # STACKIT AI Model Serving
    - name: 'StackIT'
      apiKey: '${STACKIT_API_KEY}'
      baseURL: 'https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1'
      models:
        default: [
          'cortecs/Llama-3.3-70B-Instruct-FP8-Dynamic',
          'google/gemma-3-27b-it',
          'neuralmagic/Mistral-Nemo-Instruct-2407-FP8',
          'neuralmagic/Meta-Llama-3.1-8B-Instruct-FP8'
        ]
        fetch: false
      titleConvo: true
      titleModel: 'neuralmagic/Meta-Llama-3.1-8B-Instruct-FP8'
      modelDisplayLabel: 'StackIT'
      iconURL: 'https://portal.stackit.cloud/assets/img/app-icons/common/stackit-shared.jpg'
      stream: true
      dropParams: ['stop', 'user', 'frequency_penalty', 'presence_penalty']
```

### 4. Restart LibreChat

After adding your API key, restart the LibreChat server:

```bash
npm run backend:dev
```

Or if running in Docker:

```bash
docker compose down
docker compose up -d
```

## Usage

### For Regular Chat

1. Open LibreChat in your browser
2. Click on the model selector dropdown
3. Select **"StackIT"** endpoint
4. Choose a model:
   - `google/gemma-3-27b-it`
   - `neuralmagic/Mistral-Nemo-Instruct-2407-FP8`
5. Start chatting!

### For Agents (with Tool Calling)

1. Open LibreChat in your browser
2. Create or open an Agent
3. Select **"StackIT Agents"** as the provider
4. Choose an agent-capable model:
   - `cortecs/Llama-3.3-70B-Instruct-FP8-Dynamic` (recommended, most capable)
   - `neuralmagic/Meta-Llama-3.1-8B-Instruct-FP8` (faster, good for simple tasks)
5. Configure your agent's tools and start using it!

**Important**: Don't try to use regular "StackIT" models with Agents - they don't support tool calling and will return errors.

## Features

- **OpenAI-Compatible API**: Works seamlessly with LibreChat's existing infrastructure
- **Streaming Support**: Real-time response streaming enabled
- **EU-based**: Data processing in European data centers (eu01 region)
- **Multiple Models**: Access to Llama, Gemma, and Mistral models
- **Automatic Titles**: Uses the fast Llama 3.1 8B model for conversation titles

## Troubleshooting

### Authentication Errors

If you receive 401/403 errors:
- Verify your `STACKIT_API_KEY` is correctly set in `.env`
- Check that the API key is still valid in the STACKIT Portal
- Ensure there are no extra spaces or quotes around the key

### Model Not Available

If a specific model returns errors:
- Check the [STACKIT documentation](https://docs.stackit.cloud/stackit/de/getting-started-with-shared-models-319914579.html) for model availability
- Some models may have limited availability or require special access

### Rate Limiting

If you hit rate limits:
- StackIT provides 200,000 tokens per minute
- Consider using the smaller 8B models for less critical tasks
- Implement request queuing in high-traffic scenarios

## Additional Resources

- [STACKIT AI Model Serving Documentation](https://docs.stackit.cloud/stackit/de/getting-started-with-shared-models-319914579.html)
- [STACKIT Portal](https://portal.stackit.cloud/)
- [LibreChat Configuration Guide](https://www.librechat.ai/docs/configuration/librechat_yaml)

## Pricing

For current pricing information, visit the STACKIT Portal or contact STACKIT sales.

## Support

For StackIT-specific issues:
- Contact STACKIT Support through the portal
- Check STACKIT documentation

For LibreChat integration issues:
- Open an issue on [LibreChat GitHub](https://github.com/danny-avila/LibreChat)
- Check LibreChat documentation
