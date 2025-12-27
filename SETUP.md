# Bintybyte AI Chat - Complete Setup Guide

## 📋 Table of Contents

- [Basic Project Setup](#basic-project-setup)
- [LLM Endpoints Configuration](#llm-endpoints-configuration)
- [Web Search Setup](#web-search-setup)
- [MCP ClickHouse Setup](#mcp-clickhouse-setup)
- [Production Configuration](#production-configuration)

---

## Basic Project Setup

### Prerequisites

- **Docker** 20.10+ and Docker Compose v2+
- **Make** (pre-installed on macOS/Linux)
- **Git** for version control
- **4GB RAM** minimum, 8GB recommended
- **20GB disk space** for Docker images and data

### Initial Setup

#### 1. Clone and Setup

```bash
# Navigate to project directory
cd /path/to/LibreChat

# Run automated setup
make setup
```

This creates three essential files:
- `.env` - Environment variables and API keys
- `librechat.yaml` - AI endpoint configurations
- `docker-compose.override.yml` - Docker customizations

#### 2. Configure Core Settings

Edit `.env` file:

```bash
# Server Configuration
HOST=localhost
PORT=3080
MONGO_URI=mongodb://mongodb:27017/LibreChat

# Domain Configuration (Important for production)
DOMAIN_CLIENT=http://localhost:3080
DOMAIN_SERVER=http://localhost:3080

# Security
JWT_SECRET=your_generated_secret_here
JWT_REFRESH_SECRET=your_generated_refresh_secret_here
ALLOW_REGISTRATION=true

# User Permissions
UID=1000  # Run: echo $(id -u)
GID=1000  # Run: echo $(id -g)
```

**Generate Secure Secrets:**

```bash
# Generate JWT secrets
openssl rand -hex 32  # Use for JWT_SECRET
openssl rand -hex 32  # Use for JWT_REFRESH_SECRET
openssl rand -hex 32  # Use for CREDS_KEY
openssl rand -hex 16  # Use for CREDS_IV
```

#### 3. Build and Start

```bash
# Build Docker containers
make build

# Start all services
make up

# Verify services are running
make ps

# View logs
make logs
```

#### 4. Access Application

Open browser to: **http://localhost:3080**

Create your first account (if `ALLOW_REGISTRATION=true`)

---

## LLM Endpoints Configuration

### Overview

Bintybyte supports multiple AI providers through the `librechat.yaml` configuration file.

### Pre-Configured Providers

The following providers are already configured in `librechat.yaml`:

1. **Groq** - Ultra-fast inference
2. **Mistral AI** - European AI models
3. **OpenRouter** - Access to 100+ models
4. **Helicone** - AI gateway with monitoring
5. **Portkey** - Enterprise AI gateway

### 1. Groq Configuration

**Get API Key:** [console.groq.com](https://console.groq.com/keys)

**Add to `.env`:**
```bash
GROQ_API_KEY=gsk_your_key_here
```

**Configuration in `librechat.yaml`:**
```yaml
endpoints:
  custom:
    - name: 'groq'
      apiKey: '${GROQ_API_KEY}'
      baseURL: 'https://api.groq.com/openai/v1/'
      models:
        default:
          - 'llama-3.1-8b-instant'      # Fastest
          - 'llama-3.3-70b-versatile'   # Best for MCP
          - 'llama-3.3-70b-specdec'     # Fastest variant
          - 'compound-beta'             # Newest model
          - 'mixtral-8x7b-32768'        # Title generation
        fetch: false
      titleConvo: true
      titleModel: 'mixtral-8x7b-32768'
      modelDisplayLabel: 'Groq'
```

**Features:**
- ✅ Free tier available
- ⚡ Fastest inference speed
- 🔧 Great for MCP tools
- 💰 Very cost-effective

### 2. Mistral AI Configuration

**Get API Key:** [console.mistral.ai](https://console.mistral.ai/)

**Add to `.env`:**
```bash
MISTRAL_API_KEY=your_key_here
```

**Configuration in `librechat.yaml`:**
```yaml
- name: 'Mistral'
  apiKey: '${MISTRAL_API_KEY}'
  baseURL: 'https://api.mistral.ai/v1'
  models:
    default:
      - 'mistral-tiny'         # Fast, cheap
      - 'mistral-small'        # Balanced
      - 'mistral-medium'       # High quality
      - 'mistral-large-latest' # Best model
    fetch: true
  titleConvo: true
  titleModel: 'mistral-tiny'
  dropParams: ['stop', 'user', 'frequency_penalty', 'presence_penalty']
```

**Note:** Must drop specific parameters to avoid 422 errors.

### 3. OpenRouter Configuration

**Get API Key:** [openrouter.ai/keys](https://openrouter.ai/keys)

**Add to `.env`:**
```bash
OPENROUTER_KEY=sk-or-your_key_here
```

**Configuration in `librechat.yaml`:**
```yaml
- name: 'OpenRouter'
  apiKey: '${OPENROUTER_KEY}'
  baseURL: 'https://openrouter.ai/api/v1'
  models:
    default:
      - 'meta-llama/llama-3-70b-instruct'
      - 'anthropic/claude-3.5-sonnet'
      - 'openai/gpt-4o'
      - 'google/gemini-pro'
    fetch: true  # Fetch all available models
  dropParams: ['stop']
```

**Benefits:**
- Access to 100+ models from one API
- Free tier available
- Pay-per-use pricing
- No subscriptions needed

### 4. Helicone Configuration

**Get API Key:** [helicone.ai](https://www.helicone.ai/)

**Add to `.env`:**
```bash
HELICONE_KEY=sk-helicone-your_key_here
```

**Configuration in `librechat.yaml`:**
```yaml
- name: 'Helicone'
  apiKey: '${HELICONE_KEY}'
  baseURL: 'https://oai.helicone.ai/v1'
  models:
    default:
      - 'gpt-4o-mini'
      - 'gpt-4o'
      - 'claude-3-5-sonnet-20241022'
    fetch: true
```

**Features:**
- 🔍 Request monitoring
- 📊 Usage analytics
- 💰 Cost tracking
- 🚀 Caching

### 5. Portkey Configuration

**Get API Key:** [portkey.ai](https://portkey.ai/)

**Add to `.env`:**
```bash
PORTKEY_API_KEY=your_portkey_api_key
PORTKEY_OPENAI_VIRTUAL_KEY=your_virtual_key
```

**Configuration in `librechat.yaml`:**
```yaml
- name: 'Portkey'
  apiKey: 'dummy'
  baseURL: 'https://api.portkey.ai/v1'
  headers:
    x-portkey-api-key: '${PORTKEY_API_KEY}'
    x-portkey-virtual-key: '${PORTKEY_OPENAI_VIRTUAL_KEY}'
  models:
    default:
      - 'gpt-4o-mini'
      - 'gpt-4o'
```

**Enterprise Features:**
- Load balancing across providers
- Automatic failover
- Rate limiting
- Detailed analytics

### 6. Standard Providers (OpenAI, Anthropic, Google)

**Add to `.env`:**
```bash
# OpenAI
OPENAI_API_KEY=sk-your_key_here

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-your_key_here

# Google Gemini
GOOGLE_KEY=your_google_api_key
```

These are configured by default in the application.

### Adding Custom Endpoints

To add a new provider:

**1. Add API key to `.env`:**
```bash
YOUR_PROVIDER_KEY=your_key_here
```

**2. Add configuration to `librechat.yaml`:**
```yaml
endpoints:
  custom:
    - name: 'YourProvider'
      apiKey: '${YOUR_PROVIDER_KEY}'
      baseURL: 'https://api.provider.com/v1'
      models:
        default:
          - 'model-name-1'
          - 'model-name-2'
        fetch: false
      titleConvo: true
      titleModel: 'model-name-1'
      modelDisplayLabel: 'Your Provider'
```

**3. Restart services:**
```bash
make restart
```

---

## Web Search Setup

### Overview

Bintybyte supports three complementary web search tools:

| Tool | Purpose | Cost |
|------|---------|------|
| **SERPER** | Google Search API | $50/5K searches |
| **FIRECRAWL** | Content extraction | $0/500 pages free |
| **JINA** | AI reranking | Free tier |

### When to Use Each Tool

#### Use Cases Matrix

| Scenario | Configuration | Reason |
|----------|--------------|--------|
| Quick fact checking | SERPER only | Fast + snippets sufficient |
| Article reading | FIRECRAWL only | Need full content |
| Research filtering | JINA only | Smart ranking needed |
| **Production** | **All 3** | **Maximum quality** |
| News analysis | All 3 | Speed + content + filtering |
| Medical info | All 3 | Accuracy critical |

### 1. SERPER Setup (Google Search)

**Get API Key:** [serper.dev](https://serper.dev)

**Free Tier:** 2,500 searches

**Add to `.env`:**
```bash
SERPER_API_KEY=your_serper_api_key_here
```

**Add to `librechat.yaml`:**
```yaml
webSearch:
  serperApiKey: '${SERPER_API_KEY}'
  images: true
  news: true
  videos: true
```

**Best For:**
- Quick searches
- Getting snippets
- Metadata extraction
- Fast results needed

**Cost:** ~$1 per 100 searches after free tier

### 2. FIRECRAWL Setup (Content Extraction)

**Get API Key:** [firecrawl.dev](https://firecrawl.dev)

**Free Tier:** 500 pages/month

**Add to `.env`:**
```bash
FIRECRAWL_API_KEY=your_firecrawl_api_key
FIRECRAWL_API_URL=https://api.firecrawl.dev  # Optional
```

**Add to `librechat.yaml`:**
```yaml
webSearch:
  firecrawlApiKey: '${FIRECRAWL_API_KEY}'
  firecrawlApiUrl: '${FIRECRAWL_API_URL}'
```

**Best For:**
- Known URLs to read
- Full page content
- Complex page layouts
- JavaScript-heavy sites
- Clean markdown conversion

**Cost:** $0.01 per page after free tier

### 3. JINA Setup (AI Reranking)

**Get API Key:** [jina.ai](https://jina.ai)

**Free Tier:** Available

**Add to `.env`:**
```bash
JINA_API_KEY=jina_your_key_here
JINA_API_URL=https://api.jina.ai/v1/rerank  # Optional
```

**Add to `librechat.yaml`:**
```yaml
webSearch:
  jinaApiKey: '${JINA_API_KEY}'
  jinaApiUrl: '${JINA_API_URL}'
```

**Alternative: Cohere Reranking**

```bash
# In .env
COHERE_API_KEY=your_cohere_key

# In librechat.yaml
webSearch:
  cohereApiKey: '${COHERE_API_KEY}'
```

**Best For:**
- Filtering irrelevant results
- Semantic relevance
- Noise reduction
- Quality over quantity

### 4. SearxNG Setup (Self-Hosted Alternative)

**Free, self-hosted Google alternative**

**Setup SearxNG:**
```bash
# Using Docker
docker run -d -p 8080:8080 searxng/searxng
```

**Add to `.env`:**
```bash
SEARXNG_INSTANCE_URL=http://localhost:8080
SEARXNG_API_KEY=your_optional_api_key
```

**Add to `librechat.yaml`:**
```yaml
webSearch:
  searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}'
  searxngApiKey: '${SEARXNG_API_KEY}'
```

**Benefits:**
- ✅ Completely free
- 🔒 Privacy-focused
- 🌍 No rate limits
- 🏠 Self-hosted

### Complete Production Configuration

**For maximum quality, use all three:**

**`.env`:**
```bash
# Search
SERPER_API_KEY=your_serper_key

# Content Extraction
FIRECRAWL_API_KEY=your_firecrawl_key
FIRECRAWL_API_URL=https://api.firecrawl.dev

# Reranking
JINA_API_KEY=your_jina_key
JINA_API_URL=https://api.jina.ai/v1/rerank

# Backup (Optional)
SEARXNG_INSTANCE_URL=http://searxng:8080
```

**`librechat.yaml`:**
```yaml
webSearch:
  # Search Providers
  serperApiKey: '${SERPER_API_KEY}'
  searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}'
  
  # Content Scrapers
  firecrawlApiKey: '${FIRECRAWL_API_KEY}'
  firecrawlApiUrl: '${FIRECRAWL_API_URL}'
  
  # Rerankers
  jinaApiKey: '${JINA_API_KEY}'
  jinaApiUrl: '${JINA_API_URL}'
  
  # Search Categories
  images: true
  news: true
  videos: true
```

### Cost Optimization Strategies

#### Development Setup (Free)
```bash
# Use free tiers only
SEARXNG_INSTANCE_URL=http://localhost:8080  # Self-hosted
JINA_API_KEY=...                            # Free tier
# No SERPER or FIRECRAWL = $0/month
```

#### Budget Setup ($10/month)
```bash
SERPER_API_KEY=...      # ~1000 searches/month
FIRECRAWL_API_KEY=...   # 500 pages free + 500 paid
JINA_API_KEY=...        # Free tier
```

#### Production Setup ($50-100/month)
```bash
SERPER_API_KEY=...      # 5000+ searches
FIRECRAWL_API_KEY=...   # 5000 pages
JINA_API_KEY=...        # Paid tier for volume
```

### Testing Web Search

**After configuration:**

```bash
# Restart services
make restart

# View logs to verify
make logs-api | grep -i "search"

# Test in UI
# 1. Start a conversation
# 2. Enable web search in interface
# 3. Ask a question requiring current information
```

---

## MCP ClickHouse Setup

### Overview

Model Context Protocol (MCP) enables AI models to interact with external tools and databases. Bintybyte includes a pre-configured ClickHouse MCP server for database queries and analytics.

### Architecture

```
┌─────────────────┐
│  Bintybyte AI   │
│     (Port 3080) │
└────────┬────────┘
         │
         ↓ SSE Connection
┌─────────────────┐
│  MCP ClickHouse │
│    (Port 8001)  │
└────────┬────────┘
         │
         ↓ SQL Queries
┌─────────────────┐
│   ClickHouse    │
│     Database    │
└─────────────────┘
```

### Quick Start

**Start MCP server:**
```bash
make mcp-start
```

**View logs:**
```bash
make mcp-logs
```

**Stop MCP server:**
```bash
make mcp-stop
```

**Restart MCP server:**
```bash
make mcp-restart
```

### Configuration Details

#### 1. Docker Configuration

Already configured in `docker-compose.override.yml`:

```yaml
services:
  mcp-clickhouse:
    image: mcp/clickhouse
    container_name: mcp-clickhouse
    ports:
      - 8001:8000
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - CLICKHOUSE_HOST=sql-clickhouse.clickhouse.com
      - CLICKHOUSE_USER=demo
      - CLICKHOUSE_PASSWORD=
      - CLICKHOUSE_MCP_SERVER_TRANSPORT=sse
      - CLICKHOUSE_MCP_BIND_HOST=0.0.0.0
    restart: always
```

#### 2. LibreChat Configuration

Already configured in `librechat.yaml`:

```yaml
mcpServers:
  clickhouse-playground:
    type: sse
    url: http://host.docker.internal:8001/sse
```

### Using Your Own ClickHouse Database

To connect to a custom ClickHouse instance:

**1. Update `docker-compose.override.yml`:**

```yaml
services:
  mcp-clickhouse:
    environment:
      - CLICKHOUSE_HOST=your-clickhouse-host.com
      - CLICKHOUSE_USER=your_username
      - CLICKHOUSE_PASSWORD=your_password
      - CLICKHOUSE_DATABASE=your_database
      - CLICKHOUSE_PORT=8123
      - CLICKHOUSE_MCP_SERVER_TRANSPORT=sse
      - CLICKHOUSE_MCP_BIND_HOST=0.0.0.0
```

**2. Restart MCP service:**

```bash
make mcp-restart
```

### Adding More MCP Servers

#### Filesystem MCP Server

Access local files:

**Add to `librechat.yaml`:**
```yaml
mcpServers:
  clickhouse-playground:
    type: sse
    url: http://host.docker.internal:8001/sse
  
  filesystem:
    type: stdio
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-filesystem"
      - /app/uploads  # Path inside Docker container
    timeout: 60000
```

**Add volume mount in `docker-compose.override.yml`:**
```yaml
services:
  api:
    volumes:
      - ./librechat.yaml:/app/librechat.yaml
      - ./documents:/app/documents:ro  # Read-only access
```

#### Puppeteer MCP Server

Web automation:

**Add to `librechat.yaml`:**
```yaml
mcpServers:
  puppeteer:
    type: stdio
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-puppeteer"
    timeout: 300000  # 5 minutes
```

#### GitHub MCP Server

GitHub integration:

**Add to `.env`:**
```bash
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token
```

**Add to `librechat.yaml`:**
```yaml
mcpServers:
  github:
    type: stdio
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}"
```

### Available MCP Servers

| Server | Purpose | Type |
|--------|---------|------|
| `mcp/clickhouse` | Database queries | SSE |
| `@modelcontextprotocol/server-filesystem` | File access | stdio |
| `@modelcontextprotocol/server-puppeteer` | Web automation | stdio |
| `@modelcontextprotocol/server-github` | GitHub API | stdio |
| `@modelcontextprotocol/server-brave-search` | Web search | stdio |
| `mcp-obsidian` | Obsidian notes | stdio |
| `@modelcontextprotocol/server-postgres` | PostgreSQL | stdio |

### MCP Interface Configuration

Control user permissions in `librechat.yaml`:

```yaml
interface:
  mcpServers:
    use: true      # Allow users to use MCP servers
    create: false  # Disable user-created MCP servers
    share: false   # Disable MCP server sharing
```

### Security Considerations

#### Production MCP Setup

1. **Restrict MCP domains** in `librechat.yaml`:

```yaml
mcpSettings:
  allowedDomains:
    - 'localhost'
    - '*.example.com'
    - 'trusted-mcp-provider.com'
```

2. **Use read-only database access:**
```yaml
environment:
  - CLICKHOUSE_USER=readonly_user
  - CLICKHOUSE_READONLY=1
```

3. **Limit file system access:**
```yaml
mcpServers:
  filesystem:
    args:
      - -y
      - "@modelcontextprotocol/server-filesystem"
      - /app/public  # Only public directory
```

4. **Set timeouts:**
```yaml
mcpServers:
  your-server:
    timeout: 30000  # 30 seconds max
```

### Testing MCP Integration

**1. Verify MCP server is running:**
```bash
curl http://localhost:8001/sse
# Should return SSE stream
```

**2. Check logs:**
```bash
make mcp-logs
```

**3. Test in UI:**
- Start a new conversation
- Select a model that supports tools
- Ask: "Query the ClickHouse database for available tables"
- The AI should use the MCP tool to execute the query

### Troubleshooting MCP

**MCP server not accessible:**
```bash
# Check if container is running
docker ps | grep mcp-clickhouse

# Restart MCP
make mcp-restart

# Check logs for errors
make mcp-logs
```

**Connection refused:**
```bash
# Verify host.docker.internal resolution
docker exec LibreChat ping host.docker.internal

# Check port mapping
docker port mcp-clickhouse
```

**AI not using MCP tools:**
1. Ensure `interface.mcpServers.use: true` in `librechat.yaml`
2. Use models that support function calling (GPT-4, Claude 3+, Groq)
3. Check agent configuration allows MCP tools

---

## Production Configuration

### Security Hardening

#### 1. Generate Production Secrets

```bash
# Generate all secrets at once
cat > .env.production << EOF
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
CREDS_KEY=$(openssl rand -hex 32)
CREDS_IV=$(openssl rand -hex 16)
MEILI_MASTER_KEY=$(openssl rand -hex 32)
EOF

# Copy to .env
cat .env.production >> .env
```

#### 2. Disable Public Registration

```bash
# In .env
ALLOW_REGISTRATION=false
ALLOW_SOCIAL_LOGIN=false
```

#### 3. Configure HTTPS

**Using Nginx reverse proxy:**

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass http://localhost:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 4. Database Authentication

**Enable MongoDB authentication:**

```bash
# In docker-compose.override.yml
services:
  mongodb:
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=secure_password
    command: mongod --auth

# Update .env
MONGO_URI=mongodb://admin:secure_password@mongodb:27017/LibreChat?authSource=admin
```

### Performance Optimization

#### 1. Resource Limits

Create `docker-compose.prod.yml`:

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G

  mongodb:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 1G
```

#### 2. Enable Caching

```bash
# In .env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=secure_redis_password
```

**Add Redis to `docker-compose.override.yml`:**

```yaml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: always

volumes:
  redis_data:
```

#### 3. Node.js Optimization

```bash
# In .env
NODE_ENV=production
NODE_OPTIONS="--max-old-space-size=4096"
```

### Monitoring Setup

#### 1. Health Checks

```yaml
# In docker-compose.prod.yml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

#### 2. Logging

```yaml
services:
  api:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

```bash
# In .env
DEBUG_LOGGING=false
CONSOLE_JSON=true  # For structured logging
```

### Backup Strategy

#### Automated MongoDB Backup

**Create backup script:**

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/mongodb"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

docker exec chat-mongodb mongodump \
  --out /tmp/backup_$TIMESTAMP \
  --gzip

docker cp chat-mongodb:/tmp/backup_$TIMESTAMP $BACKUP_DIR/

# Keep only last 7 days
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} \;
```

**Add to crontab:**
```bash
0 2 * * * /path/to/backup.sh
```

#### Restore from Backup

```bash
# Copy backup to container
docker cp /backups/mongodb/backup_20250127 chat-mongodb:/tmp/

# Restore
docker exec chat-mongodb mongorestore \
  --gzip \
  --drop \
  /tmp/backup_20250127
```

### Deployment Checklist

- [ ] All secrets generated and secured
- [ ] HTTPS/SSL configured
- [ ] Database authentication enabled
- [ ] Registration disabled (if needed)
- [ ] Resource limits set
- [ ] Health checks configured
- [ ] Logging configured
- [ ] Backup strategy implemented
- [ ] Monitoring enabled
- [ ] Rate limiting configured
- [ ] Domain names configured
- [ ] API keys secured
- [ ] Firewall rules set
- [ ] Docker volumes for persistence
- [ ] Environment-specific .env file

### Start Production Environment

```bash
# Build with production config
docker compose \
  -f docker-compose.yml \
  -f docker-compose.override.yml \
  -f docker-compose.prod.yml \
  up -d --build

# Verify all services
docker compose ps

# Check logs
docker compose logs -f
```

---

## Support

For issues and questions:
- 📖 Read this guide thoroughly
- 🔍 Check logs: `make logs-api`
- 🐛 GitHub Issues: [github.com/bintybyte/librechat/issues]
- 🌐 Website: [bintybyte.com](https://bintybyte.com)

---

**Last Updated:** December 2025
