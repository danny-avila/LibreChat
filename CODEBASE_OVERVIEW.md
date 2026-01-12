# LibreChat Codebase - Deep Dive Overview

## 🎯 Project Summary

**LibreChat** is an open-source, full-stack AI chat platform that provides a ChatGPT-like interface with support for multiple AI providers and advanced features. Current version: **v0.8.1-rc2**

### Key Characteristics:
- **Monorepo Architecture** using npm workspaces
- **Full-stack JavaScript/TypeScript** application
- **Multi-AI Provider Support**: OpenAI, Anthropic, Google, Azure, AWS Bedrock, and more
- **Enterprise-ready** with RBAC, multi-tenancy, and extensive customization
- **n8n Integration** for AI-powered workflow automation (custom feature in this fork)

---

## 📁 Repository Structure

```
librechat/
├── api/                          # Backend Node.js/Express API
│   ├── server/                   # Server entry points and routes
│   │   ├── index.js             # Main server file
│   │   ├── routes/              # API route handlers
│   │   ├── services/            # Business logic services
│   │   ├── controllers/         # Request handlers
│   │   └── middleware/          # Express middleware (including n8n tools)
│   ├── models/                   # Mongoose data models
│   ├── db/                       # Database connection & setup
│   ├── strategies/               # Passport authentication strategies
│   ├── app/                      # Application-level logic
│   └── utils/                    # Utility functions
│
├── client/                       # Frontend React application
│   ├── src/
│   │   ├── components/          # React components (29 feature directories)
│   │   │   ├── Chat/           # Chat interface components
│   │   │   ├── Nav/            # Navigation components
│   │   │   ├── Agents/         # Agent marketplace & management
│   │   │   ├── Auth/           # Authentication UI
│   │   │   ├── Profile/        # User profile components
│   │   │   └── ...             # Many more feature components
│   │   ├── routes/              # React Router configuration
│   │   ├── hooks/               # Custom React hooks (43 hooks)
│   │   ├── store/               # State management (Recoil)
│   │   ├── data-provider/       # API data access layer
│   │   ├── utils/               # Frontend utilities
│   │   ├── locales/             # i18n translations (42 languages)
│   │   └── Providers/           # React context providers
│   └── public/                  # Static assets
│
├── packages/                     # Shared packages (npm workspaces)
│   ├── data-provider/           # API client & data fetching
│   ├── data-schemas/            # Shared TypeScript schemas & Mongoose models
│   ├── api/                     # API utilities package
│   └── client/                  # Client utilities package
│
├── config/                       # Configuration scripts
│   ├── create-user.js           # User management utilities
│   ├── add-balance.js           # Token balance management
│   ├── update.js                # Update/migration scripts
│   └── ...                      # Various admin scripts
│
├── n8n-workflows/               # n8n workflow definitions (custom)
├── e2e/                         # Playwright end-to-end tests
├── docker-compose.yml           # Docker orchestration
├── librechat.yaml              # Main configuration file
└── .env                         # Environment variables

```

---

## 🏗️ Architecture Overview

### Technology Stack

#### Backend (API)
- **Runtime**: Node.js (supports Bun as alternative)
- **Framework**: Express.js v4.21
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Passport.js (JWT, Local, LDAP, OAuth2)
  - Supports: Google, GitHub, Discord, Facebook, Apple, OpenID, SAML
- **Search**: Meilisearch v1.12
- **Caching**: Redis with ioredis/Keyv
- **File Storage**: Local, S3, Azure Blob, Firebase
- **Session Management**: express-session with connect-redis
- **AI SDKs**: 
  - @anthropic-ai/sdk (Claude)
  - openai (GPT models)
  - @google/generative-ai (Gemini)
  - @langchain/core (RAG & agents)
  - @librechat/agents (custom agent framework)
  - @modelcontextprotocol/sdk (MCP integration)

#### Frontend (Client)
- **Framework**: React 18.2
- **Build Tool**: Vite 6.4
- **Routing**: React Router v6
- **State Management**: 
  - Recoil (global state)
  - Jotai (atomic state)
  - @tanstack/react-query v4 (server state)
- **UI Libraries**:
  - Radix UI (accessible components)
  - Tailwind CSS (styling)
  - Framer Motion (animations)
  - react-dnd (drag & drop)
- **Markdown**: react-markdown with rehype/remark plugins
- **i18n**: i18next with 42+ language support
- **Forms**: react-hook-form with Zod validation

#### DevOps & Infrastructure
- **Containerization**: Docker & Docker Compose
- **Reverse Proxy**: Nginx support
- **Vector Database**: pgvector (for RAG)
- **Testing**: Jest, Playwright
- **Linting**: ESLint v9, Prettier

---

## 🔑 Core Features & Implementation

### 1. **Multi-AI Provider System**

