## Why

The LibreChat × OpenClaw deep integration introduces a new `openclaw` endpoint spanning backend (ACP gateway client, SSE streaming, controller), shared data layer (types, endpoints, schemas), and frontend (model switcher, thinking-level selector, skills panel). None of these new modules have test coverage, creating high regression risk before any commit or merge.

## What Changes

- Add unit tests for `packages/api/src/endpoints/openclaw/` (config, gateway, client, events, controller)
- Add unit tests for `packages/data-provider/src/types/openclaw.ts` type correctness (schema validation)
- Add integration tests for the Express routes in `api/server/routes/openclaw/`
- Add frontend component tests for `OpenClawModelSwitcher`, `ThinkingLevelSelector`, `OpenClawSkillsPanel`
- Add React Query hook tests in `client/src/data-provider/OpenClaw/`
- Verify `npm run build:data-provider` compiles cleanly

## Capabilities

### New Capabilities

- `openclaw-gateway-client`: Unit tests for ACP WebSocket client — session init, send/receive, reconnect, error handling
- `openclaw-streaming-events`: Unit tests for SSE event parsing and streaming state machine
- `openclaw-controller`: Unit tests for chat controller — message save, abort, job lifecycle
- `openclaw-routes`: Integration tests for Express route handlers (tools, skills, models, stream, abort)
- `openclaw-frontend-components`: Component tests for ModelSwitcher, ThinkingLevelSelector, SkillsPanel
- `openclaw-data-provider-hooks`: React Query hook tests for OpenClaw queries/mutations

### Modified Capabilities

- (none — all new modules)

## Impact

- `packages/api/src/endpoints/openclaw/` — new test files alongside each module
- `api/server/routes/openclaw/` — new `__tests__/` directory
- `client/src/components/Chat/Input/` — `__tests__/` for new components
- `client/src/components/SidePanel/OpenClaw/` — `__tests__/` for skills panel
- `client/src/data-provider/OpenClaw/` — `__tests__/` for query hooks
- Test framework: Jest (per LibreChat convention), `mongodb-memory-server` for any DB, real SDK objects (no heavy mocking)
