# OpenRouter Provider Configuration

## Overview

OpenRouter is a unified API gateway that provides access to 100+ AI models from various providers including OpenAI, Anthropic, Google, Meta, Mistral, and more. LibreChat's native OpenRouter integration offers enterprise-grade features like automatic fallbacks, smart routing, and real-time credits tracking.

## Prerequisites

- LibreChat installation (Docker, Node.js, or cloud deployment)
- OpenRouter API key from [openrouter.ai/keys](https://openrouter.ai/keys)
- Basic understanding of environment variables

## Basic Configuration

### 1. Obtain API Key

1. Visit [OpenRouter](https://openrouter.ai)
2. Sign up or log in to your account
3. Navigate to [API Keys](https://openrouter.ai/keys)
4. Click "Create Key"
5. Copy the generated key (format: `sk-or-v1-...`)

### 2. Environment Variables

Add to your `.env` file:

```bash
# Required: OpenRouter API Key
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx

# Optional: Site Attribution (recommended for better rate limits)
OPENROUTER_SITE_URL=https://your-domain.com
OPENROUTER_SITE_NAME=YourApplicationName

# Optional: Cache Configuration (milliseconds)
OPENROUTER_CACHE_TTL_CREDITS=300000  # 5 minutes (default)
OPENROUTER_CACHE_TTL_MODELS=3600000   # 1 hour (default)
```

### 3. Docker Configuration

If using Docker, ensure environment variables are passed:

```yaml
# docker-compose.yml
services:
  librechat:
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - OPENROUTER_SITE_URL=${OPENROUTER_SITE_URL}
      - OPENROUTER_SITE_NAME=${OPENROUTER_SITE_NAME}
```

Or using Docker run:

```bash
docker run -d \
  -e OPENROUTER_API_KEY=sk-or-v1-xxx \
  -e OPENROUTER_SITE_URL=https://myapp.com \
  -e OPENROUTER_SITE_NAME="My App" \
  librechat/librechat
```

## Advanced Configuration

### Model Fallback Chains

Configure automatic fallbacks for reliability:

```javascript
// In conversation settings
{
  "model": "openai/gpt-4",
  "models": [
    "anthropic/claude-3-opus-20240229",
    "google/gemini-pro-1.5",
    "openai/gpt-3.5-turbo"
  ],
  "route": "fallback"
}
```

**Fallback Rules:**
- Maximum 10 models in chain
- Triggers on errors, rate limits, or timeouts
- Each attempt counts toward rate limits
- Cannot use with Auto Router

### Auto Router Configuration

Let OpenRouter intelligently select models:

```javascript
{
  "model": "openrouter/auto",
  // OpenRouter analyzes prompt and selects optimal model
}
```

**Auto Router Benefits:**
- Cost optimization
- Performance optimization
- Automatic capability matching
- No configuration needed

### Provider Preferences

Control which providers and models to use:

```javascript
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

**Provider Options:**

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `order` | array | Preferred provider priority | All providers |
| `require_parameters` | boolean | Require full parameter support | false |
| `data_collection` | string | "allow" or "deny" data collection | "allow" |
| `allow_fallbacks` | boolean | Enable automatic fallbacks | true |
| `quantization` | array | Accepted quantization levels | All levels |

### Rate Limiting Configuration

Default rate limits are applied automatically:

```javascript
// Default configuration
const rateLimits = {
  chat: {
    requests: 30,
    window: '1m'  // 30 requests per minute
  },
  credits: {
    requests: 100,
    window: '10s'  // 100 requests per 10 seconds
  },
  models: {
    requests: 100,
    window: '10s'  // 100 requests per 10 seconds
  }
};
```

### Custom Headers

Add custom headers for specific requirements:

```javascript
// In OpenRouterClient initialization
headers: {
  'Authorization': `Bearer ${apiKey}`,
  'HTTP-Referer': process.env.OPENROUTER_SITE_URL,
  'X-Title': process.env.OPENROUTER_SITE_NAME,
  'X-Custom-Header': 'custom-value'  // Additional headers
}
```

## Usage Examples

### Basic Chat Completion

```javascript
// JavaScript/TypeScript
const response = await fetch('/api/openrouter/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    model: 'openai/gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Explain quantum computing.' }
    ],
    temperature: 0.7,
    max_tokens: 500
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

### With Fallback Chain

```javascript
const response = await fetch('/api/openrouter/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    model: 'openai/gpt-4',
    models: [
      'anthropic/claude-3-opus-20240229',
      'google/gemini-pro',
      'mistral/mistral-large'
    ],
    route: 'fallback',
    messages: [
      { role: 'user', content: 'Write a poem about AI.' }
    ]
  })
});
```

### Streaming Response

```javascript
const response = await fetch('/api/openrouter/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    model: 'openai/gpt-4',
    messages: [{ role: 'user', content: 'Tell me a story.' }],
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
        console.log('Stream complete');
      } else {
        const parsed = JSON.parse(data);
        process.stdout.write(parsed.choices[0].delta.content || '');
      }
    }
  }
}
```

### Check Credits Balance

```javascript
async function checkCredits() {
  const response = await fetch('/api/openrouter/credits', {
    headers: {
      'Authorization': `Bearer ${jwtToken}`
    }
  });

  const credits = await response.json();

  if (credits.remaining_credits < 1.0) {
    console.warn('Low balance warning!');
    console.log(`Remaining: $${credits.remaining_credits}`);
  }

  return credits;
}

// Monitor credits periodically
setInterval(checkCredits, 300000); // Check every 5 minutes
```

### List Available Models

```javascript
async function getModels() {
  const response = await fetch('/api/openrouter/models', {
    headers: {
      'Authorization': `Bearer ${jwtToken}`
    }
  });

  const { data } = await response.json();

  // Filter by capability
  const visionModels = data.filter(m =>
    m.architecture.modality.includes('image')
  );

  // Sort by price
  const byPrice = data.sort((a, b) =>
    a.pricing.prompt - b.pricing.prompt
  );

  // Find specific provider models
  const openaiModels = data.filter(m =>
    m.id.startsWith('openai/')
  );

  return { visionModels, byPrice, openaiModels };
}
```

## Agent Configuration

### Creating an Agent with OpenRouter

```javascript
// Agent configuration
const agent = {
  name: "Research Assistant",
  provider: "openrouter",
  model: "openai/gpt-4",
  fallbackModels: [
    "anthropic/claude-3-opus-20240229",
    "google/gemini-pro"
  ],
  systemPrompt: "You are a research assistant...",
  temperature: 0.7,
  maxTokens: 2000,
  tools: ["web_search", "code_interpreter"],
  capabilities: {
    vision: true,
    functionCalling: true,
    streaming: true
  }
};
```

### Agent with Auto Router

```javascript
const agent = {
  name: "Smart Assistant",
  provider: "openrouter",
  model: "openrouter/auto", // Automatic model selection
  systemPrompt: "You are a helpful assistant...",
  providerPreferences: {
    order: ["OpenAI", "Anthropic"],
    require_parameters: true
  }
};
```

## Performance Optimization

### Caching Strategy

```javascript
// Cache configuration for optimal performance
const cacheConfig = {
  // Credits: Cache for 5 minutes
  credits: {
    ttl: 300000,
    strategy: 'time-based',
    invalidateOn: ['purchase', 'heavy-usage']
  },

  // Models: Cache for 1 hour
  models: {
    ttl: 3600000,
    strategy: 'time-based',
    invalidateOn: ['force-refresh']
  }
};
```

### Batch Requests

```javascript
// Process multiple requests efficiently
async function batchProcess(prompts) {
  const results = await Promise.all(
    prompts.map(prompt =>
      fetch('/api/openrouter/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          model: 'openai/gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100
        })
      })
    )
  );

  return Promise.all(results.map(r => r.json()));
}
```

### Error Handling with Retry

```javascript
async function robustRequest(params, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('/api/openrouter/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify(params)
      });

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 429) {
        // Rate limited - exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      // Exponential backoff for network errors
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## Security Best Practices

### 1. API Key Management

```javascript
// Never expose API keys in client-side code
// Bad - Client side
const apiKey = 'sk-or-v1-xxxxx'; // NEVER DO THIS

// Good - Server side only
const apiKey = process.env.OPENROUTER_API_KEY;
```

### 2. Environment Variable Validation

```javascript
// Validate on startup
function validateEnvironment() {
  const required = ['OPENROUTER_API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate API key format
  if (!process.env.OPENROUTER_API_KEY.startsWith('sk-or-')) {
    throw new Error('Invalid OpenRouter API key format');
  }
}
```

### 3. Request Sanitization

```javascript
// Sanitize user input
function sanitizeMessages(messages) {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content.substring(0, 10000) // Limit length
  })).filter(msg =>
    ['system', 'user', 'assistant'].includes(msg.role)
  );
}
```

### 4. Response Validation

```javascript
// Validate API responses
function validateResponse(response) {
  if (!response.choices || !Array.isArray(response.choices)) {
    throw new Error('Invalid response structure');
  }

  if (!response.usage || typeof response.usage !== 'object') {
    console.warn('Missing usage data in response');
  }

  return response;
}
```

## Monitoring and Logging

### Request Logging

```javascript
// Log requests for debugging
function logRequest(endpoint, params, response, duration) {
  logger.info('OpenRouter Request', {
    endpoint,
    model: params.model,
    fallbacks: params.models,
    tokens: response.usage,
    duration,
    cost: response.usage?.total_cost,
    provider: response.provider
  });
}
```

### Credit Monitoring

```javascript
// Monitor credit usage
async function monitorCredits() {
  const credits = await getCredits();

  // Alert on low balance
  if (credits.remaining_credits < 5.0) {
    await sendAlert('Low OpenRouter balance', {
      remaining: credits.remaining_credits,
      usage_rate: credits.used_credits / credits.total_credits
    });
  }

  // Log usage metrics
  logger.info('Credit Status', {
    total: credits.total_credits,
    remaining: credits.remaining_credits,
    used: credits.used_credits,
    percentage: (credits.used_credits / credits.total_credits) * 100
  });
}
```

### Error Tracking

```javascript
// Track and analyze errors
function trackError(error, context) {
  logger.error('OpenRouter Error', {
    message: error.message,
    code: error.code,
    status: error.status,
    model: context.model,
    fallbacks: context.models,
    timestamp: new Date().toISOString()
  });

  // Send to error tracking service
  if (errorTracker) {
    errorTracker.captureException(error, { extra: context });
  }
}
```

## Troubleshooting

### Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| API key not working | Verify key starts with `sk-or-`, check for spaces/newlines |
| Models not loading | Clear cache, check network connectivity, verify API key permissions |
| Credits not displaying | Ensure API key has credit read permissions, check browser console |
| Rate limiting | Implement exponential backoff, use fallback models, upgrade plan |
| Streaming not working | Check proxy configuration, ensure SSE support, verify response headers |
| Agent incompatibility | Ensure using native provider (not YAML), restart application |

### Debug Mode

Enable debug logging:

```bash
# Add to .env
DEBUG=openrouter:*
LOG_LEVEL=debug
```

### Health Check Endpoint

```javascript
// Implement health check
app.get('/api/openrouter/health', async (req, res) => {
  try {
    const credits = await getCredits();
    const models = await getModels();

    res.json({
      status: 'healthy',
      credits: credits.remaining_credits > 0,
      models: models.length > 0,
      cache: {
        credits: isCreditsCached(),
        models: isModelsCached()
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

## Best Practices Summary

1. **Always use environment variables** for API keys
2. **Implement fallback chains** for production reliability
3. **Cache responses** to reduce API calls and costs
4. **Monitor credits** to avoid service interruption
5. **Use appropriate models** for different tasks (cost/performance)
6. **Handle errors gracefully** with retries and fallbacks
7. **Log important events** for debugging and analytics
8. **Validate all inputs and outputs** for security
9. **Use streaming** for better user experience with long responses
10. **Keep API key secure** and rotate regularly

## Support Resources

- **Documentation**: [LibreChat Docs](https://docs.librechat.ai)
- **API Reference**: [OpenRouter API](../api-reference/openrouter.md)
- **Migration Guide**: [YAML to Native](../migration/openrouter-yaml-to-native.md)
- **OpenRouter Dashboard**: [openrouter.ai/dashboard](https://openrouter.ai/dashboard)
- **Community Support**: [Discord](https://discord.librechat.ai)
- **Issue Tracker**: [GitHub Issues](https://github.com/danny-avila/LibreChat/issues)