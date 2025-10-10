# Feature Request: MCP Sampling Support for LibreChat

## Executive Summary

We request that LibreChat implement **MCP Sampling** support, which allows MCP servers to request LLM completions through the client. This is a standard feature of the Model Context Protocol (MCP) specification that would unlock powerful agentic capabilities for MCP servers while maintaining user control and security.

## What is MCP Sampling?

MCP Sampling is a core feature of the Model Context Protocol that enables **servers to request LLM completions from clients** via the `sampling/createMessage` method. This reverses the typical flow: instead of clients always initiating LLM calls, servers can request them when needed.

### Key Benefits

1. **No API Keys in MCP Servers**: MCP servers don't need their own LLM API credentials
2. **User Control**: Users maintain full control over which models are used and can review requests
3. **Security**: Human-in-the-loop review prevents malicious or unexpected LLM usage
4. **Cost Management**: Uses the client's existing LLM configuration and billing
5. **Agentic Workflows**: Enables sophisticated multi-step reasoning within MCP servers

## Use Cases for Senticor

### 1. Hive RDF Triple Store MCP Server
The Hive MCP server could use sampling for:
- **Semantic Analysis**: Ask LLM to analyze RDF graph structures and suggest relationships
- **Ontology Reasoning**: Request semantic inferences about entities in the knowledge graph
- **Natural Language Queries**: Convert user questions into SPARQL queries with LLM assistance
- **Data Enrichment**: Generate additional semantic annotations for RDF triples

Example workflow:
```
User: "Add customer John Doe to the graph"
→ Hive MCP creates entity
→ Hive MCP requests sampling: "Analyze this customer profile and suggest relevant ontology classes"
→ LLM responds with semantic suggestions
→ Hive MCP enriches the RDF data
→ User gets semantically rich knowledge graph
```

### 2. Rechtsinformationen MCP Server
The legal information MCP server could use sampling for:
- **Document Summarization**: Request summaries of long legal texts
- **Legal Analysis**: Ask LLM to analyze legal arguments or precedents
- **Cross-Reference Detection**: Identify connections between legal documents
- **Citation Validation**: Verify legal citations and references

## How MCP Sampling Works

### Request Flow

```
┌─────────────┐  1. sampling/createMessage   ┌──────────────┐
│  MCP Server │ ────────────────────────────> │  LibreChat   │
│   (Hive)    │                                │   (Client)   │
└─────────────┘                                └──────────────┘
                                                      │
                                                      │ 2. User reviews
                                                      │    (optional)
                                                      ▼
                                               ┌──────────────┐
                                               │     LLM      │
                                               │  (Claude,    │
                                               │  GPT, etc)   │
                                               └──────────────┘
                                                      │
┌─────────────┐  4. Return completion         │
│  MCP Server │ <─────────────────────────────┘
│   (Hive)    │
└─────────────┘
```

### Request Format

MCP servers send requests like this:

```typescript
{
  "method": "sampling/createMessage",
  "params": {
    "messages": [
      {
        "role": "user",
        "content": {
          "type": "text",
          "text": "Analyze this RDF triple and suggest semantic relationships..."
        }
      }
    ],
    "modelPreferences": {
      "hints": [{"name": "claude-3-sonnet"}],
      "intelligencePriority": 0.8,  // Prefer smarter models
      "speedPriority": 0.5,          // Balance speed
      "costPriority": 0.3            // Less emphasis on cost
    },
    "systemPrompt": "You are an RDF ontology expert helping to enrich knowledge graphs.",
    "maxTokens": 1000
  }
}
```

### Response Format

LibreChat returns:

```typescript
{
  "content": {
    "type": "text",
    "text": "Based on the RDF triple provided, I suggest..."
  },
  "model": "claude-3-sonnet-20240229",
  "stopReason": "end_turn"
}
```

## Implementation Requirements

### 1. Enable Sampling Capability

**File**: `packages/api/src/mcp/connection.ts`

**Current code** (lines 126-134):
```typescript
this.client = new Client(
  {
    name: '@librechat/api-client',
    version: '1.2.3',
  },
  {
    capabilities: {},  // ← Empty capabilities
  },
);
```

**Proposed change**:
```typescript
this.client = new Client(
  {
    name: '@librechat/api-client',
    version: '1.2.3',
  },
  {
    capabilities: {
      sampling: {},  // ← Enable sampling capability
    },
  },
);
```

