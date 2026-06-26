# Memory Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LibreChat memory work for Graupel's standard (non-agent) chat path — auto-extract user facts + inject them into context across the curated models, visible/manageable by normal users.

**Architecture:** Port the memory read (inject) + write (extract) logic from `AgentClient` into `BaseClient.sendMessage` (which all standard endpoints inherit), as thin methods that reuse `packages/api` (`createMemoryProcessor`, `memoryInstructions`, `isMemoryAgentEnabled`, `checkAccess`) + `~/models` (`getFormattedMemories`, `setMemory`, `deleteMemory`). Add a `memory` config block (cheap gptsapi extraction model). Remove the admin-only gate on the memory side panel.

**Tech Stack:** JS (`/api` BaseClient, thin) · TS reuse in `packages/api`/`packages/data-schemas` (unchanged) · React (`client`, one-line gate change) · Jest · YAML config.

**Spec:** [docs/superpowers/specs/2026-06-26-graupel-memory-fix-design.md](../specs/2026-06-26-graupel-memory-fix-design.md)

## Global Constraints

- **Reuse, don't reimplement**: injection uses `db.getFormattedMemories`; extraction uses `createMemoryProcessor` (from `@librechat/api`) — skip `initializeAgent` (BaseClient isn't agent-based). Memory orchestration lives as thin `BaseClient` methods, mirroring `AgentClient.useMemory`/`runMemory`. No changes to `AgentClient` or `packages/api` memory code.
- **Gating (all must pass to inject/extract)**: `req.config.memory` present and `!disabled`; user not opted out (`req.user.personalization?.memories !== false`); `MEMORIES.USE` permission (`checkAccess`); **NOT a temporary chat** (`req.body.isTemporary` falsy). Extraction additionally requires `isMemoryAgentEnabled(memoryConfig)`.
- **Extraction is best-effort**: fire-and-forget with a 3s timeout (`Promise.race`), mirroring `AgentClient.awaitMemoryWithTimeout`. A failure/timeout must NOT block or fail the chat response.
- **`this.user` is the userId string** — the db memory methods accept `string | ObjectId`, pass `this.user` directly.
- **Extraction model** = config `memory.agent` (provider `openAI` + model `gemini-2.5-flash-lite`, routed to gptsapi via `OPENAI_REVERSE_PROXY`). Cheap by design.
- **No gating (billing) integration.** No schema changes (reuse `MemoryEntry`). No new frontend components (reuse `SidePanel/Memories`).
- **Tests**: `cd api && npx jest <pattern>` (BaseClient lives in `/api`; no Mongo needed if memory db methods are stubbed). Client test: `cd client && npx jest <pattern>`.
- Two config files: `graupel.yaml.example` (committed) + `librechat.yaml` (gitignored, local — for runtime verification).

## File Structure

- **Modify** `api/app/clients/BaseClient.js`: add `injectMemoryContext(payload)` (read) + `runMemory(messages)` + `awaitMemoryWithTimeout(promise)` methods; call them in `sendMessage` (inject before `sendCompletion`, extract after).
- **Modify** `graupel.yaml.example` + `librechat.yaml`: add `memory:` block.
- **Modify** `client/src/hooks/Nav/useSideNavLinks.ts:159`: drop `isAdmin &&`.
- **Test**: `api/app/clients/__tests__/BaseClient.memory.spec.js` (new); `client/src/hooks/Nav/` test for the gate (extend or new).

Reference (read-only, do not change): `api/server/controllers/agents/client.js` (`useMemory` ~513, `runMemory` ~700, `awaitMemoryWithTimeout` ~488); `packages/api/src/agents/memory.ts` (`createMemoryProcessor` ~507).

---

## Task 1: Memory config + injection (read path)

**Files:** Modify `api/app/clients/BaseClient.js`, `graupel.yaml.example`, `librechat.yaml`. Test: `api/app/clients/__tests__/BaseClient.memory.spec.js`.

**Interfaces — Produces:** `BaseClient.prototype.injectMemoryContext(payload): Promise<payload>` — gated; prepends a system message with existing memories. Consumed by `sendMessage`.

- [ ] **Step 1: Add the `memory` config block** to BOTH `graupel.yaml.example` and `librechat.yaml` (top-level):

