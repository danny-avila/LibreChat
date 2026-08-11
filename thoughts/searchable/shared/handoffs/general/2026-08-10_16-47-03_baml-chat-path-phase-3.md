---
date: 2026-08-10T16:47:03-04:00
researcher: maceo
git_commit: 8029eddfda11ade9dbc04747ebb7d2572da21f2a
branch: baml-setup
repository: silmari-chat
topic: 'BAML chat-path wiring — Phase 3 (settings, parsers, named-route identity)'
tags: [implementation, strategy, baml, endpoints, data-provider, routing, workflow-closure]
status: complete
last_updated: 2026-08-10
last_updated_by: maceo
type: implementation_strategy
---

# Handoff: BAML chat-path wiring — next is Phase 3

## Task(s)

Implementing `thoughts/searchable/shared/plans/2026-08-10-10-34-baml-chat-path-tdd-plan.md`
(7 phases, 6 blocking workflow closures). Nothing is committed — the working tree
holds all of it.

| Phase | Status |
| --- | --- |
| 0 — compiled runtime proof (**Closure A**) | **complete, green** |
| 1 — config, discovery, provider identity, token config | **complete, green** |
| 2 — runtime carrier, initializer, lazy module boundary | **partial** — 2.1 wired; 2.2 and 2.3's specs not written |
| 3 — settings, serialization, named-route identity | **next, not started** |
| 4 — adapter protocol, streaming, cancellation, bounds | code exists and is exercised by Closure A; unit suites not written |
| 5 — public route, SSE, persistence (**Closures C/D/E**) | not started |
| 6 — build graph, Docker, CI, docs (**Closure F**) | scripts partly written; matrix/Docker/CI not started |

Phase-0 and Phase-1 sections of the plan file are already annotated with `[x]`
and with the deviations described below.

## Critical References

- `thoughts/searchable/shared/plans/2026-08-10-10-34-baml-chat-path-tdd-plan.md` — the plan. Phase 3 is "TDD implementation sequence → Phase 3"; the contracts it must satisfy are in "Verified corrections and locked decisions" §7 and "Workflow closure → Closure B".
- `references/closure-test-framework.md` — the BLOCKING-behavior gate. Closure B is blocking and is Phase 3's acceptance.
- `node_modules/@librechat/agents/src/llm/baml/types.ts` — the port contract (`BamlFunctionSet`, the closed four-code failure union, "`meta` may never be fabricated").

## Recent changes

**New — BAML runtime (all new files):**
- `packages/api/baml.toml`, `packages/api/baml_src/ns_host/{clients,protocol,turn}.baml` — two compiled clients (`OpenRouter` → `openai/gpt-oss-120b`, `FreePoolBackoff` 4 retries; `OpenRouterFast` → `openai/gpt-oss-20b`, `FastPoolBackoff` 2 retries), one shared `turn_protocol` prompt, one direct LLM function per client.
- `packages/api/src/baml/generated/` — committed generated SDK (3.1 MB), plus `packages/api/baml.generated.sha256`.
- `packages/api/src/baml/{protocol.ts,manifest.ts,worker.mts,runtime.mts,transcript.ts,errors.ts,loader.ts}`.
- `packages/api/src/baml/runtime.acceptance.mjs` — Closure A, 14 assertions.
- `packages/api/scripts/{bamlFingerprint,generate-baml,verify-baml-generated,verify-baml-dist,watch-baml}.mjs`.
- `packages/api/tsdown.config.mjs` — now three configs (see Learnings).
- `packages/api/package.json` — `generate:baml`, `verify:baml`, `verify:baml-dist`, `test:baml-runtime`; `build`/`build:dev`/`b:build*` gated on `verify:baml`; `@boundaryml/baml-bridge: 0.15.0` peer.

