# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LibreChat-FIPS is a fork of [LibreChat](https://github.com/danny-avila/LibreChat) (v0.8.1-rc2) customized for FIPS-compliant deployment on Red Hat OpenShift. It's an all-in-one AI chat platform supporting multiple model providers (OpenAI, Anthropic, Google, AWS Bedrock, custom/local endpoints) with agents, MCP servers, and multi-user auth.

## Common Commands

### Install & Build

```bash
npm ci                          # Install dependencies
npm run build:packages          # Build shared packages (required order: data-provider -> data-schemas -> api -> client)
npm run frontend                # Build all packages + Vite client bundle (production)
```

### Development Servers

```bash
npm run backend:dev             # API server with nodemon (port 3080)
npm run frontend:dev            # Vite dev server with HMR
```

### Testing

```bash
npm run test:api                # Backend tests (jest --ci)
npm run test:client             # Frontend tests (jest --ci)
cd api && npx jest path/to/test.spec.js           # Single API test
cd client && npx jest src/components/Foo.test.tsx  # Single client test

# Package-level tests (with coverage)
cd packages/data-provider && npm run test:ci
cd packages/data-schemas && npm run test:ci
cd packages/api && npm run test:ci

# E2E
npm run e2e                     # Playwright headless
npm run e2e:headed              # With browser visible
```

### Lint & Format

```bash
npm run lint                    # ESLint (no fix)
npm run lint:fix                # ESLint with auto-fix
npm run format                  # Prettier --write
cd client && npm run typecheck  # TypeScript type check (client only)
```

Pre-commit hooks run `lint-staged` automatically: prettier + eslint on JS/TS/JSX/TSX, prettier on JSON.

### OpenShift Deployment

```bash
make deploy NAMESPACE=librechat-fips    # Deploy via Helm
make status NAMESPACE=librechat-fips    # Show pods/services/routes
make logs NAMESPACE=librechat-fips      # Follow app logs
make update-config NAMESPACE=librechat-fips  # Push updated librechat.yaml ConfigMap + rollout
make restart NAMESPACE=librechat-fips   # Rolling restart
make url NAMESPACE=librechat-fips       # Print app URL
make test-health NAMESPACE=librechat-fips
```

## Architecture

### Monorepo Structure (npm workspaces)

The project has four workspace members that must be built in dependency order:

1. **`packages/data-provider`** (`librechat-data-provider`) - Shared API contract: endpoint URL builders, Axios request layer with JWT refresh, React Query hooks, TypeScript types/enums. Used by both client and API.
2. **`packages/data-schemas`** (`@librechat/data-schemas`) - Mongoose schemas, model factories, Winston logger. Used by API-side code.
3. **`packages/api`** (`@librechat/api`) - MCP system, agents engine (LangChain-based), caching layer, OAuth, crypto, tools. Used by the API server.
4. **`packages/client`** (`@librechat/client`) - Shared React components, hooks, store, theming.

### API Server (`api/`)

- **Express.js** with Passport.js auth (JWT, OpenID, LDAP, SAML, social OAuth)
- Entry: `api/server/index.js`
- AI provider clients: `api/app/clients/` (OpenAIClient, AnthropicClient, GoogleClient, OllamaClient extending BaseClient)
- Endpoint initialization: `api/server/services/Endpoints/` - each provider has an `initialize.js`
- MongoDB via Mongoose; optional Redis for caching/rate-limiting
- MeiliSearch for full-text search
- Middleware stack in `api/server/middleware/` (auth, rate limiting, RBAC, request validation, ban checks)

### Client (`client/`)

- **React + Vite** SPA, being migrated from JS to TypeScript
- Communicates with API via hooks from `packages/data-provider` (React Query)
- AI streaming via SSE (Server-Sent Events)
- Tailwind CSS for styling

### Configuration

- **`librechat.yaml`** - Primary app config: MCP servers, custom endpoints, memory, interface settings, rate limits, file storage strategy. Loaded at runtime, supports `CONFIG_PATH` env var override.
- **`.env`** - Credentials and feature flags (see `.env.example` for full reference)
- **`helm/librechat/`** - Helm chart with `values-openshift.yaml` for OpenShift deploys

### MCP System (`packages/api/src/mcp/`)

- `MCPManager` - singleton managing all server connections
- `MCPServersRegistry` - registry of server configs from `librechat.yaml`
- Supports `stdio` and `sse` transports
- OAuth reconnection support
- MCP servers configured under `mcpServers:` in `librechat.yaml`

### Database

- MongoDB + Mongoose exclusively
- Schemas in `packages/data-schemas/src/schema/`
- Connection in `api/db/connect.js`
- Key models: User, Conversation, Message, Agent, File, Transaction, Session, Balance

## Conventions

- **Commit format**: Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`, `test:`)
- **Branch naming**: Slash-based (`fix/description`, `feat/description`, `new/feature/x`)
- **File naming**: camelCase for JS/TS; PascalCase for React components (`.tsx`)
- **Import order** (ESLint-enforced): npm packages -> TypeScript types -> local imports, each group sorted longest to shortest
- **Frontend migration**: JS -> TypeScript is ongoing; new frontend code should be TypeScript
- **Backend**: Remains JavaScript/Express.js

## FIPS Compliance Notes

This fork replaces non-FIPS algorithms:
- **bcrypt -> PBKDF2-HMAC-SHA256** for password hashing
- **HMAC-SHA1 -> HMAC-SHA256** for TOTP
- Uses Red Hat UBI 9 / `nodejs-20` base image with FIPS-validated OpenSSL 3.0
- Build with `Containerfile.fips` (on the `feat/fips-openshift-deployment` branch)
- Breaking change: existing deployments with bcrypt passwords require reset on migration