```yaml
memory:
  disabled: false
  personalize: true
  messageWindowSize: 5
  agent:
    enabled: true
    provider: "openAI"               # routed to gptsapi via OPENAI_REVERSE_PROXY
    model: "gemini-2.5-flash-lite"
    instructions: >
      Extract durable facts about the user worth remembering across chats:
      stated preferences (response format, tone, length), working context
      (languages, frameworks, projects, role), and stable personal facts.
      Do NOT store secrets, passwords, API keys, health, or financial details.
      Update/replace existing keys rather than duplicating.
```

- [ ] **Step 2: Write the failing test** — `api/app/clients/__tests__/BaseClient.memory.spec.js`. Use the existing `FakeClient` test pattern (see `api/app/clients/__tests__/BaseClient.test.js` / `FakeClient.js`). Stub `~/models` memory methods.

```js
const { Constants } = require('librechat-data-provider');
jest.mock('~/models', () => ({
  getFormattedMemories: jest.fn(),
  setMemory: jest.fn(),
  deleteMemory: jest.fn(),
  getRoleByName: jest.fn().mockResolvedValue({ permissions: { MEMORIES: { USE: true } } }),
}));
const db = require('~/models');
const BaseClient = require('../BaseClient');

// minimal concrete client
class TestClient extends BaseClient {
  constructor(opts) { super('key', opts); }
  async sendCompletion() { return { completion: 'hi', metadata: {} }; }
  getBuildMessagesOptions() { return {}; }
  buildMessages() {}
}

const makeClient = (overrides = {}) => {
  const req = {
    body: { isTemporary: false },
    user: { id: 'u1', role: 'USER', personalization: { memories: true } },
    config: { memory: { disabled: false, personalize: true, messageWindowSize: 5, agent: { enabled: true, provider: 'openAI', model: 'gemini-2.5-flash-lite' } } },
    ...(overrides.req || {}),
  };
  const c = new TestClient({ req, res: {}, ...overrides.opts });
  c.user = 'u1';
  c.conversationId = 'c1';
  c.responseMessageId = 'r1';
  return c;
};

describe('BaseClient.injectMemoryContext', () => {
  beforeEach(() => jest.clearAllMocks());

  it('prepends a system message with existing memories when enabled', async () => {
    db.getFormattedMemories.mockResolvedValue({ withoutKeys: '1. likes concise code', withKeys: '', totalTokens: 3 });
    const c = makeClient();
    const payload = [{ role: 'user', content: 'hi' }];
    const result = await c.injectMemoryContext(payload);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('likes concise code');
    expect(result.length).toBe(2);
  });

  it('does NOT inject for temporary chats', async () => {
    db.getFormattedMemories.mockResolvedValue({ withoutKeys: 'x', withKeys: '', totalTokens: 1 });
    const c = makeClient({ req: { body: { isTemporary: true }, user: { id: 'u1', role: 'USER', personalization: { memories: true } }, config: { memory: { disabled: false } } } });
    const payload = [{ role: 'user', content: 'hi' }];
    expect(await c.injectMemoryContext(payload)).toBe(payload);
    expect(db.getFormattedMemories).not.toHaveBeenCalled();
  });

  it('does NOT inject when user opted out', async () => {
    const c = makeClient({ req: { body: {}, user: { id: 'u1', role: 'USER', personalization: { memories: false } }, config: { memory: { disabled: false } } } });
    expect(await c.injectMemoryContext([{ role: 'user', content: 'hi' }])).toHaveLength(1);
    expect(db.getFormattedMemories).not.toHaveBeenCalled();
  });

  it('does NOT inject when memory config absent/disabled', async () => {
    const c = makeClient({ req: { body: {}, user: { id: 'u1', role: 'USER' }, config: {} } });
    expect(await c.injectMemoryContext([{ role: 'user', content: 'hi' }])).toHaveLength(1);
  });

  it('returns payload unchanged when no memories exist', async () => {
    db.getFormattedMemories.mockResolvedValue({ withoutKeys: '', withKeys: '', totalTokens: 0 });
    const c = makeClient();
    const payload = [{ role: 'user', content: 'hi' }];
    expect((await c.injectMemoryContext(payload)).length).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test — verify it fails**

Run: `cd api && npx jest app/clients/__tests__/BaseClient.memory.spec.js -t injectMemoryContext`
Expected: FAIL (`injectMemoryContext is not a function`).

- [ ] **Step 4: Implement `injectMemoryContext`** in `BaseClient.js`. Add the import at the top (near other `@librechat/api` requires) and the method (near `addInstructions`, ~line 315):

```js
// top of file (add to existing requires)
const { checkAccess, memoryInstructions, isMemoryAgentEnabled } = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const db = require('~/models');

