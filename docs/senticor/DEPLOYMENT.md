# NEURIS LibreChat Deployment Guide

**Multi-Repository Deployment for Neues Rechtsinformationssystem (NEURIS)**

This deployment consists of three repositories working together:

1. **LibreChat** (this repo) - Main chat interface
2. **rechtsinformationen-bund-de-mcp** - MCP server for legal information
3. **aixplain-proxy** - OpenAI-compatible proxy for aiXplain models

---

## Repository Structure

```
deployment/
├── LibreChat/                    # This repository
│   ├── .env                      # Environment configuration
│   ├── librechat.yaml           # LibreChat configuration
│   ├── docker-compose.yml       # Base docker compose
│   └── docker-compose.override.yml  # Local overrides
│
├── rechtsinformationen-bund-de-mcp/  # MCP Server
│   ├── src/                     # TypeScript source
│   ├── dist/                    # Built JavaScript (after npm run build)
│   └── package.json
│
└── aixplain-proxy/              # aiXplain Proxy
    ├── server.js                # Proxy server
    ├── package.json
    └── Dockerfile
```

---

## Prerequisites

- **Node.js** v18+ or v20+
- **Docker** & Docker Compose
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
cd LibreChat

# Clone MCP Server (sibling directory)
cd ..
git clone https://github.com/wolfgangihloff/rechtsinformationen-bund-de-mcp.git

# Clone aiXplain Proxy (sibling directory)
cd ..
git clone <aixplain-proxy-repo-url> aixplain-proxy
```

### 2. Build MCP Server

```bash
cd rechtsinformationen-bund-de-mcp
npm install
npm run build
# Verify build
ls -la dist/index.js
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
    volumes:
      # Mount librechat.yaml
      - ./librechat.yaml:/app/librechat.yaml:ro

      # Mount MCP server
      - ../rechtsinformationen-bund-de-mcp:/app/mcp-servers/rechtsinformationen-bund-de:ro

  # Add aiXplain proxy service
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

```bash
docker compose up -d

# Check logs
docker compose logs -f

# Verify MCP server loaded
docker compose logs api | grep "MCP servers initialized"
# Should show: "Added 6 MCP tools"

# Verify proxy is running
curl http://localhost:3001/health
```

### 7. Access LibreChat

Open http://localhost:3080

---

## Configuration Details

### LibreChat (`librechat.yaml`)

**MCP Server Configuration:**
```yaml
mcpServers:
  rechtsinformationen-bund-de:
    type: stdio
    command: node
    args:
      - /app/mcp-servers/rechtsinformationen-bund-de/dist/index.js
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

### Available Tools

1. `deutsche_gesetze_suchen` - Search German laws
2. `rechtsprechung_suchen` - Search case law
3. `dokument_details_abrufen` - Get document details
4. `alle_rechtsdokumente_suchen` - Search all documents
5. `semantische_rechtssuche` - Semantic search
6. `gesetz_per_eli_abrufen` - Get law by ELI

### Recommended Models for MCP Tools

- **gpt-oss-120b** (aiXplain) - Best, pre-configured
- **z-ai/glm-4.6** (OpenRouter) - 200K context, excellent tools
- **GPT-4o** (OpenAI) - Requires user API key
- **Claude 3.5 Sonnet** (Anthropic) - Best citations, requires API key

---

## Troubleshooting

### MCP Server Not Loading

```bash
# Check if MCP server is mounted
docker compose exec api ls -la /app/mcp-servers/rechtsinformationen-bund-de/

# Check if built files exist
docker compose exec api ls -la /app/mcp-servers/rechtsinformationen-bund-de/dist/

# Test MCP server directly
cd rechtsinformationen-bund-de-mcp
node dist/index.js
```

### aiXplain Proxy Issues

```bash
# Check proxy logs
docker compose logs aixplain-proxy

# Test proxy directly
curl http://localhost:3001/v1/models

# Verify model mapping
docker compose exec aixplain-proxy cat /path/to/model-mapping.json
```

### LibreChat Not Starting

```bash
# Check all logs
docker compose logs

# Restart everything
docker compose down
docker compose up -d

# Check individual services
docker compose ps
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
- Provides 6 tools for legal research

**Build command:**
```bash
npm run build
```

**How it's used:**
- Mounted read-only into LibreChat container
- Executed via `node dist/index.js`
- Communicates via stdio protocol

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

### Updating MCP Server

```bash
cd rechtsinformationen-bund-de-mcp
git pull
npm install
npm run build
cd ../LibreChat
docker compose restart api
```

### Updating aiXplain Proxy

```bash
cd aixplain-proxy
git pull
npm install
docker build -t aixplain-proxy .
cd ../LibreChat
docker compose restart aixplain-proxy
```

### Updating LibreChat

```bash
cd LibreChat
git pull
docker compose down
docker compose up -d
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

**Last Updated**: 2025-10-06
**Version**: 1.0
**Status**: ✅ Production Ready
