# OpenRouter API Reference

## Overview

LibreChat's OpenRouter integration provides native support for OpenRouter's AI model routing service, enabling access to 100+ AI models through a single unified API. This integration supports the full Agent system, model fallbacks, automatic routing, and real-time credits tracking.

## Base Configuration

### Environment Variables

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx

# Optional Site Attribution (recommended for better rate limits)
OPENROUTER_SITE_URL=https://localhost:3080        # Your LibreChat instance URL
OPENROUTER_SITE_NAME=LibreChat                    # Your application name

# Optional Base URL (for custom endpoints)
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1  # Default value

# Cache Settings (milliseconds)
OPENROUTER_CACHE_TTL_CREDITS=300000               # 5 minutes (default)
OPENROUTER_CACHE_TTL_MODELS=3600000                # 1 hour (default)

# Background Refresh
OPENROUTER_BACKGROUND_REFRESH=240000              # 4 minutes (default)
OPENROUTER_BACKGROUND_REFRESH=false               # Disable background refresh

# Model Configuration
OPENROUTER_MODELS=                                # Comma-separated list of specific models to use

# Domain Settings (fallback for OPENROUTER_SITE_URL)
DOMAIN_CLIENT=http://localhost:3080               # Used if OPENROUTER_SITE_URL not set
```

### API Key Format

OpenRouter API keys must follow the format: `sk-or-v1-*` or `sk-or-*`

Keys can be obtained from: https://openrouter.ai/keys

## API Endpoints

### 1. Chat Completions

**Endpoint:** `POST /api/edit/openrouter`

**Description:** Send chat messages and receive AI model responses with support for streaming, model fallbacks, and provider preferences.

#### Request Headers

```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

#### Request Body

```json
{
  "model": "openai/gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1000,
  "top_p": 1.0,
  "frequency_penalty": 0,
  "presence_penalty": 0,
  "models": ["claude-3-opus-20240229", "gpt-4-turbo-preview"],
  "route": "fallback",
  "provider": {
    "order": ["OpenAI", "Anthropic"],
    "require_parameters": true,
    "data_collection": "deny"
  },
  "transforms": ["middle-out"]
}
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Primary model to use (e.g., "openai/gpt-4", "anthropic/claude-3-opus", "openrouter/auto") |
| `messages` | array | Yes | Array of message objects with `role` and `content` |
| `stream` | boolean | No | Enable Server-Sent Events streaming (default: false) |
| `temperature` | number | No | Sampling temperature (0.0 - 2.0, default: 0.7) |
| `max_tokens` | number | No | Maximum tokens to generate |
| `top_p` | number | No | Nucleus sampling parameter (0.0 - 1.0) |
| `frequency_penalty` | number | No | Frequency penalty (-2.0 - 2.0) |
| `presence_penalty` | number | No | Presence penalty (-2.0 - 2.0) |
| `models` | array | No | Fallback model chain (max 10 models) |
| `route` | string | No | Routing strategy: "fallback" or "weighted" |
| `provider` | object | No | Provider preferences and requirements |
| `transforms` | array | No | Message transformation strategies |

#### Special Models

- **`openrouter/auto`**: Automatically selects the best model based on prompt
- **Provider-specific models**: Use format `provider/model` (e.g., "openai/gpt-4")

#### Response (Non-Streaming)

```json
{
  "id": "gen-xxxxxxxxxxxxxxxx",
  "model": "openai/gpt-4",
  "object": "chat.completion",
  "created": 1234567890,
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! I'm doing well, thank you for asking. How can I assist you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 18,
    "total_tokens": 43,
    "total_cost": 0.00123
  },
  "provider": "openai"
}
```

#### Response (Streaming)

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"id":"gen-xxx","model":"openai/gpt-4","object":"chat.completion.chunk","created":1234567890,"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"gen-xxx","model":"openai/gpt-4","object":"chat.completion.chunk","created":1234567890,"choices":[{"index":0,"delta":{"content":" there!"},"finish_reason":null}]}

data: {"id":"gen-xxx","model":"openai/gpt-4","object":"chat.completion.chunk","created":1234567890,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":25,"completion_tokens":18,"total_tokens":43}}

data: [DONE]
```