### 2. Implement Request Handler

**File**: `packages/api/src/mcp/connection.ts` (in `setupEventListeners()` method)

Add the sampling request handler:

```typescript
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';

private setupEventListeners(): void {
  this.isInitializing = true;

  // Existing event listeners...
  this.on('connectionChange', (state: t.ConnectionState) => {
    // ... existing code ...
  });

  this.subscribeToResources();

  // NEW: Add sampling request handler
  this.setupSamplingHandler();
}

private setupSamplingHandler(): void {
  this.client.setRequestHandler(
    CreateMessageRequestSchema,
    async (request, extra) => {
      logger.info(
        `${this.getLogPrefix()} Sampling request received`,
        {
          messageCount: request.params?.messages?.length,
          maxTokens: request.params?.maxTokens
        }
      );

      try {
        // TODO: Integrate with LibreChat's LLM infrastructure
        // This is where we need to call the same LLM system that
        // agents use for tool execution
        const response = await this.handleSamplingRequest(request.params, extra);
        return response;
      } catch (error) {
        logger.error(`${this.getLogPrefix()} Sampling request failed:`, error);
        throw error;
      }
    }
  );
}

private async handleSamplingRequest(
  params: SamplingParams,
  extra: RequestHandlerExtra
): Promise<CreateMessageResult> {
  // This needs to integrate with LibreChat's agent/LLM infrastructure
  // Route the request through the same system that handles agent tool calls

  // The actual implementation would depend on how LibreChat
  // wants to handle model selection, user approval, etc.
  throw new Error('Sampling not yet implemented');
}
```

### 3. Integration with LibreChat's LLM Infrastructure

The `handleSamplingRequest` method needs to integrate with LibreChat's existing infrastructure:

**Option A: Route through Agent system**
```typescript
// Use the same LLM infrastructure that agents use
private async handleSamplingRequest(
  params: SamplingParams,
  extra: RequestHandlerExtra
): Promise<CreateMessageResult> {
  // Get the current user's model configuration
  const config = this.getConfigForUser(this.userId);

  // Route to LibreChat's LLM client
  const llmClient = await createLLMClient({
    provider: config.provider,
    model: selectModelFromPreferences(params.modelPreferences, config),
    apiKey: config.apiKey,
  });

  // Make the LLM call
  const response = await llmClient.createMessage({
    messages: params.messages,
    system: params.systemPrompt,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
  });

  return {
    content: response.content,
    model: response.model,
    stopReason: response.stopReason,
    usage: response.usage,
  };
}
```

**Option B: Emit event for user approval**
```typescript
// Allow user to review and approve sampling requests
private async handleSamplingRequest(
  params: SamplingParams,
  extra: RequestHandlerExtra
): Promise<CreateMessageResult> {
  // Emit event to frontend for user approval
  this.emit('samplingRequest', {
    serverName: this.serverName,
    params: params,
    requestId: generateRequestId(),
  });

  // Wait for user approval/modification
  const approvedParams = await this.waitForUserApproval(params);

  // Proceed with approved request
  return await this.executeSamplingRequest(approvedParams);
}
```

### 4. Model Selection Logic

Implement logic to select appropriate models based on preferences:

```typescript
function selectModelFromPreferences(
  preferences: ModelPreferences,
  userConfig: UserConfig
): string {
  // Check if user has access to hinted models
  if (preferences.hints) {
    for (const hint of preferences.hints) {
      if (userHasAccessToModel(userConfig, hint.name)) {
        return hint.name;
      }
    }
  }

  // Fall back to priority-based selection
  const { intelligencePriority, speedPriority, costPriority } = preferences;

  if (intelligencePriority > 0.7) {
    return userConfig.preferredIntelligentModel || userConfig.defaultModel;
  } else if (speedPriority > 0.7) {
    return userConfig.preferredFastModel || userConfig.defaultModel;
  } else if (costPriority > 0.7) {
    return userConfig.preferredCheapModel || userConfig.defaultModel;
  }

  return userConfig.defaultModel;
}
```

## Security Considerations

### User Approval Flow (Recommended)

1. **Request Notification**: When a sampling request comes in, show user a notification
2. **Request Details**: Display what the MCP server is asking the LLM
3. **User Decision**: User can:
   - Approve as-is
   - Modify the request
   - Deny the request
