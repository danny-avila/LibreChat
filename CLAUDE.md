# CLAUDE.md

# Regras gerais
- Se comunique em Portugues do Brasil
- Este é um Fork do librechat, mas estamos personalisando para uso vertical
- Não se limite a arquivo de configuração edite e crie arquivos sempre que necessario.

## 🔧 Ferramentas (Tools) - Quick Reference

📚 **Documentação completa: [`docs/TOOLS_GUIDE.md`](./docs/TOOLS_GUIDE.md)**

### Checklist Rápido para Nova Ferramenta
1. ✅ Criar: `api/app/clients/tools/structured/MinhaFerramenta.js`
2. ✅ Registrar: `manifest.json`
3. ✅ Exportar: `index.js`
4. ✅ Mapear: `handleTools.js`
5. ✅ API Key: `.env`
6. ✅ Docker: `docker-compose.override.yml`

### Comandos Essenciais
```bash
# Listar ferramentas
curl http://localhost:3080/api/agents/tools

# Rebuild Docker
sudo docker compose build --no-cache api

# Testar ferramenta
sudo docker compose exec api node -e "
const T = require('/app/api/app/clients/tools/structured/MinhaFerramenta.js');
console.log(new T({ override: true }).name);
"
```

### Troubleshooting
- **Não aparece?** → Check API key no `.env`
- **MODULE_NOT_FOUND?** → Não use `require('~/config')`
- **Cache?** → `docker compose down && up -d`

📖 Ver [`docs/TOOLS_GUIDE.md`](./docs/TOOLS_GUIDE.md) para:
- Exemplos práticos completos
- Integração com APIs externas
- Troubleshooting detalhado
- Boas práticas
- Lista completa de ferramentas disponíveis


This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Development Commands

### Development
```bash
# Start full stack with Docker
docker compose up -d

# Frontend development (port 5173)
npm run frontend:dev

# Backend development (port 3080)
npm run backend:dev

# Build frontend for production
npm run frontend

# Build packages before development
npm run build:data-provider
npm run build:api
```

### Testing
```bash
# Run backend tests
npm run test:api

# Run frontend tests
npm run test:client

# Run specific test file
npm run test:api -- path/to/test.spec.js

# E2E tests with Playwright
npm run e2e

# E2E in UI mode
npm run e2e:ui
```

### Code Quality
```bash
# Lint all code
npm run lint

# Format with Prettier
npm run format

# Update dependencies safely
npm run update
```

## High-Level Architecture

### Monorepo Structure
LibreChat uses npm workspaces with three main areas:
- **`/api`**: Express.js backend serving REST APIs and handling AI provider integrations
- **`/client`**: React frontend built with Vite, using Recoil/Jotai for state management
- **`/packages/*`**: Shared libraries used by both frontend and backend

### Data Flow Architecture
1. **Client** � Makes requests via React Query hooks from `packages/data-provider`
2. **API Gateway** � Express routes in `/api/server/routes` validate and process requests
3. **Service Layer** � `/api/server/services` handles business logic and AI provider orchestration
4. **AI Providers** � Unified interface in `/api/app/clients` abstracts different AI services (OpenAI, Anthropic, Google, etc.)
5. **Database Layer** � MongoDB models in `/packages/data-schemas` with Mongoose ODM
6. **Search Layer** � Meilisearch integration for conversation/message search
7. **Cache Layer** � Redis/Keyv for session management and caching

### AI Provider Integration Pattern
All AI providers follow a consistent pattern:
- Base client class in `/api/app/clients/BaseClient.js`
- Provider-specific implementations extend base class
- Unified message formatting through `/api/app/clients/prompts`
- Plugin system for extending functionality (`/api/app/clients/tools`)

### Authentication & Authorization
- Multi-strategy auth via Passport.js (`/api/strategies`)
- JWT for session management
- User permissions and roles in MongoDB
- Social auth providers (Google, GitHub, Discord, etc.)

### File Handling System
- Strategy pattern for storage: local, S3, Firebase (`/api/server/services/Files`)
- Multipart upload handling with image optimization
- File associations tracked in MongoDB

### Agent System Architecture
- Agents defined in `/api/models/Agent.js`
- MCP (Model Context Protocol) server integration in `/packages/api`
- Tool execution framework in `/api/app/clients/tools`
- Agent marketplace and sharing capabilities

### Frontend State Management
- **Recoil**: Global application state (conversations, messages, settings)
- **Jotai**: Lightweight atoms for UI state
- **React Query**: Server state management and caching
- **Custom hooks**: Located in `/client/src/hooks` for business logic

### Configuration System
- **librechat.yaml**: Main configuration file for endpoints, models, and features
- **Environment variables**: Sensitive configuration in `.env`
- **Dynamic loading**: Configuration parsed at startup in `/api/server/services/Config`

### Database Schema Relationships
- **User** � has many **Conversations**
- **Conversation** � has many **Messages**
- **Message** � belongs to **User** and **Conversation**
- **Agent** � belongs to **User**, can be shared
- **File** � belongs to **User**, associated with **Messages**

### Docker Architecture
The docker-compose setup includes:
- **LibreChat**: Main application container
- **MongoDB**: Primary database
- **Meilisearch**: Search engine
- **PostgreSQL + pgvector**: Vector database for RAG
- **RAG API**: Separate service for retrieval-augmented generation

### TypeScript Migration Status
- Frontend: ~90% complete (client directory)
- Packages: Fully TypeScript
- Backend: JavaScript (TypeScript migration planned)

When modifying code:
- Frontend components use TypeScript interfaces in `/client/src/types`
- API responses follow schemas in `/packages/data-schemas`
- New frontend code should be TypeScript
- Backend remains JavaScript for now