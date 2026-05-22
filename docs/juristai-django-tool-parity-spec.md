# JuristAI Django Tool Parity Spec

## Goal

`Chatbot` should expose the important JuristAI product APIs as first-class
server-executed tool calls in the agent loop, instead of relying on the
LitigAI frontend to parse hidden assistant directives and call separate
middleware routes itself.

Parity here means:

- the model can discover the relevant JuristAI tools through the normal agent
  tool catalog
- the tool executes inside `Chatbot`, not in the browser
- the tool result feeds back into the same run as native tool output
- LitigAI/FedCrim no longer need hidden `<litigai-intent>` routing directives
  for workflows that already exist as tool-callable JuristAI APIs

This spec covers the `Chatbot` side, but it depends on curated `django-hub`
OpenAPI exposure.

## Current State

Today the JuristAI Django bridge in `Chatbot` is partial.

- The general LibreChat/OpenAI tool-call infrastructure exists.
- The JuristAI-specific tool bridge is wired through:
  - [api/server/services/juristaiTools.js](C:/Users/aibns/Git%20Projects/juristai/Chatbot/api/server/services/juristaiTools.js)
  - [packages/api/src/tools/juristai/specLoader.ts](C:/Users/aibns/Git%20Projects/juristai/Chatbot/packages/api/src/tools/juristai/specLoader.ts)
  - [packages/api/src/tools/juristai/toolBuilder.ts](C:/Users/aibns/Git%20Projects/juristai/Chatbot/packages/api/src/tools/juristai/toolBuilder.ts)
- The active bridge still uses a bundled static spec with a single callable
  operation: `search-case`.
- LitigAI still uses frontend directive parsing plus browser-side
  `intentHandler` invocation for many workflows.

That means `Chatbot` currently has tool-call capability, but not parity with the
important JuristAI workflow surface.

## Non-Goals

This spec does not require:

- exposing every Django route as a tool
- exposing webhooks, OAuth callbacks, ingestion jobs, admin-only ops, health
  checks, or raw internal maintenance endpoints
- making raw GraphQL itself a tool surface
- keeping `intentHandler` as the long-term routing abstraction

The desired end state is explicit, domain-specific tools, not a single
catch-all orchestration tool.

## Architecture Target

### 1. Source of truth

The JuristAI tool catalog must come from `django-hub` OpenAPI, fetched from:

- `GET /api/schema/?format=json`

The static bundled `SEARCH_CASE_SPEC` should remain only as a development
fallback or be removed entirely after schema access is stable.

### 2. Curation gate

Only operations marked with:

- `x-llm-callable: true`

are eligible for exposure to `Chatbot`.

This remains the hard gate in
[packages/api/src/tools/juristai/specLoader.ts](C:/Users/aibns/Git%20Projects/juristai/Chatbot/packages/api/src/tools/juristai/specLoader.ts).

### 3. Execution model

For each curated operation:

- `Chatbot` advertises a namespaced tool such as `juristai__search-case`
- `Chatbot` executes it through `createActionTool`
- auth is supplied by the minted per-user chat JWT
- server-owned defaults are injected in `Chatbot`, not guessed by the model
- results come back as normal tool outputs within the same run

### 4. App-aware curation

Tool exposure must be filtered by product context, at minimum:

- `appId = 1` FedCrim
- `appId = 2` LitigAI

The filtering contract should stay in the existing `perAppOperations` model in
the JuristAI spec loader, but the allowlists need to become real and broad
instead of implicit single-tool behavior.

### 5. GraphQL-backed product domains

For important product capabilities that currently live mainly in GraphQL, the
preferred parity path is:

- add thin, authenticated Django REST wrappers for the exact tool operations we
  want the model to call
- mark those wrappers `x-llm-callable: true`
- avoid exposing raw GraphQL documents as model-facing tools

This keeps tool contracts stable, typed, auditable, and consistent with the
existing OpenAPI-based JuristAI loader.

## Important Tool Domains

The following are the important JuristAI APIs that should reach parity before
the frontend directive bridge is removed.

### Tier 1: required for LitigAI workflow parity

These replace the workflows most likely to be routed today through hidden
frontend directives.

#### 1. Case lookup and retrieval

- `search-case`
- `get-case-metadata`
- case summary retrieve/generate where applicable
- people dossier read

Primary Django surfaces:

- `/api/core/search-case/`
- `/api/core/get-case-metadata/`
- `/api/core/generate-case-summary/`
- `/api/core/retrieve-case-summary/`
- `/api/core/read-people-dossiers/`

