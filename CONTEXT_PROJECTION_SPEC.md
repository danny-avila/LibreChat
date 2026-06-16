# Context Projection — Aligning the Gauge with the SDK in Every State

**Branch:** `feat/context-projection` (off `origin/dev` @ `054fa4bfa7`)
**Goal:** The gauge should always render the agents SDK's authoritative view of "what context am I dealing with" — before usage (pre-send / load / switch) and after (real provider usage). The client's `sumBranch` estimate is the one number that *isn't* the SDK's, and it's active exactly where we currently have no SDK data. This spec closes that gap.

---

## 1. Current state on `dev` — what already works

The layered design is further along than the stale `feat/context-usage-tracking` branch suggested. On dev:

- **Live stream / resume:** `on_context_usage` is post-prune and reconciled to real provider tokens (#13780). Authoritative.
- **Persisted snapshot (Increment 1 — DONE):**
  - Backend writes the reconciled post-prune snapshot to `responseMessage.metadata.contextUsage` ([api/server/controllers/agents/client.js:897](api/server/controllers/agents/client.js), via `buildPersistedContextUsage` in [packages/api/src/agents/usage.ts:286](packages/api/src/agents/usage.ts)).
  - Client rehydrates per-branch snapshots from `metadata.contextUsage` on load — `hydrateSnapshots()` ([client/src/store/usage.ts:149](client/src/store/usage.ts)), called from `useTokenUsage` ([client/src/hooks/Chat/useTokenUsage.ts:128](client/src/hooks/Chat/useTokenUsage.ts)) into `snapshotsByAnchorFamily`, recovered per-branch via `findBranchSnapshotAnchor`.
- **Estimate fallback** is summary-baseline-aware: it stops the branch walk at the deepest summarized response and adds `summaryBaseline`, so it no longer pegs at 100% forever after a compaction ([useTokenUsage.ts:235-241](client/src/hooks/Chat/useTokenUsage.ts)).

So a reloaded conversation **does** show the SDK's authoritative breakdown for any turn generated with the feature on. Increment 1 is shipped; this spec does **not** redo it.

---

## 2. Residual gaps (the two edge cases)

**G1 — Window / model switch staleness (snapshot-backed branches).**
The snapshot path uses the max baked at generation time: `maxTokens = activeSnapshot.contextBudget ?? breakdown.maxContextTokens` ([useTokenUsage.ts:205](client/src/hooks/Chat/useTokenUsage.ts)), with **no comparison to the currently-resolved window** (`limits.maxContextTokens`). Switch the model/`maxContextTokens` without regenerating and the gauge shows the *old* window and the *old* prune boundary until the next send.

**G2 — Snapshot-less branches.**
Any branch with no `metadata.contextUsage` falls to the `sumBranch` estimate, which sums every (post-summary) message with **no window cap and no prune awareness** ([utils/tokens.ts:96](client/src/utils/tokens.ts)). For a long un-summarized branch beyond the window it over-reports and pegs. Hit by: pre-feature history, non-agent endpoints, foreign/imported conversations, and the live edge of a branch not yet generated this session.

Both are precisely what an SDK projection resolves: it re-runs the *real* prune+budget math for the *current* config over the branch, regardless of whether a prior generation exists.

---

## 3. Architecture: a third SDK-sourced layer

The view-model precedence becomes:

1. **Live snapshot** (streaming this branch) — unchanged.
2. **Persisted snapshot** (`metadata.contextUsage`) — **only when its baked `maxContextTokens` equals the currently-resolved window** (fixes G1).
3. **Projection** (NEW) — SDK-computed post-prune breakdown for `(branch, resolved config)`, fetched on load / branch-switch / model-switch.
4. **`sumBranch` estimate** — last-resort fallback only (SDK absent, non-agent endpoint, pre-feature message with no stored counts).

The client never re-derives pruning. Layers 1–2 are "after usage" (real tokens); layer 3 is "before usage" (count-based but prune-accurate); layer 4 is the dumb fallback.

---

## 4. SDK primitive (`@librechat/agents`)

Good news: the pure pieces exist.

- `getMessagesWithinTokenLimit({ messages, maxContextTokens, indexTokenCountMap, instructionTokens, tokenCounter, ... })` → `PruningResult` ([src/messages/prune.ts:645](../../agents/src/messages/prune.ts)). Pure: no `AgentContext`, no model call. This *is* the windowed-subset selection.
- `AgentContext.getTokenBudgetBreakdown(messages)` ([src/agents/AgentContext.ts:1261](../../agents/src/agents/AgentContext.ts)) assembles the `TokenBudgetBreakdown` (instructions / system / dynamic / toolSchema / summary / messageTokens / availableForMessages) — but needs context state.

**New SDK surface — `projectContextUsage(...)`:** a pure combiner that
1. runs `getMessagesWithinTokenLimit` to get the kept subset + `remainingContextTokens`,
2. sums kept messages' counts for `messageTokens`,
3. assembles the same `TokenBudgetBreakdown` shape from caller-supplied structural counts (`instructionTokens`, `systemMessageTokens`, `toolSchemaTokens`, `summaryTokens`, `toolCount`, `reserveRatio`),
4. returns `{ breakdown, remainingContextTokens, prePruneContextTokens }` — the same payload as `ON_CONTEXT_USAGE` minus the live usage fields.

Inputs are plain values + a `tokenCounter`; output reuses `TokenBudgetBreakdown` / mirrors `TContextUsageEvent`. No recency/reserve math is duplicated outside the SDK → no client/calibration drift. Optionally expose an `AgentContext.projectContextUsage(messages)` convenience wrapper for callers that already built a context.

Ship as an additive agents minor; LibreChat bumps after publish (gated on go-ahead).

---

## 5. LibreChat backend — projection endpoint

A sibling to the existing token-config route ([api/server/routes/endpoints.js:10](api/server/routes/endpoints.js), `TokenConfigController`):

`GET /api/endpoints/context-projection?conversationId=&messageId=&endpoint=&model=&maxContextTokens=&agent_id=&spec=`

Server flow (new `packages/api/src/endpoints/projection.ts`, thin JS controller wrapper):
1. Load the branch (tail → root via `parentMessageId`) for `messageId`.
2. Resolve config exactly like the run path does (`packages/api/src/agents/initialize.ts` chain) → instructions, tool schemas, summary, `maxContextTokens`, `reserveRatio`, tokenizer.
3. Build `messages: BaseMessage[]` + `indexTokenCountMap` for the branch.
4. Call SDK `projectContextUsage(...)` → breakdown.
5. Return a `TContextUsageEvent`-shaped blob (no usage/cost; cost stays on the live path).

**Performance.** Structural counts (instruction/tool/summary tokens) depend on config, not the branch → cache per `(endpoint, model, agentId, summaryHash)`. Per-message counts come from stored `message.tokenCount` (already in DB). The projection itself is O(messages) arithmetic. So a load/switch projection is cheap once structural counts are warm.

**Open implementation question (flag for impl):** `indexTokenCountMap` is positional over the *formatted* `BaseMessage[]` (system message, tool messages, content parts), which is not 1:1 with DB messages. Decide: (a) map stored `tokenCount`s onto formatted positions, or (b) recount server-side via the SDK tokenizer (accurate, costlier — cache by message id). Recommend (a) with (b) as fallback when a message lacks a stored count.

---

## 6. Client wiring

- New `useContextProjectionQuery(conversation, tailId)` in `data-provider/Endpoints/queries.ts` — React Query, keyed on `(conversationId, tailId, resolvedEndpoint, model, maxContextTokens)`, `staleTime` generous (only refetch when the key changes). Gated off when `interface.contextUsage === false`.
- `useTokenUsage` precedence update (§3): prefer the persisted snapshot only when `snapshot.maxContextTokens === limits.maxContextTokens`; otherwise use the projection; else estimate. This single guard fixes **G1**, and the projection covers **G2**.
- Retire `sumBranch` to the explicit last-resort branch (keep it — it's the only thing that works with zero SDK data / non-agent endpoints).
- `isEstimate` stays `true` only for the §3-layer-4 path; projection renders as authoritative (`isEstimate: false`) but flagged `projected: true` if we want a subtle "pre-send projection" affordance in the breakdown header.

---

## 7. Sequencing

1. **SDK:** `projectContextUsage` primitive + unit tests in `@librechat/agents`; PR, review, publish (on go-ahead).
2. **LibreChat backend:** projection endpoint + `projection.ts` + structural-count cache (can be built/tested against the published SDK).
3. **LibreChat client:** query + view-model precedence + G1 guard + estimate demotion.
4. Bump `@librechat/agents` in `api/` + `packages/api/`; wire end-to-end.

Degrades cleanly: without the SDK release or the endpoint, dev's behavior (snapshot + summary-aware estimate) remains the fallback.

---

## 8. Decisions needed

- **SDK API shape:** pure `projectContextUsage(inputs)` (recommended) vs. `AgentContext.projectContextUsage(messages)` method vs. both.
- **`indexTokenCountMap` source:** stored `tokenCount` mapping (recommended) vs. server recount.
- **Projection trigger cadence:** every load/branch/model change (simplest) vs. only when the active snapshot's window ≠ resolved window (cheaper, but leaves G2's snapshot-less load on the estimate until something changes).
- **Non-agent endpoints:** out of scope (no SDK) → keep estimate, or add a minimal server-side windowing for them too.

---

## 9. Verification

- SDK: unit tests for `projectContextUsage` (windowing parity with a live prune; reserve/recency boundary; summary/instruction subtraction).
- Backend: `cd packages/api && npx jest projection` — branch load, config resolution, count mapping, payload shape.
- Client: precedence tests (snapshot-fresh vs window-mismatch→projection vs snapshot-less→projection vs SDK-absent→estimate); window-switch reactivity.
- E2E: load a long pre-feature conversation (projection, not pegged); switch model and confirm the gauge re-projects without regenerating; generate and confirm live snapshot supersedes projection.