#### Error Responses

```json
{
  "error": {
    "message": "Invalid API key",
    "type": "authentication_error",
    "code": 401
  }
}
```

### 2. Credits API

**Endpoint:** `GET /api/openrouter/credits`

**Description:** Retrieve current account balance and usage limits.

#### Request Headers

```http
Authorization: Bearer <JWT_TOKEN>
```

#### Response

```json
{
  "total_credits": 10.50,
  "remaining_credits": 8.25,
  "used_credits": 2.25,
  "usage_limit": 50.00,
  "rate_limit": {
    "requests": 100,
    "interval": "10s"
  },
  "usage": {
    "label": "Monthly",
    "used": 2.25,
    "limit": 50.00,
    "is_free_tier": false,
    "rate_limit": {
      "requests": 100,
      "interval": "10s"
    }
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `total_credits` | number | Total credits available in account |
| `remaining_credits` | number | Credits remaining for current period |
| `used_credits` | number | Credits consumed in current period |
| `usage_limit` | number | Maximum credit usage allowed |
| `rate_limit` | object | Rate limiting configuration |
| `usage` | object | Detailed usage information |

### 3. Models API

**Endpoint:** `GET /api/openrouter/models`

**Description:** List all available models with pricing and capabilities.

#### Request Headers

```http
Authorization: Bearer <JWT_TOKEN>
```

#### Response

```json
{
  "data": [
    {
      "id": "openai/gpt-4",
      "name": "GPT-4",
      "description": "OpenAI's most capable model",
      "pricing": {
        "prompt": 0.03,
        "completion": 0.06,
        "request": 0,
        "image": 0
      },
      "context_length": 8192,
      "architecture": {
        "modality": "text",
        "tokenizer": "cl100k_base",
        "instruct_type": "chat"
      },
      "supported_generation_methods": ["chat"],
      "top_provider": {
        "max_completion_tokens": 4096,
        "is_moderated": false
      },
      "per_request_limits": {
        "prompt_tokens": "8000",
        "completion_tokens": "4000"
      }
    },
    {
      "id": "anthropic/claude-3-opus-20240229",
      "name": "Claude 3 Opus",
      "description": "Claude's most powerful model",
      "pricing": {
        "prompt": 0.015,
        "completion": 0.075,
        "request": 0,
        "image": 0
      },
      "context_length": 200000,
      "architecture": {
        "modality": "text+image",
        "tokenizer": "claude",
        "instruct_type": "chat"
      },
      "supported_generation_methods": ["chat"],
      "top_provider": {
        "max_completion_tokens": 4096,
        "is_moderated": false
      },
      "per_request_limits": {
        "prompt_tokens": "200000",
        "completion_tokens": "4096"
      }
    },
    {
      "id": "openrouter/auto",
      "name": "Auto Router",
      "description": "Automatically selects the best model based on your prompt",
      "pricing": {
        "prompt": -1,
        "completion": -1,
        "request": 0,
        "image": 0
      },
      "context_length": -1,
      "architecture": {
        "modality": "text",
        "tokenizer": "router",
        "instruct_type": "chat"
      },
      "supported_generation_methods": ["chat"],
      "top_provider": {
        "max_completion_tokens": null,
        "is_moderated": false
      },
      "per_request_limits": null
    }
  ]
}
```

#### Model Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique model identifier |
| `name` | string | Display name |
| `description` | string | Model description |
| `pricing` | object | Cost per token (in dollars) |
| `context_length` | number | Maximum context window |
| `architecture` | object | Model architecture details |
| `supported_generation_methods` | array | Supported generation types |
| `top_provider` | object | Provider-specific limits |
| `per_request_limits` | object | Request token limits |

## Authentication

### API Key Authentication

OpenRouter supports multiple authentication methods:

1. **User-provided key**: Passed via request headers
2. **Environment variable**: `OPENROUTER_API_KEY`
3. **BYOK (Bring Your Own Key)**: User's personal OpenRouter key

### JWT Authentication

All endpoints require a valid JWT token for user authentication:

```http
Authorization: Bearer <JWT_TOKEN>
```

## Rate Limiting

Default rate limits:
- **30 requests per minute** per user
- **100 requests per 10 seconds** for credit/model queries

Rate limit headers in response:
```http
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 28
X-RateLimit-Reset: 1234567890
```

## Error Handling

### Error Response Format

```json
{
  "error": {
    "message": "Detailed error description",
    "type": "error_type",
    "code": 400,
    "details": {
      "field": "additional_info"
    }
  }
}
```

### Common Error Codes

| Code | Type | Description |
|------|------|-------------|
| 400 | `invalid_request_error` | Invalid request parameters |
| 401 | `authentication_error` | Invalid or missing API key |
| 402 | `insufficient_credits` | Not enough credits |
| 403 | `permission_error` | Access denied |
| 404 | `not_found_error` | Model or resource not found |
| 429 | `rate_limit_error` | Rate limit exceeded |
| 500 | `internal_error` | Server error |
| 502 | `model_error` | Model provider error |
| 503 | `service_unavailable` | Temporary unavailability |

## Model Fallbacks

### Fallback Chain Configuration

```json
{
  "model": "openai/gpt-4",
  "models": [
    "anthropic/claude-3-opus-20240229",
    "google/gemini-pro",
    "meta-llama/llama-2-70b-chat"
  ],
  "route": "fallback"
}
```

### Fallback Triggers

Fallbacks activate when:
- Primary model returns an error
- Rate limits are exceeded
- Model is unavailable
- Response timeout occurs

### Fallback Limitations

- Maximum 10 models in fallback chain
- Cannot use with `openrouter/auto`
- Each model attempt counts toward rate limits

## Provider Preferences

### Provider Configuration

```json
{
  "provider": {
    "order": ["OpenAI", "Anthropic", "Google"],
    "require_parameters": true,
    "data_collection": "deny",
    "allow_fallbacks": true,
    "quantization": ["fp16", "int8"]
  }
}
```

### Provider Options

| Option | Type | Description |
|--------|------|-------------|
| `order` | array | Preferred provider order |
| `require_parameters` | boolean | Require provider to support all parameters |
| `data_collection` | string | Data collection preference: "allow" or "deny" |
| `allow_fallbacks` | boolean | Allow automatic fallbacks |
| `quantization` | array | Accepted quantization levels |

## Streaming

### Server-Sent Events (SSE)

Enable streaming by setting `stream: true`:

```javascript
const response = await fetch('/api/openrouter/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    model: 'openai/gpt-4',
    messages: messages,
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') {
        // Stream complete
      } else {
        const parsed = JSON.parse(data);
        // Process chunk
      }
    }
  }
}
```

## Caching

### Cache Configuration

The integration implements intelligent caching:

- **Credits**: 5-minute TTL (configurable)
- **Models**: 1-hour TTL (configurable)

### Cache Invalidation

Force cache refresh by adding query parameters:
```
GET /api/openrouter/credits?force=true
GET /api/openrouter/models?force=true
```

## WebSocket Support (Future)

*Note: WebSocket support is planned for future releases*

## SDK Examples

### JavaScript/TypeScript

```typescript
import { OpenRouterClient } from '@librechat/openrouter';

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY,
  siteUrl: 'https://myapp.com',
  siteName: 'My App'
});