The platform supports multiple AI endpoints through a unified interface:

**Configuration**: `librechat.yaml`
```yaml
endpoints:
  - openAI
  - assistants
  - azureOpenAI
  - google
  - anthropic
  - custom  # OpenAI-compatible APIs
```

**Implementation Path**: 
- `api/server/services/Endpoints/` - Provider-specific implementations
- `client/src/components/Endpoints/` - UI for each provider
- `packages/data-schemas/` - Shared type definitions

### 2. **Agent System**

LibreChat includes a powerful agent framework with:
- **Agent Marketplace** - Discover and share custom agents
- **Tool Integration** - MCP (Model Context Protocol) support
- **Code Interpreter** - Execute code in Python, Node.js, Go, etc.
- **File Search** - RAG-powered document search
- **Custom Tools** - n8n workflows as AI function tools

**Key Files**:
- `api/models/Agent.js` - Agent model (29KB, comprehensive)
- `api/server/controllers/agents/` - Agent controllers
- `client/src/components/Agents/` - Agent UI (14 components)
- `api/server/services/PermissionService.js` - Agent permissions

### 3. **Authentication & Authorization**

**Multi-Strategy Auth**:
- JWT token-based authentication
- Local username/password
- LDAP integration
- OAuth2 (Google, GitHub, Discord, Facebook, Apple)
- SAML SSO
- Two-Factor Authentication (2FA)

**RBAC System**:
- Role-based access control
- User/Group/Role permissions
- Per-resource permissions (agents, prompts, conversations)
- Fine-grained access control

**Implementation**:
- `api/strategies/` - Passport strategies (jwtLogin, ldapLogin, passportLogin)
- `api/server/controllers/auth/` - Auth controllers
- `api/server/services/PermissionService.js` - 27KB permission logic
- `client/src/components/Auth/` - 18 auth components

### 4. **Conversation Management**

**Features**:
- Conversation branching (fork messages)
- Message editing with history
- Search across all conversations (Meilisearch)
- Export/Import (ChatGPT, Chatbot UI formats)
- Conversation tags & categories
- Presets (saved configurations)
- Bookmarks

**Data Models**:
- `api/models/Conversation.js` - Conversation schema
- `api/models/Message.js` - Message schema
- `api/models/ConversationTag.js` - Tagging system

### 5. **File Handling**

**Multi-Storage Strategy**:
```javascript
fileStrategy: {
  avatar: "s3",      // User avatars
  image: "firebase", // Chat images
  document: "local"  // Documents
}
```

**Capabilities**:
- Multimodal AI (images with Claude, GPT-4o, Gemini)
- File upload/download
- Image generation (DALL-E, Stable Diffusion, Flux)
- Document processing for RAG
- File citations in responses

**Implementation**:
- `api/server/services/Files/` - 17 file service modules
- `api/models/File.js` - File metadata model
- `client/src/components/Files/` - File UI components

### 6. **n8n Integration** (Custom Feature)

This fork includes deep n8n workflow integration:

**Architecture**:
1. **External n8n Instance**: Hosted at `https://nadyaputriast-n8n.hf.space`
2. **Workflow Loading**: `api/server/middleware/loadN8nTools.js`
3. **Tool Injection**: `api/server/middleware/injectN8nTools.js`
4. **Tool Execution**: `api/server/services/N8nToolExecutor.js`
5. **API Routes**: `api/server/routes/n8n.js` and `n8n-tools.js`

**How It Works**:
- n8n workflows are exposed as AI function tools
- LibreChat loads workflow metadata from n8n API
- AI models can call workflows as functions
- Workflows execute on n8n instance, results returned to chat

**Key Files** (170+ n8n-related references):
- `api/server/services/N8nToolService.js` (12KB)
- `api/server/services/N8nToolWrapper.js` (6KB)
- `api/server/routes/librechat-integration.js` (8KB)
- `n8n-workflows/` directory

### 7. **RAG (Retrieval-Augmented Generation)**

**Vector Database**: PostgreSQL with pgvector extension

**Services**:
- Separate RAG API container (`rag_api`)
- Document embedding & indexing
- Semantic search
- Context retrieval for AI responses

**Configuration**:
```yaml
# docker-compose.yml
rag_api:
  image: ghcr.io/danny-avila/librechat-rag-api-dev-lite
  environment:
    - DB_HOST=vectordb
    - RAG_PORT=8000
```

### 8. **Code Artifacts & Generative UI**

**Sandboxed Execution**:
- React components (live preview)
- HTML/CSS (rendered in iframe)
- Mermaid diagrams
- Code execution in multiple languages

**Implementation**:
- `client/src/components/Artifacts/` - Artifact renderer
- `api/server/services/Artifacts/` - Server-side artifact handling

---

## 🗄️ Database Schema

### Core Collections (MongoDB)

