# OpenRouter Native Tool Support Implementation

## Overview
This document describes the native tool calling support added to the OpenRouter integration in LibreChat, enabling full agent system compatibility with function/tool calling capabilities.

## Implementation Details

### 1. OpenRouterClient Enhancement

The `OpenRouterClient` class has been enhanced to support OpenAI-compatible tool calling:

#### Added Parameters
- `tools` - Array of tool definitions in OpenAI format
- `tool_choice` - Control parameter for tool selection ('auto', 'none', 'required', or specific tool)
- `parallel_tool_calls` - Boolean to enable parallel tool execution
- `functions` - Legacy function definitions for backward compatibility
- `function_call` - Legacy function call control

#### Request Building
The client now includes tool parameters in the API request body:
```javascript
const requestBody = {
  messages,
  model: effectiveModel,
  ...otherParams,
  transforms: ['middle-out'],
  // Tool calling parameters
  ...(tools && { tools }),
  ...(tool_choice && { tool_choice }),
  ...(parallel_tool_calls !== undefined && { parallel_tool_calls }),
  // Legacy support
  ...(functions && { functions }),
  ...(function_call && { function_call }),
};
```

### 2. Response Handling

#### Non-Streaming Mode
- Preserves `tool_calls` from the response
- Maintains compatibility with agent system expectations
- Supports legacy `function_call` format

#### Streaming Mode
- Accumulates tool call chunks during streaming
- Builds complete tool call objects from deltas
- Returns properly formatted response with tool_calls when stream ends

### 3. Agent System Integration

The implementation works seamlessly with LibreChat's agent system:
- ChatOpenRouter (from @librechat/agents) extends ChatOpenAI
- Tool definitions are passed through in OpenAI format
- Response format matches agent system expectations

## Testing

### API Verification
Direct API testing confirms OpenRouter supports tool calling:
```bash
curl -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
    "model": "openai/gpt-4-turbo",
    "tools": [...],
    "tool_choice": "auto"
  }'
```

Response includes:
```json
{
  "choices": [{
    "message": {
      "tool_calls": [{
        "id": "call_xxx",
        "type": "function",
        "function": {
          "name": "tool_name",
          "arguments": "{...}"
        }
      }]
    }
  }]
}
```

### Supported Models
Tool calling works with models that support function calling, including:
- OpenAI models (gpt-4-turbo, gpt-4o, etc.)
- Anthropic models with tool support
- Other providers that support OpenAI-compatible tool format

## Key Features

1. **Full OpenAI Compatibility**: Implements the complete OpenAI tool calling specification
2. **Streaming Support**: Handles tool calls in both streaming and non-streaming modes
3. **Legacy Support**: Maintains backward compatibility with function_call format
4. **Agent Integration**: Works seamlessly with LibreChat's agent system
5. **Auto-Router Compatible**: Tool calling works alongside auto-router feature

## Usage Example

```javascript
const response = await client.chatCompletion({
  messages: [
    { role: 'user', content: 'Calculate 25 * 4' }
  ],
  tools: [{
    type: 'function',
    function: {
      name: 'calculator',
      description: 'Performs arithmetic',
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string' },
          a: { type: 'number' },
          b: { type: 'number' }
        }
      }
    }
  }],
  tool_choice: 'auto'
});

// Response contains tool_calls
if (response.choices[0].message.tool_calls) {
  // Process tool calls
}
```

## Implementation Files

- `/api/app/clients/OpenRouterClient.js` - Core client implementation with tool support
- `/api/server/services/Endpoints/openrouter/initialize.js` - Initialization logic for agents

## Benefits

1. **Agent Compatibility**: Enables OpenRouter to work with LibreChat's agent system
2. **Tool Ecosystem**: Access to all LibreChat tools through OpenRouter
3. **Model Flexibility**: Use any OpenRouter model that supports tools
4. **Fallback Support**: Combine with OpenRouter's model fallback feature

## Status

✅ **Implemented and Ready**
- Tool parameters accepted in chatCompletion
- Request body includes tool definitions
- Non-streaming responses preserve tool_calls
- Streaming accumulates and returns tool calls
- Agent system integration verified