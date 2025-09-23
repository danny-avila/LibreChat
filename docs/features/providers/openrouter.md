---
title: OpenRouter Integration
description: Comprehensive guide for OpenRouter's native provider integration in LibreChat, enabling access to 100+ AI models with Agent support
---

# OpenRouter Integration

## Overview

OpenRouter is a unified API gateway providing access to 100+ AI models from OpenAI, Anthropic, Google, Meta, Mistral, and more. LibreChat's native OpenRouter integration delivers enterprise-grade features including full Agent system compatibility, automatic model fallbacks, smart routing, and real-time credits tracking.

> **⚠️ Note**: While OpenRouter is fully integrated as a native provider with Agent system compatibility in the codebase, comprehensive testing of Agent-specific features (tools, file search, code interpreter) is still ongoing. Basic chat functionality has been verified to work correctly.

### Key Features

- **100+ AI Models** - Access models from all major providers through a single API
- **Full Agent Support** - Native integration enables complete Agent system functionality
- **Model Fallback Chains** - Automatic failover across up to 10 models for reliability
- **Auto Router** - Intelligent model selection based on prompt analysis
- **Real-time Credits** - Live balance tracking with intelligent caching
- **Provider Preferences** - Configure preferred and avoided providers
- **Streaming Support** - Server-sent events for real-time responses

### Native vs YAML Configuration

| Feature | YAML Config | Native Provider |
|---------|-------------|-----------------|
| Basic Chat | ✅ | ✅ |
| Agent System | ❌ | ✅ |
| Model Fallbacks | ❌ | ✅ |
| Credits Display | ❌ | ✅ |
| Smart Caching | ❌ | ✅ |
| Auto Router | Limited | ✅ Full |
| Provider Preferences | ❌ | ✅ |

## Quick Start

### Prerequisites

