# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Security Guidelines

**CRITICAL: API Keys and Secrets**

- **NEVER** commit API keys, secrets, or credentials directly in any files (code, documentation, configs)
- **ALWAYS** use placeholders in documentation (e.g., `<your-api-key>`, `<your-secret>`)
- API keys and secrets belong **ONLY** in `.env` files (which are gitignored)
- When documenting configuration:
  - Use: `OPENROUTER_KEY=<your-openrouter-api-key>`
  - Never: `OPENROUTER_KEY=sk-or-v1-actual-key-here`
- For security-sensitive values (JWT secrets, encryption keys, database passwords):
  - Provide generation instructions (e.g., `openssl rand -hex 32`)
  - Never include actual values, even as examples
- Double-check any documentation changes before committing

## Project Overview

LibreChat is an all-in-one AI conversations platform that integrates multiple AI models (OpenAI, Anthropic, Google, Azure, AWS Bedrock, custom endpoints) with advanced features like agents, RAG, code interpreter, and multi-user support. The project is a full-stack application with a monorepo structure using npm workspaces.

## Architecture

### Monorepo Structure

- **`api/`**: Backend Express.js server (Node.js)
  - `server/`: Express app initialization, routes, middleware, controllers
  - `models/`: Mongoose schemas (User, Conversation, Message, Agent, etc.)
  - `strategies/`: Authentication strategies (JWT, OAuth, LDAP)
  - `db/`: Database connection and MeiliSearch indexing
  - `utils/`, `cache/`, `app/`, `lib/`: Shared utilities and services

- **`client/`**: Frontend React/Vite application (TypeScript)
  - `src/components/`: React components
  - `src/hooks/`: Custom React hooks
  - `src/store/`: Recoil state management
  - `src/data-provider/`: API integration layer
  - `src/routes/`: React Router configuration
  - `src/locales/`: i18n translations

- **`packages/`**: Shared packages used by both frontend and backend
  - `data-provider/`: Shared data fetching and mutation logic
  - `data-schemas/`: TypeScript schemas and Zod validators
  - `api/`: Shared API utilities and middleware
  - `client/`: Shared frontend utilities

### Key Technologies

- **Backend**: Express.js, Mongoose (MongoDB), Passport.js, Redis/KeyV (caching), MeiliSearch (search)
- **Frontend**: React 18, TypeScript, Vite, TanStack Query (react-query), Recoil, Tailwind CSS, Radix UI
- **Testing**: Jest (unit), Playwright (E2E)
- **Infrastructure**: Docker Compose, MongoDB, MeiliSearch, PostgreSQL (pgvector for RAG)

### Data Flow

1. Client makes requests through `librechat-data-provider` package
2. API routes in `api/server/routes/` handle requests
3. Controllers in `api/server/controllers/` process business logic
4. Models in `api/models/` interact with MongoDB
5. Shared schemas in `packages/data-schemas/` ensure type safety
6. Services in `api/server/services/` handle complex operations (OAuth, file storage, MCP servers)

### Authentication

- Multiple strategies: JWT, OAuth2 (Google, GitHub, Discord, Facebook, Apple), LDAP, SAML
- Session management with express-session + Redis/Memorystore
- Passport.js for authentication middleware

### AI Integration Architecture

- Multiple endpoint types configured in `librechat.yaml`
- Each AI provider has its own implementation in `packages/api/src/endpoints/`
- Agents built on `@librechat/agents` package with tool/action support
- RAG API runs as separate service (rag_api) using pgvector

## Development Commands

### Installation & Setup

```bash
# Standard install
npm run reinstall

# Using Bun (faster)
npm run b:reinstall

# Docker-based install
npm run reinstall:docker
```

### Running the Application

```bash
# Development mode (runs both frontend and backend)
npm run backend:dev       # Backend only on port 3080
npm run frontend:dev      # Frontend only on port 3090

# Production mode
npm run backend          # Runs api/server/index.js
npm run frontend         # Builds client
```

### Testing

```bash
# Run all tests
npm run test:client      # Client tests with Jest
npm run test:api         # API tests with Jest

# E2E tests (Playwright)
npm run e2e              # Headless mode
npm run e2e:headed       # With browser UI
npm run e2e:debug        # Debug mode with PWDEBUG
npm run e2e:a11y         # Accessibility tests

# Single test file
cd api && npm test -- path/to/test.spec.js
cd client && npm test -- path/to/test.spec.tsx

# Watch mode
cd api && npm test
cd client && npm test
```

### Building

```bash
# Build all packages (required before frontend build)
npm run build:packages

# Build individual packages
npm run build:data-provider
npm run build:data-schemas
npm run build:api
npm run build:client-package

# Build frontend (includes package builds)
npm run frontend
```

### Code Quality

```bash
npm run lint             # Lint all files
npm run lint:fix         # Auto-fix linting issues
npm run format           # Format with Prettier

# Type checking (client)
cd client && npm run typecheck
```

### Database & User Management

```bash
# User operations
npm run create-user      # Create new user
npm run invite-user      # Generate invitation link
npm run list-users       # List all users
npm run ban-user         # Ban a user
npm run delete-user      # Delete a user
npm run reset-password   # Reset user password

# Balance management
npm run add-balance      # Add balance to user
npm run set-balance      # Set user balance
npm run list-balances    # List all balances
npm run user-stats       # Show user statistics

# MeiliSearch
npm run reset-meili-sync # Reset MeiliSearch synchronization

# Migrations
npm run migrate:agent-permissions
npm run migrate:prompt-permissions
```