// method on BaseClient
async memoryEnabled() {
  const req = this.options?.req;
  if (!req) return null;
  if (req.body?.isTemporary) return null;                       // temp chat bypass
  if (req.user?.personalization?.memories === false) return null; // user opt-out
  const memoryConfig = req.config?.memory;
  if (!memoryConfig || memoryConfig.disabled === true) return null;
  const hasAccess = await checkAccess({
    user: req.user,
    permissionType: PermissionTypes.MEMORIES,
    permissions: [Permissions.USE],
    getRoleByName: db.getRoleByName,
  });
  if (!hasAccess) return null;
  return memoryConfig;
}

async injectMemoryContext(payload) {
  const memoryConfig = await this.memoryEnabled();
  if (!memoryConfig) return payload;
  try {
    const { withoutKeys } = await db.getFormattedMemories({ userId: this.user });
    if (!withoutKeys) return payload;
    const content = `${memoryInstructions}\n\n# Existing memory about the user:\n${withoutKeys}`;
    return this.addInstructions(payload, { role: 'system', content });
  } catch (err) {
    logger.error('[BaseClient] memory injection failed', err);
    return payload;
  }
}
```

- [ ] **Step 5: Wire injection into `sendMessage`** — after `buildMessages` returns `payload` (~line 470), before `sendCompletion` (~line 571):

```js
// after: let { prompt: payload, tokenCountMap, promptTokens } = await this.buildMessages(...);
payload = await this.injectMemoryContext(payload);
```
> Note: `payload` is already `let`. If a later step recomputes token counts from `payload`, injection happens before `sendCompletion` so the system message is included in the request; token accounting drift is acceptable (memory text is small).

- [ ] **Step 6: Run the test — verify it passes**

Run: `cd api && npx jest app/clients/__tests__/BaseClient.memory.spec.js -t injectMemoryContext`
Expected: PASS (5/5).

- [ ] **Step 7: Lint + commit**

Run: `cd api && npx eslint app/clients/BaseClient.js`
```bash
git add api/app/clients/BaseClient.js api/app/clients/__tests__/BaseClient.memory.spec.js graupel.yaml.example
git commit -m "feat(memory): inject existing memories into standard chat payload (BaseClient)"
```

---

## Task 2: Memory extraction (write path)

**Files:** Modify `api/app/clients/BaseClient.js`. Test: extend `api/app/clients/__tests__/BaseClient.memory.spec.js`.

**Interfaces — Consumes:** `memoryEnabled()` (Task 1), `createMemoryProcessor` from `@librechat/api`. **Produces:** `runMemory(messages)` + `awaitMemoryWithTimeout(promise)`; extraction triggered in `sendMessage` after `sendCompletion`.

- [ ] **Step 1: Write the failing test** (append to the spec file):

```js
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  createMemoryProcessor: jest.fn(),
}));
const { createMemoryProcessor } = require('@librechat/api');
const { HumanMessage } = require('@librechat/agents/langchain/messages');

