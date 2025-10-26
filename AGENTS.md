# LibreChat AGENTS.md

LibreChat is a multi-provider AI chat platform featuring agents, tools, and multimodal interactions. This file provides guidance for AI coding agents working on the codebase.

## Project Overview

LibreChat is a monorepo-based full-stack application providing a unified interface for multiple AI models and providers (OpenAI, Anthropic, Google Gemini, Azure, AWS Bedrock, Groq, Mistral, and more).

## Workspace Structure

LibreChat uses npm workspaces to organize code into distinct packages with clear responsibilities:

```
LibreChat/
├── api/                          # Express.js backend (CJS, transitioning to TypeScript)
├── client/                       # React/Vite frontend application
└── packages/
    ├── api/                      # @librechat/api - Backend TypeScript package
    ├── client/                   # @librechat/client - Frontend shared components
    ├── data-provider/            # librechat-data-provider - Shared frontend/backend
    └── data-schemas/             # @librechat/data-schemas - Backend schemas & models
```

### Workspace Responsibilities

#### `/api` - Express.js Backend
- **Language**: CommonJS JavaScript (transitioning to TypeScript via shared packages)
- **Purpose**: Main Express.js server, routes, middleware, legacy services
- **Note**: Legacy workspace; **new backend logic should go in `packages/api` instead**
- **Uses**: `librechat-data-provider`, `@librechat/api`, `@librechat/data-schemas`

#### `/client` - React Frontend Application
- **Language**: TypeScript + React
- **Purpose**: Main web application UI
- **Uses**: `librechat-data-provider`, `@librechat/client`

#### `/packages/api` - `@librechat/api`
- **Language**: TypeScript (full support)
- **Purpose**: Backend-only package for all new backend logic
- **Used by**: `/api` workspace and potentially other backend projects
- **Key Modules**: Agents, MCP, tools, file handling, endpoints, authentication, caching, middleware
- **Critical**: **All new backend logic should be coded here first and foremost for full TypeScript support**
- **Depends on**: `@librechat/data-schemas`

#### `/packages/client` - `@librechat/client`
- **Language**: TypeScript + React
- **Purpose**: Reusable React components, hooks, and utilities
- **Used by**: `/client` workspace and other LibreChat team frontend repositories
- **Exports**: Common components, hooks, SVG icons, theme utilities, localization

#### `/packages/data-provider` - `librechat-data-provider`
- **Language**: TypeScript
- **Purpose**: **App-wide shared package** used by both frontend and backend
- **Scope**: Universal - used everywhere
- **Exports**: Data services, API endpoints, type definitions, utilities, React Query hooks
- **Note**: Foundation package that all other workspaces depend on

#### `/packages/data-schemas` - `@librechat/data-schemas`
- **Language**: TypeScript
- **Purpose**: Backend-only schemas, models, and data validation
- **Used by**: Backend workspaces only (`@librechat/api`, `/api`)
- **Exports**: Mongoose models, Zod schemas, database utilities, configuration schemas

## Build System & Dependencies

### Build Order

The build system has a specific dependency chain that must be followed:

```bash
# Full frontend build command:
npm run frontend
```

**Execution order:**
1. `librechat-data-provider` - Foundation package (all depend on this)
2. `@librechat/data-schemas` - Required by `@librechat/api`
3. `@librechat/api` - Backend TypeScript package
4. `@librechat/client` - Frontend shared components
5. `/client` - Final frontend compilation

### Individual Build Commands

Packages can be built separately as needed:

```bash
npm run build:data-provider      # Build librechat-data-provider
npm run build:data-schemas       # Build @librechat/data-schemas
npm run build:api                # Build @librechat/api
npm run build:client-package     # Build @librechat/client
npm run build:client             # Build /client frontend app
npm run build:packages           # Build all packages (excludes /client app)
```

**Note**: Not all packages need rebuilding for every change - only rebuild when files in that specific workspace are modified.

## Development Workflow

### Running Development Servers

```bash
# Backend
npm run backend:dev              # Runs /api workspace with nodemon

# Frontend  
npm run frontend:dev             # Runs /client with Vite dev server

# Both (not recommended for active development)
npm run dev
```