1. **users**
   - Authentication credentials
   - Profile information
   - Token balance
   - Roles & permissions
   - 2FA settings

2. **conversations**
   - Conversation metadata
   - Participant information
   - Model configuration
   - Tags & categories

3. **messages**
   - Message content
   - Parent/child relationships (branching)
   - Attachments & files
   - AI model responses

4. **agents**
   - Agent definitions
   - Tool configurations
   - Model settings
   - Sharing permissions
   - Extensive schema (29KB model file)

5. **files**
   - File metadata
   - Storage location
   - Usage tracking
   - Access control

6. **presets**
   - Saved model configurations
   - Custom prompts
   - Sharing settings

7. **prompts**
   - Prompt library
   - Variables & templates
   - Sharing permissions

8. **roles**
   - RBAC role definitions
   - Permissions mapping

9. **balances**
   - User token balances
   - Transaction history
   - Auto-refill settings

### Relationships
- Users → Conversations (1:N)
- Conversations → Messages (1:N, with branching tree structure)
- Users → Agents (1:N, creator relationship)
- Messages → Files (N:M)
- Conversations → Tags (N:M)

---

## 🔐 Security Implementation

### Authentication Flow

1. **Registration**:
   - Email verification (optional)
   - Domain whitelist support
   - Social login options
   - CAPTCHA (Turnstile) support

2. **Login**:
   - JWT token issued (stored in httpOnly cookie)
   - Session management via Redis
   - 2FA verification if enabled
   - Rate limiting per IP

3. **Authorization**:
   - JWT verification on each request
   - Role-based access checks
   - Resource-level permissions
   - Ownership validation

### Security Features
- **express-mongo-sanitize**: Prevents NoSQL injection
- **helmet**: Security headers (implied)
- **CORS**: Configurable cross-origin policies
- **Rate Limiting**: express-rate-limit with Redis backend
- **Input Validation**: Zod schemas throughout
- **Secure File Upload**: File type validation, size limits
- **XSS Protection**: DOMPurify on client side

**Key Files**:
- `api/server/middleware/` - Auth & security middleware
- `api/server/services/AuthService.js` (16KB)
- `api/strategies/` - Passport strategies

---

## 🌐 API Architecture

### Route Structure

```
/api/
├── auth/              # Authentication endpoints
├── user/              # User management
├── convos/            # Conversations CRUD
├── messages/          # Messages CRUD
├── search/            # Conversation search
├── files/             # File upload/download
├── agents/            # Agent management
├── assistants/        # OpenAI Assistants API
├── presets/           # Preset management
├── prompts/           # Prompt library
├── endpoints/         # Available AI providers
├── models/            # Available AI models
├── config/            # App configuration
├── balance/           # Token balance
├── keys/              # API key management
├── plugins/           # Plugin system
├── mcp/               # Model Context Protocol
├── memories/          # Conversation memories
├── roles/             # RBAC management
├── permissions/       # Access control
├── tags/              # Conversation tags
├── banner/            # Admin banners
├── n8n/               # n8n proxy endpoints (custom)
├── n8n-tools/         # n8n workflow tools (custom)
└── librechat/         # Direct n8n webhooks (custom)
```

### Middleware Stack (in order)

1. **noIndex** - Prevent search engine indexing
2. **express.json/urlencoded** - Body parsing (3MB limit)
3. **handleJsonParseError** - Graceful JSON error handling
4. **mongoSanitize** - NoSQL injection prevention
5. **cors** - Cross-origin resource sharing
6. **cookieParser** - Cookie handling
7. **compression** - Response compression
8. **staticCache** - Static asset caching
9. **passport.initialize** - Auth initialization
10. **loadN8nTools** - Load n8n workflows (custom)
11. **injectN8nTools** - Inject tools into requests (custom)
12. **Routes** - Application routes
13. **ErrorController** - Global error handler

**Server Entry**: `api/server/index.js` (367 lines with detailed logging)

---

## 🎨 Frontend Architecture

### Component Organization

The client follows a feature-based organization:

```
client/src/components/
├── Chat/              # Main chat interface
├── Nav/               # Navigation & sidebar (15 components)
├── Messages/          # Message rendering
├── Input/             # Chat input area
├── Agents/            # Agent marketplace (14 components)
├── Profile/           # User settings (24 components)
├── Auth/              # Login/register (18 components)
├── Endpoints/         # AI provider selection (14 components)
├── Prompts/           # Prompt library (26 components)
├── Files/             # File management (10 components)
├── Conversations/     # Conversation list (11 components)
├── SidePanel/         # Right sidebar (15 components)
├── Bookmarks/         # Bookmarked conversations
├── Artifacts/         # Code artifacts rendering
├── Tools/             # Tool integrations
├── MCP/               # Model Context Protocol UI
├── OAuth/             # OAuth flow components
└── ui/                # Reusable UI primitives
```

