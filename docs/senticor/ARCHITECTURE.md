# LibreChat Senticor Architecture

Technical architecture documentation for the Senticor/NEURIS LibreChat deployment.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        LibreChat                             │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐   │
│  │   Client   │  │  API/Agent │  │   MCP Servers       │   │
│  │  (React)   │──│  (Express) │──│  - Honeycomb        │   │
│  └────────────┘  └────────────┘  │  - Legal Research   │   │
│                                   │  - Web Fetch        │   │
│                                   └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │              │                      │
         │              │                      │
         ▼              ▼                      ▼
   ┌─────────┐   ┌──────────┐          ┌──────────┐
   │  React  │   │ MongoDB  │          │   HIVE   │
   │  State  │   │ MeiliSearch│        │   API    │
   └─────────┘   └──────────┘          └──────────┘
```

## Core Components

### 1. Frontend (Client)
- **Technology**: React 18 + TypeScript + Vite
- **State Management**: Recoil + TanStack Query
- **UI**: Tailwind CSS + Radix UI
- **Location**: `client/src/`

### 2. Backend (API)
- **Technology**: Express.js + Node.js
- **Database**: MongoDB (Mongoose ODM)
- **Search**: MeiliSearch
- **Authentication**: Passport.js (JWT, OAuth)
- **Location**: `api/server/`

### 3. Agents System
- **Package**: `@librechat/agents`
- **Features**: Multi-tool support, streaming, circuit breakers
- **Configuration**: Agent models in MongoDB
- **Permissions**: ACL system with PUBLIC/PRIVATE access

### 4. MCP (Model Context Protocol) Servers

#### Honeycomb MCP (HIVE)
- **Purpose**: Knowledge graph management
- **Tools**: 9 tools for honeycomb and entity operations
- **Location**: External MCP server at `senticor-hive-mcp`
- **API**: REST API at `http://hive-api:8000`

#### Legal Research MCP (Rechtsinformationen Bund DE)
- **Purpose**: German federal legal information
- **Tool**: `deutsche_gesetze_suchen`
- **Location**: External MCP server
- **Data Source**: German federal law database

#### Web Fetch MCP
- **Purpose**: Fetch and parse web content
- **Tool**: `fetch`
- **Features**: HTML to markdown conversion

## Data Flow

### Agent Interaction Flow

```
User Message
    │
    ▼
Agent Controller (api/server/controllers/agents/)
    │
    ├─> Parse Request
    ├─> Load Agent Config (MongoDB)
    ├─> Initialize LLM (Google/OpenAI/Anthropic)
    │
    ▼
Agent Execution (@librechat/agents)
    │
    ├─> Process Instructions
    ├─> Call Tools (MCP)
    │   │
    │   ├─> Honeycomb MCP → HIVE API
    │   ├─> Legal MCP → German Law DB
    │   └─> Web Fetch MCP → External URLs
    │
    ├─> Generate Response
    │
    ▼
Stream Response to Client
```

### MCP Tool Invocation

```
Agent
  │
  ▼
MCP Manager (api/server/services/)
  │
  ├─> Validate Tool Name
  ├─> Find MCP Server
  │
  ▼
MCP Server (stdio/http)
  │
  ├─> Execute Tool
  ├─> Return Result (JSON)
  │
  ▼
Agent (processes result)
  │
  ▼
Client (displays in chat)
```

## Key Technical Decisions

### 1. Agent Permissions
- **System**: Access Control Lists (ACL)
- **Types**:
  - `PUBLIC` - All users can view/use
  - `PRIVATE` - Owner only
  - `SHARED` - Specific users/groups
- **Implementation**: MongoDB collections with principal/resource model

### 2. Model Parameter Handling

**Critical**: Google Gemini models don't support `thinking` parameter.

**Solution**: Explicitly set in agent config:
```javascript
model_parameters: {
  temperature: 0.7,
  maxOutputTokens: 8000,
  thinking: false  // Required for Gemini
}
```

**Reference**: `api/server/controllers/agents/client.js:75-77` has similar handling for Bedrock.

