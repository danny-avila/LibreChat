# LibreChat

Forked chat platform — serves as the agent runtime, MCP client, and user-facing UI for the InboundFound ecosystem.

## Structure

```
LibreChat/
├── librechat.yaml              # MCP server configs, agent capabilities, endpoints
├── api/
│   ├── server/
│   │   ├── services/MCP.js     # MCP server management (~27KB)
│   │   ├── services/initializeMCPs.js  # MCP init on startup
│   │   ├── services/ToolService.js     # Tool management
│   │   ├── controllers/agents/         # Agent request/response handlers
│   │   └── routes/agents/              # Agent API endpoints
│   └── app/clients/            # Base client, tools, prompts, specs
├── client/
│   └── src/components/
│       ├── Agents/             # Agent UI (cards, grid, marketplace)
│       └── MCP/                # MCP config UI (dialog, status icons)
└── packages/
    ├── api/                    # Shared API types
    ├── data-provider/          # Data utilities
    └── data-schemas/           # TypeScript schemas
```

## MCP Server Connections (librechat.yaml)

| Server | Transport | Endpoint | Purpose |
|--------|-----------|----------|---------|
| if-core-app-mcp | SSE | host.docker.internal:15532 | PM + LG tools (JWT auth) |
| neo4j_server | SSE | host.docker.internal:8000 | Direct Cypher queries |
| draftOrSendEmail | SSE | n8n cloud webhook | Gmail email drafting/sending |
| wordpress | SSE | wordpress-mcp-python:8001 | CMS content management |

## Agent Chains

Sequential agent chains are configured in the UI. The weekly opportunities pipeline runs as a 7-stage chain where each stage is a LibreChat agent with system instructions from markdown files (stored in c-r-research-... repo).

```
Agent capabilities: execute_code, file_search, artifacts, actions, tools, ocr, chain, web_search
Max recursion: 100, default: 40
Auth: Firebase JWT (customJWTAuth: 'ubAuthToken')
```

## System Context

```
LibreChat ◄ THIS REPO (chat UI + agent runtime)
  ├── MCP (SSE) → if-core-apps-mcp (Python bridge, port 15532)
  │                 └── GraphQL → Hasura → NestJS backends
  │                                         ├── PitchMesh (*_pm) — B2B outreach
  │                                         └── Launch Guardian (*_lg) — SEO platform
  ├── MCP (SSE) → Neo4j MCP Server (port 8000)
  ├── MCP (SSE) → n8n webhooks
  └── MCP (SSE) → WordPress MCP (port 8001)
```

### Sibling Repos
| Repo | Role |
|------|------|
| **if-core-apps-mcp** | MCP server this platform connects to for PM + LG tools |
| **pitch-god** (PitchMesh) | NestJS backend behind Hasura *_pm namespace |
| **launch-guardian** | NestJS backend behind Hasura *_lg namespace |
| **c-r-research-...** | Agent chain instructions + data for weekly opportunities pipeline |