// Simple completion
const response = await client.chatCompletion({
  model: 'openai/gpt-4',
  messages: [
    { role: 'user', content: 'Hello!' }
  ]
});

// With fallbacks
const response = await client.chatCompletion({
  model: 'openai/gpt-4',
  models: ['claude-3-opus', 'gemini-pro'],
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  route: 'fallback'
});

// Check credits
const credits = await client.getCredits();
console.log(`Remaining credits: $${credits.remaining_credits}`);
```

### cURL Examples

```bash
# Chat completion
curl -X POST https://localhost:3080/api/openrouter/chat/completions \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Get credits
curl -X GET https://localhost:3080/api/openrouter/credits \
  -H "Authorization: Bearer $JWT_TOKEN"

# List models
curl -X GET https://localhost:3080/api/openrouter/models \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## Best Practices

### 1. Use Model Fallbacks

Always configure fallback models for production:
```json
{
  "model": "openai/gpt-4",
  "models": ["claude-3-opus", "gpt-3.5-turbo"],
  "route": "fallback"
}
```

### 2. Monitor Credits

Implement credit monitoring:
```javascript
const credits = await client.getCredits();
if (credits.remaining_credits < 1.0) {
  console.warn('Low credits warning');
}
```

### 3. Handle Rate Limits

Implement exponential backoff:
```javascript
async function makeRequestWithRetry(params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.chatCompletion(params);
    } catch (error) {
      if (error.code === 429 && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
      } else {
        throw error;
      }
    }
  }
}
```