### State Management Strategy

1. **Server State** (@tanstack/react-query):
   - API data fetching
   - Caching & invalidation
   - Optimistic updates
   - Background refetching

2. **Global State** (Recoil):
   - User preferences
   - UI state (modals, panels)
   - Current conversation
   - Selected model/preset

3. **Atomic State** (Jotai):
   - Form state
   - Component-local state

4. **URL State** (React Router):
   - Current conversation ID
   - Search filters
   - Navigation state

### Routing Structure

```javascript
/ (root)
├── /login              # Login page
├── /login/2fa          # Two-factor auth
├── /register           # Registration
├── /forgot-password    # Password reset request
├── /reset-password     # Password reset form
├── /verify             # Email verification
├── /c/:conversationId  # Chat interface
├── /c/new              # New conversation
├── /search             # Search conversations
├── /profile            # User profile
├── /agents             # Agent marketplace
├── /agents/:category   # Filtered agents
├── /share/:shareId     # Shared conversation view
└── /oauth/             # OAuth callbacks
    ├── /success
    └── /error
```

### Data Flow

```
User Action
    ↓
Component Event Handler
    ↓
React Query Mutation / Recoil Action
    ↓
API Request (data-provider)
    ↓
Backend API Route
    ↓
Controller → Service → Model
    ↓
Database Operation
    ↓
Response
    ↓
React Query Cache Update
    ↓
Component Re-render
```

---

## 🧩 Package Architecture

### packages/data-provider

**Purpose**: Centralized API client for both frontend and backend

**Exports**:
- API request functions
- Type definitions
- Validation schemas
- React Query hooks (via `/react-query` export)

**Build Output**:
- `dist/index.js` (CommonJS)
- `dist/index.es.js` (ES Modules)
- `dist/types/` (TypeScript definitions)

### packages/data-schemas

**Purpose**: Shared schemas, models, and utilities

**Exports**:
- Zod validation schemas
- Mongoose model creators
- Database methods
- Winston logger configuration
- Utility functions

**Key Functions**:
- `createModels(mongoose)` - Initialize all Mongoose models
- `createMethods(mongoose)` - Generate CRUD methods
- Type exports for TypeScript

### packages/api

**Purpose**: Backend API utilities and helpers

**Contents**:
- API-specific utilities
- Helper functions
- Shared backend logic

### packages/client

**Purpose**: Frontend shared utilities

**Contents**:
- UI component library
- Shared hooks
- Common utilities

---

## 🔧 Configuration System

### Environment Variables (.env)

**Server**:
```bash
HOST=localhost
PORT=3080
MONGO_URI=mongodb://127.0.0.1:27017/LibreChat
DOMAIN_CLIENT=http://localhost:3080
DOMAIN_SERVER=http://localhost:3080
```

**Authentication**:
```bash
JWT_SECRET=your-secret
JWT_REFRESH_SECRET=your-refresh-secret
SESSION_EXPIRY=1000 * 60 * 15  # 15 minutes
REFRESH_TOKEN_EXPIRY=1000 * 60 * 60 * 24 * 7  # 7 days
```

**AI Providers**:
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
AZURE_OPENAI_API_KEY=...
```

**Storage**:
```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=...
FIREBASE_CREDENTIALS=...
```

**n8n Integration** (custom):
```bash
VITE_N8N_WEBHOOK_URL=https://nadyaputriast-n8n.hf.space
```

### librechat.yaml

**Main Configuration File** for:
- AI endpoint definitions
- Custom endpoints (OpenAI-compatible)
- Interface customization
- Feature toggles
- File storage strategy
- Registration settings
- Rate limits
- Speech (TTS/STT) configuration
- Balance & transaction settings

**Example**:
```yaml
version: 1.2.1
cache: true

fileStrategy:
  avatar: "s3"
  image: "firebase"
  document: "local"

interface:
  endpointsMenu: true
  modelSelect: true
  agents: true
  fileSearch: true
  
registration:
  socialLogins: ['github', 'google', 'discord']
  
balance:
  enabled: true
  startBalance: 20000
```

---

## 🚀 Deployment Architecture

### Docker Compose Services

```yaml
services:
  api:                    # LibreChat backend
    image: ghcr.io/danny-avila/librechat-dev:latest
    ports: ["3080:3080"]
    depends_on: [mongodb, rag_api]
    
  mongodb:                # Primary database
    image: mongo
    command: mongod --noauth
    volumes: ["./data-node:/data/db"]
    
  meilisearch:           # Search engine
    image: getmeili/meilisearch:v1.12.3
    volumes: ["./meili_data_v1.12:/meili_data"]
    
  vectordb:              # PostgreSQL with pgvector
    image: pgvector/pgvector:0.8.0-pg15-trixie
    
  rag_api:               # RAG service
    image: ghcr.io/danny-avila/librechat-rag-api-dev-lite
    depends_on: [vectordb]
