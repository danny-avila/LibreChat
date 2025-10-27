# NEURIS LibreChat Deployment Guide

**Multi-Repository Deployment for Neues Rechtsinformationssystem (NEURIS)**

This deployment consists of five repositories working together:

1. **LibreChat** (this repo) - Main chat interface
2. **rechtsinformationen-bund-de-mcp** - MCP server for German legal information (8 tools)
3. **hive-mcp** - MCP server for Honeycomb knowledge graph (11 tools)
4. **mcp-server-fetch** - MCP server for web page fetching (1 tool) - installed via uvx
5. **aixplain-proxy** - OpenAI-compatible proxy for aiXplain models

**Total: 20 MCP tools available**

---

## Repository Structure

```
deployment/
├── LibreChat/                          # This repository
│   ├── .env                            # Environment configuration
│   ├── librechat.yaml                  # LibreChat configuration
│   ├── docker-compose.yml              # Base docker compose
│   └── docker-compose.override.yml     # Local overrides
│
├── rechtsinformationen-bund-de-mcp/    # MCP Server - Legal Info
│   ├── src/                            # TypeScript source
│   ├── dist/                           # Built JavaScript (npm run build)
│   └── package.json
│
├── hive-mcp/                           # MCP Server - Honeycomb
│   ├── src/                            # TypeScript source
│   ├── dist/                           # Built JavaScript (npm run build)
│   └── package.json
│
└── aixplain-proxy/                     # aiXplain Proxy
    ├── server.js                       # Proxy server
    ├── package.json
    └── Dockerfile

Note: mcp-server-fetch is installed automatically via uvx (no separate repo needed)
```

---

## Prerequisites

- **Node.js** v18+ or v20+
- **Podman** (rootless container runtime - preferred over Docker)
  - macOS: `brew install podman` + `podman machine init && podman machine start`
  - Linux: Install via package manager
- **Git**

---

## Deployment Steps

### 1. Clone All Repositories

```bash
# Create deployment directory
mkdir neuris-deployment
cd neuris-deployment

# Clone LibreChat
git clone <librechat-repo-url> LibreChat

# Clone MCP Servers (sibling directories)
git clone https://github.com/wolfgangihloff/rechtsinformationen-bund-de-mcp.git
git clone <hive-mcp-repo-url> hive-mcp

# Clone aiXplain Proxy (sibling directory)
git clone <aixplain-proxy-repo-url> aixplain-proxy

# Note: mcp-server-fetch will be installed automatically via uvx
```

### 2. Build MCP Servers

```bash
# Build Rechtsinformationen MCP Server
cd rechtsinformationen-bund-de-mcp
npm install
npm run build
ls -la dist/index.js  # Verify build

# Build Honeycomb MCP Server
cd ../hive-mcp
npm install
npm run build
ls -la dist/index.js  # Verify build
```

### 3. Setup aiXplain Proxy

```bash
cd ../aixplain-proxy
npm install

# Add model mapping for gpt-oss-120b
# Edit your model mapping file to include:
# 'gpt-oss-120b': '6895f768d50c89537c1cf24e'

# Build if using Docker
docker build -t aixplain-proxy .
```

### 4. Configure LibreChat

```bash
cd ../LibreChat

# Copy environment template
cp .env.example .env

# Edit .env with your settings (see README-Senticor.md for details)
# Key variables:
# - AIXPLAIN_API_KEY=<your-key>
# - OPENROUTER_KEY=<your-key>
```

### 5. Create Docker Compose Override

Create `docker-compose.override.yml`:

```yaml
services:
  api:
    # Use development mode for better debugging
    command: npm run backend:dev

    volumes:
      # Mount librechat.yaml
      - ./librechat.yaml:/app/librechat.yaml:ro

      # Mount MCP servers
      - ../rechtsinformationen-bund-de-mcp:/app/mcp-servers/rechtsinformationen-bund-de:ro
      - ../hive-mcp:/app/mcp-servers/honeycomb:ro

      # Optional: Mount modified files for STT MP4 support
      - ./api/server/routes/files/multer.js:/app/api/server/routes/files/multer.js:ro
      - ./api/server/services/Files/Audio/STTService.js:/app/api/server/services/Files/Audio/STTService.js:ro
      - ./packages/data-provider/dist:/app/packages/data-provider/dist:ro

  # Add aiXplain proxy service (optional)
  aixplain-proxy:
    image: aixplain-proxy
    container_name: aixplain-proxy
    ports:
      - "3001:3001"
    environment:
      - AIXPLAIN_API_KEY=${AIXPLAIN_API_KEY}
    restart: always
```

### 6. Start Services

**Important: Use `podman compose` (without hyphen) for best reliability**

