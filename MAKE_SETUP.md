# Bintybyte AI Chat - Makefile Setup Guide

## 📋 Overview

This guide explains the Bintybyte Makefile automation system, which simplifies deployment and management of the AI chat platform. The Makefile provides production-grade commands for setup, deployment, monitoring, and maintenance.

---

## 🎯 Command Categories

### Setup Commands
- `make setup` - **Complete automated setup**
- `make install` - Install Node.js dependencies

### Docker Commands
- `make build` - Build Docker containers
- `make up` - Start all services
- `make down` - Stop all services
- `make restart` - Restart services
- `make rebuild` - Clean rebuild

### MCP Commands
- `make mcp-start` - Start MCP ClickHouse server
- `make mcp-stop` - Stop MCP server
- `make mcp-logs` - View MCP logs
- `make mcp-restart` - Restart MCP server

### Utility Commands
- `make logs` - View all service logs
- `make logs-api` - View API logs only
- `make logs-db` - View MongoDB logs only
- `make ps` - Show running containers
- `make shell` - Open shell in API container

### Maintenance Commands
- `make clean` - Remove all containers and data (⚠️ destructive)
- `make reset` - Reset database only
- `make dev` - Start in development mode

---

## 💻 Operating System Setup

### Prerequisites by OS

#### macOS
- **Make** - Pre-installed ✅
- **OpenSSL** - Pre-installed ✅  
- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop)
- Terminal app or iTerm2

#### Linux (Ubuntu/Debian)
- **Make** - Usually pre-installed ✅
  ```bash
  # If needed:
  sudo apt-get update && sudo apt-get install build-essential
  ```
