---
title: OpenRouter
description: Setup guide for OpenRouter integration with LibreChat
---

# OpenRouter

OpenRouter provides access to 100+ AI models through a unified API with automatic routing and privacy features.

## Setup

### 1. Create OpenRouter Account

Sign up at [openrouter.ai](https://openrouter.ai)

### 2. Generate API Key

1. Navigate to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Click "Create Key"
3. Copy your API key (starts with `sk-or-`)

### 3. Configure Environment

Add to your `.env` file:

```bash
OPENROUTER_API_KEY=sk-or-your-key-here

# Optional: Site attribution for better rate limits
OPENROUTER_SITE_URL=http://localhost:3080
OPENROUTER_SITE_NAME=LibreChat
```

## Model Configuration

OpenRouter automatically provides access to all available models based on your account. Models are dynamically fetched and include:

- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude 3 family)
- Google (Gemini Pro)
- Meta (Llama 3)
- 100+ additional models

To use specific models only, you can set:

```bash
OPENROUTER_MODELS=openai/gpt-4,anthropic/claude-3-opus,google/gemini-pro
```

## Features

- **Auto-Router**: Enable automatic model selection via the UI toggle
- **Zero Data Retention (ZDR)**: Privacy mode available via shield icon
- **Full Agent Support**: Native tool/function calling for compatible models
- **Credits Display**: Real-time balance shown in navigation bar

## Technical Implementation

OpenRouter uses a custom `ChatOpenRouter` class (extends langchain's `ChatOpenAI`) located at `api/app/clients/llm/ChatOpenRouter.js` that provides:
- Proper streaming with model detection for Auto-Router
- ZDR header injection (`X-OpenAI-Enable-Compliance`) when privacy mode is enabled
- Real-time model indicator updates in UI through custom stream parsing
- Full compatibility with LibreChat's Agent system via `createLLM` integration
- Automatic detection of OpenRouter requests by baseURL pattern matching

## Notes

- Credits are deducted per request based on [model pricing](https://openrouter.ai/pricing)
- View usage history at [openrouter.ai/activity](https://openrouter.ai/activity)
- API key can also be set to `user_provided` to allow users to supply their own keys
- For advanced configurations, see [OpenRouter API docs](https://openrouter.ai/docs)