# #13898 integration patch spec — subagent loading over `/v1`

**Status: UNVALIDATED.** Apply on the staging build host (runbook Phase 3), then
`npm run build && npm run test:api`. Do NOT merge until green + a live `/v1`
subagent spawn is confirmed on staging. Anchors verified against `fix/subagents-over-v1`
(recon 2026-07-08). §2/§3 build-time unknown is now RESOLVED (see §2).

Helper: `packages/api/src/agents/subagents.ts` (committed) — reconcile to the factory
shape in §0 before wiring.

---

## §0 — Reconcile the helper to the real signatures

Real JWT closures: `loadSubagentsFor(config, depth=0)` (mutates `config.subagentAgentConfigs`),
`resolveSubagentTrees(rootConfigs)` (positional array). Reconcile `subagents.ts` to a factory
closing over shared state (matches existing closure style, minimal churn):

```ts
export function createSubagentLoader(deps: {
  primaryConfig; skippedAgentIds; edgeAgentIds; pureSubagentIds; subagentGraphIds;
  loadedSubagentConfigIds; maxResolvedDepthByConfigId;
  loadAgentById: (id: string) => Promise<InitializedAgent | null>;
  assertSubagentGraphRoom: (id: string) => void;
  maxSubagentDepth: number;
  checkSubagentAccess?: (agentId: string) => Promise<boolean>;  // #13898 ACL, injectable
}) { /* loadSubagentsFor body = initialize.js 615–707 + ACL check before loadAgentById;
        resolveSubagentTrees body = initialize.js 714–717 */ 
  return { loadSubagentsFor, resolveSubagentTrees };
}
```

---

## §1 — `initialize.js` (JWT path, minimal diff)

- **1a.** Add `createSubagentLoader,` to the `@librechat/api` destructure.
- **1b.** DELETE inline closures lines **615–707** + **714–717**. KEEP line 709
  (`maxResolvedDepthByConfigId`) + JSDoc 711–713.