- **OpenSSL** - Usually pre-installed ✅
- **Docker** - [Install instructions](https://docs.docker.com/engine/install/ubuntu/)

#### Windows - Three Options

**Option 1: WSL2 (Recommended)**
```powershell
# In PowerShell (Run as Administrator)
wsl --install
```
- All Linux commands work natively
- Best compatibility with Make and Docker
- [Setup Guide](https://docs.microsoft.com/windows/wsl/install)

**Option 2: Git Bash**
- Download: [git-scm.com](https://git-scm.com/download/win)
- Includes Make and OpenSSL
- Good compatibility

**Option 3: Native PowerShell**
- Install Make: `choco install make` (requires [Chocolatey](https://chocolatey.org/))
- Or [GnuWin32 Make](http://gnuwin32.sourceforge.net/packages/make.htm)
- Install OpenSSL: [slproweb.com/products/Win32OpenSSL.html](https://slproweb.com/products/Win32OpenSSL.html)

### Command Reference by OS

Throughout this guide, commands are shown for each operating system:

| Task | macOS | Linux | Windows (WSL2) | Windows (PowerShell) |
|------|-------|-------|----------------|----------------------|
| **Run Make** | `make setup` | `make setup` | `make setup` | `make setup` or manual |
| **Edit Files** | `nano .env` or `vim .env` or `code .env` | `nano .env` or `vim .env` | `nano .env` | `notepad .env` or `code .env` |
| **View Logs** | `make logs` | `make logs` | `make logs` | `docker compose logs` |
| **Generate Secrets** | `openssl rand -hex 32` | `openssl rand -hex 32` | `openssl rand -hex 32` | PowerShell function |

**Text Editor Guide:**
- **macOS**: `nano` (Terminal), `vim` (Terminal), `code` (VS Code), or `open -a TextEdit .env` (GUI)
- **Linux**: `nano` (Terminal), `vim` (Terminal), `gedit` (GUI), or `code` (VS Code)
- **Windows WSL2**: `nano` (same as Linux), `vim`, or `code`
- **Windows PowerShell**: `notepad .env` (Notepad), `code .env` (VS Code), or any Windows text editor

---

## 🚀 The `make setup` Command

### What It Does

The `make setup` command is the **primary initialization command** that creates all necessary configuration files for Bintybyte AI Chat.

### Files Created

#### 1. `.env` File
**Source:** Copies from `.env.example`

**Purpose:** Contains all environment variables and API keys

**Created Configuration:**
```bash
# Core Settings
PORT=3080
MONGO_URI=mongodb://mongodb:27017/LibreChat
DOMAIN_CLIENT=http://localhost:3080
DOMAIN_SERVER=http://localhost:3080

# Security
JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef
JWT_REFRESH_SECRET=eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418
CREDS_KEY=f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0
CREDS_IV=e2341419ec3dd3d19b13a1a87fafcbfb

# AI Providers (Placeholders - User must configure)
OPENAI_API_KEY=user_provided
ANTHROPIC_API_KEY=user_provided
GOOGLE_KEY=user_provided
GROQ_API_KEY=user_provided
MISTRAL_API_KEY=user_provided
OPENROUTER_KEY=user_provided
HELICONE_KEY=user_provided
PORTKEY_API_KEY=user_provided
PORTKEY_OPENAI_VIRTUAL_KEY=user_provided

# Web Search (Optional)
JINA_API_KEY=
SERPER_API_KEY=
FIRECRAWL_API_KEY=

# Search Configuration
SEARCH=true
MEILI_NO_ANALYTICS=true
MEILI_HOST=http://meilisearch:7700
MEILI_MASTER_KEY=DrhYf7zENyR6AlUCKmnz0eYASOQdl6zxH7s7MKFSfFCt

# RAG Configuration
RAG_PORT=8000

# User System
OPENAI_MODERATION=false
BAN_VIOLATIONS=true
LIMIT_CONCURRENT_MESSAGES=true
CONCURRENT_MESSAGE_MAX=2
ALLOW_REGISTRATION=true

# Permissions
UID=1000
GID=1000
```

**What Needs Configuration:**
- Replace all `user_provided` values with actual API keys
- Optionally add web search API keys
- Change security secrets for production
- Adjust permissions (UID/GID) to match your system

#### 2. `docker-compose.override.yml` File
**Source:** Generated from scratch

**Purpose:** Overrides default Docker configuration to mount librechat.yaml and adds MCP ClickHouse service

**Created Configuration:**
```yaml
# Bintybyte LibreChat - Docker Compose Override
# Enables: Groq, Mistral, OpenRouter, Helicone, Portkey, MCP, WebSearch

services:
  api:
    volumes:
      - ./librechat.yaml:/app/librechat.yaml

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
```

**What This Does:**
- Mounts `librechat.yaml` into the API container
- Enables custom AI endpoint configuration
- Allows hot-reloading of endpoint changes
- **Adds MCP ClickHouse service** for database queries and analytics
- Configures ClickHouse demo database connection
- Exposes MCP server on port 8001

#### 3. `librechat.yaml` File
**Source:** Copies from `librechat.example.yaml`

**Purpose:** Defines all AI endpoints and their configurations

**Created Configuration Includes:**

**A. Interface Settings:**
```yaml
interface:
  customWelcome: 'Welcome to Bintybyte AI Chat! Connect with multiple AI models in one place.'
  fileSearch: true
  endpointsMenu: true
  modelSelect: true
  parameters: true
  agents: true
  mcpServers:
    use: true
    create: false
    share: false
```

**B. AI Endpoints:**
```yaml
endpoints:
  custom:
    # 1. Groq - Fast Inference
    - name: 'groq'
      apiKey: '${GROQ_API_KEY}'
      baseURL: 'https://api.groq.com/openai/v1/'
      models:
        default:
          - 'llama-3.1-8b-instant'
          - 'llama-3.3-70b-versatile'
          - 'compound-beta'
      titleModel: 'mixtral-8x7b-32768'
      
    # 2. Mistral AI
    - name: 'Mistral'
      apiKey: '${MISTRAL_API_KEY}'
      baseURL: 'https://api.mistral.ai/v1'
      models:
        default: ['mistral-tiny', 'mistral-small', 'mistral-large-latest']
      dropParams: ['stop', 'user', 'frequency_penalty', 'presence_penalty']
      
    # 3. OpenRouter - 100+ Models
    - name: 'OpenRouter'
      apiKey: '${OPENROUTER_KEY}'
      baseURL: 'https://openrouter.ai/api/v1'
      models:
        default: ['meta-llama/llama-3-70b-instruct']
        fetch: true
      dropParams: ['stop']
      
    # 4. Helicone - AI Gateway
    - name: 'Helicone'
      apiKey: '${HELICONE_KEY}'
      baseURL: 'https://oai.helicone.ai/v1'
      models:
        fetch: true
      
    # 5. Portkey - Enterprise Gateway
    - name: 'Portkey'
      apiKey: 'dummy'
      baseURL: 'https://api.portkey.ai/v1'
      headers:
        x-portkey-api-key: '${PORTKEY_API_KEY}'
        x-portkey-virtual-key: '${PORTKEY_OPENAI_VIRTUAL_KEY}'
```

**C. MCP Server Configuration:**
```yaml
mcpServers:
  mcp-clickhouse:
    type: sse
    url: http://mcp-clickhouse:8000/sse
    # In Docker use mcp-clickhouse:8000; the host port 8001 is for host-level access
```

**D. Web Search Configuration:**
```yaml
webSearch:
  jinaApiKey: '${JINA_API_KEY}'
  serperApiKey: '${SERPER_API_KEY}'
  firecrawlApiKey: '${FIRECRAWL_API_KEY}'
  images: true
  news: true
  videos: true
```

**E. Registration Settings:**
```yaml
registration:
  socialLogins: []  # Disabled for simplicity - no social authentication required
```

**What This Does:**
- Disables social login providers (GitHub, Google, Discord, etc.)
- Allows direct registration without OAuth setup
- Simplifies initial setup and testing
- Can be enabled later by adding providers to the array

---

## 📝 Step-by-Step Setup Process

### Phase 1: Initial Setup

```bash
# Run the setup command
make setup
```

**What Happens:**
1. ✅ Checks if `.env` exists
   - If not: Copies `.env.example` → `.env`
   - If yes: Skips (preserves your configuration)

2. ✅ Checks if `docker-compose.override.yml` exists
   - If not: Creates minimal override file
   - If yes: Skips (preserves your customizations)

3. ✅ Checks if `librechat.yaml` exists
   - If not: Copies `librechat.example.yaml` → `librechat.yaml`
   - If yes: Skips (preserves your configurations)

4. ✅ Displays setup summary and next steps

**Output:**
```
Setting up Bintybyte LibreChat...
Creating .env file from .env.example...
.env file created with all default values.
Creating docker-compose.override.yml...
docker-compose.override.yml created.
Creating librechat.yaml from example...
librechat.yaml created with all endpoints enabled.

✅ Setup complete! Configuration files created:
   - .env (from .env.example with all settings)
   - docker-compose.override.yml (with librechat.yaml mount)
   - librechat.yaml (with Groq, Mistral, OpenRouter, Helicone, Portkey, MCP, WebSearch)

📝 Next steps:
1. Edit .env and add your API keys:
   - OPENAI_API_KEY
   - ANTHROPIC_API_KEY
   - GOOGLE_KEY
   - GROQ_API_KEY
   - MISTRAL_API_KEY
   - OPENROUTER_KEY
   - HELICONE_KEY
   - PORTKEY_API_KEY
   - PORTKEY_OPENAI_VIRTUAL_KEY
2. Run 'make build' to build containers
3. Run 'make up' to start services
```

### Phase 2: Configuration

After running `make setup`, you need to configure API keys:

**macOS (Terminal-based editors):**
```bash
# nano - Simple, beginner-friendly (built-in)
nano .env

# vim - Advanced editor (built-in)
vim .env

# VS Code - GUI editor (if installed)
code .env
```

**macOS (GUI editors):**
```bash
# TextEdit - macOS default GUI editor
open -a TextEdit .env

# Or double-click .env in Finder and choose an editor
```

**Linux (Terminal-based editors):**
```bash
# nano - Simple, beginner-friendly (usually pre-installed)
nano .env

# vim - Advanced editor (usually pre-installed)  
vim .env

# VS Code - GUI editor (if installed)
code .env
```

**Linux (GUI editors):**
```bash
# gedit - GNOME text editor
gedit .env

# kate - KDE text editor
kate .env

# Or use your desktop environment's default text editor
```

**Windows (WSL2 - same as Linux):**
```bash
# Inside WSL terminal, use Linux editors:
nano .env
vim .env
code .env

# Or edit with Windows apps:
notepad.exe .env
code .env
```

**Windows (PowerShell/CMD - Native):**
```powershell
# Notepad - Windows built-in editor
notepad .env

# VS Code (if installed)
code .env

# Or right-click .env → Open with → Choose editor
```

**Required Edits:**

1. **Replace placeholder API keys:**
```bash
# Before (placeholder)
OPENAI_API_KEY=user_provided

# After (your key)
OPENAI_API_KEY=sk-proj-abc123...
```

2. **Add web search keys (optional):**
```bash
JINA_API_KEY=jina_abc123...
SERPER_API_KEY=abc123...
FIRECRAWL_API_KEY=fc-abc123...
```

3. **Generate production secrets:**
```bash
# Generate new secrets for production
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
CREDS_KEY=$(openssl rand -hex 32)
CREDS_IV=$(openssl rand -hex 16)
MEILI_MASTER_KEY=$(openssl rand -hex 32)
```

4. **Set correct permissions:**
```bash
# Get your system UID/GID
echo "UID=$(id -u)"
echo "GID=$(id -g)"

# Update in .env
UID=1000
GID=1000
```

### Phase 3: Build and Deploy

**macOS / Linux / Windows (WSL2/Git Bash):**
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

**Windows (PowerShell - Without Make):**
```powershell
# Build Docker containers
docker compose build

# Start all services
docker compose up -d

# Verify services are running
docker compose ps

# View logs
docker compose logs -f
```

---

## 🔧 Configuration Responsibilities

### Which Command Does What

| Command | Creates | Modifies | Purpose |
|---------|---------|----------|---------|
| `make setup` | `.env`, `docker-compose.override.yml`, `librechat.yaml` | None | Initial setup |
| `make build` | Docker images | None | Prepares containers |
| `make up` | Docker containers | None | Starts services |
| `make down` | None | Stops containers | Shutdown |
| `make restart` | None | Restarts containers | Apply changes |
| `make mcp-start` | MCP container | Starts MCP | Enable MCP tools |

**macOS / Linux:**
```bash
# Create secure secrets
cat >> .env << EOF

# Production Security (Generated $(date))
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
CREDS_KEY=$(openssl rand -hex 32)
CREDS_IV=$(openssl rand -hex 16)
MEILI_MASTER_KEY=$(openssl rand -hex 32)
EOF
```

**Windows (WSL2 / Git Bash):**
```bash
# Same as macOS/Linux
cat >> .env << EOF

# Production Security (Generated $(date))
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
CREDS_KEY=$(openssl rand -hex 32)
CREDS_IV=$(openssl rand -hex 16)
MEILI_MASTER_KEY=$(openssl rand -hex 32)
EOF
```

**Windows (PowerShell):**
```powershell
# Generate and append secrets
$date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
@"

# Production Security (Generated $date)
JWT_SECRET=$(New-RandomSecret 32)
JWT_REFRESH_SECRET=$(New-RandomSecret 32)
CREDS_KEY=$(New-RandomSecret 32)
CREDS_IV=$(New-RandomSecret 16)
MEILI_MASTER_KEY=$(New-RandomSecret 32)
"@ | Add-Content .env                                               │
│  1. .env                                        │
│     ├─ Environment variables                   │
│     ├─ API keys (user must add)                │
│     ├─ Security secrets                        │
│     └─ Feature flags                           │
│                                                 │
│  2. docker-compose.override.yml                │
│     ├─ Mounts librechat.yaml                   │
│     └─ Custom Docker configuration             │
│                                                 │
│  3. librechat.yaml                             │
│     ├─ AI endpoint definitions                 │
│     ├─ MCP server configuration                │
│     ├─ Web search settings                     │
│     └─ Interface customization                 │
│                                                 │
└─────────────────────────────────────────────────┘
                      ↓
                 make build
                      ↓
                  make up
                      ↓
            Running Application
```

---

## 🔐 Production Configuration

### Security Hardening

After `make setup`, enhance security:

**1. Generate Production Secrets:**
```bash
# Create secure secrets
cat >> .env << EOF

# Production Security (Generated $(date))
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
**macOS / Linux / Windows (WSL2/Git Bash):**
```bash
# 1. Initial setup
make setup

# 2. Add at least one AI provider key
nano .env
# Add: OPENAI_API_KEY=sk-...

# 3. Build and start
make build
make up

# 4. Access at http://localhost:3080
```

**Windows (PowerShell):**
```powershell
# 1. Manual setup (if Make unavailable)
Copy-Item .env.example .env
Copy-Item librechat.example.yaml librechat.yaml

# 2. Edit .env in Notepad
notepad .env
# Add: OPENAI_API_KEY=sk-...

# 3. Build and start
docker compose build
docker compose up -dOCIAL_LOGIN=false
```

**3. Set Production Domains:**
```bash
# In .env
DOMAIN_CLIENT=https://chat.yourdomain.com
DOMAIN_SERVER=https://chat.yourdomain.com
NODE_ENV=production
```

### Environment-Specific Configuration

#### Development
```bash
# .env.development
DEBUG_LOGGING=true
ALLOW_REGISTRATION=true
SEARCH=true
```

#### Production
```bash
# .env.production
DEBUG_LOGGING=false
ALLOW_REGISTRATION=false
CONSOLE_JSON=true
NODE_ENV=production
```

---

## 📊 Configuration Matrix

### What Gets Configured by `make setup`

| Component | Configuration | User Action Required |
|-----------|--------------|---------------------|
| **Core API** | Port, MongoDB URI | ✅ None (defaults work) |
| **OpenAI** | Placeholder key | ❌ Must add API key |
| **Anthropic** | Placeholder key | ❌ Must add API key |
| **Google** | Placeholder key | ❌ Must add API key |
| **Groq** | Endpoint configured | ❌ Must add API key |
| **Mistral** | Endpoint configured | ❌ Must add API key |
| **OpenRouter** | Endpoint configured | ❌ Must add API key |
| **Helicone** | Endpoint configured | ❌ Must add API key |
| **Portkey** | Endpoint configured | ❌ Must add 2 keys |
| **Web Search (SERPER)** | Variable ready | ⚠️ Optional: add key |
| **Web Search (FIRECRAWL)** | Variable ready | ⚠️ Optional: add key |
| **Web Search (JINA)** | Variable ready | ⚠️ Optional: add key |
| **MCP ClickHouse** | Server configured | ✅ Works with demo DB |
| **Security Secrets** | Default secrets | ⚠️ Change for production |
| **Database** | MongoDB configured | ✅ None (auto-created) |
| **Search (Meilisearch)** | Configured | ✅ None (auto-started) |

**macOS / Linux / Windows (WSL2/Git Bash):**
```bash
# 1. Add API key to .env
echo "NEW_PROVIDER_KEY=your_key" >> .env

# 2. Add endpoint to librechat.yaml
nano librechat.yaml
# Add new endpoint configuration

# 3. Restart services
make restart
```

**Windows (PowerShell):**
**macOS / Linux / Windows (WSL2/Git Bash):**
```bash
# After changing .env
make restart

# After changing librechat.yaml
make restart

# After changing docker-compose.override.yml
make rebuild
```

**Windows (PowerShell):**
```powershell
# After changing .env or librechat.yaml
docker compose restart

# After changing docker-compose.override.yml
docker compose down
docker compose build
docker compose up -t services
docker compos Minimal Setup (Development)

```bash
# 1. Initial setup
make setup

# 2. Add at least one AI provider key
nano .env
# Add: OPENAI_API_KEY=sk-...

# 3. Build and start
make build
**macOS / Linux:**
```bash
# Backup all configuration
mkdir -p backups/$(date +%Y%m%d)
cp .env backups/$(date +%Y%m%d)/
cp librechat.yaml backups/$(date +%Y%m%d)/
cp docker-compose.override.yml backups/$(date +%Y%m%d)/
```

**Windows (WSL2 / Git Bash):**
```bash
# Same as macOS/Linux
mkdir -p backups/$(date +%Y%m%d)
cp .env backups/$(date +%Y%m%d)/
cp librechat.yaml backups/$(date +%Y%m%d)/

**macOS / Linux / Windows (WSL2/Git Bash):**
```bash
# Check if .env.example exists
ls -la .env.example

# Manual copy if needed
cp .env.example .env
```

**Windows (PowerShell):**
```powershell
# Check if .env.example exists
Get-Item .env.example

# Manual copy if needed
Copy-Item .env.example .env
```

**macOS / Linux / Windows (WSL2/Git Bash):**
```bash
# Rebuild containers
make rebuild

# Check mounted files
make shell
ls -la /app/librechat.yaml
cat /app/.env | grep API_KEY
```

**Windows (PowerShell):**
```powershell
# Rebuild containers
docker compose down
docker compose build --no-cache
docker compose up -d

# Check mounted files
docker compose exec api sh
# Inside container:
ls -la /app/librechat.yaml
cat /app/.env | grep API_KEY
exit
**Issue:** Make command not found (Windows)
```powershell
# Option 1: Use WSL2
wsl
cd /mnt/c/path/to/LibreChat
make setup

# Option 2: Use Docker Compose directly
docker compose build
docker compose up -don)

```bash
# 1. Initial setup
make setup

# 2. Configure all API keys
nano .env
# Add all provider keys
# Add web search keys

**macOS / Linux / Windows (WSL2/Git Bash):**
```bash
# Verify .env has real keys
cat .env | grep API_KEY

# Ensure no quotes or spaces
# Wrong: OPENAI_API_KEY="sk-abc123"
# Right: OPENAI_API_KEY=sk-abc123
```

**Windows (PowerShell):**
```powershell
# Verify .env has real keys
Select-String -Path .env -Pattern "API_KEY"

# Or view in Notepad
notepad .env

# Ensure no quotes or spaces
# Wrong: OPENAI_API_KEY="sk-abc123"
# Right: OPENAI_API_KEY=sk-abc123
```

**Issue:** Line ending problems (Windows)

Windows may add CRLF line endings that cause issues:

**Windows (Git Bash/WSL2):**
```bash
# Convert line endings to Unix format (LF)
dos2unix .env
dos2unix librechat.yaml

# Or manually with sed
sed -i 's/\r$//' .env
sed -i 's/\r$//' librechat.yaml
```

**Windows (PowerShell):**
```powershell
# Convert line endings
(Get-Content .env -Raw) -replace "`r`n", "`n" | Set-Content .env -NoNewline
# 4. Start MCP server
make mcp-start

# 5. Build and start
make build
make up

# 6. Verify everything
make ps
make logs-api

# 7. Access at http://localhost:3080
```

**Time to deploy:** ~15 minutes

---

## 🔄 Post-Setup Operations

### Adding New Endpoints

**After `make setup`, to add a new AI provider:**

```bash
# 1. Add API key to .env
echo "NEW_PROVIDER_KEY=your_key" >> .env

# 2. Add endpoint to librechat.yaml
nano librechat.yaml
# Add new endpoint configuration

# 3. Restart services
make restart
```

### Updating Configuration

```bash
# After changing .env
make restart

# After changing librechat.yaml
make restart

# After changing docker-compose.override.yml
make rebuild
```

### Backup Configuration

```bash
# Backup all configuration
mkdir -p backups/$(date +%Y%m%d)
cp .env backups/$(date +%Y%m%d)/
cp librechat.yaml backups/$(date +%Y%m%d)/
cp docker-compose.override.yml backups/$(date +%Y%m%d)/
```

---

## 🐛 Troubleshooting Setup

### Setup Command Fails

**Issue:** `.env` not created
```bash
# Check if .env.example exists
ls -la .env.example

# Manual copy if needed
cp .env.example .env
```

**Issue:** Permission denied
```bash
# Fix permissions
chmod +x Makefile
sudo chown $USER:$USER .
```

### Configuration Not Loading

**Issue:** Changes not reflected
```bash
# Rebuild containers
make rebuild

# Check mounted files
make shell
ls -la /app/librechat.yaml
cat /app/.env | grep API_KEY
```

### API Keys Not Working

**Issue:** "user_provided" error
```bash
# Verify .env has real keys
cat .env | grep API_KEY

# Ensure no quotes or spaces
# Wrong: OPENAI_API_KEY="sk-abc123"
# Right: OPENAI_API_KEY=sk-abc123
```

---

## 📋 Checklist

### Post-Setup Verification

- [ ] `.env` file created
- [ ] `librechat.yaml` file created
- [ ] `docker-compose.override.yml` file created
- [ ] At least one AI provider API key added
- [ ] Production secrets generated (if production)
- [ ] UID/GID set correctly
- [ ] `make build` completed successfully
- [ ] `make up` started all services
- [ ] Can access http://localhost:3080
- [ ] Can create account/login
- [ ] AI models appear in interface
- [ ] Can send messages to AI

### Production Deployment Checklist

- [ ] All API keys configured
- [ ] Production secrets generated
- [ ] Registration disabled (if needed)
- [ ] HTTPS/SSL configured
- [ ] Domain names configured
- [ ] Database authentication enabled
- [ ] Backups configured
- [ ] Monitoring enabled
- [ ] Rate limiting configured
- [ ] Firewall rules set

---

## 📞 Support

For setup issues:
- Review this guide thoroughly
- Check `make logs-api` for errors
- Verify all files were created by `make setup`
- Ensure API keys are valid and properly formatted
- Refer to [SETUP.md](SETUP.md) for detailed configuration

---

**Document Version:** 1.0  
**Last Updated:** December 2025  
**Compatible with:** Bintybyte AI Chat v1.0+
