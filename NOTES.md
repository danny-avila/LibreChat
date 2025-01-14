# LibreChat AWS Bedrock Integration Notes

## Architecture Overview

- Model providers implemented as clients in api/app/clients/
- Clients inherit from BaseClient class
- Configuration handled through:
  - librechat.yaml for endpoint config
  - Environment variables for credentials
  - Docker configuration for service setup

## Configuration Structure

### Environment Variables

- AWS_ACCESS_KEY_ID: AWS access key for authentication
- AWS_SECRET_ACCESS_KEY: AWS secret key for authentication
Note: Agent IDs are now fetched dynamically from AWS Bedrock

### librechat.yaml Configuration

```yaml
endpoints:
  bedrockAgent:
    - name: 'AWS Bedrock Agent'
      agentId: '${AWS_BEDROCK_AGENT_ID}'
      agentAliasId: '${AWS_BEDROCK_AGENT_ALIAS_ID}'
      region: 'eu-central-1'
      models:
        default: ['bedrock-agent']
        supported: ['bedrock-agent']
      iconURL: '/assets/aws-bedrock.png'
      modelDisplayLabel: 'AWS Bedrock Agent'
```

### AWS SDK Configuration

The BedrockAgentClient uses the following configuration:

- Region: eu-central-1 (configured in librechat.yaml)
- Credentials: Loaded from environment variables
- Agent Configuration:
  - Agent ID: From AWS_BEDROCK_AGENT_ID
  - Agent Alias ID: From AWS_BEDROCK_AGENT_ALIAS_ID

## AWS Bedrock Agent Capabilities

1. Core Features:

   - Natural language understanding
   - Task orchestration
   - API action execution
   - Knowledge base integration
   - Memory/session management

2. API Components:

   - bedrock-agent: Control plane for agent management
   - bedrock-agent-runtime: Data plane for agent invocation
   - Key commands:
     - InvokeAgentCommand: Main chat interaction
     - RetrieveAndGenerateCommand: Knowledge base queries
     - GetAgentMemoryCommand: Session management

3. Streaming Support:
   - Supported for orchestration prompts
   - Response in bytes field of chunk object
   - Session continuity via sessionId
   - Limitations:
     - Not supported for pre/post processing
     - Limited with knowledge base + user input

## Integration Points

1. Client Implementation (BedrockAgentClient):

   - Location: api/app/clients/
   - Extend BaseClient
   - Key methods:
     - constructor (AWS credentials, agent config)
     - sendMessage (InvokeAgentCommand)
     - getTokenCount (agent-specific counting)
     - getCompletion (streaming support)

2. Configuration:

   - librechat.yaml:
     - Agent endpoint definition
     - Model configuration
     - Knowledge base settings
   - Environment:
     - AWS credentials
     - Region configuration
     - Agent/Knowledge Base IDs

3. Message Handling:

   - Streaming response implementation
   - Session management via sessionId
   - Memory/context handling
   - Error handling and retries

4. Frontend Updates:
   - Model selection UI
   - Agent configuration options
   - Knowledge base integration UI
   - Session management

## Implementation Strategy

1. Phase 1 - Basic Integration:

   - Single agent support
   - Basic chat functionality
   - Streaming responses
   - Session management

2. Phase 2 - Advanced Features:
   - Knowledge base integration
   - Multiple agent support
   - Action group configuration
   - Enhanced error handling

## Questions to Resolve

1. Agent configuration format in librechat.yaml
2. Token counting strategy for Bedrock
3. Error handling and retry logic
4. Frontend configuration options
5. Testing and validation approach

## Message Routing and UI Contexts

1. Message Flow:

   - User input captured in ChatForm.tsx
   - Processed through useSubmitMessage hook
   - Routed via useChatFunctions.ts
   - Handled by appropriate client (BedrockAgentClient)

2. Provider Selection:

   - ModelSelect.tsx renders provider-specific components
   - useSelectMention.ts manages endpoint switching
   - Conversation state tracked in conversation.ts
   - Provider-specific settings in BedrockAgent.tsx

3. Routing Decision Flow:

   - Based on conversation.endpoint and endpointType
   - Validates endpoint configuration
   - Checks agent availability
   - Constructs appropriate payload

4. UI Context Management:
   - Provider-specific components (BedrockAgent.tsx)
   - Dynamic settings forms
   - Real-time validation
   - Session state tracking

## Next Steps

1. Define configuration schema
2. Implement BedrockAgentClient
3. Add streaming support
4. Create frontend components
5. Test and validate integration