- **1c.** Before the call site, instantiate with **allow-all** ACL (preserves today's behavior):
```js
const { resolveSubagentTrees } = createSubagentLoader({
  primaryConfig, skippedAgentIds, edgeAgentIds, pureSubagentIds,
  subagentGraphIds, loadedSubagentConfigIds, maxResolvedDepthByConfigId,
  loadAgentById, assertSubagentGraphRoom,
  maxSubagentDepth: MAX_SUBAGENT_DEPTH,
  checkSubagentAccess: undefined,          // JWT path: no load-time gate (unchanged)
});
```
- **1d.** Call site unchanged: `await resolveSubagentTrees([primaryConfig, ...agentConfigs.values()]);`
  Still gated on `subagentsCapabilityEnabled` (line 572).

---

## §2 — `openai.js` (the /v1 fix) — DEFINITIVE (recon-resolved)

**Recon 2026-07-08 confirmed:** this controller does **NOT** have `loadAgentById`,
`assertSubagentGraphRoom`, or `MAX_SUBAGENT_*`; `checkPermission` exists only inside the
`discoverConnectedAgents` callback closure; `getRemoteAgentPermissions` **is** imported.
So we BUILD the missing pieces locally (no "verify" hedge).

**2a. Imports** — add to the `require('@librechat/api')` block:
```js
  createSubagentLoader, buildRemoteAgentSubagentAccessCheck,
  MAX_SUBAGENT_DEPTH, MAX_SUBAGENT_GRAPH_NODES,
```
(`getRemoteAgentPermissions`, `discoverConnectedAgents`, `initializeAgent`, `ResourceType`,
`AgentCapabilities` already imported.)

**2b. Capability flag** — after `enabledCapabilities` (recon line ~253):
```js
const subagentsCapabilityEnabled = enabledCapabilities.has(AgentCapabilities.subagents);
```

**2c. Insertion** — after `primaryConfig.edges = discoveredEdges;` (recon ~line 399/472),
before `runAgents`:
```js
if (subagentsCapabilityEnabled) {
  // getAgent is available via the discovery deps (db.getAgent); reuse it.
  const subagentGraphIds = new Set([primaryConfig.id, ...handoffAgentConfigs.keys()]);
  const loadAgentById = async (id) => {
    const agent = await getAgent({ id });
    if (!agent) return null;
    return initializeAgent({ req, res, agent, endpointOption, allowedProviders,
      modelsConfig, loadTools, requestFiles: [], conversationId, parentMessageId,
      resourceType: ResourceType.REMOTE_AGENT }, dbMethods);
  };
  const assertSubagentGraphRoom = (id) => {
    if (subagentGraphIds.size >= MAX_SUBAGENT_GRAPH_NODES) {
      throw new Error(`Subagent graph exceeds MAX_SUBAGENT_GRAPH_NODES (${MAX_SUBAGENT_GRAPH_NODES}) at ${id}.`);
    }
  };
  const checkPermission = async ({ userId, role, resourceId, requiredPermission }) => {
    const perms = await getRemoteAgentPermissions({ getEffectivePermissions }, userId, role, resourceId);
    return hasPermissions(perms, requiredPermission);
  };
  const { resolveSubagentTrees } = createSubagentLoader({
    primaryConfig, skippedAgentIds,
    edgeAgentIds: new Set([primaryConfig.id, ...handoffAgentConfigs.keys()]),
    pureSubagentIds: new Set(), subagentGraphIds,
    loadedSubagentConfigIds: new Set(), maxResolvedDepthByConfigId: new Map(),
    loadAgentById, assertSubagentGraphRoom,
    maxSubagentDepth: MAX_SUBAGENT_DEPTH,
    // #13898 SECURITY: same REMOTE_AGENT + VIEW gate discoverConnectedAgents uses
    checkSubagentAccess: buildRemoteAgentSubagentAccessCheck(req, checkPermission, ResourceType.REMOTE_AGENT),
  });
  await resolveSubagentTrees([primaryConfig, ...handoffAgentConfigs.values()]);
}
```
> Build-time confirmations (fast, on staging compile): `getAgent`/`dbMethods`/`getEffectivePermissions`/
> `hasPermissions` names as bound in this file's discovery call — copy the exact identifiers the
> existing `discoverConnectedAgents({...},{ getAgent, checkPermission, ... })` block uses (recon lines
> 368–396). If `getEffectivePermissions`/`hasPermissions` aren't in scope, lift them from the same
> import used by the closure at 377–387.

## §3 — `responses.js` — identical

Same 2a/2b/2c, insertion after `primaryConfig.edges = discoveredEdges;` (recon ~line 438/568).
Same imports, same local builders, same REMOTE_AGENT check. `getRemoteAgentPermissions` is
already imported here too.

---

## §4 — Tests (`packages/api/src/agents/subagents.spec.ts`)
Mirror `discovery.spec.ts`: (a) nested A→B→C BFS; (b) depth guard throws; (c) cycle A↔B →
primary, no loop; (d) graph-node cap; (e) allow-all loads all (JWT parity); (f) REMOTE_AGENT
check SKIPS a subagent the user lacks VIEW on (the /v1 security property — the reason for this PR).

---

## §5 — Validation gate (staging Phase 3)
1. `npm run build` clean.
2. `npm run test:api` — new spec + existing agents suites green.
3. LIVE: POST staging `/api/agents/v1/chat/completions` (sk- key) invoking Mr Spera → confirm
   its subagents spawn (broken in prod, #46/#13898). [Note: staging graph = 4 agents (Mr Spera,
   IT Helpdesk, Doc Router, Security Reviewer) — validates the mechanism; Accelo/Workspace wiring
   is a separate email-Phase-2 question, see librechat-infra#146.]
4. Regression: browser/JWT chat with Mr Spera still spawns subagents (no behavior change).
5. Negative: sk- key whose user lacks VIEW on a subagent does NOT spawn it.