```

### Deployment Options

1. **Docker Compose** (Development/Self-hosted)
2. **Railway** (One-click deploy)
3. **Zeabur** (One-click deploy)
4. **Sealos** (One-click deploy)
5. **Kubernetes** (Helm charts available)
6. **Manual** (Node.js + MongoDB)

### Production Considerations

- Use Nginx/Caddy as reverse proxy
- Enable HTTPS (Let's Encrypt)
- Set up Redis for session storage
- Configure S3/Firebase for file storage
- Use managed MongoDB (Atlas)
- Set up monitoring (logs directory)
- Configure rate limiting
- Set proper TRUST_PROXY value

---

## 🧪 Testing Strategy

### Backend Testing
- **Framework**: Jest
- **API Testing**: Supertest
- **Mocking**: mongodb-memory-server
- **Coverage**: Jest coverage reports

**Test Files**:
- `api/models/*.spec.js` - Model tests
- `api/server/services/*.spec.js` - Service tests
- `api/server/controllers/*.spec.js` - Controller tests

### Frontend Testing
- **Framework**: Jest + React Testing Library
- **DOM Mocking**: jsdom
- **User Events**: @testing-library/user-event

**Test Files**:
- `client/src/**/__tests__/*.spec.tsx`

### E2E Testing
- **Framework**: Playwright
- **Configs**:
  - `e2e/playwright.config.local.ts` - Local testing
  - `e2e/playwright.config.ts` - CI testing
  - `e2e/playwright.config.a11y.ts` - Accessibility testing

**Commands**:
```bash
npm run e2e              # Run tests
npm run e2e:headed       # With browser
npm run e2e:debug        # Debug mode
npm run e2e:codegen      # Generate tests
```

---

## 🌍 Internationalization

### i18n Setup

**Languages Supported** (42+):
- English, 中文 (简体), 中文 (繁體), العربية
- Deutsch, Español, Français, Italiano
- Polski, Português, Русский, 日本語
- 한국어, Tiếng Việt, and many more

**Implementation**:
- **Library**: i18next
- **Detection**: i18next-browser-languagedetector
- **Files**: `client/src/locales/*/*.json`
- **Provider**: Locize (translation management)

**Translation Progress**: Tracked via Locize badge

---

## 📊 Admin Features

### User Management Scripts

Located in `config/`:

```bash
npm run create-user          # Create new user
npm run invite-user          # Send invitation
npm run ban-user            # Ban user account
npm run delete-user         # Delete user
npm run list-users          # List all users
npm run reset-password      # Reset user password
npm run user-stats          # User statistics
```

### Balance Management

```bash
npm run add-balance         # Add tokens to user
npm run set-balance         # Set token balance
npm run list-balances       # List all balances
```

### Database Management

```bash
npm run reset-meili-sync    # Reset Meilisearch sync
npm run flush-cache         # Clear Redis cache
npm run reset-terms         # Reset ToS acceptance
```

### Migration Scripts

```bash
npm run migrate:agent-permissions      # Migrate agent permissions
npm run migrate:prompt-permissions     # Migrate prompt permissions
```

---

## 🔌 Extension Points

### 1. Custom Endpoints

Add OpenAI-compatible APIs via `librechat.yaml`:

```yaml
endpoints:
  custom:
    - name: "My Custom LLM"
      apiKey: "${CUSTOM_API_KEY}"
      baseURL: "https://api.example.com/v1"
      models:
        default: ["my-model-1", "my-model-2"]
```

### 2. MCP (Model Context Protocol)

Integrate external tools and services:
- Server implementations: `api/server/services/MCP.js`
- Route handlers: `api/server/routes/mcp.js`
- Client UI: `client/src/components/MCP/`

### 3. Custom Authentication

Add new Passport strategies in `api/strategies/`

### 4. Plugin System

Located in `api/server/controllers/PluginController.js`

### 5. Webhook Integrations

n8n integration demonstrates webhook architecture:
- `api/server/routes/librechat-integration.js`
- Direct webhook endpoints for external systems

---

## 🛠️ Development Workflow

### Setup

```bash
# Clone repository
git clone https://github.com/danny-avila/LibreChat.git
cd LibreChat

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start MongoDB (or use Docker)
docker compose up -d mongodb

# Build packages
npm run build:packages

# Start backend
npm run backend:dev

