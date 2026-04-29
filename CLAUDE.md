# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# LibreChat

## Project Overview

LibreChat is a monorepo with the following key workspaces:

| Workspace | Language | Side | Dependency | Purpose |
|---|---|---|---|---|
| `/api` | JS (legacy) | Backend | `packages/api`, `packages/data-schemas`, `packages/data-provider`, `@librechat/agents` | Express server — minimize changes here |
| `/packages/api` | **TypeScript** | Backend | `packages/data-schemas`, `packages/data-provider` | New backend code lives here (TS only, consumed by `/api`) |
| `/packages/data-schemas` | TypeScript | Backend | `packages/data-provider` | Database models/schemas, shareable across backend projects |
| `/packages/data-provider` | TypeScript | Shared | — | Shared API types, endpoints, data-service — used by both frontend and backend |
| `/client` | TypeScript/React | Frontend | `packages/data-provider`, `packages/client` | Frontend SPA |
| `/packages/client` | TypeScript | Frontend | `packages/data-provider` | Shared frontend utilities |

The source code for `@librechat/agents` (major backend dependency, same team) is at `/home/danny/agentus`.

---

## Workspace Boundaries

- **All new backend code must be TypeScript** in `/packages/api`.
- Keep `/api` changes to the absolute minimum (thin JS wrappers calling into `/packages/api`).
- Database-specific shared logic goes in `/packages/data-schemas`.
- Frontend/backend shared API logic (endpoints, types, data-service) goes in `/packages/data-provider`.
- Build data-provider from project root: `npm run build:data-provider`.

---

## Code Style

### Naming and File Organization

- **Single-word file names** whenever possible (e.g., `permissions.ts`, `capabilities.ts`, `service.ts`).
- When multiple words are needed, prefer grouping related modules under a **single-word directory** rather than using multi-word file names (e.g., `admin/capabilities.ts` not `adminCapabilities.ts`).
- The directory already provides context — `app/service.ts` not `app/appConfigService.ts`.

### Structure and Clarity

- **Never-nesting**: early returns, flat code, minimal indentation. Break complex operations into well-named helpers.
- **Functional first**: pure functions, immutable data, `map`/`filter`/`reduce` over imperative loops. Only reach for OOP when it clearly improves domain modeling or state encapsulation.
- **No dynamic imports** unless absolutely necessary.

### DRY

- Extract repeated logic into utility functions.
- Reusable hooks / higher-order components for UI patterns.
- Parameterized helpers instead of near-duplicate functions.
- Constants for repeated values; configuration objects over duplicated init code.
- Shared validators, centralized error handling, single source of truth for business rules.
- Shared typing system with interfaces/types extending common base definitions.
- Abstraction layers for external API interactions.

### Iteration and Performance

- **Minimize looping** — especially over shared data structures like message arrays, which are iterated frequently throughout the codebase. Every additional pass adds up at scale.
- Consolidate sequential O(n) operations into a single pass whenever possible; never loop over the same collection twice if the work can be combined.
- Choose data structures that reduce the need to iterate (e.g., `Map`/`Set` for lookups instead of `Array.find`/`Array.includes`).
- Avoid unnecessary object creation; consider space-time tradeoffs.
- Prevent memory leaks: careful with closures, dispose resources/event listeners, no circular references.

### Type Safety

- **Never use `any`**. Explicit types for all parameters, return values, and variables.
- **Limit `unknown`** — avoid `unknown`, `Record<string, unknown>`, and `as unknown as T` assertions. A `Record<string, unknown>` almost always signals a missing explicit type definition.
- **Don't duplicate types** — before defining a new type, check whether it already exists in the project (especially `packages/data-provider`). Reuse and extend existing types rather than creating redundant definitions.
- Use union types, generics, and interfaces appropriately.
- All TypeScript and ESLint warnings/errors must be addressed — do not leave unresolved diagnostics.

### Comments and Documentation

- Write self-documenting code; no inline comments narrating what code does.
- JSDoc only for complex/non-obvious logic or intellisense on public APIs.
- Single-line JSDoc for brief docs, multi-line for complex cases.
- Avoid standalone `//` comments unless absolutely necessary.

### Import Order