describe('BaseClient.runMemory (extraction)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds a buffer message from recent messages and calls the processor', async () => {
    const processMemory = jest.fn().mockResolvedValue([]);
    createMemoryProcessor.mockResolvedValue(['', processMemory]);
    const c = makeClient();
    const msgs = [
      { role: 'user', content: 'my name is Tian' },
      { role: 'assistant', content: 'noted' },
    ];
    await c.runMemory(msgs);
    expect(createMemoryProcessor).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      memoryMethods: expect.objectContaining({ setMemory: expect.any(Function) }),
      config: expect.objectContaining({ llmConfig: expect.objectContaining({ model: 'gemini-2.5-flash-lite' }) }),
    }));
    expect(processMemory).toHaveBeenCalledWith([expect.any(HumanMessage)]);
  });

  it('skips extraction when memory agent is not enabled', async () => {
    const c = makeClient({ req: { body: {}, user: { id: 'u1', role: 'USER', personalization: { memories: true } }, config: { memory: { disabled: false, agent: { enabled: false } } } } });
    await c.runMemory([{ role: 'user', content: 'x' }]);
    expect(createMemoryProcessor).not.toHaveBeenCalled();
  });

  it('skips extraction for temporary chats', async () => {
    const c = makeClient({ req: { body: { isTemporary: true }, user: { id: 'u1', role: 'USER', personalization: { memories: true } }, config: { memory: { disabled: false, agent: { enabled: true, provider: 'openAI', model: 'm' } } } } });
    await c.runMemory([{ role: 'user', content: 'x' }]);
    expect(createMemoryProcessor).not.toHaveBeenCalled();
  });

  it('awaitMemoryWithTimeout resolves undefined on timeout without throwing', async () => {
    const c = makeClient();
    const never = new Promise(() => {});
    await expect(c.awaitMemoryWithTimeout(never, 50)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd api && npx jest app/clients/__tests__/BaseClient.memory.spec.js -t "extraction"`
Expected: FAIL (`runMemory is not a function`).

- [ ] **Step 3: Implement `runMemory` + `awaitMemoryWithTimeout`** in `BaseClient.js` (add imports `createMemoryProcessor`, `isMemoryAgentEnabled`, `getBufferString`/`HumanMessage`):

```js
const { getBufferString, HumanMessage } = require('@librechat/agents/langchain/messages');

async runMemory(messages) {
  const memoryConfig = await this.memoryEnabled();
  if (!memoryConfig || !isMemoryAgentEnabled(memoryConfig)) return;
  try {
    const agentCfg = memoryConfig.agent;
    const llmConfig = {
      provider: agentCfg.provider,
      model: agentCfg.model,
      ...(agentCfg.model_parameters ?? {}),
    };
    const config = {
      validKeys: memoryConfig.validKeys,
      instructions: agentCfg.instructions,
      llmConfig,
      tokenLimit: memoryConfig.tokenLimit,
    };
    const [, processMemory] = await createMemoryProcessor({
      userId: this.user,
      conversationId: `${this.conversationId}`,
      messageId: `${this.responseMessageId}`,
      config,
      memoryMethods: {
        setMemory: db.setMemory,
        deleteMemory: db.deleteMemory,
        getFormattedMemories: db.getFormattedMemories,
      },
      res: this.options.res,
    });

    const windowSize = memoryConfig.messageWindowSize ?? 5;
    const recent = messages.slice(-windowSize);
    const bufferString = getBufferString(recent);
    const bufferMessage = new HumanMessage(`# Current Chat:\n\n${bufferString}`);
    return await processMemory([bufferMessage]);
  } catch (err) {
    logger.error('[BaseClient] memory extraction failed', err);
  }
}

async awaitMemoryWithTimeout(memoryPromise, timeoutMs = 3000) {
  if (!memoryPromise) return;
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Memory timeout')), timeoutMs));
    return await Promise.race([memoryPromise, timeout]);
  } catch (err) {
    logger.warn('[BaseClient] memory extraction timed out/failed', err?.message);
    return undefined;
  }
}
```
> `getBufferString`/`HumanMessage` accept role/content message objects; BaseClient's `payload`/messages are `{role, content}` shaped — pass the recent slice directly. (If a client's message shape differs, map to `{role, content}` first; verify against the OpenAI-compatible payload.)

- [ ] **Step 4: Wire extraction into `sendMessage`** — after `sendCompletion` (~line 571), non-blocking + bounded:

```js
const { completion, metadata } = await this.sendCompletion(payload, opts);
// fire-and-forget memory extraction (best-effort, bounded)
const memoryPromise = this.runMemory([
  ...payload,
  { role: 'assistant', content: typeof completion === 'string' ? completion : '' },
]);
this.awaitMemoryWithTimeout(memoryPromise);   // not awaited in the response path
```
> Do NOT `await` the extraction in the response path (best-effort). `awaitMemoryWithTimeout` swallows errors so the floating promise can't crash the request.

- [ ] **Step 5: Run — verify it passes**

Run: `cd api && npx jest app/clients/__tests__/BaseClient.memory.spec.js`
Expected: PASS (all injection + extraction tests).

- [ ] **Step 6: Lint + commit**

Run: `cd api && npx eslint app/clients/BaseClient.js`
```bash
git add api/app/clients/BaseClient.js api/app/clients/__tests__/BaseClient.memory.spec.js
git commit -m "feat(memory): auto-extract memories after standard chat completion (BaseClient)"
```

---

## Task 3: Frontend visibility — show memory panel to normal users

**Files:** Modify `client/src/hooks/Nav/useSideNavLinks.ts:159`. Test: `client/src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx` (new or extend).

**Interfaces — Consumes:** nothing from prior tasks (independent).

- [ ] **Step 1: Write the failing test** — assert a non-admin user with MEMORIES USE+READ gets the `memories` nav link.

```tsx
// minimal: mock useAuthContext (role USER) + useHasAccess (true), render the hook, assert a link with id 'memories' exists.
// Mirror the existing useSideNavLinks test setup if present; otherwise mock the hook's deps and call it via renderHook.
import { renderHook } from '@testing-library/react';
// ... mocks for useAuthContext -> { user: { role: 'USER' } }, useHasAccess -> true, other deps ...
it('includes the memories panel for a non-admin user with memory permissions', () => {
  const { result } = renderHook(() => useSideNavLinks(/* required props */));
  expect(result.current.some((l) => l.id === 'memories')).toBe(true);
});
```
> Inspect the existing hook signature/props and any existing test in `client/src/hooks/Nav/` to wire the mocks correctly (the hook takes several props: endpoint, keyProvider, etc.). Keep the test focused on the memories-link gating.

- [ ] **Step 2: Run — verify it fails**

Run: `cd client && npx jest src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx`
Expected: FAIL (link absent because of the `isAdmin &&` gate).

- [ ] **Step 3: Remove the admin gate** — `client/src/hooks/Nav/useSideNavLinks.ts:159`:

```ts
// before:
if (isAdmin && hasAccessToMemories && hasAccessToReadMemories) {
// after:
if (hasAccessToMemories && hasAccessToReadMemories) {
```
(Leave `isAdmin` defined — it's used elsewhere; only this condition changes.)

- [ ] **Step 4: Run — verify it passes**

Run: `cd client && npx jest src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `cd client && npx tsc --noEmit` (no NEW errors in the file; baseline ~159).
```bash
git add client/src/hooks/Nav/useSideNavLinks.ts client/src/hooks/Nav/__tests__/useSideNavLinks.spec.tsx
git commit -m "feat(memory): show memory side panel to non-admin users with permission"
```

---

## Runtime Verification (after all tasks; run the app)

Restart backend (loads `memory` config), reload frontend. As a normal (non-admin) user:
1. Memory panel appears in the side nav (Task 3).
2. Chat with the default Gemini model, share a personal fact ("I'm Tian, I prefer concise code"). Within a few seconds the Memory panel shows an auto-extracted entry (Task 2 extraction via gemini-2.5-flash-lite — confirm in backend logs it used that cheap model).
3. Open a new conversation, ask "what's my name / my preference" → the model answers from injected memory (Task 1 injection).
4. Manually add/edit/delete a memory in the panel → works (existing CRUD). Toggle opt-out in Personalization settings → injection/extraction stop.
5. In a Temporary Chat, share a fact → NOT extracted/injected (bypass).
6. Share a fake secret ("my password is X") → should not be stored as a memory (extraction instructions).

---

## Self-Review

- **Spec coverage:** §4.1 injection → Task 1. §4.2 extraction → Task 2. §4.3 reuse (createMemoryProcessor, skip initializeAgent) → Task 2 Step 3. §5 config + extraction model + instructions → Task 1 Step 1. §6 frontend visibility → Task 3. §2 temp-chat bypass → `memoryEnabled()` gate (Tasks 1+2). §2 sensitive exclusion → instructions (Task 1 config). §8 verification → Runtime Verification.
- **Placeholder scan:** Task 3 test references "existing hook signature/props" — the implementer must read the hook to wire mocks; the test intent + assertion are concrete. The `getBufferString` message-shape note is a real verification, not a placeholder.
- **Type/name consistency:** `memoryEnabled()` defined in Task 1, consumed in Task 2; `injectMemoryContext`/`runMemory`/`awaitMemoryWithTimeout` names consistent; `createMemoryProcessor` arg shape matches the verified signature (`userId`, `conversationId`, `messageId`, `config:{validKeys,instructions,llmConfig,tokenLimit}`, `memoryMethods:{setMemory,deleteMemory,getFormattedMemories}`, `res`); db methods (`getFormattedMemories`→`{withoutKeys}`, `setMemory`, `deleteMemory`) match.
- **Open risk (carry to verification):** (a) whether `memory.agent` with `provider:'openAI'` + `model:'gemini-2.5-flash-lite'` resolves the OPENAI_REVERSE_PROXY to gptsapi for the extraction LLM — if extraction errors, fall back to `model_parameters.configuration.baseURL` override or a `memory.agent.id` saved agent (spec §5). (b) `getBufferString` accepting BaseClient's `{role,content}` payload shape — verify; map if needed.
