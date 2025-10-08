# LibreChat Stackit Deployment - Senticor Configuration

This document details the configuration overrides and customizations for the LibreChat deployment on Stackit infrastructure for Senticor/NEURIS.

## Quick Links

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide for the three-repository setup
- **[FOR-MCP-REPO.md](FOR-MCP-REPO.md)** - Information to add to rechtsinformationen-bund-de-mcp repository
- **[FOR-PROXY-REPO.md](FOR-PROXY-REPO.md)** - Information to add to aixplain-proxy repository

## Table of Contents

- [Overview](#overview)
- [Multi-Repository Setup](#multi-repository-setup)
- [Authentication & Registration](#authentication--registration)
- [AI Providers Configuration](#ai-providers-configuration)
- [MCP Servers](#mcp-servers)
- [Search & Database](#search--database)
- [Security Settings](#security-settings)
- [Interface Customization](#interface-customization)
- [File Storage](#file-storage)
- [Environment Variables Reference](#environment-variables-reference)
- [Deployment Notes](#deployment-notes)

---

## Overview

This deployment uses:
- **Platform**: Stackit
- **Database**: MongoDB (local instance at 127.0.0.1:27017)
- **Search**: MeiliSearch (enabled on port 7700)
- **File Storage**: Local filesystem (default)
- **Authentication**: Email/password with self-registration enabled

### Multi-Repository Setup

This deployment consists of three repositories:

1. **LibreChat** (this repository) - Main chat interface
2. **rechtsinformationen-bund-de-mcp** - MCP server for German legal information
3. **aixplain-proxy** - OpenAI-compatible proxy for aiXplain models

**See [DEPLOYMENT.md](DEPLOYMENT.md) for complete setup instructions.**

---

## Authentication & Registration

### Self-Registration Configuration

Self-registration is **enabled** for users to sign up without admin intervention:

```env
ALLOW_EMAIL_LOGIN=true
ALLOW_REGISTRATION=true              # ✅ Self-registration enabled
ALLOW_UNVERIFIED_EMAIL_LOGIN=true    # Users can login without email verification
```

### Social Login Configuration

Social logins are currently **disabled** but configured in `librechat.yaml`:

```yaml
registration:
  socialLogins: ['github', 'google', 'discord', 'openid', 'facebook', 'apple', 'saml']
```

To enable social logins, update `.env`:
```env
ALLOW_SOCIAL_LOGIN=true
ALLOW_SOCIAL_REGISTRATION=true
```

And configure the respective OAuth credentials (GITHUB_CLIENT_ID, GOOGLE_CLIENT_ID, etc.).

### Session Configuration

```env
SESSION_EXPIRY=1000 * 60 * 15                    # 15 minutes
REFRESH_TOKEN_EXPIRY=(1000 * 60 * 60 * 24) * 7  # 7 days
```

### Password Reset

Currently **disabled**:
```env
ALLOW_PASSWORD_RESET=false
```

To enable, configure email settings and set `ALLOW_PASSWORD_RESET=true`.

---

## AI Providers Configuration

### API Key Management

Most AI providers are configured to accept **user-provided API keys**:

```env
ANTHROPIC_API_KEY=user_provided
GOOGLE_KEY=user_provided
OPENAI_API_KEY=user_provided
ASSISTANTS_API_KEY=user_provided
```

This means users must provide their own API keys in the UI.

### Pre-configured Providers

1. **OpenRouter** - Pre-configured with API key:
   ```env
   OPENROUTER_KEY=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
   ```

2. **aiXplain** - Pre-configured with API key:
   ```env
   AIXPLAIN_API_KEY=8327094ec9fbd0299f75efada22f43fe9e6d00a792b96302efa61732499e9a5d
   ```

### Custom Endpoints

Configured in `librechat.yaml`:

#### 1. Groq
- **Models**: llama3-70b-8192, llama3-8b-8192, mixtral-8x7b-32768
- **API Key**: `${GROQ_API_KEY}` (environment variable)
- **Title Model**: mixtral-8x7b-32768

#### 2. Mistral AI
- **Models**: mistral-tiny, mistral-small, mistral-medium
- **API Key**: `${MISTRAL_API_KEY}` (environment variable)
- **Features**: Auto-fetch models from API, title generation enabled
- **Note**: Drops unsupported params (stop, user, frequency_penalty, presence_penalty)

#### 3. OpenRouter
- **Models**:
  - meta-llama/llama-3-70b-instruct (Llama 3 70B)
  - qwen/qwen-2.5-72b-instruct (Qwen 2.5 72B - 128K context, tool-capable)
  - z-ai/glm-4.6 (GLM-4.6 by Z.AI - 200K context, tool-capable)
  - Auto-fetch enabled for additional models
- **API Key**: User-provided (users enter their own key)
- **Note**: Drops stop parameter for compatibility
- **Qwen 2.5 72B**: 128K context, strong reasoning, excellent for coding and tools
- **GLM-4.6**: 200K context window, advanced reasoning, tool use, better coding performance

#### 4. Portkey AI
- **Models**: GPT-4o, GPT-4o-mini, chatgpt-4o-latest
- **API Key**: `${PORTKEY_API_KEY}` (via header)
- **Virtual Key**: `${PORTKEY_OPENAI_VIRTUAL_KEY}`
- **Features**: Auto-fetch models, title generation

#### 5. aiXplain (via OpenAI-compatible proxy)
- **Endpoint**: http://aixplain-proxy:3001/v1
- **Models**:
  - gpt-4o-mini (GPT-4o Mini)
  - allam-7b-instruct (ALLaM 7B Instruct)
  - gemini-2.0-flash-exp (Gemini 2.0 Flash)
  - gpt-oss-120b (GPT OSS 120b - **recommended for MCP tools**)
  - o3-mini (O3 mini - may have limited tool support)
- **Features**: Streaming enabled, no agent features
- **Note**: Uses Docker service name; for local dev use `http://localhost:3001/v1`
- **Proxy Mapping**: Model names are mapped in aixplain-proxy to actual model IDs
- **MCP Recommendation**: Use gpt-oss-120b for best tool-calling performance

---

## MCP Servers

### Rechtsinformationen Bund DE

**MCP Server for German Legal Information** - Provides access to German federal legal information and case law.

**Repository**: https://github.com/wolfgangihloff/rechtsinformationen-bund-de-mcp

**Configuration** (in `librechat.yaml`):
```yaml
mcpServers:
  rechtsinformationen-bund-de:
    type: stdio
    command: node
    args:
      - /path/to/rechtsinformationen-bund-de-mcp/dist/index.js
    timeout: 60000  # 1 minute timeout for legal information searches
```

### Setup Instructions

**Current Setup** (Senticor Stackit Deployment):

The MCP server is **already configured and running** with the following setup:

1. **MCP Server Location**: `/Users/wolfgang/workspace/rechtsinformationen-bund-de-mcp`
2. **Docker Mount**: Mounted to `/app/mcp-servers/rechtsinformationen-bund-de` in container
3. **Configuration**: See `librechat.yaml` lines 166-174
4. **Override File**: `docker-compose.override.yml` mounts the MCP server directory

**To verify the MCP server is running**:
```bash
docker compose logs api | grep -i mcp
```

You should see:
```
[MCP][rechtsinformationen-bund-de] Tools: deutsche_gesetze_suchen, rechtsprechung_suchen, dokument_details_abrufen, alle_rechtsdokumente_suchen, semantische_rechtssuche, gesetz_per_eli_abrufen
[MCP][rechtsinformationen-bund-de] Initialized in: 268ms
MCP servers initialized successfully. Added 6 MCP tools.
```

**For new deployments**, follow these steps:

1. **Clone and build the MCP server**:
   ```bash
   # Clone the repository
   git clone https://github.com/wolfgangihloff/rechtsinformationen-bund-de-mcp.git
   cd rechtsinformationen-bund-de-mcp

   # Install dependencies
   npm install

   # Build the server
   npm run build
   ```

2. **Create docker-compose.override.yml**:
   ```yaml
   services:
     api:
       volumes:
         - ./librechat.yaml:/app/librechat.yaml:ro
         - /path/to/rechtsinformationen-bund-de-mcp:/app/mcp-servers/rechtsinformationen-bund-de:ro
   ```

3. **Update librechat.yaml**:
   ```yaml
   mcpServers:
     rechtsinformationen-bund-de:
       type: stdio
       command: node
       args:
         - /app/mcp-servers/rechtsinformationen-bund-de/dist/index.js
       timeout: 60000
   ```

4. **Restart LibreChat**:
   ```bash
   docker compose down && docker compose up -d
   ```

### Available Tools

The rechtsinformationen-bund-de MCP server provides **6 tools** for German legal research:

1. **`deutsche_gesetze_suchen`** - Search German federal laws and regulations
2. **`rechtsprechung_suchen`** - Search case law and court decisions
3. **`dokument_details_abrufen`** - Retrieve detailed information about legal documents
4. **`alle_rechtsdokumente_suchen`** - Search all legal documents in the database
5. **`semantische_rechtssuche`** - Perform semantic search across legal texts
6. **`gesetz_per_eli_abrufen`** - Get laws by ELI (European Legislation Identifier)

**Status**: ✅ Successfully loaded and initialized (verified on 2025-10-06)

### Troubleshooting

**MCP server not loading:**
- Verify the path to `dist/index.js` is correct and absolute
- Ensure Node.js v18+ or v20+ is available in the container
- Check LibreChat logs: `docker compose logs -f api`
- Verify the build was successful: `ls -la /path/to/rechtsinformationen-bund-de-mcp/dist/`

**Timeout errors:**
- Increase the timeout value if legal searches take longer
- Default is 60000ms (1 minute)

**Permission errors:**
- Ensure the MCP server files are readable by the LibreChat container user
- Check file permissions: `chmod +x /path/to/dist/index.js`

### Additional MCP Servers

To add more MCP servers, add them to the `mcpServers` section in `librechat.yaml`:

```yaml
mcpServers:
  rechtsinformationen-bund-de:
    # ... existing config ...

  another-server:
    type: stdio
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-name"
    timeout: 60000
```

For production environments with multiple users, consider using **streamable-http** type instead of stdio:

```yaml
mcpServers:
  rechtsinformationen-bund-de:
    type: streamable-http
    url: https://your-mcp-server.example.com/mcp
    headers:
      Authorization: "Bearer ${MCP_SERVER_TOKEN}"
    timeout: 60000
```

---

## Search & Database

### MongoDB

```env
MONGO_URI=mongodb://127.0.0.1:27017/LibreChat
```

- Local MongoDB instance
- No authentication (`--noauth` in docker-compose)
- Database name: `LibreChat`

### MeiliSearch

```env
SEARCH=true
MEILI_HOST=http://0.0.0.0:7700
MEILI_MASTER_KEY=3eacc86d31caa87bea7e8fbd475cfe70
MEILI_NO_ANALYTICS=true
```

- Full-text search enabled
- Indexing enabled (set `MEILI_NO_SYNC=true` in multi-node setups)
- Analytics disabled

---

## Security Settings

### JWT Secrets

```env
JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef
JWT_REFRESH_SECRET=f25a9393da616c6d5895f7b8161374e688583f44ed95d5796d19627f79cce703
```

⚠️ **Important**: These secrets should be rotated for production use.

### Encryption Keys

```env
CREDS_KEY=8ac0295e4c7e446ddbbb4ac68c3db18580926931e47217ed66a7724f1c20023f
CREDS_IV=70b4bb22d1b6f1d5cb9dca84c7a2a913
```

Used for encrypting stored credentials (API keys, tokens).

### Rate Limiting & Moderation

```env
# Ban configuration
BAN_VIOLATIONS=true
BAN_DURATION=1000 * 60 * 60 * 2  # 2 hours
BAN_INTERVAL=20

# Violation scores
LOGIN_VIOLATION_SCORE=1
REGISTRATION_VIOLATION_SCORE=1
CONCURRENT_VIOLATION_SCORE=1
MESSAGE_VIOLATION_SCORE=1
NON_BROWSER_VIOLATION_SCORE=20

# Rate limits
LOGIN_MAX=7
LOGIN_WINDOW=5
REGISTER_MAX=5
REGISTER_WINDOW=60

# Concurrent messages
LIMIT_CONCURRENT_MESSAGES=true
CONCURRENT_MESSAGE_MAX=2

# Message rate limits
LIMIT_MESSAGE_IP=true
MESSAGE_IP_MAX=40
MESSAGE_IP_WINDOW=1

LIMIT_MESSAGE_USER=false
```

### Content Moderation

```env
OPENAI_MODERATION=false  # Currently disabled
```

To enable OpenAI moderation, set to `true` and provide `OPENAI_MODERATION_API_KEY`.

---

## Interface Customization

### Branding

```env
APP_TITLE=LibreChat
HELP_AND_FAQ_URL=https://librechat.ai
```

### Interface Features (librechat.yaml)

```yaml
interface:
  customWelcome: 'Welcome to LibreChat! Enjoy your experience.'
  endpointsMenu: true      # Endpoint selection menu
  modelSelect: true        # Model selection
  parameters: true         # Model parameters UI
  sidePanel: true          # Side panel
  presets: true            # Conversation presets
  prompts: true            # Prompt library
  bookmarks: true          # Bookmark conversations
  multiConvo: true         # Multiple conversations
  agents: true             # AI agents
  marketplace:
    use: false             # Agent marketplace disabled
  fileCitations: true      # Show file citations
  fileSearch: true         # File search capability
```

### People Picker

```yaml
peoplePicker:
  users: true    # Search users
  groups: true   # Search groups
  roles: true    # Search roles
```

### Privacy & Terms

Configured to link to LibreChat's official pages:

```yaml
privacyPolicy:
  externalUrl: 'https://librechat.ai/privacy-policy'
  openNewTab: true

termsOfService:
  externalUrl: 'https://librechat.ai/tos'
  openNewTab: true
  modalAcceptance: true  # Users must accept on first login
```

---

## File Storage

### Current Configuration

```env
# No fileStrategy configured - defaults to "local"
```

Files are stored locally in the `./uploads` directory (mounted in Docker).

### Available Strategies

To change file storage, configure in `librechat.yaml`:

```yaml
# Option 1: Single strategy for all files
fileStrategy: "s3"

# Option 2: Granular strategy per file type (recommended)
fileStrategy:
  avatar: "s3"        # User/agent avatars
  image: "firebase"   # Chat images
  document: "local"   # Documents (PDFs, etc.)
```

Supported strategies: `local`, `s3`, `firebase`

### S3 Configuration

If using S3, configure in `.env`:
```env
AWS_ENDPOINT_URL=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_BUCKET_NAME=
```

### Firebase Configuration

If using Firebase, configure in `.env`:
```env
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
```

---

## Environment Variables Reference

### Server Configuration

| Variable | Value | Description |
|----------|-------|-------------|
| `HOST` | `localhost` | Server host binding |
| `PORT` | `3080` | Server port |
| `DOMAIN_CLIENT` | `http://localhost:3080` | Client domain |
| `DOMAIN_SERVER` | `http://localhost:3080` | Server domain |
| `TRUST_PROXY` | `1` | Trust first proxy hop |
| `NO_INDEX` | `true` | Prevent search engine indexing |

### Debugging

| Variable | Value | Description |
|----------|-------|-------------|
| `DEBUG_LOGGING` | `true` | Enable debug logs |
| `DEBUG_CONSOLE` | `false` | Console debug output |
| `CONSOLE_JSON` | `false` | JSON log format |
| `DEBUG_OPENAI` | `false` | OpenAI API debugging |
| `DEBUG_PLUGINS` | `true` | Plugin debugging |

### Shared Links

```env
ALLOW_SHARED_LINKS=true         # Enable conversation sharing
ALLOW_SHARED_LINKS_PUBLIC=true  # Allow public shared links
```

---

## Deployment Notes

### Docker Compose Services

The deployment includes:

1. **LibreChat API** (port 3080)
   - Main application container
   - Mounts: `.env`, `librechat.yaml`, `./images`, `./uploads`, `./logs`
   - MCP Server: `/app/mcp-servers/rechtsinformationen-bund-de` (mounted from host)

2. **MongoDB** (port 27017)
   - Data volume: `./data-node`
   - No authentication (internal network only)

3. **MeiliSearch** (port 7700)
   - Data volume: `./meili_data_v1.12`
   - Master key required for access

4. **PostgreSQL with pgvector** (for RAG)
   - Used by RAG API service
   - Volume: `pgdata2`

5. **RAG API** (port 8000)
   - Retrieval-Augmented Generation service
   - Depends on vectordb

### Startup Checklist

1. ✅ **MongoDB** - Running on localhost:27017
2. ✅ **MeiliSearch** - Running on localhost:7700
3. ✅ **Self-registration** - Enabled
4. ✅ **Email login** - Enabled without verification
5. ✅ **MCP Server** - rechtsinformationen-bund-de loaded with 6 tools
6. ⚠️ **Social logins** - Configured but disabled
7. ⚠️ **Password reset** - Disabled (no email server)
8. ✅ **API providers** - OpenRouter and aiXplain pre-configured
9. ✅ **Rate limiting** - Enabled with moderate limits
10. ✅ **File uploads** - Local storage enabled

### Production Recommendations

1. **Security**:
   - Rotate JWT secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`)
   - Rotate encryption keys (`CREDS_KEY`, `CREDS_IV`)
   - Enable MongoDB authentication
   - Set up HTTPS/TLS with reverse proxy
   - Review and strengthen rate limits

2. **Email**:
   - Configure email server for password resets
   - Enable email verification for new users
   - Set up proper `EMAIL_FROM` and `EMAIL_FROM_NAME`

3. **Monitoring**:
   - Set up log aggregation for `./logs` directory
   - Monitor MongoDB and MeiliSearch health
   - Track API usage and rate limit violations

4. **Backups**:
   - Regular MongoDB backups (`./data-node`)
   - MeiliSearch index backups (`./meili_data_v1.12`)
   - User file backups (`./uploads`)

5. **Scaling**:
   - Enable Redis for session storage and caching
   - Consider multi-node setup with `MEILI_NO_SYNC=true` on worker nodes
   - Implement load balancing for API service

### Quick Start Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Create first admin user
npm run create-user

# Add balance to user
npm run add-balance

# Check user statistics
npm run user-stats
```

### Troubleshooting

**Users can't register:**
- Verify `ALLOW_REGISTRATION=true` in `.env`
- Check rate limits (`REGISTER_MAX`, `REGISTER_WINDOW`)
- Review logs for violation scores

**API keys not working:**
- For user-provided keys: ensure users enter them in Settings
- For pre-configured keys: verify environment variables are set
- Check provider-specific requirements (Anthropic, OpenAI, etc.)

**Search not working:**
- Verify MeiliSearch is running: `http://localhost:7700/health`
- Check `MEILI_MASTER_KEY` matches in both services
- Review MeiliSearch logs for indexing errors

**File uploads failing:**
- Ensure `./uploads` directory exists and is writable
- Check file size limits (default 3MB per request)
- Verify disk space availability

---

## Configuration Change Log

### Initial Stackit Deployment

**Date**: 2025-10-06

**Changes**:
- Enabled self-registration for users
- Configured MongoDB on localhost
- Enabled MeiliSearch for full-text search
- Pre-configured OpenRouter and aiXplain API keys
- Set up custom endpoints: Groq, Mistral, Portkey, aiXplain
- Disabled social logins and password reset
- Enabled shared links (public and private)
- Configured moderation and rate limiting
- Set debug logging enabled

**Pending**:
- Email server configuration for password reset
- Social OAuth provider credentials
- Production SSL/TLS setup
- Redis configuration for scaling

---

## Support & Documentation

- **LibreChat Docs**: https://librechat.ai/docs
- **Configuration Guide**: https://www.librechat.ai/docs/configuration/librechat_yaml
- **Environment Variables**: https://www.librechat.ai/docs/configuration/dotenv
- **GitHub Repository**: https://github.com/danny-avila/LibreChat

For Senticor-specific questions, refer to internal documentation or contact the DevOps team.
