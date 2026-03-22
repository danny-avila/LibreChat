# Tasks: OpenClaw Integration Tests

## Backend Tests

- [x] Write `packages/api/src/endpoints/openclaw/__tests__/events.test.ts`
  - delta/final/aborted/error state branches
  - text, thinking, tool_use, tool_result block types
  - toolCallMap tracking

- [x] Write `packages/api/src/endpoints/openclaw/__tests__/gateway.test.ts`
  - singleton semantics
  - exponential backoff cap

- [x] Write `packages/api/src/endpoints/openclaw/__tests__/client.test.ts`
  - default option values
  - connected getter initial state

- [x] Write `packages/api/src/endpoints/openclaw/__tests__/config.test.ts`
  - config parsing from endpoint definition

## Frontend Tests

- [x] Write `client/src/components/Chat/Input/__tests__/OpenClawModelSwitcher.test.tsx`
  - renders null for non-openclaw endpoint
  - displays current model
  - calls switchModel.mutate on select

- [x] Write `client/src/components/Chat/Input/__tests__/ThinkingLevelSelector.test.tsx`
  - renders all 6 level options

- [x] Write `client/src/components/SidePanel/OpenClaw/__tests__/OpenClawSkillsPanel.test.tsx`
  - renders skill list

## Build Verification

- [x] Run `npm run build:data-provider` — PASS
- [x] Run `cd packages/api && npx jest endpoints/openclaw` — 29 tests PASS
- [x] Run frontend `jest --testPathPatterns OpenClaw|ThinkingLevel` — 15 tests PASS
