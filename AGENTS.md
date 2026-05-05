# JuristAI Chatbot

## Project Overview

JuristAI Chatbot is a production fork of LibreChat. It keeps the upstream monorepo structure, but the active product work is JuristAI case-based legal chat for LitigAI and FedCrim.

The current fork has important differences from upstream LibreChat:

- Frontend chat submissions are normalized to the Agents endpoint and can force OpenAI Responses API execution.
- `appId` selects the JuristAI prompt identity for prompt-based Responses API runs.
- `conversationId` remains the Mongo/LibreChat conversation key; OpenAI conversation/thread IDs are preserved separately as `threadId`, `openaiConversationId`, and `openai_conversation_id`.
- Agent responses use resumable streaming through `GenerationJobManager`, with `/api/agents/chat/stream/:streamId`, `/api/agents/chat/status/:conversationId`, `/api/agents/chat/active`, and `/api/agents/chat/abort`.
- Deployment targets JuristAI ECS from `.github/workflows/ci-cd.yml`; publish environment details are in `docs/publish-environment.md`.
- JuristAI case/domain persistence outside LibreChat is documented in `juristai_dynamodb_catalog.md`.

The monorepo has the following key workspaces:

| Workspace                 | Language         | Side     | Dependency                                                                             | Purpose                                                                       |
| ------------------------- | ---------------- | -------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/api`                    | JS (legacy)      | Backend  | `packages/api`, `packages/data-schemas`, `packages/data-provider`, `@librechat/agents` | Express server - minimize changes here                                        |
| `/packages/api`           | **TypeScript**   | Backend  | `packages/data-schemas`, `packages/data-provider`                                      | New backend code lives here (TS only, consumed by `/api`)                     |
| `/packages/data-schemas`  | TypeScript       | Backend  | `packages/data-provider`                                                               | Database models/schemas, shareable across backend projects                    |
| `/packages/data-provider` | TypeScript       | Shared   | -                                                                                      | Shared API types, endpoints, data-service - used by both frontend and backend |
| `/client`                 | TypeScript/React | Frontend | `packages/data-provider`, `packages/client`                                            | Frontend SPA                                                                  |
| `/packages/client`        | TypeScript       | Frontend | `packages/data-provider`                                                               | Shared frontend utilities                                                     |

The source code for `@librechat/agents` (major backend dependency, same team) is at `/home/danny/agentus`.

---

## JuristAI Conversation Flow

- The frontend payload adapter is `packages/data-provider/src/createPayload.ts`.
- Prompt mapping:
  - `appId=1`: FedCrim / criminal, prompt `pmpt_694030e601dc8196b472e5dcf8f2e3bd0aa422f8a026f796`, version `3`.
  - `appId=2`: LitigAI / civil, prompt `pmpt_694030b0bc6c8194906e2aee647e640b0959472384122916`, version `2`.
- The frontend contract is documented in `docs/frontend-responses-conversations-spec.md`.
- The backend resumable controller is `api/server/controllers/agents/request.js`.
- Stream state and cross-reconnect behavior live in `packages/api/src/stream`.
- Keep `conversationId`, `threadId`, and OpenAI conversation IDs distinct. Do not collapse them into a single field.

---

## Workspace Boundaries

- **All new backend code must be TypeScript** in `/packages/api`.
- Keep `/api` changes to the absolute minimum (thin JS wrappers calling into `/packages/api`).
- Database-specific shared logic goes in `/packages/data-schemas`.
- Frontend/backend shared API logic (endpoints, types, data-service) goes in `/packages/data-provider`.
- Build data-provider from project root: `npm run build:data-provider`.
- For JuristAI chat contract changes, update `packages/data-provider/src/createPayload.ts`, the relevant backend route/controller, and `docs/frontend-responses-conversations-spec.md` together.

---

## Code Style

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

- **Minimize looping** - especially over shared data structures like message arrays, which are iterated frequently throughout the codebase. Every additional pass adds up at scale.
- Consolidate sequential O(n) operations into a single pass whenever possible; never loop over the same collection twice if the work can be combined.
- Choose data structures that reduce the need to iterate (e.g., `Map`/`Set` for lookups instead of `Array.find`/`Array.includes`).
- Avoid unnecessary object creation; consider space-time tradeoffs.
- Prevent memory leaks: careful with closures, dispose resources/event listeners, no circular references.

### Type Safety

- **Never use `any`**. Explicit types for all parameters, return values, and variables.
- **Limit `unknown`** - avoid `unknown`, `Record<string, unknown>`, and `as unknown as T` assertions. A `Record<string, unknown>` almost always signals a missing explicit type definition.
- **Don't duplicate types** - before defining a new type, check whether it already exists in the project (especially `packages/data-provider`). Reuse and extend existing types rather than creating redundant definitions.
- Use union types, generics, and interfaces appropriately.
- All TypeScript and ESLint warnings/errors must be addressed - do not leave unresolved diagnostics.

### Comments and Documentation

- Write self-documenting code; no inline comments narrating what code does.
- JSDoc only for complex/non-obvious logic or intellisense on public APIs.
- Single-line JSDoc for brief docs, multi-line for complex cases.
- Avoid standalone `//` comments unless absolutely necessary.

### Import Order

Imports are organized into three sections:

1. **Package imports** - sorted shortest to longest line length (`react` always first).
2. **`import type` imports** - sorted longest to shortest (package types first, then local types; length resets between sub-groups).
3. **Local/project imports** - sorted longest to shortest.

Multi-line imports count total character length across all lines. Consolidate value imports from the same module. Always use standalone `import type { ... }` - never inline `type` inside value imports.

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

- Feature hooks: `client/src/data-provider/[Feature]/queries.ts` -> `[Feature]/index.ts` -> `client/src/data-provider/index.ts`.
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

| Command                       | Purpose                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `npm run smart-reinstall`     | Install deps (if lockfile changed) + build via Turborepo                 |
| `npm run reinstall`           | Clean install - wipe `node_modules` and reinstall from scratch           |
| `npm run backend`             | Start the backend server                                                 |
| `npm run backend:dev`         | Start backend with file watching (development)                           |
| `npm run build`               | Build all compiled code via Turborepo (parallel, cached)                 |
| `npm run frontend`            | Build all compiled code sequentially (legacy fallback)                   |
| `npm run frontend:dev`        | Start frontend dev server with HMR (port 3090, requires backend running) |
| `npm run build:data-provider` | Rebuild `packages/data-provider` after changes                           |

- Node.js: v20.19.0+ or ^22.12.0 or >= 23.0.0
- Database: MongoDB
- Backend runs on `http://localhost:3080/`; frontend dev server on `http://localhost:3090/`

---

## Testing

- Framework: **Jest**, run per-workspace.
- Run tests from their workspace directory: `cd api && npx jest <pattern>`, `cd packages/api && npx jest <pattern>`, etc.
- Frontend tests: `__tests__` directories alongside components; use `test/layout-test-utils` for rendering.
- Cover loading, success, and error states for UI/data flows.
- Mock data-provider hooks and external dependencies.

---

## Formatting

Fix all formatting lint errors (trailing spaces, tabs, newlines, indentation) using auto-fix when available. All TypeScript/ESLint warnings and errors **must** be resolved.