```bash
# Start all services
podman compose up -d

# Check logs
podman logs -f LibreChat

# Verify MCP servers loaded
podman logs LibreChat 2>&1 | grep "MCP servers initialized"
# Should show: "MCP servers initialized successfully. Added 20 MCP tools"

# View individual MCP server details
podman logs LibreChat 2>&1 | grep "\[MCP\]" | grep "Initialized"

# Verify proxy is running (if using aiXplain)
curl http://localhost:3001/health
```

**Troubleshooting: Connection Refused Errors**

If you get "unable to connect to Podman socket" errors:
```bash
pkill -9 gvproxy
podman machine start
podman compose up -d
```

### 7. Access LibreChat

Open http://localhost:3080

---

## Configuration Details

### LibreChat (`librechat.yaml`)

**MCP Server Configuration (all 3 servers):**
```yaml
mcpServers:
  # German Legal Information (8 tools)
  rechtsinformationen:
    type: stdio
    command: node
    args:
      - /app/mcp-servers/rechtsinformationen-bund-de/dist/index.js
    timeout: 60000
    chatMenu: true

  # Honeycomb Knowledge Graph (11 tools)
  honeycomb:
    type: stdio
    command: node
    args:
      - /app/mcp-servers/honeycomb/dist/index.js
    timeout: 60000
    chatMenu: true
    env:
      HONEYCOMB_API_URL: "http://host.containers.internal:8000"

  # Web Page Fetching (1 tool)
  fetch:
    type: stdio
    command: uvx
    args:
      - mcp-server-fetch
    timeout: 60000
    chatMenu: true
```

**aiXplain Models (via proxy):**
```yaml
endpoints:
  custom:
    - name: 'aiXplain'
      baseURL: 'http://aixplain-proxy:3001/v1'
      models:
        default: [
          'gpt-4o-mini',
          'allam-7b-instruct',
          'gemini-2.0-flash-exp',
          'gpt-oss-120b',  # Best for MCP tools
          'o3-mini'
        ]
```

---

## Using MCP Tools

### Quick Test

1. Select **aiXplain** endpoint
2. Choose **gpt-oss-120b** model (best for tools)
3. Look for tool dropdown below text input
4. Enable **rechtsinformationen-bund-de**
5. Ask: `"Suche nach BGB § 433 und zeige Details"`

### Available Tools (20 total)

**Rechtsinformationen (8 tools):**
1. `deutsche_gesetze_suchen` - Search German federal laws
2. `rechtsprechung_suchen` - Search case law
3. `dokument_details_abrufen` - Get document details
4. `alle_rechtsdokumente_suchen` - Search all legal documents
5. `semantische_rechtssuche` - Semantic search across legal texts
6. `gesetz_per_eli_abrufen` - Get law by ELI
7. `gesetz_per_abkuerzung_abrufen` - Get law by abbreviation
8. `gesetz_inhaltsverzeichnis_abrufen` - Get law table of contents

**Honeycomb (11 tools):**
1. `create_honeycomb` - Create new knowledge graph
2. `add_entity_to_honeycomb` - Add single entity
3. `batch_add_entities` - Add multiple entities (recommended)
4. `get_honeycomb` - Get honeycomb details
5. `list_honeycombs` - List all honeycombs
6. `delete_entity` - Remove entity
7. `update_entity` - Update entity
8. `search_entities` - Search within honeycomb
9. `get_honeycomb_stats` - Get statistics
10. `prepare_entity_extraction` - Prepare data extraction
11. `get_entity_relationships` - Get entity connections

**Fetch (1 tool):**
1. `fetch` - Fetch and read web page content

### Recommended Models for MCP Tools

- **gpt-oss-120b** (aiXplain) - Best, pre-configured
- **z-ai/glm-4.6** (OpenRouter) - 200K context, excellent tools
- **GPT-4o** (OpenAI) - Requires user API key
- **Claude 3.5 Sonnet** (Anthropic) - Best citations, requires API key

---

## Troubleshooting

### MCP Servers Not Loading

```bash
# Check if MCP servers are mounted
podman exec LibreChat ls -la /app/mcp-servers/rechtsinformationen-bund-de/
podman exec LibreChat ls -la /app/mcp-servers/honeycomb/

# Check if built files exist
podman exec LibreChat ls -la /app/mcp-servers/rechtsinformationen-bund-de/dist/
podman exec LibreChat ls -la /app/mcp-servers/honeycomb/dist/

# Test MCP server directly (on host machine)
cd rechtsinformationen-bund-de-mcp
node dist/index.js

# Check MCP initialization in logs
podman logs LibreChat 2>&1 | grep "\[MCP\]"
```

