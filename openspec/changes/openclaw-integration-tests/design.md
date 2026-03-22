# Design: OpenClaw Integration Tests

## Architecture

Tests are co-located with source files following LibreChat conventions:

```
packages/api/src/endpoints/openclaw/
  __tests__/
    client.test.ts       ← Unit: OpenClawGatewayClient internals
    gateway.test.ts      ← Unit: GatewayManager singleton + backoff
    events.test.ts       ← Unit: translateEvent / translateContentBlock
    controller.test.ts   ← Unit: runOpenClawChat (mocks gateway + GenerationJobManager)
    config.test.ts       ← Unit: resolveOpenClawConfig

client/src/components/Chat/Input/
  __tests__/
    OpenClawModelSwitcher.test.tsx
    ThinkingLevelSelector.test.tsx

client/src/components/SidePanel/OpenClaw/
  __tests__/
    OpenClawSkillsPanel.test.tsx

client/src/data-provider/OpenClaw/
  __tests__/
    queries.test.ts
```

## Testing Strategy

### Backend (Jest / Node)

- **Gateway client**: Use a local WebSocket mock server (via `ws` package) to simulate connect/disconnect/RPC cycles. No heavy mocking — test the real client code against a real WS server.
- **Gateway manager**: Test singleton semantics and backoff logic by injecting a mock `OpenClawGatewayClient` into the manager via factory injection or by replacing `entries` directly.
- **Events translator**: Pure function — no mocks needed. Test all 4 state branches (`delta`, `final`, `aborted`, `error`) and all content block types.
- **Controller**: Mock only `gatewayManager.getClient` and `GenerationJobManager` (external boundary). Exercise real message-building logic.
- **Config**: Pure functions — no mocks.

### Frontend (Jest + React Testing Library)

- Use `test/layout-test-utils` from the existing LibreChat test infrastructure.
- Mock React Query hooks (`useOpenClawModelsQuery`, `useSwitchOpenClawModel`) at the module level.
- Mock `useChatContext` to provide conversation fixture.
- Verify rendered output and mutation calls.

## Key Decisions

1. **WS mock server over jest.mock('ws')**: Closer to real behavior, catches protocol issues.
2. **Pure function tests for events**: Events translator is a pure function with zero side effects — test exhaustively with no setup.
3. **No mongodb-memory-server here**: Controller tests mock DB layer; schema correctness is covered by TypeScript compilation.
4. **Existing test infra**: Reuse LibreChat's `test/layout-test-utils` for all React component tests.