# Start frontend (in another terminal)
npm run frontend:dev
```

### Build Process

**Packages** (must build first):
```bash
npm run build:data-provider    # Build data-provider
npm run build:data-schemas     # Build data-schemas
npm run build:api              # Build API package
npm run build:client-package   # Build client package
npm run build:packages         # Build all packages
```

**Frontend**:
```bash
npm run frontend              # Build for production
npm run frontend:dev          # Development server
```

**Backend**:
```bash
npm run backend               # Production mode
npm run backend:dev           # Development with nodemon
```

### Bun Support

LibreChat supports Bun as an alternative to npm:

```bash
bun run b:api                # Start backend with Bun
bun run b:client:dev         # Start frontend dev with Bun
bun run b:build:api          # Build API with Bun
bun run b:client             # Build client with Bun
```

---

## 🔍 Notable Patterns & Conventions

### 1. Module Aliases

Both backend and frontend use path aliases:

**Backend** (`api/`):
```javascript
// Using ~ alias
require('~/models/User')
require('~/db/connect')
require('~/server/services/AuthService')
```

**Frontend** (`client/src/`):
```javascript
// Using ~ alias
import { useAuth } from '~/hooks/AuthContext'
import Button from '~/components/ui/Button'
```

### 2. Error Handling

**Backend**:
- Global error controller: `api/server/middleware/ErrorController.js`
- Custom error classes
- Consistent error response format

**Frontend**:
- Error boundaries for React components
- API error watcher: `client/src/components/Auth/ApiErrorWatcher.jsx`
- Toast notifications for user-facing errors

### 3. Safe Middleware Loading

The server uses a `safeUse()` wrapper to gracefully handle missing middleware:

```javascript
const safeUse = (appInstance, middleware, name) => {
  try {
    if (middleware && typeof middleware === 'function') {
      appInstance.use(middleware);
      console.log(`[OK] Middleware loaded: ${name}`);
    }
  } catch (err) {
    console.error(`[ERROR] Failed to load middleware '${name}':`, err.message);
  }
};
```

This allows optional features (like n8n) to fail gracefully.

### 4. Data Provider Pattern

Centralized API access through `packages/data-provider`:

```javascript
// Frontend
import { useGetConversationsQuery } from 'librechat-data-provider/react-query'

// Backend
const { dataService } = require('librechat-data-provider')
```

### 5. Mongoose Model Creation

Models are created dynamically:

```javascript
// packages/data-schemas
const createModels = (mongoose) => {
  // Define all schemas
  // Register all models
  return models
}

// api/db/index.js
const { createModels } = require('@librechat/data-schemas')
createModels(mongoose)
```

---

## 🚨 Known Customizations (This Fork)

### n8n Integration

**What's Different**:
1. **External n8n Instance**: Uses hosted n8n at `https://nadyaputriast-n8n.hf.space`
2. **Middleware Additions**:
   - `api/server/middleware/loadN8nTools.js` - Loads workflows
   - `api/server/middleware/injectN8nTools.js` - Injects into AI context
3. **New Routes**:
   - `/api/n8n` - n8n proxy endpoints
   - `/api/n8n-tools` - Workflow tool management
   - `/api/librechat` - Direct webhook endpoints
4. **Services**:
   - `N8nToolService.js` - Workflow management
   - `N8nToolExecutor.js` - Tool execution
   - `N8nToolWrapper.js` - LangChain integration
5. **Workflows Directory**: `n8n-workflows/` (17 workflow files)

**Why This Matters**:
- AI models can trigger n8n workflows as function calls
- Extends LibreChat with no-code automation
- Workflows return structured data to chat

### Profile System

**New Feature**:
- `api/server/routes/profile.js` - Profile routes
- `api/server/controllers/ProfileController.js` - Profile logic
- `client/src/routes/ProfileRoute.tsx` - Profile page
- `client/src/components/Profile/` - 24 profile components

### GUIDE.md

Custom deployment guide specific to this fork's configuration.

---

## 💡 Key Insights for Building On This

### 1. Understanding the Request Flow

**Chat Message Flow**:
```
User types message in ChatRoute
    ↓
Input component captures text
    ↓
useSubmitMessage hook processes
    ↓
API POST /api/messages
    ↓
MessagesController handles request
    ↓
Determines AI provider (OpenAI, Anthropic, etc.)
    ↓
EndpointService executes provider logic
    ↓
Streams response back to client
    ↓
MessageContent component renders
```

### 2. Adding a New AI Provider

**Steps**:
1. Add provider config to `librechat.yaml`
2. Create service in `api/server/services/Endpoints/[provider]/`
3. Add UI components in `client/src/components/Endpoints/[provider]/`
4. Update schema in `packages/data-schemas/`
5. Add provider types to TypeScript definitions

**Reference**: Existing providers like `api/server/services/Endpoints/anthropic/`

### 3. Database Operations

**Pattern**:
```javascript
// Get model
const User = mongoose.model('User')

// Or use methods from api/models/
const { getConvo, saveConvo } = require('~/models')

// Direct Mongoose
const convo = await Conversation.findById(id)

// Using methods (recommended)
const convo = await getConvo(id)
```