#### 2. Drafting and document-generation workflows

- generate motion
- demand letter
- lawsuit generation
- lawsuit recommendation
- document summary
- doc critique
- precedent query / legal research helper routes that already exist as product
  middleware

Primary Django surfaces:

- `/api/core/generate-motion/`
- `/api/core/demand-letter/`
- `/api/core/generate-lawsuit/`
- `/api/core/recommend-lawsuit/`
- `/api/core/summarize-document/`
- `/api/core/doc-critique/`
- `/api/core/precedent-query/`
- `/api/core/query-processor/`

#### 3. Action items

Parity needs explicit tool operations for:

- list relevant action items
- create action item
- update action item
- assign/reassign action item
- close/complete action item
- reorder action items only if needed by an actual assistant workflow

Current frontend contract source:

- [action_items_graphql_frontend_contract.md](C:/Users/aibns/Git%20Projects/juristai/django-hub/docs/contracts/action_items_graphql_frontend_contract.md)

Implementation note:

- do not expose the whole GraphQL schema
- add focused REST wrappers in `django-hub` for the assistant use cases
- mark only those wrappers `x-llm-callable: true`

#### 4. Deadlines and important dates

Parity needs explicit tool operations for:

- list case important dates
- create/update/delete important date
- run deadlines insight workflow

Current frontend contract source:

- [case_important_dates_deadlines_insight_frontend_contract.md](C:/Users/aibns/Git%20Projects/juristai/django-hub/docs/contracts/case_important_dates_deadlines_insight_frontend_contract.md)

Primary surfaces:

- GraphQL CRUD for `CaseImportantDate`
- `/api/core/deadlines-insight/`

#### 5. Legal-team and account workflow actions

Parity needs explicit tools for concrete actions such as:

- legal team invite
- account-manager or cross-case orchestration actions that are truly product
  actions rather than pure chat guidance

Primary Django surfaces:

- `/api/core/legal-team-invite/`
- `/api/core/account-manager/`

Important rule:

- if a route is only a legacy catch-all orchestrator, it should be decomposed
  into narrower tool-callable operations over time
- `intentHandler` may remain temporarily, but it should not be the desired final
  tool abstraction

### Tier 2: important product parity, but not blocking removal of hidden routing

#### 6. Scheduling

Expose the concrete scheduling operations already documented for the frontend:

- public scheduling link lookup
- slot search
- reservation create/delete
- booking create/cancel/reschedule/confirm
- conferencing connect/disconnect/retry
- host/admin scheduling reads where useful in chat

Contract source:

- [scheduling_django_api_graphql_frontend_contract.md](C:/Users/aibns/Git%20Projects/juristai/django-hub/docs/contracts/scheduling_django_api_graphql_frontend_contract.md)

Primary surfaces already exist under:

- `/api/core/scheduling/*`

This is a strong parity candidate because it already has REST middleware routes.

#### 7. Signatures

Expose staff signature workflows such as:

- create signature request
- list case signatures
- get request detail
- send reminder
- void request
- self-sign session
- reconcile request

Contract source:

- [signatures_opensign_django_api_graphql_frontend_contract.md](C:/Users/aibns/Git%20Projects/juristai/django-hub/docs/contracts/signatures_opensign_django_api_graphql_frontend_contract.md)

Primary surfaces already exist under:

- `/api/core/signatures/*`

### Tier 3: useful parity, lower priority

These should be added after Tier 1 and Tier 2 unless they are immediately
needed by a live workflow.

#### 8. Billing and client-billing reads/mutations

Expose the important middleware flows that already have stable Django contracts:

- bill/estimate/payment send previews
- clone flows
- status updates
- tax-type CRUD where actually useful in chat
- portal reads where useful for conversational retrieval

Contract source:

- [client_billing_delta_django_api_graphql_frontend_contract.md](C:/Users/aibns/Git%20Projects/juristai/django-hub/docs/contracts/client_billing_delta_django_api_graphql_frontend_contract.md)

#### 9. Email/person insight helpers

Expose read-oriented insight tools only where the contract is stable and the use
case is real:

- people dossier read
- email individual dossier reflection reads if they become chat-relevant

## What Should Not Be Tools

The following should stay out of the model-facing tool catalog unless there is a
very specific reason:

- OAuth callbacks
- ingestion orchestrators
- webhooks
- raw upload/presign helpers unless the assistant truly needs to upload a file
- health endpoints
- admin-only maintenance or indexing routes
- low-level internal “glue” endpoints that are not meaningful user-facing
  actions

