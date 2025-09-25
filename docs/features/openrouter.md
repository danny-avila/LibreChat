---
title: OpenRouter Features
description: Advanced features available with OpenRouter integration
---

# OpenRouter Features

OpenRouter integration in LibreChat provides advanced routing and privacy features for accessing 100+ AI models through a dual implementation architecture.

## Architecture Overview

LibreChat uses two parallel implementations for OpenRouter:

- **`OpenRouterClient`**: Direct chat conversations (non-agent mode)
  - Extends BaseClient for standard messaging
  - Handles streaming, credits, and model caching
  - Detects Auto-Router model in real-time

- **`ChatOpenRouter`**: Agent and tool-enabled conversations
  - Provided via our enhanced [`@librechat/agents` fork](https://github.com/biostochastics/librechat-agents-openrouter)
  - Extends LangChain's ChatOpenAI for compatibility
  - Enables full Agent system integration
  - Supports function calling and tools
  - Includes auto-router detection and ZDR support

Both implementations share the same features but serve different use cases.

### Dependencies

The Agent implementation requires our enhanced fork of @librechat/agents:
```bash
# Install from GitHub
npm install github:biostochastics/librechat-agents-openrouter#main
```

## Auto-Router

The Auto-Router feature automatically selects the optimal model for each request:

1. Click the lightning bolt icon in the navigation bar
2. When enabled, model selector shows "auto"
3. OpenRouter analyzes your prompt and selects the best model
4. The actual model used appears next to credits after response

**Technical Details**:
- Direct chat: `OpenRouterClient` detects model in streaming response
- Agent mode: `ChatOpenRouter` intercepts fetch to parse SSE stream
- Both extract model from `data.model` field when != 'openrouter/auto'

## Zero Data Retention (ZDR)

Enable privacy-compliant routing:

1. Click the shield icon in the navigation bar
2. When active (amber color), requests only route to providers with no data retention
3. Some models may be unavailable in ZDR mode
4. Configure account privacy at [openrouter.ai/settings/privacy](https://openrouter.ai/settings/privacy)

**Technical Details**:
- Sends `X-OpenRouter-ZDR: true` header when enabled
- Works across both `OpenRouterClient` and `ChatOpenRouter`
- Ensures compliance with data retention policies

## Credits Management

Monitor usage in real-time:

- Current balance displayed in navigation bar
- Updates after each request
- Add credits at [openrouter.ai/credits](https://openrouter.ai/credits)
- Warning displayed when balance < $1.00

## Agent Compatibility

OpenRouter works seamlessly with LibreChat's Agent system:

- Full tool/function calling support
- Compatible with code interpreter, file search, and custom tools
- Model must support tool calling (check [model list](https://openrouter.ai/models))

## Model Access

Access 100+ models from major providers:

- **OpenAI**: GPT-4, GPT-3.5 Turbo
- **Anthropic**: Claude 3 Opus, Sonnet, Haiku
- **Google**: Gemini Pro, PaLM
- **Meta**: Llama 3 70B/8B
- **Plus**: Mistral, Mixtral, Command R, and many more

## Docker Deployment

### Build Instructions

Due to Docker Hub's rate limiting (100 pulls/6 hours for anonymous users), we use a multi-stage build approach:

```bash
# Standard build command
docker compose build --no-cache api

# The build process:
# 1. Uses ghcr.io/danny-avila/librechat-dev:latest as base (no auth required)
# 2. Installs git and build tools for GitHub packages
# 3. Installs all dependencies including our agents fork
# 4. Builds the production image with all OpenRouter features
```

### Dockerfile Architecture

Our enhanced Dockerfile uses a 3-stage build:
1. **Base Stage**: Uses GitHub Container Registry image (bypasses Docker Hub auth)
2. **Builder Stage**: Installs git, builds dependencies, compiles frontend
3. **Production Stage**: Optimized final image with only runtime requirements

### Troubleshooting Docker Build

If you encounter authentication errors:
```bash
# Pull the base image first
docker pull ghcr.io/danny-avila/librechat-dev:latest

# Then build
docker compose build api
```

The multi-stage Dockerfile ensures:
- ✅ GitHub packages (like our agents fork) install correctly
- ✅ No Docker Hub authentication required
- ✅ Optimized image size through multi-stage builds
- ✅ All OpenRouter features available in container

## Troubleshooting

### Common Issues

- **"No models available"**: Check API key and account credits
- **"404 No endpoints found"**: Enable ZDR or adjust privacy settings
- **Auto-Router not working**: Ensure toggle is enabled and model shows "auto"
- **Docker build fails with auth error**: Docker Hub rate limiting - use our multi-stage Dockerfile
- **ChatOpenRouter not found in container**: Ensure git is installed during build for GitHub packages

For detailed setup instructions, see [Configuration Guide](/docs/configuration/pre_configured_ai/openrouter).