### 4. Frontend Data Fetching

**Pattern**:
```javascript
// Use React Query hooks from data-provider
import { useGetConversationsQuery } from 'librechat-data-provider/react-query'

function MyComponent() {
  const { data, isLoading, error } = useGetConversationsQuery({
    pageNumber: 1,
  })
  
  // ...
}
```

### 5. Adding Middleware

**To add global middleware**:
```javascript
// api/server/index.js
const myMiddleware = require('./middleware/myMiddleware')

// Add after passport init, before routes
safeUse(app, myMiddleware, 'myMiddleware')
```

### 6. State Management Choice

**When to use what**:
- **React Query**: Server data (conversations, messages, users)
- **Recoil**: Global UI state (current conversation, modals)
- **Jotai**: Component-local state (form state)
- **useState**: Truly local component state

### 7. Agent & Tool Development

**Creating Custom Tools**:
1. Define tool schema in agent configuration
2. Implement tool execution logic
3. Register with MCP or custom tool registry
4. Tool becomes available to AI models

**n8n as Tools** (current implementation):
- Workflows defined in n8n
- Exposed as OpenAPI functions
- AI calls workflow, gets structured response

---

## 📈 Performance Considerations

### Backend Optimizations

1. **Connection Pooling**:
   - MongoDB: Configurable via `MONGO_MAX_POOL_SIZE`
   - Redis: ioredis automatic pooling

2. **Caching**:
   - Redis for sessions
   - Keyv for flexible caching
   - Static asset caching (1 year)
   - Response compression

3. **Database Indexing**:
   - Automatic index creation via Mongoose
   - Background index sync: `indexSync()`

4. **Rate Limiting**:
   - Redis-backed rate limiting
   - Per-IP file upload limits
   - Per-user API rate limits

### Frontend Optimizations

1. **Code Splitting**:
   - Route-based splitting (React Router)
   - Dynamic imports for large components
   - Vite chunking strategy

2. **Asset Optimization**:
   - Vite compression plugin
   - Image lazy loading (react-lazy-load-image-component)
   - Font optimization

3. **Rendering Optimization**:
   - React.memo for expensive components
   - useCallback/useMemo for expensive computations
   - Virtual scrolling (react-virtualized)

4. **State Management**:
   - Recoil selector caching
   - React Query stale-while-revalidate
   - Optimistic updates

---

## 🔮 Architecture Decisions

### Why Monorepo?

**Benefits**:
- Shared types between frontend/backend
- Consistent dependencies
- Easier refactoring
- Single source of truth

**Trade-offs**:
- Larger repository
- More complex build process
- All-or-nothing updates

### Why Multiple State Libraries?

**Recoil**: Complex global state with selectors
**Jotai**: Simpler atomic state
**React Query**: Server state is fundamentally different

**Verdict**: Each serves specific use case well

### Why Mongoose vs Prisma?

**Mongoose Chosen**:
- Better for dynamic schemas
- MongoDB-native features
- Middleware hooks
- Established in codebase

**Trade-off**: Less type safety than Prisma

### Why Express vs Fastify?

**Express Chosen**:
- Mature ecosystem
- More middleware options
- Team familiarity

**Trade-off**: Slower than Fastify, older API

---

## 📚 Learning Path for New Contributors

### 1. Start with Configuration
- Read `librechat.yaml` structure
- Understand `.env.example`
- Explore Docker setup

### 2. Backend Deep Dive
- `api/server/index.js` - Server startup
- `api/models/` - Data models
- `api/server/routes/convos.js` - Simple CRUD example
- `api/server/services/Endpoints/` - AI provider integration

### 3. Frontend Deep Dive
- `client/src/App.jsx` - App structure
- `client/src/routes/index.tsx` - Routing
- `client/src/components/Chat/` - Main UI
- `packages/data-provider/` - API client

### 4. Advanced Topics
- Agent system (`api/models/Agent.js`)
- Permission system (`api/server/services/PermissionService.js`)
- File handling (`api/server/services/Files/`)
- n8n integration (this fork)

### 5. Testing
- Run existing tests: `npm run test:api`
- Write a simple test
- Run E2E: `npm run e2e`

---

## 🎯 Common Tasks & Where to Start

### Task: Add a new API endpoint

**Files to modify**:
1. `api/server/routes/index.js` - Register route
2. Create `api/server/routes/myfeature.js` - Define routes
3. Create `api/server/controllers/MyFeatureController.js` - Logic
4. Update `packages/data-provider/` - Add API client function
5. Frontend: Use new API via React Query

### Task: Add a UI component

**Files to create/modify**:
1. `client/src/components/MyFeature/MyComponent.jsx`
2. Export from `client/src/components/MyFeature/index.ts`
3. Use in route or parent component
4. Add styles (Tailwind classes)
5. Add i18n strings in `client/src/locales/en/MyFeature.json`

