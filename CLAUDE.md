# LibreChat

> ⚠️ **Active fork context — Graupel.** This repository is being forked into a commercial SaaS named **Graupel** (multi-LLM "AI Workspace" subscription, overseas English market, use.ai-style positioning). Until stage 1 of the fork lands, the upstream LibreChat guidance below remains authoritative for code style and workspace boundaries. See the "Graupel Fork Context" section below for active project context, divergences from upstream, and links to design specs.

---

## Graupel Fork Context

**Source of truth**: design specs at [docs/superpowers/specs/](docs/superpowers/specs/).

| Spec | Scope |
|---|---|
| [graupel-mvp-design](docs/superpowers/specs/2026-05-21-graupel-mvp-design.md) | Top-level design, scope, pricing, risks, metrics |
| [stage-1-fork-rebrand](docs/superpowers/specs/2026-05-21-graupel-stage-1-fork-rebrand.md) | Fork repo, brand replacement, deployment pipeline (Hetzner + Coolify + Cloudflare + R2 + Atlas) |
| [stage-2-magic-link](docs/superpowers/specs/2026-05-21-graupel-stage-2-magic-link.md) | Email magic-link auth with Resend, anti-enumeration, email-prefetch mitigation |
| [stage-3-plan-gating](docs/superpowers/specs/2026-05-21-graupel-stage-3-plan-gating.md) | Plan / Quota / Gating with event-driven `applyPlanChange()`, **no payment integration** |
| [stage-4-marketing](docs/superpowers/specs/2026-05-21-graupel-stage-4-marketing.md) | Landing / pricing / legal / waitlist pages with SSG (vike) |
| [stage-5-launch](docs/superpowers/specs/2026-05-21-graupel-stage-5-launch.md) | Sentry, PostHog, MongoDB backups, email automation, invite-only beta launch |

**Always read the relevant stage spec before implementing in that area.** Don't infer Graupel decisions from CLAUDE.md alone — the specs cover edge cases, security, and rationale.

### Divergences from upstream LibreChat

Design decisions that override or extend the upstream guidance:

- **Repository will be renamed** to `graupel` (stage 1). Brand strings and visible UI change; internal schema names and DB collection names stay LibreChat-style to avoid migrations.
- **Endpoints cut from MVP**: Bedrock, Vertex, Ollama, OpenAI Assistants. Their `EModelEndpoint` enum values stay (for old conversation deserialization), but implementations and UI entry points are removed.
- **Auth providers cut**: Discord, Apple, Facebook, SAML, LDAP, OpenID.
- **Auth providers kept**: Local password (UI-collapsed fallback), Google, GitHub, plus new email magic link (stage 2).
- **Agents + MCP**: kept but UI default-hidden; surfaced only on Pro plan as a power-user feature.
- **No Stripe / payment until post-MVP stage 6.** All plan changes during MVP go through admin API (or CLI fallback). Do not introduce `stripe-node`, webhook handlers, or `stripe_customer_id` fields before stage 6.
- **Plan changes are event-driven**: any source (admin API, CLI, future Stripe webhook) must call `applyPlanChange()`. Direct `Subscription.create / update` outside that entry point is forbidden — verified by grep at stage 3 acceptance.
- **Quota check-and-increment must be atomic** (single `findOneAndUpdate` with `$inc` and upper-bound filter). Never read-then-write — race conditions will let users overrun their plan.
- **Cost auditing via `UsageLog`** (per `user_id × model_id × day`). Internal only; never exposed to users.

### Code locations for Graupel-specific work

New business code goes into existing workspaces — no new top-level packages:

- Magic-link service, billing module (`plans.ts`, `applyPlanChange.ts`, `gating.ts`, `modelPricing.ts`), admin routes, marketing endpoints → [packages/api/src/](packages/api/src/) (TypeScript)
- New schemas (`LoginToken`, `Subscription`, `Quota`, `UsageLog`, `AuditLog`, `WaitlistEntry`, `ContactSubmission`) → [packages/data-schemas/src/schema/](packages/data-schemas/src/schema/)
- Shared types (`PlanCode`, `CostTier`, billing types) → [packages/data-provider/src/types/](packages/data-provider/src/types/)
- Frontend billing UI (`PlanBadge`, `QuotaBar`, `UpgradeModal`, `ModelLockTooltip`), marketing pages, admin UI → [client/src/](client/src/)
- Thin Express wrappers calling into `packages/api` → [api/server/routes/](api/server/routes/)

### Investment & cadence

- Solo developer, ~10 hours/week. Each stage sized to fit 20-40 hours.
- Total MVP budget: 105-130 hours (~10.5-13 weeks).
- After stage 5: invite-only beta for 1-2 months, then evaluate stage 6 (Stripe) based on retention/activation metrics in [design §7.2](docs/superpowers/specs/2026-05-21-graupel-mvp-design.md#72-mvpinvite-only-beta30-天目标).

---

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

| Command | Purpose |
|---|---|
| `npm run smart-reinstall` | Install deps (if lockfile changed) + build via Turborepo |
| `npm run reinstall` | Clean install — wipe `node_modules` and reinstall from scratch |
| `npm run backend` | Start the backend server |
| `npm run backend:dev` | Start backend with file watching (development) |
| `npm run build` | Build all compiled code via Turborepo (parallel, cached) |
| `npm run frontend` | Build all compiled code sequentially (legacy fallback) |
| `npm run frontend:dev` | Start frontend dev server with HMR (port 3090, requires backend running) |
| `npm run build:data-provider` | Rebuild `packages/data-provider` after changes |

- Node.js: v20.19.0+ or ^22.12.0 or >= 23.0.0
- Database: MongoDB
- Backend runs on `http://localhost:3080/`; frontend dev server on `http://localhost:3090/`

---

## Testing

- Framework: **Jest**, run per-workspace.
- Run tests from their workspace directory: `cd api && npx jest <pattern>`, `cd packages/api && npx jest <pattern>`, etc.
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