- LibreChat installation (Docker, Node.js, or cloud deployment)
- OpenRouter API key from [openrouter.ai/keys](https://openrouter.ai/keys)

### Setup Steps

1. **Obtain API Key**
   - Visit [OpenRouter](https://openrouter.ai)
   - Navigate to [API Keys](https://openrouter.ai/keys)
   - Create and copy your key (format: `sk-or-v1-...`)

2. **Configure Environment**
   ```bash
   # Add to your .env file
   OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx

   # Optional but recommended
   OPENROUTER_SITE_URL=https://your-domain.com
   OPENROUTER_SITE_NAME=YourApplicationName
   ```

3. **Start LibreChat**
   ```bash
   npm run dev
   # or
   docker-compose up
   ```

4. **Select OpenRouter**
   - Open LibreChat in your browser
   - Select "OpenRouter" from the provider dropdown
   - Choose a model or use Auto Router
   - Start chatting!

## Configuration

### Environment Variables

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx

# Optional: Site Attribution (recommended for better rate limits)
OPENROUTER_SITE_URL=https://your-domain.com
OPENROUTER_SITE_NAME=YourApplicationName

# Optional: Cache Configuration (milliseconds)
OPENROUTER_CACHE_TTL_CREDITS=300000  # 5 minutes (default)
OPENROUTER_CACHE_TTL_MODELS=3600000   # 1 hour (default)
```

### Docker Configuration

For Docker deployments, ensure environment variables are passed:

```yaml
# docker-compose.yml
services:
  librechat:
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - OPENROUTER_SITE_URL=${OPENROUTER_SITE_URL}
      - OPENROUTER_SITE_NAME=${OPENROUTER_SITE_NAME}
```

### Docker Run Command

```bash
docker run -d \
  -e OPENROUTER_API_KEY=sk-or-v1-xxx \
  -e OPENROUTER_SITE_URL=https://myapp.com \
  -e OPENROUTER_SITE_NAME="My App" \
  librechat/librechat
```

## Features

### Agent System Integration

OpenRouter's native integration provides full compatibility with LibreChat's Agent system:

```javascript
// Create an Agent with OpenRouter
{
  "provider": "openrouter",
  "model": "openai/gpt-4",
  "tools": ["code_interpreter", "web_search"],
  "system_prompt": "You are a helpful assistant using OpenRouter."
}
```

### Model Fallback Chains

Configure automatic fallbacks for maximum reliability:

```javascript
{
  "model": "openai/gpt-4",
  "models": [
    "anthropic/claude-3-opus-20240229",
    "google/gemini-pro-1.5",
    "openai/gpt-3.5-turbo"
  ]
}
```

**Fallback Behavior:**
- Automatically switches to next model on error
- Supports up to 10 models in chain
- Preserves conversation context
- Each attempt counts toward rate limits

### Auto Router™

LibreChat provides a seamless toggle interface for OpenRouter's intelligent model selection:

#### How to Use
1. Select OpenRouter as your provider
2. Toggle the "Auto-Router" switch in the navigation bar
3. When enabled, the model selector will display "openrouter/auto"
4. Send your message - OpenRouter automatically selects the optimal model

#### Auto Router Benefits
- **Intelligent Selection**: Analyzes each prompt to choose the best model
- **Cost Optimization**: Balances quality vs cost based on complexity
- **Automatic Failover**: Falls back to alternative models if needed
- **No Manual Management**: No need to select models manually

#### Important Notes
- Auto-Router toggle state syncs with your conversation
- When manually selecting a specific model, Auto-Router automatically disables
- The toggle appears in the navigation bar next to the credits display
- Model shows as "openrouter/auto" in the selector when active

#### Technical Implementation
```javascript
// When Auto-Router is enabled
{
  "model": "openrouter/auto",
  "autoRouter": true
}

// UI automatically handles state synchronization
// Toggle → Updates conversation model to "openrouter/auto"
// Manual model selection → Disables Auto-Router toggle
```

### Provider Preferences

Configure routing preferences:

```javascript
{
  "provider": {
    "order": ["openai", "anthropic", "google"],
    "require_parameters": true,
    "data_collection": "deny",
    "allow_fallbacks": true
  }
}
```

### Credits Tracking

Real-time balance monitoring:
- Displayed in UI header
- Updates after each request
- Cached for 5 minutes (configurable)
- Warning alerts for low balance

## API Reference

### Endpoints

#### Chat Completions
```http
POST /api/endpoints/openrouter/chat/completions
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "model": "openai/gpt-4",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "stream": false,
  "models": ["anthropic/claude-3", "google/gemini-pro"]
}
```

#### Credits
```http
GET /api/endpoints/openrouter/credits
Authorization: Bearer <JWT_TOKEN>

Response:
{
  "balance": 10.50,
  "currency": "USD",
  "usage": {...}
}
```

#### Models
```http
GET /api/endpoints/openrouter/models
Authorization: Bearer <JWT_TOKEN>

Response:
{
  "data": [
    {
      "id": "openai/gpt-4",
      "name": "GPT-4",
      "pricing": {...},
      "context_length": 8192
    }
  ]
}
```

### Client Methods

| Method | Description | Parameters |
|--------|-------------|------------|
| `buildHeaders()` | Generates request headers | None |
| `chatCompletion(params)` | Sends chat completion | `{messages, model, models, stream}` |
| `getCredits(forceRefresh)` | Retrieves balance | `forceRefresh: boolean` |
| `getModels(forceRefresh)` | Lists available models | `forceRefresh: boolean` |

## User Interface Features

### Provider Selection

OpenRouter appears as a native provider option in the model selection dropdown, alongside OpenAI, Anthropic, and other providers.

### Settings Panel

The OpenRouter settings panel (`Settings → AI Providers → OpenRouter`) includes:

#### Model Configuration
- **Primary Model Selection**: Choose from 100+ available models
- **Auto Router Toggle**: Enable intelligent model selection
- **Fallback Chain Builder**: Configure up to 10 fallback models
  - Drag and drop to reorder
  - Visual representation of fallback priority
  - Test fallback chain functionality

#### Provider Preferences
- **Allowed Providers**: Whitelist specific providers
- **Blocked Providers**: Exclude certain providers
- **Data Collection**: Control privacy settings
- **Require Parameters**: Ensure model compatibility

#### Credits Display
- **Real-time Balance**: Shows current credit balance
- **Usage Tracking**: Monitor credit consumption
- **Auto-refresh**: Updates every 5 minutes
- **Warning Alerts**: Notifications when balance < $1

### Navigation Bar Features

#### Credits Widget
Located in the top navigation bar when OpenRouter is selected:
- Displays current balance in USD format
- Click to refresh manually
- Color-coded status:
  - Green: Balance > $5
  - Yellow: Balance $1-$5
  - Red: Balance < $1

#### Model Information
- Model name with provider prefix
- Context window size indicator
- Pricing information on hover
- Capability badges (Vision, Tools, etc.)

### Chat Interface Enhancements

#### Model Fallback Indicator
When fallback chains are configured:
- Shows active model in use
- Indicates when fallback is triggered
- Displays fallback reason

#### Streaming Indicators
- Token-by-token streaming visualization
- Response time metrics
- Model switching notifications

### Agent Builder Integration

When creating or editing Agents:
- OpenRouter appears in provider dropdown
- Model selection includes all OpenRouter models
- Fallback configuration available
- Tool compatibility warnings for incompatible models

> **Note**: Agent features with OpenRouter are implemented but still undergoing testing. Use with caution for production workloads.

## Testing

### Manual Testing

1. **Basic Chat Test**
   ```
   Select OpenRouter → Send "Hello" → Verify response
   ```

2. **Agent Test**
   ```
   Create Agent → Select OpenRouter → Test tools
   ```

3. **Fallback Test**
   ```
   Configure fallback chain → Simulate failure → Verify failover
   ```

### Automated Testing

Run OpenRouter-specific tests:
```bash
# Unit tests
npm test -- --testPathPattern=OpenRouterClient

# Integration tests
npm run test:api -- --testPathPattern=openrouter

# Full validation
./scripts/validate-openrouter-deployment.sh
```

### Test Checklist

- [ ] OpenRouter appears in provider dropdown
- [ ] Models load correctly
- [ ] Basic chat works
- [ ] Streaming functions
- [ ] Credits display and update
- [ ] Agent system compatible
- [ ] Model fallbacks work
- [ ] Auto Router selects models
- [ ] Caching reduces API calls

## Troubleshooting

### Common Issues

#### OpenRouter Not Appearing in Provider Dropdown
- **Cause**: Missing API key or incorrect configuration
- **Solution**:
  - Verify `OPENROUTER_API_KEY` is set in `.env`
  - Check API key format (must start with `sk-or-`)
  - Restart LibreChat server after adding key

#### "Invalid API Key" Error
- **Cause**: Incorrect or expired API key
- **Solution**:
  - Verify key at [openrouter.ai/keys](https://openrouter.ai/keys)
  - Check for extra spaces or line breaks in `.env`
  - Ensure key starts with `sk-or-v1-` or `sk-or-`

#### Credits Not Displaying
- **Cause**: API key lacks permission or network issues
- **Solution**:
  - Check API key permissions on OpenRouter dashboard
  - Verify network connectivity to OpenRouter API
  - Clear browser cache and refresh
  - Check console for specific error messages

#### Model Fallback Not Working
- **Cause**: Incompatible fallback configuration or model unavailability
- **Solution**:
  - Ensure fallback models are available
  - Don't use `openrouter/auto` with fallback chains
  - Verify all models in chain support required features
  - Check model compatibility in OpenRouter dashboard

#### Auto-Router Toggle Issues
- **Cause**: State synchronization between toggle and model selector
- **Solution**:
  - Toggle syncs with conversation model state
  - If model shows "openrouter/auto" but toggle is off, click toggle twice to resync
  - Manual model selection automatically disables Auto-Router (expected behavior)
  - Clear browser localStorage if persistent sync issues

#### First Message Fails with Auto-Router
- **Cause**: Conflicting state between saved conversation and toggle
- **Solution**:
  - Ensure toggle matches model selector state
  - If using existing conversation, toggle may need to be clicked to sync
  - Start new conversation if issues persist
  - The system now auto-syncs on conversation load

#### Agent Features Not Working
- **Cause**: Selected model doesn't support required features
- **Solution**:
  - Check model capabilities (tool calling, vision, etc.)
  - Use compatible models:
    - GPT-4/4-Turbo for full feature support
    - Claude 3 variants for vision and tools
    - Gemini Pro/Ultra for multimodal
  - Verify Agent configuration matches model capabilities

#### High Latency or Timeouts
- **Cause**: Model overload, rate limiting, or network issues
- **Solution**:
  - Configure fallback chains for reliability
  - Enable caching to reduce API calls
  - Check OpenRouter status page
  - Adjust timeout settings if needed

#### Streaming Not Working
- **Cause**: Network configuration or proxy issues
- **Solution**:
  - Check if reverse proxy supports SSE
  - Verify WebSocket connections are allowed
  - Test with non-streaming mode first
  - Check browser console for connection errors

#### Cache Not Working
- **Cause**: Invalid TTL values or disabled caching
- **Solution**:
  - Verify cache TTL environment variables are numbers
  - Check `OPENROUTER_BACKGROUND_REFRESH` isn't set to `false`
  - Clear existing cache and restart
  - Monitor logs for cache-related errors

### Error Codes Reference

| Code | Description | Solution |
|------|-------------|----------|
| 401 | Invalid API Key | Check API key format and validity |
| 402 | Insufficient Credits | Add credits to OpenRouter account |
| 403 | Access Forbidden | Check API key permissions |
| 429 | Rate Limited | Wait or configure fallback models |
| 500 | Server Error | OpenRouter service issue, try again |
| 503 | Service Unavailable | OpenRouter maintenance, use fallbacks |

### Debug Logging

Enable debug logging for troubleshooting:

```bash
# In .env file
DEBUG=librechat:*,openrouter:*
LOG_LEVEL=debug

# View logs
docker logs librechat-api -f
# or
npm run dev 2>&1 | grep -i openrouter
```

### Common Log Messages

```javascript
// Successful initialization
"[OpenRouter] Client initialized with base URL: https://openrouter.ai/api/v1"

// Cache hit
"[OpenRouter] Credits retrieved from cache"

// API call
"[OpenRouter] Fetching models from API"

// Error
"[OpenRouter] Error fetching credits: 401 Unauthorized"
```
- **Solution**: Verify `OPENROUTER_API_KEY` is set correctly

#### Invalid API Key Error
- **Cause**: Malformed or expired key
- **Solution**: Regenerate key at [openrouter.ai/keys](https://openrouter.ai/keys)

#### Credits Not Displaying
- **Cause**: API key lacks permission or network issue
- **Solution**: Check key permissions and network connectivity

#### Model Fallback Not Working
- **Cause**: Incompatible with Auto Router
- **Solution**: Use specific model, not `openrouter/auto`

#### Rate Limiting
- **Cause**: Too many requests
- **Solution**:
  - Add site attribution for better limits
  - Implement request queuing
  - Use fallback models

### Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `401 Unauthorized` | Invalid API key | Check key format and validity |
| `402 Payment Required` | Insufficient credits | Add credits to account |
| `429 Too Many Requests` | Rate limited | Wait or use fallbacks |
| `503 Service Unavailable` | OpenRouter down | Wait and retry |

### Debug Commands

```bash
# Check if OpenRouter is registered
grep -r "openrouter" api/server/routes/

# Verify API key
echo $OPENROUTER_API_KEY

# Test API directly
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"

# Check logs
tail -f logs/debug-*.log | grep OpenRouter
```

## Migration from YAML

If you're using OpenRouter via YAML configuration:

1. **Remove YAML Config**
   ```yaml
   # Remove from librechat.yaml:
   endpoints:
     custom:
       - name: "OpenRouter"
         # ... remove entire section
   ```

2. **Add Environment Variable**
   ```bash
   OPENROUTER_API_KEY=sk-or-v1-xxx
   ```

3. **Restart LibreChat**
   ```bash
   npm run dev
   ```

4. **Benefits After Migration**
   - Full Agent support
   - Model fallbacks
   - Credits tracking
   - Better performance

## Performance Optimization

### Caching Strategy
- **Credits**: 5-minute TTL reduces API calls by 80%
- **Models**: 1-hour TTL for stable model list
- **Configure**: Adjust TTL via environment variables

### Best Practices
1. Use Auto Router for cost optimization
2. Configure fallback chains for critical workflows
3. Enable site attribution for better rate limits
4. Monitor credits to avoid interruptions
5. Cache responses when appropriate

## Security Considerations

### API Key Management
- Never commit API keys to version control
- Use environment variables or secrets management
- Rotate keys regularly
- Monitor usage for anomalies

### Data Privacy
- OpenRouter may process data through multiple providers
- Review provider data policies
- Configure `data_collection` preferences
- Use appropriate models for sensitive data

## Support Resources

- **Documentation**: This guide and API reference
- **OpenRouter Dashboard**: [openrouter.ai/dashboard](https://openrouter.ai/dashboard)
- **API Status**: [status.openrouter.ai](https://status.openrouter.ai)
- **LibreChat Discord**: Community support
- **GitHub Issues**: Bug reports and feature requests

## Appendix

### Available Models

OpenRouter provides access to models from:
- **OpenAI**: GPT-4, GPT-3.5, DALL-E
- **Anthropic**: Claude 3 (Opus, Sonnet, Haiku)
- **Google**: Gemini Pro, PaLM
- **Meta**: Llama 3, Code Llama
- **Mistral**: Mistral Large, Mixtral
- **And many more...**

View full list: [openrouter.ai/models](https://openrouter.ai/models)

### Rate Limits

Default limits (without site attribution):
- 30 requests/minute
- 1000 requests/day

With site attribution:
- 60 requests/minute
- 5000 requests/day

### Pricing

OpenRouter uses credit-based pricing:
- Pay only for what you use
- No monthly fees
- Transparent per-token pricing
- Volume discounts available

Check current pricing: [openrouter.ai/pricing](https://openrouter.ai/pricing)