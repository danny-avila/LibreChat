<p align="center">
  <h1 align="center">
    Bintybyte AI Chat
  </h1>
  <p align="center">
    <em>Production-Grade Multi-Model AI Platform</em>
  </p>
  <p align="center">
    <a href="#-quick-start">Quick Start</a> •
    <a href="SETUP.md">Setup Guide</a> •
    <a href="#-configuration">Configuration</a> •
    <a href="#-production-deployment">Production</a>
  </p>
</p>

## 🚀 Quick Start

Get started with Bintybyte AI Chat in minutes using our automated setup!

### Prerequisites

- [Docker](https://www.docker.com/get-started) and Docker Compose installed
- [Make](https://www.gnu.org/software/make/) (usually pre-installed on macOS/Linux)
- API keys for your preferred AI providers

### One-Command Setup

Run the automated setup to create all configuration files:

```bash
make setup
```

This command automatically creates:
- **`.env`** - Full environment configuration from `.env.example`
- **`docker-compose.override.yml`** - Docker override with MCP ClickHouse server
- **`librechat.yaml`** - Complete AI endpoint configuration with:
  - ✅ **Groq** (Fast Inference)
  - ✅ **Mistral AI**
  - ✅ **OpenRouter** (Access to 100+ Models)
  - ✅ **Helicone** (AI Gateway & Monitoring)
  - ✅ **Portkey** (Enterprise Gateway)
  - ✅ **MCP ClickHouse Server** (Database queries & analytics)
  - ✅ **Web Search** (with Jina Reranking)

### Configure API Keys

Edit the `.env` file and add your API keys:

```bash
nano .env
```

**Required Keys** (add what you plan to use):
```bash
# Core AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_KEY=...

# Additional Providers (pre-configured in librechat.yaml)
GROQ_API_KEY=gsk_...
MISTRAL_API_KEY=...
OPENROUTER_KEY=sk-or-...
HELICONE_KEY=sk-helicone-...
PORTKEY_API_KEY=...
PORTKEY_OPENAI_VIRTUAL_KEY=...

# Web Search (optional)
JINA_API_KEY=jina_...
SERPER_API_KEY=...
FIRECRAWL_API_KEY=...
```

### Start the Application

```bash
# Build containers
make build

# Start all services (including MCP ClickHouse)
make up

# View logs (optional)
make logs
```

> The generated `.env` holds secrets and is excluded from git (see `.gitignore`), and the host-side logs/data/uploads folders are also ignored so they never get committed even though they are mounted into containers.

> `make up` runs `make ensure-volumes` first so the host directories for MongoDB, Keycloak, LDAP, and other services match the `UID`/`GID` defined in `.env`. Run `make ensure-volumes` manually whenever those values change.

### Start MCP Server (Optional)

The MCP ClickHouse server provides database query capabilities to AI models:

```bash
make mcp-start    # Start MCP server
make mcp-logs     # View MCP logs
```

### Access Your Instance

Open [http://localhost:3080](http://localhost:3080) in your browser! 🎉

---

## 📋 Available Make Commands

```bash
make help          # Show all available commands
make mcp-start     # Start MCP ClickHouse server
make mcp-stop      # Stop MCP server
make mcp-logs      # View MCP server logs
make setup         # Initial setup (creates all config files)
make build         # Build Docker containers
make ensure-volumes  # Prep host volume folders to .env UID/GID
make up            # Start all services
make down          # Stop all services
make restart       # Restart all services
make rebuild       # Rebuild from scratch
make logs          # View all logs
make logs-api      # View API logs only
make logs-db       # View MongoDB logs only
make ps            # Show running containers
make shell         # Open shell in API container
make clean         # Remove all containers and data (⚠️ dangerous)
make reset         # Reset database only
make dev           # Start in development mode
make add-ldap-user  # Seed ssouser (default) or pass USERNAME=... FIRSTNAME=... EMAIL=... etc. to create/update any LDAP user via the helper
make list-users     # Show LDAP entries (uid/cn/mail) from the configured users OU
make list-services  # Report docker compose service statuses (running/stopped/created/not created)

---

## 🎯 What is Bintybyte AI Chat?

Bintybyte AI Chat is a powerful, enterprise-ready AI conversation platform powered by LibreChat. It brings together multiple AI models in one unified interface, giving you the flexibility to choose the best AI for each task.

### Pre-Configured AI Providers

Out of the box, Bintybyte includes:

1. **OpenAI** - GPT-4o, GPT-4, GPT-3.5
2. **Anthropic** - Claude 3.5 Sonnet, Claude 3 Opus
3. **Google** - Gemini Pro, Gemini 2.0 Flash
4. **Groq** - Ultra-fast LLaMA 3.3, Mixtral (⚡ Fastest inference)
5. **Mistral AI** - Mistral Large, Medium, Small
6. **OpenRouter** - Access to 100+ models from various providers
7. **Helicone** - AI gateway with monitoring and analytics
8. **Portkey** - Enterprise AI gateway with load balancing

### Why Bintybyte AI Chat?

- **Cost Effective:** Use free or pay-per-call APIs instead of expensive subscriptions
- **Multi-Model Access:** Compare responses from different AI models instantly
- **Privacy Focused:** Self-hosted solution - your data stays on your servers
- **Pre-Configured:** Ready to use with Groq, Mistral, OpenRouter, and more
- **MCP Support:** Model Context Protocol for advanced tool integration
- **Web Search:** Built-in web search with smart reranking
- **Production Ready:** Built on proven LibreChat technology

---

## ✨ Key Features

- 🖥️ **UI & Experience** inspired by ChatGPT with enhanced design and features

- 🤖 **AI Model Selection**:  
  - Anthropic (Claude), AWS Bedrock, OpenAI, Azure OpenAI, Google, Vertex AI, OpenAI Responses API (incl. Azure)
  - [Custom Endpoints](https://www.librechat.ai/docs/quick_start/custom_endpoints): Use any OpenAI-compatible API with LibreChat, no proxy required
  - Compatible with [Local & Remote AI Providers](https://www.librechat.ai/docs/configuration/librechat_yaml/ai_endpoints):
    - Ollama, groq, Cohere, Mistral AI, Apple MLX, koboldcpp, together.ai,
    - OpenRouter, Helicone, Perplexity, ShuttleAI, Deepseek, Qwen, and more

- 🔧 **[Code Interpreter API](https://www.librechat.ai/docs/features/code_interpreter)**: 
  - Secure, Sandboxed Execution in Python, Node.js (JS/TS), Go, C/C++, Java, PHP, Rust, and Fortran
  - Seamless File Handling: Upload, process, and download files directly
  - No Privacy Concerns: Fully isolated and secure execution

- 🔦 **Agents & Tools Integration**:  
  - **[LibreChat Agents](https://www.librechat.ai/docs/features/agents)**:
    - No-Code Custom Assistants: Build specialized, AI-driven helpers
    - Agent Marketplace: Discover and deploy community-built agents
    - Collaborative Sharing: Share agents with specific users and groups
    - Flexible & Extensible: Use MCP Servers, tools, file search, code execution, and more
    - Compatible with Custom Endpoints, OpenAI, Azure, Anthropic, AWS Bedrock, Google, Vertex AI, Responses API, and more
    - [Model Context Protocol (MCP) Support](https://modelcontextprotocol.io/clients#librechat) for Tools

- 🔍 **Web Search**:  
  - Search the internet and retrieve relevant information to enhance your AI context
  - Combines search providers, content scrapers, and result rerankers for optimal results
  - **Customizable Jina Reranking**: Configure custom Jina API URLs for reranking services
  - **[Learn More →](https://www.librechat.ai/docs/features/web_search)**

- 🪄 **Generative UI with Code Artifacts**:  
  - [Code Artifacts](https://youtu.be/GfTj7O4gmd0?si=WJbdnemZpJzBrJo3) allow creation of React, HTML, and Mermaid diagrams directly in chat

- 🎨 **Image Generation & Editing**
  - Text-to-image and image-to-image with [GPT-Image-1](https://www.librechat.ai/docs/features/image_gen#1--openai-image-tools-recommended)
  - Text-to-image with [DALL-E (3/2)](https://www.librechat.ai/docs/features/image_gen#2--dalle-legacy), [Stable Diffusion](https://www.librechat.ai/docs/features/image_gen#3--stable-diffusion-local), [Flux](https://www.librechat.ai/docs/features/image_gen#4--flux), or any [MCP server](https://www.librechat.ai/docs/features/image_gen#5--model-context-protocol-mcp)
  - Produce stunning visuals from prompts or refine existing images with a single instruction

- 💾 **Presets & Context Management**:  
  - Create, Save, & Share Custom Presets  
  - Switch between AI Endpoints and Presets mid-chat
  - Edit, Resubmit, and Continue Messages with Conversation branching  
  - Create and share prompts with specific users and groups
  - [Fork Messages & Conversations](https://www.librechat.ai/docs/features/fork) for Advanced Context control

- 💬 **Multimodal & File Interactions**:  
  - Upload and analyze images with Claude 3, GPT-4.5, GPT-4o, o1, Llama-Vision, and Gemini 📸  
  - Chat with Files using Custom Endpoints, OpenAI, Azure, Anthropic, AWS Bedrock, & Google 🗃️

- 🌎 **Multilingual UI**:
  - Supports 30+ languages including English, Chinese, Arabic, Spanish, French, German, Japanese, and more

- 🧠 **Advanced Reasoning**:
  - Dynamic UI for Chain-of-Thought/Reasoning AI models

- 🎨 **Customizable Interface**:
  - Adaptable interface for power users and newcomers

- 🗣️ **Speech & Audio**:
  - Hands-free chat with Speech-to-Text and Text-to-Speech
  - Supports OpenAI, Azure OpenAI, and Elevenlabs

- 📥 **Import & Export**:
  - Import/export conversations in multiple formats
  - Export as screenshots, markdown, text, or JSON

- 🔍 **Search & Discovery**:
  - Full-text search across all conversations and messages

- 👥 **Multi-User Support**:
  - Secure authentication with OAuth2, LDAP, and email
  - Built-in moderation and usage tracking

When running LDAP locally you can seed the default `ssouser` entry after the stack is ready by running `scripts/add-ldap-user.sh seed` (the Makefile `add-ldap-user` shortcut still calls this command, and now supports `USERNAME=… FIRSTNAME=… EMAIL=… PASSWORD=… GROUPS=… ORG=…` to create or update other LDAP users without leaving `make`). The helper now ships with a `help` command so you can also create arbitrary users or groups with service metadata for RBAC, e.g. `scripts/add-ldap-user.sh user --username alice --groups support --email alice@example.com` or `scripts/add-ldap-user.sh group --name support --services api,mcp --members ssouser`. There is also an `import` command that reads CSV exports; map headers with `--map username=Employee ID` so the script knows which column to use, and include optional fields (`firstname`, `lastname`, `email`, `password`, `groups`, `org`) while only `username` is required. A ready-to-use CSV sample lives in `scripts/ldap-samples/users.csv`.
Use `make list-users` to run the helper’s new `list` command for a summary of every LDAP entry returned from the users OU, and use `make list-services` to see the current docker compose status of each declared service (running/exited/not created, etc.).

The script reads organizational metadata from `.env` (see the new `LDAP_ORGANISATION`, `LDAP_BASE`, `LDAP_USERS_OU`, `LDAP_GROUPS_OU`, and default-user entries near the LDAP configuration block) so you can reuse it across brands and domains before pointing Keycloak at the LDAP provider.

- ⚙️ **Flexible Deployment**:
  - Docker, Docker Compose, or manual deployment
  - Run completely local or deploy to cloud
  - Proxy and reverse proxy support

---

## 📚 Documentation

For detailed setup and configuration:
- **Setup Guide:** [SETUP.md](SETUP.md) - Complete configuration guide
- **Configuration:** See `.env`, `librechat.yaml`, and `docker-compose.override.yml`
- **Production Deployment:** See [Production Deployment](#-production-deployment) section below

---

## 🚀 Production Deployment

### Security Checklist

Before deploying to production:

```bash
# 1. Change default secrets
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
CREDS_KEY=$(openssl rand -hex 32)
CREDS_IV=$(openssl rand -hex 16)
MEILI_MASTER_KEY=$(openssl rand -hex 32)

# 2. Update .env with new secrets
# 3. Disable registration if needed
ALLOW_REGISTRATION=false

# 4. Configure HTTPS/SSL
# 5. Set up backups for MongoDB
# 6. Configure rate limiting
# 7. Enable monitoring
```

### Production Environment Variables

```bash
# Server (Production)
NODE_ENV=production
HOST=0.0.0.0
PORT=3080
DOMAIN_CLIENT=https://yourdomain.com
DOMAIN_SERVER=https://yourdomain.com

# Security
ALLOW_REGISTRATION=false
ALLOW_SOCIAL_LOGIN=false
SESSION_EXPIRY=900000  # 15 minutes
REFRESH_TOKEN_EXPIRY=604800000  # 7 days

# Database
MONGO_URI=mongodb://mongodb:27017/LibreChat
# Or use managed MongoDB:
# MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/librechat

# Rate Limiting (Production)
LIMIT_CONCURRENT_MESSAGES=true
CONCURRENT_MESSAGE_MAX=2
MESSAGE_IP_MAX=100
MESSAGE_IP_WINDOW=15
```

### Docker Production Configuration

Create `docker-compose.prod.yml`:

```yaml
services:
  api:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  mongodb:
    restart: always
    deploy:
      resources:
make add-ldap-user  # Seed ssouser (default) or pass USERNAME=... FIRSTNAME=... EMAIL=... etc. to create/update any LDAP user via the helper
    command: mongod --auth

volumes:
  mongodb_data:
    driver: local
```

Start with: `docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.prod.yml up -d`

### Monitoring and Logging

```bash
# Enable JSON logging for cloud platforms
CONSOLE_JSON=true

# View production logs
make logs-api | jq .    # Pretty print JSON logs

# Set up log rotation
# Configure in docker-compose.prod.yml:
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### Backup Strategy

```bash
# Automated MongoDB backup
# Add to crontab:
0 2 * * * docker exec chat-mongodb mongodump --out /backup/$(date +\%Y\%m\%d)

# Restore from backup:
docker exec -i chat-mongodb mongorestore /backup/20231227
```

---

## 🛠️ Development

### Local Development

```bash
# Install dependencies
make install

# Start in development mode
make dev

# View running containers
make ps

# Reset database
make reset
```

### Project Structure

```
.
├── api/              # Backend API server
├── client/           # React frontend
├── config/           # Configuration scripts
├── data-node/        # MongoDB data
├── uploads/          # User uploaded files
├── logs/             # Application logs
└── docker-compose.yml # Docker configuration
```

---

## 🔧 Configuration

### Configuration Files

Bintybyte uses three main configuration files (auto-generated by `make setup`):

#### 1. `.env` - Environment Variables
Contains all environment variables including API keys:
```bash
# Core Settings
PORT=3080
MONGO_URI=mongodb://mongodb:27017/LibreChat

# AI Provider API Keys
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
GOOGLE_KEY=your_key
GROQ_API_KEY=your_key
MISTRAL_API_KEY=your_key
OPENROUTER_KEY=your_key
HELICONE_KEY=your_key
PORTKEY_API_KEY=your_key

# Web Search Keys (optional)
JINA_API_KEY=your_key
SERPER_API_KEY=your_key
FIRECRAWL_API_KEY=your_key

# Features
SEARCH=true
ALLOW_REGISTRATION=true
```

#### 2. `librechat.yaml` - AI Endpoint Configuration
Defines which AI providers are available and their settings. Pre-configured with:
- Groq (fast inference with LLaMA 3.3, Mixtral)
- Mistral AI (all Mistral models)
- OpenRouter (100+ models)
- Helicone (AI gateway)
- Portkey (enterprise gateway)
- MCP server support
- Web search with reranking

Example snippet:
```yaml
endpoints:
  custom:
    - name: 'groq'
      apiKey: '${GROQ_API_KEY}'
      baseURL: 'https://api.groq.com/openai/v1/'
      models:
        default:
          - 'llama-3.3-70b-versatile'
          - 'compound-beta'
```

Setting `enabled: false` on any custom endpoint keeps the entry in your config but prevents LibreChat from contacting that provider when you do not have valid credentials yet.

#### 3. `docker-compose.override.yml` - Docker Configuration
Mounts the librechat.yaml file into the container:
```yaml
services:
  api:
    volumes:
      - ./librechat.yaml:/app/librechat.yaml
```

### Adding More AI Providers

To add additional providers, edit `librechat.yaml`:

1. Add the API key to `.env`:
   ```bash
   YOUR_PROVIDER_KEY=sk-...
   ```

2. Add the endpoint to `librechat.yaml`:
   ```yaml
   endpoints:
     custom:
       - name: 'YourProvider'
         apiKey: '${YOUR_PROVIDER_KEY}'
         baseURL: 'https://api.provider.com/v1'
         models:
           default: ['model-name']
   ```

3. Restart services:
   ```bash
   make restart
   ```

### Web Search Configuration

Bintybyte includes production-grade web search with three complementary tools: **SERPER** (search), **FIRECRAWL** (content extraction), and **JINA** (reranking). Each serves a specific purpose in the search pipeline.

#### Search Tools Overview

| Tool | Purpose | Best For | Cost |
|------|---------|----------|------|
| **SERPER** | Google Search API | Fast searches, metadata, snippets | $50/5K searches |
| **FIRECRAWL** | Content scraping | Full page content, complex layouts | $0/500 pages free |
| **JINA** | AI reranking | Relevance filtering, noise reduction | Free tier available |

#### When to Use Each Configuration

| Use Case | Tools Needed | Why |
|----------|-------------|-----|
| **Quick fact check** | SERPER only | Speed + snippets sufficient |
| **Article reading** | FIRECRAWL only | Need full content, no ranking needed |
| **Research filtering** | JINA only | Have content, need smart ranking |
| **Professional research** | All 3 | Maximum quality & accuracy |
| **News analysis** | All 3 | Speed + content + filtering |
| **E-commerce** | FIRECRAWL only | Content extraction primary |
| **Local search** | SERPER only | Metadata sufficient |
| **Medical information** | All 3 | Accuracy critical |

#### Configuration Matrix

```
┌─────────────────────────────────────────────────┐
│           WHEN TO USE WHAT                      │
├─────────────────────────────────────────────────┤
│ SERPER ONLY                                     │
│ ├─ Quick searches                              │
│ ├─ Snippets sufficient                         │
│ └─ Speed critical                              │
│                                                 │
│ FIRECRAWL ONLY                                  │
│ ├─ Known URLs to read                          │
│ ├─ Need full content                           │
│ └─ Complex page layouts                        │
│                                                 │
│ JINA ONLY                                       │
│ ├─ Have documents, need ranking                │
│ ├─ Filtering noise                             │
│ └─ Relevance critical                          │
│                                                 │
│ ALL THREE (PRODUCTION)                         │
│ ├─ Research quality matters                    │
│ ├─ Accuracy is priority                        │
│ ├─ Complex queries                             │
│ └─ Professional application                    │
└─────────────────────────────────────────────────┘
```

#### Setup Instructions

**1. Add API Keys to `.env`:**

```bash
# Search Provider (Choose one or more)
SERPER_API_KEY=...              # Google Search API
SEARXNG_INSTANCE_URL=...        # Self-hosted alternative

# Content Scraper
FIRECRAWL_API_KEY=...           # Web page content extraction
FIRECRAWL_API_URL=...           # Optional: Custom instance

# AI Reranker (Choose one)
JINA_API_KEY=...                # Jina reranking (recommended)
JINA_API_URL=...                # Optional: Custom endpoint
COHERE_API_KEY=...              # Alternative: Cohere reranking
```

**2. Configure in `librechat.yaml`:**

```yaml
webSearch:
  # Search Providers
  serperApiKey: '${SERPER_API_KEY}'
  searxngInstanceUrl: '${SEARXNG_INSTANCE_URL}'
  searxngApiKey: '${SEARXNG_API_KEY}'
  
  # Content Scrapers
  firecrawlApiKey: '${FIRECRAWL_API_KEY}'
  firecrawlApiUrl: '${FIRECRAWL_API_URL}'
  
  # Rerankers
  jinaApiKey: '${JINA_API_KEY}'
  jinaApiUrl: '${JINA_API_URL}'
  cohereApiKey: '${COHERE_API_KEY}'
  
  # Search Categories
  images: true
  news: true
  videos: true
```

**3. Restart Services:**

```bash
make restart
```

#### Production Recommendations

For production deployments:

1. **All Three Tools** - Use SERPER + FIRECRAWL + JINA for maximum quality
2. **Rate Limiting** - Configure rate limits in `.env` to control costs
3. **Caching** - Enable Redis caching to reduce API calls
4. **Monitoring** - Track API usage and costs via provider dashboards
5. **Fallbacks** - Configure SearxNG as backup for SERPER

#### Cost Optimization

```bash
# Development: Use free tiers
SEARXNG_INSTANCE_URL=https://searx.example.com  # Free, self-hosted
JINA_API_KEY=...                                 # Free tier available

# Production: Add paid services
SERPER_API_KEY=...       # ~$1 per 100 searches
FIRECRAWL_API_KEY=...    # $0 first 500, then $0.01/page
```

#### Getting API Keys

| Service | URL | Free Tier |
|---------|-----|-----------|
| SERPER | [serper.dev](https://serper.dev) | 2,500 searches |
| FIRECRAWL | [firecrawl.dev](https://firecrawl.dev) | 500 pages/month |
| JINA | [jina.ai](https://jina.ai) | Free tier available |
| Cohere | [cohere.com](https://cohere.com) | Trial credits |
| SearxNG | Self-hosted | Unlimited (free) |

---

### MCP (Model Context Protocol) Configuration

MCP servers are configured in `librechat.yaml` and provide advanced tool capabilities to AI models.

#### Pre-Configured: ClickHouse MCP Server

Bintybyte includes a **ClickHouse MCP Server** for database queries and analytics:

**Start the MCP server:**
```bash
make mcp-start    # Start ClickHouse MCP server
make mcp-logs     # View logs
make mcp-stop     # Stop server
make mcp-restart  # Restart server
```

The ClickHouse server is configured in `docker-compose.override.yml`:
```yaml
mcp-clickhouse:
  image: mcp/clickhouse
  container_name: mcp-clickhouse
  ports:
    - 8001:8000
  environment:
    - CLICKHOUSE_HOST=sql-clickhouse.clickhouse.com
    - CLICKHOUSE_USER=demo
    - CLICKHOUSE_PASSWORD=
```

And referenced in `librechat.yaml`:
```yaml
mcpServers:
  clickhouse-playground:
    type: sse
    url: http://host.docker.internal:8001/sse
```

#### Adding More MCP Servers

To add additional MCP servers, edit `librechat.yaml`:

**Example: Filesystem MCP Server**
```yaml
mcpServers:
  clickhouse-playground:
    type: sse
    url: http://host.docker.internal:8001/sse
  powered by open-source technologies.

Special thanks to:
- The open-source AI community
- All AI providers making their APIs accessible
- Contributors and testers
      - "@modelcontextprotocol/server-filesystem"
      - /path/to/files
```

**Example: Puppeteer MCP Server**
```yaml
mcpServers:
  puppeteer:
    type: stdio
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-puppeteer"
    timeout: 300000
```

**Available MCP Servers:**
- `@modelcontextprotocol/server-filesystem` - File system access
- `@modelcontextprotocol/server-puppeteer` - Web automation
- `mcp-obsidian` - Obsidian vault access
- `mcp/clickhouse` - Database queries (pre-configured)
- And many more from the MCP ecosystem

**Learn more:** [ClickHouse MCP Documentation](https://clickhouse.com/docs/use-cases/AI/MCP/librechat)

---

## 🐛 Troubleshooting

### Common Issues

**Services won't start:**
```bash
make clean
make build
make up
```

**API key errors:**
- Check that keys are set correctly in `.env`
- Ensure no extra spaces or quotes around keys
- Verify keys are valid at provider's dashboard

**Database connection errors:**
```bash
make reset
```

**Librechat.yaml not found:**
```bash
# Recreate configuration
make setup
make restart
```

**View detailed logs:**
```bash
make logs-api    # API service logs
make logs-db     # MongoDB logs
make logs        # All services
```

**Permission issues:**
Make sure your UID/GID in `.env` match your system:
```bash
echo "UID=$(id -u)" >> .env
echo "GID=$(id -g)" >> .env
make restart
```

**Port 3080 already in use:**
Edit `.env` and change the PORT:
```bash
PORT=3081
```
Then restart:
```bash
make restart
```

### Getting API Keys

| Provider | Get Key Here | Free Tier |
|----------|-------------|-----------|
| OpenAI | [platform.openai.com](https://platform.openai.com/api-keys) | $5 credit |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/) | Limited |
| Google | [makersuite.google.com](https://makersuite.google.com/app/apikey) | Free |
| Groq | [console.groq.com](https://console.groq.com/keys) | ✅ Free (fast!) |
| Mistral | [console.mistral.ai](https://console.mistral.ai/) | €5 credit |
| OpenRouter | [openrouter.ai](https://openrouter.ai/keys) | ✅ Free tier |
| Helicone | [helicone.ai](https://www.helicone.ai/) | ✅ Free tier |
| Portkey | [portkey.ai](https://portkey.ai/) | ✅ Free tier |

---

## 🤝 Contributing

We welcome contributions! Whether it's:
- 🐛 Bug reports and fixes
- ✨ New features
- 📝 Documentation improvements
- 🌍 Translations

Please open an issue first to discuss major changes.

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 🙏 Acknowledgments

Bintybyte AI Chat is built on [LibreChat](https://librechat.ai), an amazing open-source project.

Special thanks to:
- The LibreChat team and contributors
- All the AI providers making their APIs accessible
- The open-source community

---

## 📞 Support & Resources

- 🌐 **Website:** [bintybyte.com](https://bintybyte.com)
- 📖 **Documentation:** [SETUP.md](SETUP.md)
- 🐛 **Issues:** Report bugs via GitHub Issues
- 💬 **Community:** Join our discussions and forums

---

<p align="center">
  <strong>Bintybyte AI Chat</strong><br>
  Production-Grade Multi-Model AI Platform<br><br>
  Made with ❤️ by Bintybyte
</p>