4. **Timeout**: Auto-deny after 30 seconds if no response

### Configuration Options

Add to `librechat.yaml`:

```yaml
mcpServers:
  honeycomb:
    type: stdio
    command: node
    args:
      - /app/mcp-servers/honeycomb/dist/index.js
    samplingConfig:
      enabled: true                    # Enable sampling for this server
      requireUserApproval: true        # Require user approval (recommended)
      autoApproveTimeout: 30000        # Auto-deny after 30s
      maxTokensLimit: 4000             # Maximum tokens per request
      allowedModels:                   # Optional: restrict which models can be used
        - "claude-3-sonnet-20240229"
        - "gpt-4-turbo"
```

## Testing Strategy

### Unit Tests

```typescript
describe('MCP Sampling', () => {
  it('should handle sampling requests', async () => {
    const connection = await createMCPConnection({
      serverName: 'test-server',
      serverConfig: { /* ... */ },
    });

    const request = {
      method: 'sampling/createMessage',
      params: {
        messages: [{ role: 'user', content: { type: 'text', text: 'Test' } }],
        maxTokens: 100,
      },
    };

    const response = await connection.handleRequest(request);
    expect(response.content).toBeDefined();
  });

  it('should respect maxTokens limit', async () => {
    // Test that maxTokens configuration is enforced
  });

  it('should handle user denials', async () => {
    // Test that denied requests throw appropriate errors
  });
});
```

### Integration Tests

1. **End-to-End Test**: MCP server → LibreChat → LLM → Response
2. **User Approval Test**: Verify user approval flow works
3. **Model Selection Test**: Verify correct model is selected based on preferences
4. **Error Handling Test**: Test timeout, denial, and LLM errors

## Benefits to LibreChat Community

Implementing sampling support would:

1. **Enable Advanced MCP Servers**: Allow developers to build more sophisticated MCP integrations
2. **Competitive Feature**: Other MCP clients (Claude Desktop, VS Code) support sampling
3. **Standard Compliance**: Full compliance with MCP specification
4. **User Empowerment**: Users can leverage MCP servers for complex agentic workflows
5. **Ecosystem Growth**: Attract more MCP server developers to LibreChat

## Timeline Estimate

- **Phase 1**: Basic sampling support (1-2 weeks)
  - Enable capability
  - Implement basic request handler
  - Route to existing LLM infrastructure

- **Phase 2**: User approval flow (1-2 weeks)
  - Frontend UI for approval
  - Backend event handling
  - Configuration options

- **Phase 3**: Advanced features (1 week)
  - Model selection logic
  - Per-server sampling configuration
  - Usage tracking and limits

**Total**: 3-5 weeks for full implementation

## Related Work

### Similar Implementations

- **Claude Desktop**: Has full sampling support
- **VS Code MCP Extension**: Supports sampling with user approval
- **Continue.dev**: Implements sampling for their MCP integration

### LibreChat Code to Leverage

- **Agent Tool Execution**: `api/server/services/MCP.js` - Already handles tool calls from agents
- **LLM Clients**: `packages/api/src/endpoints/` - Existing LLM provider integrations
- **User Context**: `api/server/controllers/agents/client.js` - User and request context handling

## Conclusion

MCP Sampling support is a **high-value, medium-effort** feature that would:

- ✅ Unlock powerful use cases for Senticor's MCP servers (Hive, Rechtsinformationen)
- ✅ Bring LibreChat to full MCP specification compliance
- ✅ Enable the community to build more sophisticated MCP integrations
- ✅ Maintain LibreChat's security and user-control principles

We're happy to contribute to the implementation or provide testing/feedback as this feature is developed.

## References

- **MCP Specification**: Model Context Protocol SDK includes full sampling spec
- **SDK Types**: `@modelcontextprotocol/sdk` - `CreateMessageRequestSchema`, `CreateMessageResultSchema`
- **LibreChat MCP Code**:
  - [packages/api/src/mcp/connection.ts](../../packages/api/src/mcp/connection.ts)
  - [api/server/services/MCP.js](../../api/server/services/MCP.js)
  - [packages/api/src/mcp/MCPManager.ts](../../packages/api/src/mcp/MCPManager.ts)

## Contact

For questions or to discuss implementation:
- **GitHub Issue**: [Create issue in LibreChat repo]
- **Senticor Team**: Available for collaboration and testing
