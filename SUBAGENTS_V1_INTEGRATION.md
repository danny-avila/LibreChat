# #13898 integration patch spec — subagent loading over `/v1`

**Status: UNVALIDATED.** Apply these edits on the staging build host (runbook Phase 3),
then `npm run build && npm run test:api`. Do NOT merge until green + a live `/v1`
subagent spawn is confirmed on staging. Anchors verified against `fix/subagents-over-v1`
(recon 2026-07-08).

The shared helper (`packages/api/src/agents/subagents.ts`, committed) must be reconciled
to the ACTUAL closure signatures below before wiring — see §0.

---

## §0 — Reconcile the helper to the real signatures (IMPORTANT)

The committed `subagents.ts` used a `params/deps` object shape. The real JWT closures use:
- `loadSubagentsFor(config, depth = 0)` — mutates `config.subagentAgentConfigs`.
- `resolveSubagentTrees(rootConfigs)` — positional array `[primaryConfig, ...agentConfigs.values()]`.

Reconcile the helper to a **factory** that closes over the shared state (matches the existing
code's closure style, minimal churn) rather than threading 9 params on every call:

```ts
// packages/api/src/agents/subagents.ts  (factory shape)
export function createSubagentLoader(deps: {
  primaryConfig: InitializedAgent;
  skippedAgentIds: Set<string>;
  edgeAgentIds: Set<string>;
  pureSubagentIds: Set<string>;
  subagentGraphIds: Set<string>;
  loadedSubagentConfigIds: Set<string>;
  maxResolvedDepthByConfigId: Map<string, number>;
  loadAgentById: (id: string) => Promise<InitializedAgent | null>;
  assertSubagentGraphRoom: (id: string) => void;
  maxSubagentDepth: number;
  /** #13898: load-time ACL. JWT path passes allow-all; /v1 passes REMOTE_AGENT+VIEW. */
  checkSubagentAccess?: (agentId: string) => Promise<boolean>;
}) {
  const loadSubagentsFor = async (config, depth = 0) => { /* body from initialize.js 615–707,
     with the ACL check inserted right before `const subagentConfig = await loadAgentById(...)` */ };
  const resolveSubagentTrees = async (rootConfigs) => { /* body from initialize.js 714–717 */ };
  return { loadSubagentsFor, resolveSubagentTrees };
}
```
This keeps the extraction behavior-identical to the closures (the whole point of "no behavior
change" on the JWT path) while making the ACL injectable.

---

## §1 — `api/server/services/Endpoints/agents/initialize.js` (JWT path, minimal diff)

**1a. Add to the `@librechat/api` destructure (line 3–17 block):**
```js
  createSubagentLoader,
```

**1b. DELETE the inline closures** — lines **615–707** (`loadSubagentsFor`) and **714–717**
(`resolveSubagentTrees`). **KEEP** line 709 (`const maxResolvedDepthByConfigId = new Map();`)
and the JSDoc 711–713.

**1c. Immediately before the call site (was line 719), instantiate the loader** with an
**allow-all** check (preserves today's JWT behavior — no load-time ACL, relies on SDK
spawn-time callback):
```js
  const { resolveSubagentTrees } = createSubagentLoader({
    primaryConfig, skippedAgentIds, edgeAgentIds, pureSubagentIds,
    subagentGraphIds, loadedSubagentConfigIds, maxResolvedDepthByConfigId,
    loadAgentById, assertSubagentGraphRoom,
    maxSubagentDepth: MAX_SUBAGENT_DEPTH,
    // JWT/browser path: no load-time gate (unchanged behavior)
    checkSubagentAccess: undefined,
  });
```

**1d. Leave the call site unchanged (was line 719):**
```js
  await resolveSubagentTrees([primaryConfig, ...agentConfigs.values()]);
```
Gate the whole block on `subagentsCapabilityEnabled` exactly as before (line 572).

---

## §2 — `api/server/controllers/agents/openai.js` (the /v1 fix)

After `primaryConfig.edges = discoveredEdges;` and BEFORE `const runAgents = [...]`
(recon put this ~line 472), add — gated by the subagents capability:

```js
    if (subagentsCapabilityEnabled) {
      const { resolveSubagentTrees } = createSubagentLoader({
        primaryConfig,
        skippedAgentIds,            // reuse the discovery skip set
        edgeAgentIds: new Set([primaryConfig.id, ...handoffAgentConfigs.keys()]),
        pureSubagentIds: new Set(),
        subagentGraphIds: new Set(),
        loadedSubagentConfigIds: new Set(),
        maxResolvedDepthByConfigId: new Map(),
        loadAgentById,              // same loader used for handoffs in this controller
        assertSubagentGraphRoom,
        maxSubagentDepth: MAX_SUBAGENT_DEPTH,
        // #13898 SECURITY: /v1 must re-check REMOTE_AGENT + VIEW, same gate as handoffs
        checkSubagentAccess: buildRemoteAgentSubagentAccessCheck(req, checkPermission, ResourceType.REMOTE_AGENT),
      });
      await resolveSubagentTrees([primaryConfig, ...handoffAgentConfigs.values()]);
    }
```
- Import `createSubagentLoader` + `buildRemoteAgentSubagentAccessCheck` from `@librechat/api`.
- `checkPermission` here is the SAME `getRemoteAgentPermissions`-backed check the controller
  already passes to `discoverConnectedAgents` (do NOT introduce a second permission path).
- Compute `subagentsCapabilityEnabled` from `enabledCapabilities.has(AgentCapabilities.subagents)`
  (mirror initialize.js line 572) if not already in scope.
- Confirm `loadAgentById` / `assertSubagentGraphRoom` exist in this controller; if not, build
  the minimal equivalents (loadAgentById = getAgent + initializeAgent; graph-room = the
  MAX_SUBAGENT_GRAPH_NODES guard). **This is the main build-time unknown — verify on staging.**

## §3 — `api/server/controllers/agents/responses.js`

Identical insertion after `primaryConfig.edges = discoveredEdges;` (recon ~line 568), same
gating, same REMOTE_AGENT check.

---

## §4 — Tests (`packages/api/src/agents/subagents.spec.ts`)

Mirror `discovery.spec.ts`: (a) BFS resolves nested A→B→C; (b) depth guard throws past
MAX_SUBAGENT_DEPTH; (c) cycle guard (A↔B) resolves to primary, no infinite loop;
(d) graph-node cap enforced; (e) **allow-all check loads all** (JWT parity); (f) **REMOTE_AGENT
check skips a subagent the user lacks VIEW on** (the /v1 security property — the reason this PR exists).

---

## §5 — Validation gate (staging Phase 3)
1. `npm run build` clean.
2. `npm run test:api` — new spec + existing agents suites green.
3. LIVE: POST staging `/api/agents/v1/chat/completions` with an sk- key invoking Mr Spera;
   confirm its Accelo/Workspace **subagents spawn** (broken in prod today, #46/#13898).
4. Regression: browser/JWT chat with Mr Spera still spawns subagents (no behavior change).
5. Negative: an sk- key whose user lacks VIEW on a subagent does NOT spawn it.