### 4. Use Caching

Leverage built-in caching to reduce API calls:
- Don't fetch models on every request
- Cache credits for UI display
- Use appropriate TTL values

### 5. Secure API Keys

- Never expose keys in client-side code
- Use environment variables
- Implement key rotation
- Monitor key usage

## Migration from YAML Configuration

If migrating from YAML-based OpenRouter configuration, see the [Migration Guide](../migration/openrouter-yaml-to-native.md).

## Support

- **Documentation**: https://docs.librechat.ai
- **OpenRouter Dashboard**: https://openrouter.ai/dashboard
- **API Status**: https://status.openrouter.ai
- **Support**: support@openrouter.ai

## Client Implementation

### OpenRouterClient Class

The OpenRouterClient extends BaseClient and provides comprehensive API access:

```javascript
const OpenRouterClient = require('./OpenRouterClient');

// Create client instance
const client = new OpenRouterClient(apiKey, {
  // Optional configuration
  modelOptions: {
    model: 'openrouter/auto',
    temperature: 0.7
  }
});
```

### Key Features

#### Dynamic Header Generation
Headers are built on-demand for each request, ensuring fresh authentication and supporting dynamic configuration changes:

```javascript
const headers = client.buildHeaders();
// Returns:
// {
//   'Authorization': 'Bearer sk-or-...',
//   'Content-Type': 'application/json',
//   'HTTP-Referer': 'https://localhost:3080',  // if OPENROUTER_SITE_URL set
//   'X-Title': 'LibreChat'                     // if OPENROUTER_SITE_NAME set
// }
```

#### Intelligent Caching
The client implements automatic caching to minimize API calls:
- **Credits**: 5-minute cache (configurable via `OPENROUTER_CACHE_TTL_CREDITS`)
- **Models**: 1-hour cache (configurable via `OPENROUTER_CACHE_TTL_MODELS`)
- **Force Refresh**: Bypass cache by passing `forceRefresh: true`

#### Model Fallback Support
Specify multiple models for automatic fallback on failure:

```javascript
const response = await client.chatCompletion({
  model: 'openai/gpt-4',
  messages: [...],
  models: ['anthropic/claude-3', 'google/gemini-pro']  // Fallback chain
});
```

### Available Methods

| Method | Description | Parameters |
|--------|-------------|------------|
| `buildHeaders()` | Generates request headers | None |
| `chatCompletion(params)` | Sends chat completion request | `{messages, model, models, stream}` |
| `getCredits(forceRefresh)` | Retrieves account balance | `forceRefresh: boolean` |
| `getModels(forceRefresh)` | Lists available models | `forceRefresh: boolean` |
| `handleError(response)` | Processes API errors | `response: Response` |
| `getSaveOptions()` | Returns conversation save options | None |
| `buildMessages(messages)` | Formats messages for API | `messages: Array` |
| `sendCompletion(payload, opts)` | Sends completion with streaming | `payload, {onProgress, abortController}` |