### 3. MCP Server Communication

**Types**:
- `stdio`: Process-based (single-user, dev)
- `streamable-http`: HTTP-based (multi-user, production)

**Current Setup**: stdio for development
**Production Recommendation**: Switch to streamable-http

### 4. Circuit Breakers

**Purpose**: Prevent cascading failures in tool calls
**Implementation**: `api/server/utils/circuitBreaker.js`
**Configuration**:
- Failure threshold: 5
- Reset timeout: 60s
- Per-tool tracking

## Database Schema

### Key Collections

#### Agents
```javascript
{
  _id: ObjectId,
  id: 'agent_ki_referent_system',
  name: 'KI-Referent',
  author: ObjectId,  // User who created
  description: String,
  instructions: String,
  provider: 'google',
  model: 'gemini-2.0-flash',
  tools: [String],
  model_parameters: Object,
  category: String,
  createdAt: Date,
  updatedAt: Date
}
```

#### Permissions
```javascript
{
  _id: ObjectId,
  principalType: 'PUBLIC' | 'USER' | 'GROUP',
  principalId: ObjectId | null,
  resourceType: 'AGENT' | 'PROMPT',
  resourceId: ObjectId,
  accessRoleId: 'agent_viewer' | 'agent_editor',
  grantedBy: ObjectId | null,
  createdAt: Date
}
```

#### Conversations
```javascript
{
  _id: ObjectId,
  conversationId: String,
  title: String,
  user: ObjectId,
  endpoint: String,
  agentOptions: Object,  // Agent config for this conversation
  messages: [ObjectId],
  createdAt: Date,
  updatedAt: Date
}
```

## Environment Configuration

### Critical Environment Variables

```bash
# Database
MONGO_URI=mongodb://127.0.0.1:27017/LibreChat

# Search
SEARCH=true
MEILI_HOST=http://0.0.0.0:7700
MEILI_MASTER_KEY=<secret>

# Authentication
JWT_SECRET=<64-char-secret>
JWT_REFRESH_SECRET=<64-char-secret>
CREDS_KEY=<64-char-key>
CREDS_IV=<32-char-iv>

# AI Providers
GOOGLE_KEY=<api-key>
GOOGLE_MODELS=gemini-2.0-flash,gemini-2.5-flash

# HIVE API
HIVE_API_URL=http://hive-api:8000
```

## Testing Architecture

### E2E Tests (Playwright)
- **Location**: `e2e/specs/`
- **Framework**: Playwright
- **Coverage**: Full agent workflow (6 steps)
- **Duration**: ~3.4 minutes
- **Authentication**: Manual login (more reliable than storage state)

### Test Flow
```
Login (sales-demo user)
  │
  ▼
Select KI-Referent Agent
  │
  ▼
Execute 6 Steps
  ├─> Step 1: Create Honeycomb
  ├─> Step 2: Read Press Release
  ├─> Step 3: Legal Research
  ├─> Step 4: Project Structure
  ├─> Step 5: Report Outline
  └─> Step 6: Search Entities
  │
  ▼
Verify Responses (regex patterns)
```

## Performance Considerations

### 1. Agent Response Times
- **Step 1 (Honeycomb creation)**: ~30-60s
- **Step 2 (Web fetch + processing)**: ~30-45s
- **Step 3 (Legal search)**: ~20-30s
- **Steps 4-6 (Planning/Analysis)**: ~10-20s each

### 2. MCP Server Timeouts
- **Default**: 60000ms (60s)
- **Honeycomb operations**: Generally <5s
- **Legal searches**: Generally <10s
- **Web fetches**: Varies by URL (5-30s)

### 3. Database Indexes
- Conversations: `conversationId`, `user`, `createdAt`
- Messages: `conversationId`, `messageId`
- Agents: `id`, `author`
- Permissions: `principalType`, `resourceType`, `resourceId`

## Security Architecture

### 1. Authentication
- **Session Management**: express-session + Redis
- **Token Types**: JWT (15min) + Refresh (7 days)
- **Password**: bcrypt hashing
- **OAuth**: Supported (Google, GitHub, etc.)