## Tool Design Rules

### 1. One user action per tool

Each tool should correspond to one clear product action or retrieval operation.

Good:

- `juristai__create-action-item`
- `juristai__complete-action-item`
- `juristai__create-scheduling-booking`

Bad:

- `juristai__intent-handler`
- `juristai__workflow-router`

### 2. Stable operation IDs

`django-hub` operation IDs should be explicit and stable. They should not be
derived from incidental serializer names.

### 3. Model-facing schemas must be minimal

Each tool schema should expose only what the model can realistically and safely
decide.

Server-controlled values such as:

- `appId`
- authenticated user identity
- case-access enforcement
- default sort order
- provider defaults

must remain server-controlled.

### 4. Errors must be normalized

Tool-call failures should come back with stable, model-usable semantics:

- validation error
- authorization error
- not found
- conflict / needs clarification
- transient upstream failure

The model should not need to parse raw Django tracebacks or provider noise.

### 5. Mutations should be explicit

State-changing tools should be separated from read tools and described clearly
as mutations.

The agent prompt should encourage confirmation or clarification before calling
destructive or ambiguous mutations.

## Required Django Work

To achieve parity, `django-hub` needs these changes.

### 1. Mark important existing REST routes `x-llm-callable`

For routes already suitable as tools:

- add `x-llm-callable: true`
- add precise summaries/descriptions
- keep request schemas small and model-usable

### 2. Add assistant REST wrappers for GraphQL-heavy domains

For action items, deadlines CRUD, and similar domains:

- add thin REST endpoints specifically for assistant workflows
- keep them case-access checked
- make their OpenAPI request/response contracts explicit
- mark only the assistant-safe subset as `x-llm-callable`

### 3. Make `/api/schema/` fetchable by Chatbot

`Chatbot` needs a stable way to fetch the Django schema in production:

- service/admin auth token for schema fetch
- schema availability in the deployed environment
- caching with refresh

## Required Chatbot Work

### 1. Replace the static one-tool spec with live schema loading

Change the JuristAI bridge so that the primary path is:

- fetch live Django schema
- filter to `x-llm-callable`
- filter again by `perAppOperations`
- build JuristAI tools dynamically

The current bundled static spec should not remain the primary path.

### 2. Add real per-app operation allowlists

At minimum:

- FedCrim and LitigAI should not necessarily see the same tool catalog
- allowlists should be explicit and committed

### 3. Keep server defaults and auth injection

Continue to inject:

- `appId`
- user JWT
- stable defaults for sort/filter/provider fields

inside `Chatbot`.

### 4. Audit and telemetry

Record:

- which JuristAI tool was advertised
- which tool was chosen
- tool latency
- success/failure type
- upstream route called
- whether frontend fallback routing was still used

## Parity Exit Criteria

Hidden LitigAI directive parsing should only be removed after all of the
following are true:

1. The important Tier 1 workflows are exposed as server-executed JuristAI tools.
2. Those tools are advertised on the same `agents` path LitigAI uses.
3. Tool execution succeeds end-to-end with the same auth and case-access rules
   as the current frontend bridge.
4. The assistant no longer needs to emit `<litigai-intent>` or
   `invokeIntentHandler` for those workflows.
5. The frontend no longer calls `/api/core/intent-handler/` for workflows that
   already have equivalent JuristAI tools.

## Rollout Plan

### Phase 1

- make live schema loading production-ready
- expose all existing suitable REST routes as `x-llm-callable`
- add real per-app allowlists
- keep frontend directive bridge in place

### Phase 2

- add assistant REST wrappers for GraphQL-heavy domains:
  - action items
  - deadlines CRUD
  - any other Tier 1 mutation domains not already represented by REST
- validate end-to-end tool execution in `Chatbot`

### Phase 3

- switch LitigAI/FedCrim prompts away from hidden frontend routing directives
- remove frontend parsing for workflows now handled fully by `Chatbot` tools
- keep a temporary fallback only behind a feature flag if needed

### Phase 4

- deprecate or sharply narrow `intentHandler`
- prefer explicit domain tools over catch-all orchestration

## Success Condition

The success condition is not “`Chatbot` supports tool calls.”

The success condition is:

- a LitigAI or FedCrim user can ask for the important JuristAI product actions
  in normal chat
- `Chatbot` can execute those actions through curated Django-backed tools inside
  the agent loop
- the frontend does not need hidden routing text or browser-side workflow
  invocation to make the product work