Imports are organized into three sections:

1. **Package imports** — sorted shortest to longest line length (`react` always first).
2. **`import type` imports** — sorted longest to shortest (package types first, then local types; length resets between sub-groups).
3. **Local/project imports** — sorted longest to shortest.

Multi-line imports count total character length across all lines. Consolidate value imports from the same module. Always use standalone `import type { ... }` — never inline `type` inside value imports.

### JS/TS Loop Preferences

- **Limit looping as much as possible.** Prefer single-pass transformations and avoid re-iterating the same data.
- `for (let i = 0; ...)` for performance-critical or index-dependent operations.
- `for...of` for simple array iteration.
- `for...in` only for object property enumeration.

---

## Frontend Rules (`client/src/**/*`)

### Localization

- All user-facing text must use `useLocalize()`.
- Only update English keys in `client/src/locales/en/translation.json` (other languages are automated externally).
- Semantic key prefixes: `com_ui_`, `com_assistants_`, etc.

### Components

- TypeScript for all React components with proper type imports.
- Semantic HTML with ARIA labels (`role`, `aria-label`) for accessibility.
- Group related components in feature directories (e.g., `SidePanel/Memories/`).
- Use index files for clean exports.

### Data Management

- Feature hooks: `client/src/data-provider/[Feature]/queries.ts` → `[Feature]/index.ts` → `client/src/data-provider/index.ts`.
- React Query (`@tanstack/react-query`) for all API interactions; proper query invalidation on mutations.
- QueryKeys and MutationKeys in `packages/data-provider/src/keys.ts`.

### Data-Provider Integration

- Endpoints: `packages/data-provider/src/api-endpoints.ts`
- Data service: `packages/data-provider/src/data-service.ts`
- Types: `packages/data-provider/src/types/queries.ts`
- Use `encodeURIComponent` for dynamic URL parameters.

### Performance

- Prioritize memory and speed efficiency at scale.
- Cursor pagination for large datasets.
- Proper dependency arrays to avoid unnecessary re-renders.
- Leverage React Query caching and background refetching.

---

## Development Commands

### Starting the application

| Command | Purpose |
|---|---|
| `npm run backend:dev` | Start backend with file watching (nodemon, port 3080) |
| `npm run frontend:dev` | Start frontend dev server with HMR (port 3090, requires backend) |
| `npm run backend` | Start backend in production mode |

### Installing and building

| Command | Purpose |
|---|---|
| `npm run smart-reinstall` | Install deps (if lockfile changed) + build via Turborepo |
| `npm run reinstall` | Clean install — wipe `node_modules` and reinstall from scratch |
| `npm run build` | Build all packages via Turborepo (parallel, cached) |
| `npm run build:data-provider` | Rebuild `packages/data-provider` after changes |
| `npm run build:api` | Rebuild `packages/api` only |
| `npm run build:data-schemas` | Rebuild `packages/data-schemas` only |
| `npm run build:packages` | Build all packages except frontend (data-provider → data-schemas → api → client-package) |

Frontend production build requires extra heap — always run with:
```bash
cd client && NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### Linting and formatting

```bash
npm run lint          # ESLint across all workspaces
npm run lint:fix      # ESLint with auto-fix
npm run format        # Prettier write
```

### Testing

Run from the workspace directory, not the root:

```bash
cd api && npx jest <pattern>                    # Legacy backend
cd packages/api && npx jest <pattern>           # New backend (TypeScript)
cd packages/data-provider && npx jest <pattern>
cd packages/data-schemas && npx jest <pattern>
cd client && npx jest <pattern>                 # Frontend
```

Root-level shortcuts (CI mode, no watch):

```bash
npm run test:api
npm run test:packages:api
npm run test:packages:data-provider
npm run test:packages:data-schemas
npm run test:client
npm run test:all        # Runs all of the above sequentially
```

Integration tests (require live Redis or S3):

```bash
cd packages/api && npm run test:cache-integration
cd packages/api && npm run test:s3-integration
```

### E2E tests

```bash
npm run e2e             # Headless, local config
npm run e2e:headed      # With browser UI
npm run e2e:debug       # Playwright debug mode
```

### Admin utilities (run from root)

```bash
npm run create-user
npm run reset-password
npm run add-balance
npm run flush-cache
npm run migrate:agent-permissions   # --dry-run flag available
```

- Node.js: v20.19.0+ or ^22.12.0 or >= 23.0.0
- Database: MongoDB (recommended: `docker run -d --name chat-mongodb -p 27017:27017 mongo:8.0.20 mongod --noauth`)
- Backend: `http://localhost:3080/`; frontend dev server: `http://localhost:3090/`
- Config files: `.env` (copy from `.env.example`) and `librechat.yaml` (copy from `librechat.example.yaml`)