### aiXplain Proxy Issues

```bash
# Check proxy logs
podman logs aixplain-proxy

# Test proxy directly
curl http://localhost:3001/v1/models

# Verify model mapping
podman exec aixplain-proxy cat /path/to/model-mapping.json
```

### LibreChat Not Starting

```bash
# Check all logs
podman logs LibreChat

# Restart everything
podman compose down
podman compose up -d

# Check individual services
podman ps

# Common fix for connection issues
pkill -9 gvproxy && podman machine start
```

---

## Production Deployment

### Security Checklist

- [ ] Rotate JWT secrets in `.env`
- [ ] Enable MongoDB authentication
- [ ] Set up reverse proxy with SSL/TLS
- [ ] Configure firewall rules
- [ ] Enable email verification
- [ ] Set up monitoring and alerts

### Scaling Considerations

1. **MCP Server**: Convert to streamable-http for multi-user
2. **aiXplain Proxy**: Add load balancer if needed
3. **LibreChat**: Enable Redis for session storage
4. **Database**: Set up MongoDB replication

---

## Repository-Specific Information

### For `rechtsinformationen-bund-de-mcp` Repository

**What LibreChat expects:**
- Built files in `dist/index.js`
- Node.js v18+ or v20+ compatible
- Runs as stdio MCP server
- Provides 8 tools for legal research

**Build command:**
```bash
npm run build
```

**How it's used:**
- Mounted read-only into LibreChat container at `/app/mcp-servers/rechtsinformationen-bund-de`
- Executed via `node dist/index.js`
- Communicates via stdio protocol

### For `hive-mcp` Repository (Honeycomb)

**What LibreChat expects:**
- Built files in `dist/index.js`
- Node.js v18+ or v20+ compatible
- Runs as stdio MCP server
- Provides 11 tools for knowledge graph management
- Requires HONEYCOMB_API_URL environment variable

**Build command:**
```bash
npm run build
```

**How it's used:**
- Mounted read-only into LibreChat container at `/app/mcp-servers/honeycomb`
- Executed via `node dist/index.js`
- Communicates via stdio protocol
- Connects to Hive API at http://host.containers.internal:8000

### For `aixplain-proxy` Repository

**What LibreChat expects:**
- OpenAI-compatible API at `/v1` endpoints
- Model mapping for human-readable names
- Health check endpoint

**Required mappings:**
```javascript
{
  'gpt-4o-mini': '<actual-model-id>',
  'allam-7b-instruct': '<actual-model-id>',
  'gemini-2.0-flash-exp': '<actual-model-id>',
  'gpt-oss-120b': '6895f768d50c89537c1cf24e',  // Important!
  'o3-mini': '<actual-model-id>'
}
```

**Port:** 3001 (configured in librechat.yaml)

---

## Maintenance

### Updating MCP Servers

```bash
# Update Rechtsinformationen MCP
cd rechtsinformationen-bund-de-mcp
git pull
npm install
npm run build

# Update Honeycomb MCP
cd ../hive-mcp
git pull
npm install
npm run build

# Restart LibreChat
cd ../LibreChat
podman compose restart LibreChat
```

### Updating aiXplain Proxy

```bash
cd aixplain-proxy
git pull
npm install
podman build -t aixplain-proxy .
cd ../LibreChat
podman compose restart aixplain-proxy
```

### Updating LibreChat

```bash
cd LibreChat
git pull
podman compose down
podman compose up -d
```

---

## Environment Variables

See `.env` file for full configuration. Key variables:

**LibreChat:**
- `PORT=3080`
- `MONGO_URI=mongodb://mongodb:27017/LibreChat`
- `MEILI_HOST=http://meilisearch:7700`

**aiXplain:**
- `AIXPLAIN_API_KEY=<your-key>`

**OpenRouter:**
- `OPENROUTER_KEY=<your-key>`

---

## Support

- **LibreChat**: README-Senticor.md (this repo)
- **MCP Server**: rechtsinformationen-bund-de-mcp/README.md
- **Proxy**: aixplain-proxy/README.md

---

## Recent Changes

**2025-10-27:**
- ✅ Removed osint-agent-teams MCP (Python-based, causing conflicts)
- ✅ Updated to 3 MCP servers: rechtsinformationen (8), honeycomb (11), fetch (1)
- ✅ Changed all Docker commands to Podman for better compatibility
- ✅ Added Podman troubleshooting guide
- ✅ Updated tool count from 6 to 20 total tools
- ✅ Added docker-compose.override.yml example with all MCP servers

**2025-10-06:**
- Initial deployment documentation

---

**Last Updated**: 2025-10-27
**Version**: 2.0
**Status**: ✅ Production Ready (Podman-based)