**Modified — data-provider:**
- `packages/data-provider/src/schemas.ts:50` — `Providers.BAML = 'baml'` appended.
- `packages/data-provider/src/config.ts:1030` — `provider` widened to `anthropic | baml`.
- `packages/data-provider/src/config.ts:1896` `isBamlEndpoint`, `:1940` `bamlEndpointIssues`, `:2028` `normalizeBamlEndpoint`, `:2037` `customEndpointsSchema` `.superRefine`.

**Modified — packages/api:**
- `packages/api/src/endpoints/custom/provider.ts` (new) — shared `isPublishableCustomEndpoint`, `bamlClientNames`, `resolveDefaultParams`.
- `packages/api/src/endpoints/custom/config.ts` — uses the shared predicate; BAML publishes with no credential resolution.
- `packages/api/src/endpoints/config/models.ts:117-118` — BAML publishes `bamlClientNames(endpoint)` and `continue`s past all fetch/key/cache work.
- `packages/api/src/endpoints/custom/initialize.ts:102` `shouldReadFetchedTokenConfig`, `:125` `initializeBaml`, `:263` early BAML dispatch, `:341` gated cache read.
- `packages/api/src/endpoints/config/providers.ts:162` BAML re-entry (requires `endpoint`), `:253` name-reached BAML → `Providers.BAML`.
- `packages/api/src/types/endpoints.ts:89-103` — correlated `InitializeResultBase` union + `isBamlInitializeResult`.
- `packages/api/src/agents/runtime.ts` (new) — symbol carrier.
- `packages/api/src/agents/initialize.ts:1112` passes `endpoint`, `:1385` `setAgentRuntimeOptions`.
- `packages/api/src/agents/run.ts:1379` `getAgentRuntimeOptions` merged into `clientOptions` immediately before `ChatBAML`.

**Modified — api/:**
- `api/server/services/Config/loadCustomConfig.js` — applies `normalizeBamlEndpoint` after `parseCustomParams`.

**New tests (all seen red first):** `packages/data-provider/specs/baml-config.spec.ts` (25),
`packages/api/src/endpoints/custom/baml-discovery.spec.ts` (9),
`packages/api/src/endpoints/custom/baml-initialize.spec.ts` (14),
`packages/api/src/agents/__tests__/runtime-carrier.test.ts` (9).

## Learnings

**Bridge 0.15.0 defects found at the seam (both fixed in `worker.mts`):**
1. `BamlStream.next()` does **not** return `null` at exhaustion — it returns a partial with every declared field `undefined`, forever. Breaking on `null` spun 1.2M worker messages in 60s against a malformed fixture and never reached `final()`. Sentinel is now "all declared fields undefined"; a *live* stream blocks inside `next()` instead, including before first content, so it cannot end a stream early. Duplicate snapshots are also dropped worker-side.
2. Retry exhaustion arrives as `baml.errors.DevOther: All orchestration steps failed`, not `LlmClient`. Class-name-only classification filed a provider outage as `model_error` instead of rejecting as transport.
3. Terminating a worker mid-stream produced `TaggedHeapHandle should be valid` Rust panics. Letting the stream finish first removed them.

**A test that read green while proving nothing.** The first streaming assertion only checked the joined text, so a trailing `failure` chunk passed silently — that trailing chunk *was* defect #1. Strengthened to `deepEqual([...new Set(chunks.map(c => c.kind))], ['text'])`. Worth remembering for Phases 4–5.

**Environment: `packages/api` builds only under Node 24.** `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`. Under the shell default (v20) tsdown 0.22.2 selects the `unrun` config loader, an uninstalled optional peer, and *every* build fails at config load. Pre-existing, unrelated to BAML.

