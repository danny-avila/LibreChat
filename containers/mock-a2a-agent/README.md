# Mock A2A Agent

This is a mock A2A (Agent-to-Agent) protocol agent designed for LibreChat integration testing and development.

## Features

- **A2A Protocol Compliance**: Implements the A2A protocol specification
- **Multiple Transports**: Supports JSON-RPC and REST API endpoints
- **Task Workflows**: Handles both direct messages and task-based interactions
- **Conversation Context**: Maintains conversation history across interactions
- **Mock Responses**: Generates contextual responses based on input
- **Health Monitoring**: Built-in health check and status endpoints
- **Docker Support**: Containerized for easy deployment

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start the server
npm start

# For development with auto-restart
npm run dev
```

### Docker

```bash
# Build the container
docker build -t mock-a2a-agent .

# Run the container
docker run -p 8080:8080 mock-a2a-agent
```

### Docker Compose (with LibreChat)

Add to your `docker-compose.yml`:

```yaml
services:
  mock-a2a-agent:
    build: ./containers/mock-a2a-agent
    ports:
      - "8080:8080"
    environment:
      - AGENT_URL=http://mock-a2a-agent:8080
      - CORS_ORIGIN=http://localhost:3080
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## API Endpoints

### A2A Protocol Endpoints

- `GET /.well-known/agent-card` - Agent card (A2A specification)
- `POST /jsonrpc` - JSON-RPC endpoint for A2A communication
- `POST /v1/message/send` - REST endpoint for direct messages
- `POST /v1/tasks/create` - REST endpoint for task creation
- `GET /v1/tasks/:taskId` - Get task status
- `DELETE /v1/tasks/:taskId` - Cancel task

### Utility Endpoints

- `GET /health` - Health check
- `GET /status` - Agent status and statistics

## Agent Card

The agent advertises the following capabilities:

```json
{
  "protocolVersion": "0.1.0",
  "name": "Mock LangChain A2A Agent",
  "description": "A mock A2A protocol agent for LibreChat integration testing",
  "preferredTransport": "JSONRPC",
  "capabilities": {
    "streaming": true,
    "multiTurn": true,
    "taskBased": true
  },
  "skills": [
    {
      "id": "conversation",
      "name": "Conversational AI",
      "description": "Engage in natural language conversations"
    },
    {
      "id": "task-processing", 
      "name": "Task Processing",
      "description": "Handle complex, multi-step tasks"
    }
  ]
}
```

## Usage Examples

### Direct Message (JSON-RPC)

```bash
curl -X POST http://localhost:8080/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [{"type": "text", "content": "Hello!"}]
      },
      "contextId": "test-context"
    },
    "id": 1
  }'
```

### Task Creation

```bash
curl -X POST http://localhost:8080/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", 
    "method": "tasks/create",
    "params": {
      "message": {
        "role": "user",
        "parts": [{"type": "text", "content": "Analyze this data"}]
      },
      "contextId": "task-context"
    },
    "id": 2
  }'
```

### LibreChat Registration

To register this mock agent with LibreChat:

```bash
curl -X POST http://localhost:3080/api/a2a/agents/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "agentCardUrl": "http://mock-a2a-agent:8080/.well-known/agent-card",
    "authentication": {
      "type": "none"
    },
    "options": {
      "enableStreaming": true,
      "enableTasks": true
    }
  }'
```

## Environment Variables

- `PORT` - Server port (default: 8080)
- `HOST` - Server host (default: 0.0.0.0)
- `AGENT_URL` - Public URL for the agent (used in agent card)
- `CORS_ORIGIN` - CORS allowed origins
- `NODE_ENV` - Node environment (development/production)

## Mock Behavior

The mock agent provides intelligent responses based on input:

- **Greetings**: Responds to hello, hi, hey with friendly greetings
- **Questions**: Handles what/how questions with informative responses  
- **A2A Protocol**: Explains A2A protocol when asked
- **Tasks**: Processes task-based workflows with realistic delays
- **Context**: Maintains conversation history and context
- **Artifacts**: Generates mock artifacts for task-based interactions

## Development

The mock agent is designed for:

- **Testing A2A Integration**: Verify LibreChat's A2A protocol implementation
- **Development**: Develop A2A features without external dependencies
- **Debugging**: Test message flows, task workflows, and error handling
- **Demo**: Demonstrate A2A protocol capabilities

## Limitations

This is a mock implementation for testing purposes:

- No actual AI/LLM integration
- Responses are generated programmatically
- No persistent storage (data is lost on restart)
- Limited to demonstration use cases

## License

MIT License - See LICENSE file for details.