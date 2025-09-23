# OpenRouter Troubleshooting & FAQ

## Table of Contents
- [Common Issues](#common-issues)
- [Error Codes](#error-codes)
- [Performance Issues](#performance-issues)
- [Integration Problems](#integration-problems)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Debug Guide](#debug-guide)
- [Contact Support](#contact-support)

## Common Issues

### OpenRouter Not Appearing in Provider List

**Symptoms:**
- OpenRouter missing from dropdown menu
- No OpenRouter option in Agent Builder
- Provider list doesn't update

**Solutions:**

1. **Verify API Key Format**
   ```bash
   # Check if key starts with correct prefix
   echo $OPENROUTER_API_KEY | grep "^sk-or-"
   ```
   - Must start with `sk-or-v1-` or `sk-or-`
   - No spaces or newlines
   - Exactly 64 characters after prefix

2. **Check Environment Variables**
   ```bash
   # Verify environment variable is set
   printenv | grep OPENROUTER

   # Should see:
   # OPENROUTER_API_KEY=sk-or-v1-xxxxx
   ```

3. **Restart Application Completely**
   ```bash
   # Docker
   docker-compose down && docker-compose up -d

   # PM2
   pm2 stop all && pm2 start ecosystem.config.js

   # Development
   # Kill all node processes and restart
   pkill node && npm run backend:dev
   ```

4. **Clear Browser Cache**
   - Open DevTools (F12)
   - Right-click refresh button
   - Select "Empty Cache and Hard Reload"

5. **Check Server Logs**
   ```bash
   # Look for initialization errors
   docker logs librechat 2>&1 | grep -i "openrouter"

   # Should see:
   # [OpenRouter] Provider initialized successfully
   ```

### Authentication Errors (401)

**Error Message:**
```json
{
  "error": {
    "message": "Invalid OpenRouter API key",
    "type": "authentication_error",
    "code": 401
  }
}
```

**Solutions:**

1. **Verify API Key**
   ```bash
   # Test API key directly
   curl https://openrouter.ai/api/v1/models \
     -H "Authorization: Bearer $OPENROUTER_API_KEY" \
     -H "Content-Type: application/json"
   ```

2. **Check Key Permissions**
   - Log into [OpenRouter Dashboard](https://openrouter.ai/dashboard)
   - Navigate to API Keys
   - Verify key has required permissions:
     - ✅ Chat Completions
     - ✅ Models List
     - ✅ Credits View

3. **Regenerate API Key**
   - Delete current key from dashboard
   - Generate new key
   - Update `.env` file
   - Restart application

### Insufficient Credits (402)

**Error Message:**
```json
{
  "error": {
    "message": "Insufficient credits",
    "type": "insufficient_credits",
    "code": 402
  }
}
```

**Solutions:**

1. **Check Current Balance**
   ```bash
   curl https://openrouter.ai/api/v1/credits \
     -H "Authorization: Bearer $OPENROUTER_API_KEY"
   ```

2. **Add Credits**
   - Visit [OpenRouter Billing](https://openrouter.ai/billing)
   - Add payment method
   - Purchase credits

3. **Use Free Models**
   Some models offer free tiers:
   - `openrouter/auto` (limited free usage)
   - Check model pricing in dashboard

4. **Implement Fallback to Cheaper Models**
   ```javascript
   {
     "model": "openai/gpt-4",
     "models": ["openai/gpt-3.5-turbo"], // Cheaper fallback
     "route": "fallback"
   }
   ```

### Rate Limiting (429)

**Error Message:**
```json
{
  "error": {
    "message": "Rate limit exceeded",
    "type": "rate_limit_error",
    "code": 429,
    "retry_after": 30
  }
}
```

**Solutions:**

1. **Implement Exponential Backoff**
   ```javascript
   async function retryWithBackoff(fn, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (error.code === 429 && i < maxRetries - 1) {
           const delay = Math.pow(2, i) * 1000;
           await new Promise(r => setTimeout(r, delay));
         } else {
           throw error;
         }
       }
     }
   }
   ```

2. **Reduce Request Frequency**
   - Add delays between requests
   - Batch multiple prompts into single request
   - Use streaming for long responses

3. **Upgrade Rate Limits**
   - Contact OpenRouter support
   - Upgrade to higher tier plan
   - Use site attribution headers for better limits

### Models Not Loading

**Symptoms:**
- Empty model dropdown
- "No models available" message
- Model list never updates

**Solutions:**

1. **Force Refresh Models**
   ```javascript
   // Add force parameter to bypass cache
   fetch('/api/openrouter/models?force=true', {
     headers: { 'Authorization': `Bearer ${token}` }
   })
   ```

2. **Check Network Connectivity**
   ```bash
   # Test OpenRouter API directly
   curl -I https://openrouter.ai/api/v1/models
   ```

3. **Clear Model Cache**
   ```bash
   # Delete cache files if using file-based cache
   rm -rf .cache/openrouter/models.*

   # Or restart with cache disabled temporarily
   OPENROUTER_CACHE_TTL_MODELS=0 npm start
   ```

4. **Verify Firewall/Proxy Settings**
   - Ensure `openrouter.ai` is not blocked
   - Check corporate firewall rules
   - Verify proxy configuration if applicable

### Credits Not Displaying

**Symptoms:**
- Balance shows as $0.00
- "Unable to load credits" error
- Credits never update

**Solutions:**

1. **Check Credits Permission**
   - Verify API key has credits read permission
   - Some keys may be restricted

2. **Force Credits Refresh**
   ```javascript
   // Manual refresh
   fetch('/api/openrouter/credits?force=true', {
     headers: { 'Authorization': `Bearer ${token}` }
   })
   ```

3. **Check Browser Console**
   - Open DevTools (F12)
   - Check Console tab for errors
   - Look for CORS or network errors

4. **Verify Backend Response**
   ```bash
   # Test credits endpoint directly
   curl http://localhost:3080/api/openrouter/credits \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

## Error Codes

### HTTP Status Codes

| Code | Type | Description | Solution |
|------|------|-------------|----------|
| 400 | Bad Request | Invalid request format | Check request body structure |
| 401 | Unauthorized | Invalid API key | Verify API key format and validity |
| 402 | Payment Required | Insufficient credits | Add credits to account |
| 403 | Forbidden | Access denied | Check API key permissions |
| 404 | Not Found | Model not found | Verify model ID exists |
| 429 | Too Many Requests | Rate limit exceeded | Implement backoff, reduce frequency |
| 500 | Internal Error | Server error | Retry request, contact support |
| 502 | Bad Gateway | Model provider error | Use fallback model, retry |
| 503 | Service Unavailable | Temporary outage | Wait and retry |

### OpenRouter-Specific Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `context_length_exceeded` | Input too long for model | Reduce input size or use model with larger context |
| `model_not_available` | Model temporarily offline | Use fallback model |
| `invalid_model_id` | Model ID doesn't exist | Check model list for valid IDs |
| `parameter_not_supported` | Model doesn't support parameter | Remove unsupported parameter |
| `content_policy_violation` | Content violates policies | Review and modify content |

## Performance Issues

### Slow Response Times

**Symptoms:**
- Long delays before responses
- Timeouts on requests
- UI becomes unresponsive

**Solutions:**

1. **Use Streaming**
   ```javascript
   {
     "stream": true,  // Enable streaming
     "model": "openai/gpt-4"
   }
   ```

2. **Choose Faster Models**
   - `openai/gpt-3.5-turbo` - Fastest
   - `mistral/mistral-7b` - Fast and efficient
   - `google/gemini-flash` - Optimized for speed

3. **Optimize Prompts**
   - Reduce system prompt size
   - Limit conversation history
   - Use concise instructions

4. **Enable Caching**
   ```bash
   # Increase cache TTL for stable data
   OPENROUTER_CACHE_TTL_MODELS=7200000  # 2 hours
   OPENROUTER_CACHE_TTL_CREDITS=600000   # 10 minutes
   ```

### High API Costs

**Problem:** Excessive credit consumption

**Solutions:**

1. **Use Cost-Effective Models**
   ```javascript
   // Tier models by cost
   const models = {
     expensive: ["openai/gpt-4", "anthropic/claude-3-opus"],
     moderate: ["openai/gpt-3.5-turbo", "anthropic/claude-3-sonnet"],
     cheap: ["mistral/mistral-7b", "google/gemini-flash"]
   };
   ```

2. **Implement Token Limits**
   ```javascript
   {
     "max_tokens": 500,  // Limit response length
     "temperature": 0.3  // Lower temperature = less tokens
   }
   ```

3. **Use Auto Router**
   ```javascript
   {
     "model": "openrouter/auto"  // Automatically optimizes cost/performance
   }
   ```

## Integration Problems

### Agents Not Working with OpenRouter

**Symptoms:**
- OpenRouter not in Agent Builder
- Agents fail when using OpenRouter
- "Provider not supported" errors

**Solutions:**

1. **Verify Native Provider Setup**
   ```bash
   # Check if using YAML config (old method)
   grep -i "openrouter" librechat.yaml

   # Should return nothing - YAML config must be removed
   ```

2. **Check Agent Service Registration**
   ```javascript
   // Verify in api/server/services/AgentService.js
   const providers = {
     'openrouter': OpenRouterClient,  // Must be present
     // ... other providers
   };
   ```

3. **Restart and Clear Cache**
   ```bash
   # Full restart
   docker-compose down
   docker volume prune  # Warning: removes all unused volumes
   docker-compose up -d
   ```

### Streaming Not Working

**Symptoms:**
- Response appears all at once
- No incremental updates
- SSE connection fails

**Solutions:**

1. **Check Proxy Configuration**
   ```nginx
   # nginx.conf - Enable SSE
   location /api/openrouter/chat/completions {
     proxy_pass http://backend;
     proxy_http_version 1.1;
     proxy_set_header Connection "";
     proxy_buffering off;
     proxy_cache off;
   }
   ```

2. **Verify Response Headers**
   ```javascript
   // Should include:
   headers: {
     'Content-Type': 'text/event-stream',
     'Cache-Control': 'no-cache',
     'Connection': 'keep-alive'
   }
   ```

3. **Test with curl**
   ```bash
   curl -N -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"model":"openai/gpt-3.5-turbo","messages":[{"role":"user","content":"Hi"}],"stream":true}' \
        http://localhost:3080/api/openrouter/chat/completions
   ```

## Frequently Asked Questions

### General Questions

**Q: What models are available through OpenRouter?**
A: Over 100 models including:
- OpenAI (GPT-4, GPT-3.5, DALL-E)
- Anthropic (Claude 3 family)
- Google (Gemini, PaLM)
- Meta (Llama family)
- Mistral (7B, 8x7B, Large)
- And many more...

Check current list: `/api/openrouter/models`

**Q: How does pricing work?**
A: You pay per token used:
- Input tokens (prompt)
- Output tokens (completion)
- Prices vary by model
- No monthly fees, pay-as-you-go
- View pricing: [openrouter.ai/models](https://openrouter.ai/models)

**Q: What is Auto Router?**
A: Auto Router (`openrouter/auto`) intelligently selects the best model for each prompt based on:
- Content type
- Complexity
- Cost optimization
- Availability

**Q: Can I use my own API keys for specific providers?**
A: Yes, through Provider Preferences:
```javascript
{
  "provider": {
    "allow_user_keys": true,
    "user_keys": {
      "openai": "sk-...",
      "anthropic": "sk-ant-..."
    }
  }
}
```

### Technical Questions

**Q: How do fallback chains work?**
A: Fallbacks trigger automatically when:
1. Primary model returns error
2. Rate limit exceeded
3. Model unavailable
4. Request timeout

Example:
```javascript
{
  "model": "openai/gpt-4",
  "models": ["claude-3-opus", "gpt-3.5-turbo"],
  "route": "fallback"
}
```

**Q: What's the maximum context length?**
A: Depends on the model:
- GPT-4: 8K-128K tokens
- Claude 3: 200K tokens
- Gemini Pro: 1M tokens
- Check specific model limits in `/api/openrouter/models`

**Q: How can I reduce latency?**
A: Several strategies:
1. Use streaming responses
2. Choose models closer to your region
3. Implement caching
4. Use smaller, faster models
5. Optimize prompt length

**Q: Is my data private?**
A: Yes, with controls:
```javascript
{
  "provider": {
    "data_collection": "deny",  // Opt out of data collection
    "require_parameters": true
  }
}
```

### Migration Questions

**Q: How do I migrate from YAML configuration?**
A: See [Migration Guide](../migration/openrouter-yaml-to-native.md)

Key steps:
1. Add `OPENROUTER_API_KEY` to `.env`
2. Remove OpenRouter from `librechat.yaml`
3. Restart application
4. OpenRouter appears automatically

**Q: Will my conversations be preserved?**
A: Yes, all conversation history is preserved. Only the provider configuration changes.

**Q: Can I use both YAML and native providers?**
A: Not recommended for OpenRouter. Native provider should completely replace YAML configuration.

### Troubleshooting Questions

**Q: Why am I getting CORS errors?**
A: CORS errors indicate client-side API calls. Ensure:
- All API calls go through LibreChat backend
- Not calling OpenRouter directly from browser
- Check proxy configuration

**Q: How do I enable debug logging?**
A: Add to `.env`:
```bash
DEBUG=openrouter:*
LOG_LEVEL=debug
NODE_ENV=development
```

**Q: Where are logs stored?**
A: Depends on deployment:
- Docker: `docker logs librechat`
- PM2: `pm2 logs librechat`
- Development: Console output
- Production: Check `logs/` directory

## Debug Guide

### Enable Verbose Logging

1. **Environment Variables**
   ```bash
   # .env
   DEBUG=openrouter:*,librechat:*
   LOG_LEVEL=debug
   NODE_ENV=development
   ```

2. **Client-Side Debugging**
   ```javascript
   // In browser console
   localStorage.setItem('debug', 'openrouter:*');
   ```

3. **Network Inspection**
   - Open DevTools → Network tab
   - Filter by "openrouter"
   - Check request/response details

### Common Debug Commands

```bash
# Check if OpenRouter is initialized
curl http://localhost:3080/api/openrouter/health

# Test authentication
curl https://openrouter.ai/api/v1/auth/key \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"

# List available models
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq '.data[].id'

# Check current usage
curl https://openrouter.ai/api/v1/credits \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"

# Test simple completion
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

### Debug Checklist

- [ ] API key starts with `sk-or-`
- [ ] Environment variables loaded correctly
- [ ] No YAML configuration for OpenRouter
- [ ] Application fully restarted
- [ ] Browser cache cleared
- [ ] Network connectivity to openrouter.ai
- [ ] Correct JWT token for authentication
- [ ] No firewall blocking requests
- [ ] Logs show successful initialization
- [ ] Credits endpoint responds
- [ ] Models endpoint returns list
- [ ] Simple chat completion works

## Contact Support

### LibreChat Support

- **Documentation**: [docs.librechat.ai](https://docs.librechat.ai)
- **GitHub Issues**: [github.com/danny-avila/LibreChat/issues](https://github.com/danny-avila/LibreChat/issues)
- **Discord Community**: [discord.librechat.ai](https://discord.librechat.ai)
- **Discussion Forum**: [github.com/danny-avila/LibreChat/discussions](https://github.com/danny-avila/LibreChat/discussions)

### OpenRouter Support

- **Status Page**: [status.openrouter.ai](https://status.openrouter.ai)
- **Documentation**: [openrouter.ai/docs](https://openrouter.ai/docs)
- **Email Support**: support@openrouter.ai
- **Dashboard**: [openrouter.ai/dashboard](https://openrouter.ai/dashboard)

### Reporting Issues

When reporting issues, include:

1. **Environment Info**
   ```bash
   node --version
   npm --version
   docker --version  # if using Docker
   ```

2. **Configuration** (sanitized)
   ```bash
   # Remove sensitive data
   grep -i openrouter .env | sed 's/=.*/=REDACTED/'
   ```

3. **Error Messages**
   - Full error text
   - HTTP status codes
   - Stack traces if available

4. **Steps to Reproduce**
   - Exact steps taken
   - Expected behavior
   - Actual behavior

5. **Logs**
   ```bash
   # Recent OpenRouter logs
   docker logs librechat --tail 100 | grep -i openrouter
   ```

### Emergency Contacts

For critical issues affecting production:

1. **LibreChat Critical Issues**: Create issue with `[URGENT]` tag
2. **OpenRouter Outages**: Check [status.openrouter.ai](https://status.openrouter.ai)
3. **Security Issues**: Email security@librechat.ai (do not post publicly)

---

*Last updated: 2024*
*Version: 1.0.0*