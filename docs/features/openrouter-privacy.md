# OpenRouter Privacy Settings and Error Handling

## Overview

OpenRouter enforces privacy policies at the API level based on your account settings. This document explains how privacy works and how to handle related errors in LibreChat.

## Privacy Policy Enforcement

OpenRouter's privacy system works at the **API key level**:

1. **Account Settings**: Configure at https://openrouter.ai/settings/privacy
2. **Per-Key Configuration**: Each API key has its own privacy settings
3. **Server-Side Enforcement**: OpenRouter blocks incompatible models automatically

## Common Error: "No endpoints found matching your data policy"

### What It Means
When you see this 404 error, it means the model you selected is incompatible with your OpenRouter account's privacy settings.

### Example Scenario
- Your API key has "deny training on free models" enabled
- You try to use Grok (X-AI) which trains on user data
- OpenRouter returns: `404 No endpoints found matching your data policy (Free model training)`

## Solutions

### 1. Use Zero Data Retention (ZDR)
LibreChat now includes a ZDR toggle in OpenRouter settings:
- Enable it to only use providers that guarantee Zero Data Retention
- This adds `zdr: true` parameter to all requests
- Note: This may limit available models

### 2. Adjust Your OpenRouter Settings
Visit https://openrouter.ai/settings/privacy to configure:
- Training permissions for free models
- Training permissions for paid models
- Zero Data Retention enforcement

### 3. Choose Compatible Models
The enhanced model selector can filter models based on known privacy policies:
- Use the "Privacy Mode" toggle to hide models that may train on data
- Auto Router is never filtered and handles routing automatically

## Privacy-Safe Providers

These providers typically don't train on user data:
- Anthropic (Claude models)
- Mistral AI
- DeepSeek
- Perplexity
- Inflection AI

## Providers That May Train on Data

Unless ZDR is enabled or special agreements exist:
- OpenAI (some models)
- Google (Gemini models)
- Meta (Llama models)
- Microsoft/Azure
- X-AI (Grok)

## Best Practices

1. **Enable ZDR** for maximum privacy when working with sensitive data
2. **Test Models** before relying on them for production use
3. **Check Provider Policies** as they may change over time
4. **Use Different API Keys** for different privacy requirements

## Technical Implementation

### Request with ZDR
```javascript
{
  "model": "anthropic/claude-3-opus",
  "messages": [...],
  "zdr": true  // Enforces Zero Data Retention
}
```

### Error Response Example
```json
{
  "error": {
    "code": 404,
    "message": "No endpoints found matching your data policy (Free model training)"
  }
}
```

## Troubleshooting

### Model Works Sometimes, Fails Other Times
- Check if you're using multiple API keys with different settings
- Verify ZDR toggle state matches your needs

### All Models Failing
- Your privacy settings may be too restrictive
- Try disabling ZDR temporarily
- Check account settings at OpenRouter

### Need Maximum Privacy
1. Enable ZDR in LibreChat settings
2. Configure strict privacy at https://openrouter.ai/settings/privacy
3. Use only known privacy-safe providers

## Related Features

- **Model Sorting**: Sort by provider to group privacy-safe models
- **Privacy Filter**: Hide models that may train on data
- **Auto Router**: Let OpenRouter choose compatible models automatically

---

For more information, see:
- [OpenRouter Privacy Documentation](https://openrouter.ai/docs/features/privacy-and-logging)
- [Zero Data Retention](https://openrouter.ai/docs/features/zdr)
- [LibreChat OpenRouter Integration](./openrouter.md)