### Where to Place New Code

#### Backend Logic
- **Primary location**: `/packages/api/src/` - Full TypeScript support
- **Legacy location**: `/api/` - Only for modifying existing CJS code
- **Strategy**: Prefer `@librechat/api` for all new features, utilities, and services

#### Frontend Components
- **Reusable components**: `/packages/client/src/components/`
- **App-specific components**: `/client/src/components/`
- **Strategy**: If it could be reused in other frontend projects, put it in `@librechat/client`

#### Shared Types & Utilities
- **Universal (frontend + backend)**: `/packages/data-provider/src/`
- **Backend-only**: `/packages/data-schemas/src/` or `/packages/api/src/`
- **Frontend-only**: `/packages/client/src/`

#### Database Models & Schemas
- **Always**: `/packages/data-schemas/src/models/` or `/packages/data-schemas/src/schema/`

## Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Passport.js (OAuth2, OpenID, LDAP, SAML, JWT)
- **AI Integration**: LangChain, direct SDK integrations
- **Streaming**: Server-Sent Events (SSE)

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **State Management**: Recoil
- **Styling**: TailwindCSS
- **UI Components**: Radix UI, Headless UI
- **Data Fetching**: TanStack Query (React Query)
- **HTTP Client**: Axios

### Package Manager
- **Primary**: npm (workspaces)
- **Alternative**: pnpm (compatible), bun (experimental scripts available)

## Configuration

### Environment Variables
- `.env` - Local development (never commit)
- `docker-compose.override.yml.example` - Example for Docker environment configuration
- Validate on server startup

### librechat.yaml
Main configuration for:
- AI provider endpoints
- Model configurations
- Agent and tool settings
- Authentication options

## Code Quality & Standards

### General Guidelines
- Use TypeScript for all new code (especially in `packages/`)
- Follow existing ESLint/Prettier configurations (formatting issues will be fixed manually)
- Keep functions focused and modular
- Handle errors appropriately with proper HTTP status codes

### File Naming
- React components: `PascalCase.tsx` (e.g., `ChatInterface.tsx`)
- Utilities: `camelCase.ts` (e.g., `formatMessage.ts`)
- Test files: `*.spec.ts` or `*.test.ts`

## Key Architectural Patterns

### Multi-Provider Pattern
Abstract AI provider implementations to support multiple services uniformly:
- Provider services implement common interfaces
- Handle streaming via SSE
- Support both completion and chat endpoints

### Agent System
- Built on LangChain
- Agent definitions in `packages/api/src/agents/`
- Tools in `packages/api/src/tools/`
- MCP (Model Context Protocol) support in `packages/api/src/mcp/`

### Data Layer
- `librechat-data-provider` provides unified data access
- React Query for frontend data fetching
- Backend services use Mongoose models from `@librechat/data-schemas`

## Testing

```bash
npm run test:api                 # Backend tests
npm run test:client              # Frontend tests
npm run e2e                      # Playwright E2E tests
```

## Common Pitfalls

1. **Wrong workspace for backend code**: New backend logic belongs in `/packages/api`, not `/api`
  - The `/api` workspace is still necessary as it's used to run the Express.js server, but all new logic should be written in TypeScript in `/packages/api` as much as possible. Existing logic should also be converted to TypeScript if possible.
2. **Build order matters**: Can't build `@librechat/api` before `@librechat/data-schemas`
3. **Unnecessary rebuilds**: Only rebuild packages when their source files change
4. **Import paths**: Use package names (`@librechat/api`) not relative paths across workspaces
5. **TypeScript vs CJS**: `/api` is still CJS; use `packages/api` for TypeScript

## Getting Help

- **Documentation**: https://docs.librechat.ai
- **Discord**: Active community support
- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: General questions and ideas

---

**Remember**: The monorepo structure exists to enforce separation of concerns. Respect workspace boundaries and build dependencies. When in doubt about where code should live, consider:
- Is it backend logic? → `packages/api/src/`
- Is it a database model? → `packages/data-schemas/src/`
- Is it shared between frontend/backend? → `packages/data-provider/src/`
- Is it a reusable React component? → `packages/client/src/`
- Is it app-specific UI? → `client/src/`