### Error Handling

The client provides comprehensive error handling with specific messages:

```javascript
try {
  const response = await client.chatCompletion({...});
} catch (error) {
  // Error types:
  // - 401: Invalid API key
  // - 402: Insufficient credits
  // - 429: Rate limit exceeded
  // - 503: Service unavailable
}
```

### Token Counting

The client tracks token usage using OpenRouter's response format:
- Input tokens: `usage.prompt_tokens`
- Output tokens: `usage.completion_tokens`
- Total tokens: `usage.total_tokens`

## Agent System Integration

### Overview

OpenRouter is fully integrated with LibreChat's Agent system, allowing you to create AI assistants that leverage OpenRouter's extensive model selection and routing capabilities.

> **⚠️ Testing Status**: Agent system integration is implemented in the codebase but comprehensive testing is still in progress. Basic chat functionality is confirmed working. Agent-specific features (tools, file search, code interpreter) should be considered experimental.

### Agent Configuration

When creating or configuring an Agent, OpenRouter appears as a native provider option alongside OpenAI, Anthropic, and other providers.

#### Creating an Agent with OpenRouter

```javascript
{
  "name": "Research Assistant",
  "provider": "openrouter",
  "model": "openrouter/auto", // Or specific model like "openai/gpt-4"
  "modelOptions": {
    "models": ["claude-3-opus", "gpt-4", "gemini-pro"], // Fallback chain
    "temperature": 0.7,
    "max_tokens": 2000
  },
  "tools": ["web_search", "code_interpreter"],
  "systemPrompt": "You are a helpful research assistant..."
}
```

### Supported Agent Features

- ✅ **Tool Calling**: Full support for function calling with compatible models
- ✅ **File Search**: Document analysis and retrieval
- ✅ **Code Interpreter**: Code execution capabilities
- ✅ **MCP Servers**: Model Context Protocol integration
- ✅ **Custom Tools**: User-defined tools and actions
- ✅ **Streaming Responses**: Real-time token streaming
- ✅ **Context Management**: Automatic context window handling

### Model Compatibility

Not all models support all Agent features. Check model capabilities:

| Model | Tool Calling | Vision | Code Interpreter |
|-------|-------------|--------|------------------|
| GPT-4/4-Turbo | ✅ | ✅ | ✅ |
| Claude 3 (all variants) | ✅ | ✅ | ✅ |
| Gemini Pro/Ultra | ✅ | ✅ | ✅ |
| Llama 3 | ✅ | ❌ | ✅ |
| Mixtral | ✅ | ❌ | ✅ |

### Agent API Usage

```javascript
// Initialize Agent with OpenRouter
const agent = await createAgent({
  provider: 'openrouter',
  apiKey: process.env.OPENROUTER_API_KEY,
  model: 'openai/gpt-4',
  fallbackModels: ['anthropic/claude-3-opus', 'google/gemini-pro']
});

// Use Agent with tools
const response = await agent.chat({
  messages: [{ role: 'user', content: 'Search for recent AI news' }],
  tools: ['web_search'],
  stream: true
});
```

## Features Comparison

| Feature | YAML Config | Native Provider |
|---------|-------------|-----------------|
| Agent Compatibility | ❌ | ✅ |
| Model Fallbacks | Limited | ✅ Full Support |
| Credits Display | ❌ | ✅ Real-time |
| Caching | ❌ | ✅ Intelligent |
| Auto Router | ✅ | ✅ Enhanced |
| Provider Preferences | ❌ | ✅ |
| Dynamic Configuration | ❌ | ✅ |

## Changelog

### Current Implementation
- Native OpenRouter provider integration
- Full Agent system compatibility
- Model fallback chains with up to 10 models
- Auto Router support with smart routing
- Real-time credits tracking with caching
- Provider preferences configuration
- Server-sent events streaming support
- Intelligent caching with configurable TTLs
- Dynamic header generation
- Comprehensive error handling
- Token usage tracking