# OpenRouter Configuration

## Overview

OpenRouter is now a **native provider** in LibreChat, providing access to 100+ AI models with automatic fallback, smart routing, and credits tracking. The native integration enables full compatibility with the Agent system and advanced features.

## Features

- **100+ Models**: Access models from OpenAI, Anthropic, Google, Meta, and more through a single API
- **Automatic Fallback**: Configure fallback chains for high availability
- **Smart Routing**: Automatic selection of the best model for your request
- **Credits Tracking**: Real-time credits display and usage monitoring
- **Agent Compatibility**: Full support for LibreChat's Agent system with tool calling
- **Native Tool Support**: Complete OpenAI-compatible tool/function calling for agents
- **Native Integration**: No YAML configuration required

## Setup

### 1. Get an API Key

1. Sign up at [OpenRouter.ai](https://openrouter.ai)
2. Navigate to [Keys](https://openrouter.ai/keys)
3. Create a new API key
4. Copy the key (starts with `sk-or-`)

### 2. Configure Environment

Add to your `.env` file:

```bash
# OpenRouter API Key (required)
OPENROUTER_API_KEY=sk-or-your-key-here

# Optional: Site attribution headers
OPENROUTER_SITE_URL=http://localhost:3080
OPENROUTER_SITE_NAME=LibreChat

# Optional: Cache settings (defaults shown)
OPENROUTER_CACHE_TTL_CREDITS=300000  # 5 minutes in ms
OPENROUTER_CACHE_TTL_MODELS=3600000   # 1 hour in ms
```

### 3. Restart LibreChat

```bash
docker-compose restart
# or
npm run backend
```

## Usage

### Basic Chat

1. Select **OpenRouter** from the provider dropdown
2. Choose a model (e.g., `claude-3-opus`, `gpt-4`, `llama-3-70b`)
3. Start chatting - requests are automatically routed through OpenRouter

### Using with Agents

OpenRouter is fully compatible with the Agent system:

1. Navigate to Agent Builder
2. Select **OpenRouter** as the provider
3. Configure your preferred model
4. Set up fallback models for high availability
5. Save and use your agent

### Configuring Fallbacks

OpenRouter supports automatic fallback to alternative models:

1. Select OpenRouter as provider
2. In settings, enable "Fallback Models"
3. Add models to your fallback chain
4. Drag to reorder priority
5. If the primary model fails, the next model is automatically used

Example fallback chain:
- Primary: `claude-3-opus`
- Fallback 1: `gpt-4`
- Fallback 2: `claude-3-sonnet`
- Fallback 3: `llama-3-70b`

### Auto Router

OpenRouter's Auto Router automatically selects the best model:

1. Select OpenRouter as provider
2. Choose "Auto Router" from the model dropdown
3. OpenRouter will automatically pick the optimal model based on:
   - Request content
   - Model availability
   - Cost optimization
   - Performance requirements

## Models

### Popular Models Available

- **OpenAI**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- **Anthropic**: Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku
- **Google**: Gemini Pro, Gemini Pro Vision, PaLM 2
- **Meta**: Llama 3 70B, Llama 3 8B, Code Llama
- **Mistral**: Mistral Large, Mistral Medium, Mixtral
- **And many more...**

### Viewing Available Models

The model list is dynamically fetched from OpenRouter:

1. Select OpenRouter from the provider dropdown
2. Click on the model selector
3. Browse all available models with pricing info
4. Search for specific models

## Credits and Billing

### Viewing Credits

Your OpenRouter balance is displayed in the UI:
- Top navigation bar shows current balance
- Updates every 5 minutes or on manual refresh
- Warning displayed when balance < $1

### Managing Credits

1. Visit [OpenRouter Dashboard](https://openrouter.ai/dashboard)
2. Add credits using credit card or cryptocurrency
3. View usage history and analytics
4. Set up usage alerts

### Cost Optimization

- Use smaller models for simple tasks
- Configure fallback to cheaper models
- Monitor usage through the dashboard
- Set daily/monthly spending limits

## Tool Calling and Agents

### Native Tool Support

OpenRouter now supports OpenAI-compatible tool/function calling, enabling full agent functionality:

- **Tool Definitions**: Define tools in OpenAI format
- **Tool Choice**: Control tool selection with `auto`, `none`, `required`, or specific tool
- **Parallel Execution**: Enable parallel tool calls for efficiency
- **Legacy Support**: Backward compatible with function_call format

### Using with Agents

1. Create an agent in the Agent Builder
2. Select OpenRouter as the provider
3. Choose a model that supports tool calling (e.g., GPT-4, Claude 3)
4. Add tools to your agent
5. The agent will automatically use tools when appropriate

### Supported Models for Tools

Most modern models support tool calling:
- OpenAI GPT-4 family
- Claude 3 models
- Gemini Pro models
- Other models with function calling capability

### Example Tool Usage

```javascript
// Tools are automatically handled by the agent system
const agent = {
  provider: 'openrouter',
  model: 'openai/gpt-4-turbo',
  tools: ['calculator', 'web_search', 'code_interpreter']
};
```

## Advanced Configuration

### Custom Headers

OpenRouter uses special headers for attribution:

```javascript
// Automatically configured from environment
HTTP-Referer: process.env.OPENROUTER_SITE_URL
X-Title: process.env.OPENROUTER_SITE_NAME
```

### Rate Limiting

Default rate limits:
- 30 requests per minute per user
- Configurable in `api/server/middleware/openRouterValidation.js`

### Caching

Response caching reduces API calls:
- Credits: 5-minute cache
- Models list: 1-hour cache

Adjust in environment variables if needed.

## Troubleshooting

### "Invalid API Key"

- Verify key starts with `sk-or-`
- Check key is correctly set in `.env`
- Ensure no extra spaces or quotes

### "No models available"

- Check your OpenRouter account has credits
- Verify API key has correct permissions
- Try refreshing the model list

### "Request failed"

- Check your credit balance
- Verify model is available
- Check rate limits haven't been exceeded

### "Routing to wrong provider"

If requests are going to OpenAI instead of OpenRouter:
1. Clear browser cache
2. Restart LibreChat
3. Ensure OPENROUTER_API_KEY is set
4. Check browser console for errors

## Migration from YAML Configuration

If you previously used OpenRouter via YAML configuration:

1. Remove OpenRouter section from `librechat.yaml`
2. Add `OPENROUTER_API_KEY` to `.env`
3. Restart LibreChat
4. Agents created with YAML config will need to be recreated

## API Endpoints

The native integration provides these endpoints:

- `POST /api/edit/openrouter` - Chat completions
- `GET /api/endpoints/openrouter/models` - List available models
- `GET /api/endpoints/openrouter/credits` - Check credit balance

## Security Notes

- API keys are never sent to the client
- All requests are proxied through LibreChat backend
- Credits are cached to reduce API calls
- Rate limiting prevents abuse

## Support

- [OpenRouter Documentation](https://openrouter.ai/docs)
- [OpenRouter Discord](https://discord.gg/openrouter)
- [LibreChat GitHub Issues](https://github.com/danny-avila/LibreChat/issues)

## Changelog

### v0.8.0
- Added native OpenRouter provider
- Full Agent system compatibility
- Automatic fallback support
- Credits display in UI
- Real-time model availability