**Plan deviations (both documented in the plan file, Phase 0 section):**
- `tsdown` needs **three** configs, not two: `outputOptions.codeSplitting: false` is what keeps unnamed chunks out of the manifest, and rolldown rejects it for a multi-input build. Facade and worker get one single-entry ESM config each.
- The exact ten-file dist manifest can't be asserted for the whole directory — the pre-existing CJS build already emits hashed shared chunks (`redisTelemetry-*.cjs`, `index-*.d.cts`). `verify-baml-dist.mjs` asserts all ten required files, denies every forbidden name, and tolerates only hashed CJS chunks.

**Correction to something I said earlier in the session.** I reported that exact selected-model authorization "does not exist" and deferred it to Phase 5. It does exist, and its location is now known: `packages/api/src/agents/validation.ts:801` (`availableModels.find(m => m === model)`, list from `modelsConfig[endpoint]` at `:791`), called via `validateAgentModel` from `api/server/services/Endpoints/agents/initialize.js:250`. For ephemeral agents the key is `req.body.endpoint` (`packages/api/src/agents/load.ts:150`). It is **not** in `initializeCustom` — that part was right.

**Phase 3 anchors (verified this session):**
- `api/server/routes/agents/chat.js:74-80` — six shared `router.use`, with `buildEndpointOption` **last at `:80` as a shared `router.use`**, exactly as the plan assumed. Routes: `/resume` `:99`, `/` `:109`, `/:endpoint` `:119`.
- **`req.params.endpoint` is never read anywhere** — not in `chat.js`, `controllers/agents/request.js`, or `buildEndpointOption`. The `:endpoint` segment is a matcher only; identity comes from `req.body.endpoint`. `requireEndpointIdentity` is genuinely new behavior.
- `validateModel` is imported-but-commented-out at `chat.js:13`; it is live only on the assistants routes.
- `buildEndpointOption.js`: `req.body.endpoint` `:29`, `getDefaultParamsEndpoint` `:40`, `parseCompactConvo` `:44-49`, enforce gate `:60`, `applyModelSpecPreset` `:86`/`:108`, `req.body.endpointOption =` `:139`.
- `client/src/components/Endpoints/EndpointSettings.tsx:20-21` resolves its key as `getEndpointField(endpointsConfig, endpoint, 'type') ?? conversation.endpoint` — it does **not** read `customParams.defaultParamsEndpoint`. The pattern to copy is `client/src/components/SidePanel/Parameters/Panel.tsx:45` and `client/src/components/SidePanel/Agents/ModelPanel.tsx:81`.
- `parsers.ts:37-38` — `type EndpointSchemaLookupKey = EModelEndpoint | Providers.OPENROUTER` is the union to widen; maps at `:40-51` and `:322-333`.
- `parameterSettings.ts:1159-1177` `paramSettings`, `:1189-1241` `presetSettings`, `:1243-1250` `agentParamSettings` (derived by reduce — needs no edit).
- **Existing route tests are not a reusable Phase 5 harness**: `streamTenant.spec.js` and `abort.spec.js` use supertest with no MongoMemoryServer and both `jest.mock('~/server/routes/agents/chat')` to an empty router, so neither exercises the real chat stack.

## Artifacts

- `thoughts/searchable/shared/plans/2026-08-10-10-34-baml-chat-path-tdd-plan.md` (annotated with progress + deviations)
- `/tmp/claude-1000/-home-maceo-Dev-silmari-chat/8f72ada0-0a2e-4277-b806-e6de2c02222d/scratchpad/phase3-client.md` — full frontend research
- `/tmp/claude-1000/-home-maceo-Dev-silmari-chat/8f72ada0-0a2e-4277-b806-e6de2c02222d/scratchpad/phase3-server.md` — full backend routing research
- All source files listed under "Recent changes"

> The two scratchpad reports are session-scoped and may be swept. Re-run the two
> research prompts if they are gone; everything load-bearing from them is already
> in Learnings above.

## Action Items & Next Steps

**Phase 3 — Closure B is BLOCKING.** It spans `loadCustomConfig` → discovery →
real settings rendering → client serialization → `buildEndpointOption`. Calling a
settings map directly, or asserting on a magic display name, does **not** close
it.