### Task: Modify database schema

**Files to modify**:
1. `packages/data-schemas/src/schemas/myModelSchema.ts` - Define schema
2. `packages/data-schemas/src/models/myModel.ts` - Create model
3. Rebuild packages: `npm run build:data-schemas`
4. Add methods in `api/models/myModel.js` if needed

### Task: Add authentication strategy

**Files to create/modify**:
1. `api/strategies/myStrategy.js` - Implement strategy
2. `api/server/index.js` - Register with passport
3. `api/server/routes/auth.js` - Add routes
4. `client/src/components/Auth/` - Add UI component

### Task: Integrate external service

**Example: n8n integration in this fork**:
1. Create service: `api/server/services/MyServiceWrapper.js`
2. Add routes: `api/server/routes/myservice.js`
3. Add middleware if needed: `api/server/middleware/myServiceMiddleware.js`
4. Register in `api/server/index.js`
5. Add frontend UI: `client/src/components/MyService/`

---

## 🐛 Debugging Tips

### Backend Debugging

**Enable debug logging**:
```bash
# .env
DEBUG_LOGGING=true
DEBUG_CONSOLE=true
```

**Check logs**:
```bash
tail -f logs/error.log
tail -f logs/debug-YYYY-MM-DD.log
```

**Inspect database**:
```javascript
// Connect via MongoDB Compass
mongodb://127.0.0.1:27017/LibreChat
```

**Test API directly**:
```bash
curl -X POST http://localhost:3080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password"}'
```

### Frontend Debugging

**React Query Devtools**:
- Enabled in development
- Top-right corner toggle
- Inspect queries, mutations, cache

**Redux Devtools** (for Recoil):
```javascript
// Enable in development
<RecoilRoot>
  <RecoilDebugObserver />
  {/* ... */}
</RecoilRoot>
```

**Network Tab**:
- Check API requests
- Inspect request/response
- Check WebSocket connections (SSE)

**Console Logging**:
```javascript
// Temporary debugging
console.log('[DEBUG] Current state:', state)
```

---

## 🔗 Important File Locations

### Critical Backend Files
- `api/server/index.js` - Main server entry (367 lines)
- `api/models/Agent.js` - Agent model (29KB)
- `api/server/services/PermissionService.js` - Permissions (27KB)
- `api/db/connect.js` - MongoDB connection
- `packages/data-schemas/` - Shared schemas

### Critical Frontend Files
- `client/src/App.jsx` - App root
- `client/src/routes/index.tsx` - Routing
- `client/src/components/Chat/` - Main chat UI
- `client/src/hooks/AuthContext.tsx` - Auth state
- `packages/data-provider/react-query/` - API hooks

### Configuration Files
- `.env` - Environment variables
- `librechat.yaml` - Main config
- `docker-compose.yml` - Docker setup
- `package.json` - Dependencies (root, api, client)
- `vite.config.js` - Frontend build
- `eslint.config.mjs` - Linting

### Documentation Files
- `README.md` - Project overview
- `CHANGELOG.md` - Version history
- `GUIDE.md` - Deployment guide (custom)
- `.env.example` - Env template
- `librechat.example.yaml` - Config template

---

## 🚀 Next Steps for Building

When you're ready to build on this codebase:

1. **Choose Your Feature Area**:
   - New AI provider integration?
   - Enhanced agent capabilities?
   - Custom authentication?
   - UI/UX improvements?
   - External service integration?

2. **Study Similar Implementations**:
   - Look at existing providers in `api/server/services/Endpoints/`
   - Check how n8n integration was added (this fork)
   - Review agent system for extensibility patterns

3. **Plan Your Changes**:
   - What database changes needed?
   - What API endpoints required?
   - What frontend components?
   - What configuration options?

4. **Start Small**:
   - Create a minimal implementation
   - Test thoroughly
   - Iterate and expand

5. **Follow Patterns**:
   - Use existing patterns (safeUse, data-provider, etc.)
   - Maintain consistent error handling
   - Add TypeScript types
   - Include tests

---

## 📞 Additional Resources

- **Official Docs**: https://docs.librechat.ai
- **GitHub**: https://github.com/danny-avila/LibreChat
- **Discord**: https://discord.librechat.ai
- **Blog**: https://librechat.ai/blog
- **Translation**: Locize platform

---

**Last Updated**: Based on v0.8.1-rc2 codebase analysis
**Total Codebase Size**: ~150+ files in api/, ~200+ in client/src/
**Languages**: JavaScript, TypeScript, JSX/TSX
**Lines of Code**: Estimated 50,000+ (excluding node_modules)

This document provides a comprehensive foundation for understanding and building upon the LibreChat codebase. Refer to specific files mentioned for implementation details.