### Docker Operations

```bash
# Deployed environment
npm run start:deployed   # Start with deploy-compose.yml
npm run stop:deployed    # Stop deployed containers
npm run update:deployed  # Update deployed version
```

## Testing Practices

### Backend Testing

- Tests are in `api/test/` and alongside source files as `*.spec.js`
- Uses Jest with MongoDB Memory Server for integration tests
- Run tests before committing changes
- Test files mirror the structure of source files

### Frontend Testing

- Tests in `client/test/` and alongside components as `*.test.tsx`
- Uses React Testing Library + Jest
- Test coverage for hooks, components, and utilities

### E2E Testing

- Playwright tests in `e2e/` directory
- Tests run against local server (port 3080)
- Auth state stored in `e2e/storageState.json`
- Run `npm run e2e:login` to generate auth credentials

## Important Patterns

### Model Schemas

- Mongoose models in `api/models/` define MongoDB collections
- Key models: User, Conversation, Message, Agent, Prompt, File, Transaction
- Models use Mongoose plugins for timestamps, soft deletes, and indexing
- Shared methods in files like `userMethods.js`, `balanceMethods.js`

### API Routes Pattern

Routes follow REST conventions:
- `GET /api/resource` - List/search
- `GET /api/resource/:id` - Get single
- `POST /api/resource` - Create
- `PUT/PATCH /api/resource/:id` - Update
- `DELETE /api/resource/:id` - Delete

### State Management

- **Recoil** for global state (user, conversations, messages)
- **TanStack Query** for server state and caching
- **Jotai** for some component-level state
- Atoms defined in `client/src/store/`

### Configuration

- Environment variables in `.env` (see `.env.example`)
- Application config in `librechat.yaml` for:
  - AI endpoints (custom, OpenAI, Anthropic, etc.)
  - MCP servers (Model Context Protocol)
  - Interface settings
  - Rate limits
  - File upload settings
- Docker config in `docker-compose.yml`
- Senticor-specific config documented in `README-Senticor.md`

### File Structure Conventions

- Keep route handlers thin - delegate to controllers
- Put business logic in services, not controllers
- Shared utilities go in `packages/` if used by both frontend and backend
- Component files should be in PascalCase (e.g., `ChatInput.tsx`)
- Utility files in camelCase (e.g., `formatDate.ts`)

## Common Development Workflows

### Adding a New API Endpoint

1. Create route in `api/server/routes/`
2. Create controller in `api/server/controllers/`
3. Add model if needed in `api/models/`
4. Add data provider hooks in `packages/data-provider/src/`
5. Update TypeScript types in `packages/data-schemas/src/types/`
6. Write tests in `api/test/`
7. Run tests before committing

### Adding a New Frontend Feature

1. Create component in `client/src/components/`
2. Add hooks in `client/src/hooks/` if needed
3. Add state in `client/src/store/` if global state needed
4. Update data provider in `packages/data-provider/`
5. Add translations in `client/src/locales/`
6. Write tests in `client/test/`
7. Run tests and type checking before committing

### Working with Agents

- Agents use the `@librechat/agents` package (external dependency)
- Agent definitions stored in `Agent` model (`api/models/Agent.js`)
- Agent execution happens in `api/server/services/`
- Tools/actions defined separately and linked to agents
- MCP (Model Context Protocol) servers configured in:
  - `librechat.yaml` under `mcpServers` section
  - Initialized by `api/server/services/initializeMCPs.js`
  - See `MCP-SETUP.md` for setup instructions

### Database Migrations

- No formal migration system; changes applied through model updates
- For data migrations, create scripts in `config/` directory
- Test migrations with `--dry-run` flag when available
- Always backup database before running migrations

## Development Environment

### Prerequisites

- Node.js 18+ (or Bun for faster builds)
- MongoDB (can use Docker)
- Redis (optional but recommended for production)
- MeiliSearch (optional, for search features)

### Docker Development

The `docker-compose.yml` includes:
- LibreChat API service (port 3080)
- MongoDB (port 27017)
- MeiliSearch (port 7700)
- PostgreSQL with pgvector (for RAG)
- RAG API service (port 8000)

### Environment Variables

Critical variables (see `.env.example` for full list):
- `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET`: Authentication secrets
- AI provider API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
- `MEILI_HOST`, `MEILI_MASTER_KEY`: MeiliSearch config
- `PORT`, `HOST`: Server configuration

## Package Inter-dependencies

Build order matters:
1. `packages/data-schemas` (no dependencies)
2. `packages/data-provider` (depends on data-schemas)
3. `packages/api` (depends on data-schemas)
4. `packages/client` (depends on data-provider, api, data-schemas)
5. `client/` (frontend - depends on all packages)

Always run `npm run build:packages` after modifying package code before testing in client or api.

## AI Provider Integration

- Providers configured in `librechat.yaml` under `endpoints` section
- Each provider has custom logic in `packages/api/src/endpoints/`
- Shared endpoint logic in `packages/api/src/app/`
- Authentication/authorization per provider in middleware
- Custom endpoints allow any OpenAI-compatible API

## Localization

- Translation files in `client/src/locales/[lang]/`
- Managed through Locize platform
- Use i18next hooks: `useTranslation()`, `t()`
- Add new keys to `translation.json` for each language
- Translations synced from Locize in CI/CD