1. **Behavior 3.1** — `packages/data-provider/src/parameterSettings.ts`: add `const bamlConfig: SettingsConfiguration = []` at `paramSettings[Providers.BAML]` and `presetSettings[Providers.BAML] = { col1: [], col2: [] }`. Assert derived `agentParamSettings[Providers.BAML]` is also empty. No cast to an incompatible shape.
2. **Behavior 3.2** — `EndpointSettings.tsx` must resolve `customParams.defaultParamsEndpoint` before selecting the component and preset columns (copy `Panel.tsx:45`). Because BAML's arrays are empty it then renders no panel, and no `settings[Providers.BAML]` entry is needed. Test through **real endpoint-query data** for two arbitrarily named endpoints; assert `max_output_tokens` and other OpenAI controls are absent. Render util is `test/layout-test-utils` (needed — the component reads `useRecoilValue(store.currentSettingsView)` at `:19`).
3. **Behavior 3.3** — `parsers.ts`: add BAML entries to **both** maps and widen `EndpointSchemaLookupKey`. Full schema picks exactly the 14 fields listed in plan §7; compact picks the same minus `iconURL`. Strip provider generation fields at client serialization (`useChatFunctions.ts:469-481`) **and** server ingress including enforced model-spec reparsing. Use the plan's explicit deny fixture.
4. **Behavior 3.4** — `createPayload.ts`: `encodeURIComponent` the endpoint segment exactly once (Express already decodes `req.params.endpoint`; do not decode again). Move `buildEndpointOption` off the shared `router.use` at `chat.js:80` and register per-route in the plan's exact order, adding `requireEndpointIdentity` on `/:endpoint` only. Mismatch or missing body identity → HTTP 400 with exactly `{ "error": "Route endpoint does not match request endpoint." }`. `/resume` and `/` behavior and ordering must not change — `buildEndpointOption.spec.js` (12 tests) is the regression net.

**Always:** run each new test red before wiring it, and re-run adjacent OpenAI/Anthropic custom-endpoint suites after every config/settings change.

**Verification commands** (Node 24 first):
```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm run build:data-provider                       # required after any data-provider edit
(cd packages/data-provider && npx jest --runInBand specs/)
(cd packages/api && npx jest --runInBand src/endpoints src/agents)
(cd api && npx jest server/middleware/buildEndpointOption.spec.js server/services/Config/loadCustomConfig.spec.js)
(cd client && npx jest --runInBand src/components/Endpoints)
(cd packages/api && npm run build && npm run verify:baml-dist && npm run test:baml-runtime)
```

## Other Notes

**Beads.** Epic `AF-69t` (in progress, carries a progress note). Remaining phases:
`AF-0nz` Phase 2 remainder · **`AF-cj0` Phase 3 (claim this next)** · `AF-9yt`
Phase 4 · `AF-4v8` Phase 5 · `AF-5ij` Phase 6. Upstream bug `AF-vv8` (runtime
client override panics) stays open and is deliberately unblocked — the design
avoids the broken mechanism.

Three `bd remember` entries were written this session: the `next()` exhaustion
sentinel, the `DevOther` transport classification, and the Node-24 build
requirement. Search with `bd memories baml`.

**Not committed.** Conservative profile — `git status` shows ~15 modified and ~12
new paths, all listed above. `Dockerfile.multi` and two files under
`scripts/baml-toolloop/issues/` were already modified before this session.

**Regression baseline as of this handoff:** 824 `packages/api/src/endpoints`,
1645 `packages/api/src/agents`, 142 data-provider config/parser, 21
`loadCustomConfig`, 14/14 Closure A. `tsc --noEmit` clean in `packages/api`.

**Root `baml_src/`, `baml.toml`, and `baml_ts/` are the old probe project** and
must never become production build inputs. Production BAML lives under
`packages/api/`.