### 2. API Key Storage
- **Encryption**: AES-256-CBC
- **Keys**: `CREDS_KEY` (32 bytes) + `CREDS_IV` (16 bytes)
- **Storage**: MongoDB (encrypted)

### 3. Rate Limiting
- **Login**: 7 attempts per 5 minutes
- **Registration**: 5 attempts per hour
- **Messages**: 40 per minute per IP
- **Concurrent Messages**: 2 per user

### 4. Content Moderation
- **Optional**: OpenAI moderation API
- **Currently**: Disabled
- **Configurable**: Per endpoint

## Scaling Considerations

### Current Setup (Single Node)
- ✅ Good for: <100 concurrent users
- ✅ Simple deployment
- ❌ Single point of failure
- ❌ No horizontal scaling

### Production Setup (Multi-Node)
1. **Load Balancer**: nginx/HAProxy
2. **Multiple API Nodes**: Docker Swarm/Kubernetes
3. **Redis**: Session sharing + caching
4. **MeiliSearch**: Set `MEILI_NO_SYNC=true` on workers
5. **MongoDB**: Replica set
6. **MCP Servers**: Switch to streamable-http

## Deployment Architecture

### Development
```
Host Machine
  ├─> LibreChat (port 3080)
  ├─> MongoDB (port 27017)
  ├─> MeiliSearch (port 7700)
  ├─> PostgreSQL/pgvector (port 5432)
  ├─> RAG API (port 8000)
  └─> MCP Servers (stdio)
```

### Production (Recommended)
```
                    ┌──────────────┐
                    │ Load Balancer│
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
      ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
      │LibreChat│    │LibreChat│    │LibreChat│
      │  Node 1 │    │  Node 2 │    │  Node 3 │
      └────┬────┘    └────┬────┘    └────┬────┘
           │               │               │
           └───────────────┼───────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
      ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
      │ MongoDB │    │  Redis  │    │ MeiliSearch│
      │ Replica │    │ Cluster │    │  Cluster │
      └─────────┘    └─────────┘    └──────────┘
                           │
                     ┌─────▼──────┐
                     │ MCP Servers│
                     │   (HTTP)   │
                     └────────────┘
```

## Troubleshooting Guide

### Agent Not Responding

**Symptom**: Agent selection works, but no AI response

**Checklist**:
1. Check API key configured in `.env`
2. Verify model name matches provider
3. Check `thinking` parameter for Gemini
4. Review logs: `podman logs LibreChat | grep error`
5. Verify MCP servers initialized

### MCP Tools Not Working

**Symptom**: "No tools found" errors

**Checklist**:
1. Check MCP server initialization in logs
2. Verify tool names in agent config
3. Ensure MCP servers are mounted correctly
4. Check MCP server build: `ls -la mcp-server/dist/`
5. Verify timeout settings (60s default)

### Permission Errors

**Symptom**: Users can't access agent

**Checklist**:
1. Run permissions migration
2. Verify agent has PUBLIC permissions
3. Check ACL collections in MongoDB
4. Ensure agent author exists

## Monitoring & Logging

### Log Locations
- **Application**: `./logs/`
- **MongoDB**: stdout (docker logs)
- **MeiliSearch**: stdout (docker logs)

### Key Metrics to Monitor
- Agent response times
- MCP tool success rates
- Circuit breaker trips
- Database query times
- Memory usage per node
- Active sessions/users

### Recommended Tools
- **Application Monitoring**: PM2, New Relic
- **Database**: MongoDB Atlas, or Prometheus
- **Logging**: ELK Stack, Grafana Loki
- **Alerting**: PagerDuty, Opsgenie

## References

- **LibreChat Docs**: https://librechat.ai/docs
- **MCP Protocol**: https://modelcontextprotocol.io
- **Agent SDK**: https://github.com/danny-avila/librechat-agents
- **HIVE API**: Internal documentation

---

**Last Updated**: 2025-10-14
**Version**: 1.0