---

## Architecture: Request Flow

A typical API request flows through these layers:

```
HTTP Request
  → api/server/routes/          # Express routers (JS, thin)
  → api/server/middleware/      # Auth, validation, rate limiting
  → api/server/controllers/     # Thin JS wrappers
  → packages/api/src/           # All real logic (TypeScript)
      ├── endpoints/            # Per-provider model fetching and initialization
      ├── agents/               # Agent execution logic
      ├── cache/                # Keyv-based cache (Redis or in-memory)
      ├── mcp/                  # MCP server registry and tool resolution
      ├── stream/               # Streaming response handling
      └── auth/, admin/, acl/   # Auth, permissions, ACL
```

## Architecture: Model Resolution

When a client requests `/api/models`:

1. `api/server/controllers/ModelController.js` calls `loadDefaultModels()` + `loadConfigModels()`
2. `loadDefaultModels` resolves built-in providers (OpenAI, Anthropic, Google, Bedrock) via `packages/api/src/endpoints/models.ts`
3. `loadConfigModels` iterates custom endpoints from `librechat.yaml`, calls `fetchModels()` per endpoint
4. `fetchModels()` hits the provider's `/models` endpoint via HTTP, caches results for 2 minutes under `CacheKeys.MODEL_QUERIES`
5. On failure, falls back to the `default` model list defined in `librechat.yaml`

Resolution priority per provider: **env var** (e.g. `OPENAI_MODELS`) → **API fetch** → **hardcoded defaults** in `librechat-data-provider`.

## Architecture: Cache

`packages/api/src/cache/` wraps [Keyv](https://github.com/jaredwray/keyv) with two backends:
- **Redis** — when `REDIS_URI` is set in `.env`
- **In-memory** — default fallback for development

Named caches (e.g. `CacheKeys.MODEL_QUERIES`, `CacheKeys.CONFIG_STORE`) are accessed via `standardCache(key)`. Cache TTLs are defined in `librechat-data-provider`'s `Time` enum.

## Architecture: Frontend Data Flow

```
Component
  → useQuery/useMutation (React Query)
  → client/src/data-provider/[Feature]/queries.ts
  → data-service.ts (packages/data-provider/src/data-service.ts)
  → api-endpoints.ts (packages/data-provider/src/api-endpoints.ts)
  → HTTP → Express backend
```

QueryKeys and MutationKeys are the single source of truth for cache invalidation — always use `packages/data-provider/src/keys.ts`, never hardcode strings.

---

## Testing

- Framework: **Jest**, run per-workspace.
- Frontend tests: `__tests__` directories alongside components; use `test/layout-test-utils` for rendering.
- Cover loading, success, and error states for UI/data flows.

### Philosophy

- **Real logic over mocks.** Exercise actual code paths with real dependencies. Mocking is a last resort.
- **Spies over mocks.** Assert that real functions are called with expected arguments and frequency without replacing underlying logic.
- **MongoDB**: use `mongodb-memory-server` for a real in-memory MongoDB instance. Test actual queries and schema validation, not mocked DB calls.
- **MCP**: use real `@modelcontextprotocol/sdk` exports for servers, transports, and tool definitions. Mirror real scenarios, don't stub SDK internals.
- Only mock what you cannot control: external HTTP APIs, rate-limited services, non-deterministic system calls.
- Heavy mocking is a code smell, not a testing strategy.

---

## Formatting

Fix all formatting lint errors (trailing spaces, tabs, newlines, indentation) using auto-fix when available. All TypeScript/ESLint warnings and errors **must** be resolved.
