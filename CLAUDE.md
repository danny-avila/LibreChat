# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LibreChat is a full-stack AI chat application with a React frontend and Node.js/Express backend. It supports multiple AI providers (OpenAI, Anthropic, Google, Azure, AWS Bedrock, etc.) and features like agents, assistants, file uploads, and MCP (Model Context Protocol) integration.

## Monorepo Structure

This is an npm workspaces monorepo with the following structure:

```
LibreChat/
├── api/                    # Express backend (Node.js)
│   ├── app/clients/        # AI provider clients (Anthropic, Google, OpenAI, Ollama)
│   ├── models/             # Mongoose models and database logic
│   └── server/             # Express routes, middleware, services
├── client/                 # React frontend (Vite + TypeScript)
│   └── src/
│       ├── components/     # React components
│       ├── hooks/          # Custom React hooks
│       ├── Providers/      # React context providers
│       └── store/          # State management (Jotai/Recoil)
└── packages/               # Shared libraries
    ├── api/                # @librechat/api - MCP services, agents, caching
    ├── client/             # @librechat/client - Shared React components
    ├── data-provider/      # librechat-data-provider - API client, types, schemas
    └── data-schemas/       # @librechat/data-schemas - Mongoose schemas/models
```

## Common Commands

### Development
```bash
npm run backend:dev          # Start backend with nodemon (hot reload)
npm run frontend:dev         # Start Vite dev server for client
npm run frontend             # Build all packages and client for production
```

### Building Packages
```bash
npm run build:packages       # Build all shared packages
npm run build:data-provider  # Build data-provider package
npm run build:data-schemas   # Build data-schemas package
npm run build:api            # Build @librechat/api package
npm run build:client-package # Build @librechat/client package
```

### Testing
```bash
npm run test:api             # Run API tests (Jest)
npm run test:client          # Run client tests (Jest)
npm run e2e                  # Run Playwright e2e tests locally
npm run e2e:headed           # Run e2e tests with browser visible
```

### Linting & Formatting
```bash
npm run lint                 # Run ESLint
npm run lint:fix             # Run ESLint with auto-fix
npm run format               # Run Prettier
```

### Docker
```bash
docker compose up -d         # Start all services (MongoDB, MeiliSearch, RAG API)
npm run start:deployed       # Start production Docker deployment
npm run stop:deployed        # Stop Docker deployment
```

## Architecture Notes

### AI Provider Clients
Located in `api/app/clients/`, each client extends `BaseClient.js`:
- `AnthropicClient.js` - Claude models
- `GoogleClient.js` - Gemini models (supports both API and Vertex AI)
- `OpenAIClient.js` - OpenAI and Azure OpenAI
- `OllamaClient.js` - Local Ollama models

### Data Flow
1. Frontend uses `librechat-data-provider` for API calls (React Query hooks)
2. Backend routes in `api/server/routes/` handle requests
3. Services in `api/server/services/` contain business logic
4. Database operations via Mongoose models in `packages/data-schemas/`

### Configuration
- `librechat.yaml` - Main configuration (endpoints, UI, features)
- `.env` - Environment variables (API keys, database, auth)
- See `librechat.example.yaml` and `.env.example` for all options

### Key Technologies
- **Frontend**: React 18, Vite, TailwindCSS, Radix UI, Jotai/Recoil, React Query
- **Backend**: Express, MongoDB/Mongoose, Passport.js
- **AI**: LangChain, @librechat/agents, MCP SDK
- **Search**: MeiliSearch for message/conversation search

## Package Dependencies

When modifying shared packages, rebuild them before testing:
1. `npm run build:data-provider` - Core types and API client
2. `npm run build:data-schemas` - Database schemas (depends on data-provider)
3. `npm run build:api` - Server utilities (depends on data-schemas)
4. `npm run build:client-package` - Shared React components

## Testing Conventions

- Test files use `.spec.js`, `.spec.ts`, `.test.js`, or `.test.tsx` extensions
- API tests: `cd api && npm run test:ci`
- Client tests: `cd client && npm run test:ci`
- Package tests: `cd packages/<name> && npm run test:ci`
- Run single test: `npx jest <path-to-test> --no-coverage`

## Documentation

- Official docs: https://librechat.ai/docs
- Configuration guide: https://librechat.ai/docs/configuration
- YAML structure: https://librechat.ai/docs/configuration/librechat_yaml
