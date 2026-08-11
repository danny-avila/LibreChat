---
date: 2026-08-10T08:13:59-04:00
researcher: maceo
git_commit: b46393b39265cf4dabe2cf1c81e56c001ef358ae
branch: baml-setup
repository: silmari-chat
topic: "How the chat path selects a provider, and where BAML is and is not connected to it"
tags: [research, codebase, baml, providers, endpoints, run-orchestration, agents]
status: complete
last_updated: 2026-08-10
last_updated_by: maceo
last_updated_note: "Added follow-up research resolving all four open questions (function-set carrier, selection surface, title generation, registration import placement)"
---

# Research: Wiring BAML into the chat path

**Date**: 2026-08-10T08:13:59-04:00
**Researcher**: maceo
**Git Commit**: `b46393b39265cf4dabe2cf1c81e56c001ef358ae`
**Branch**: `baml-setup`
**Repository**: silmari-chat

## Research Question

"Wire BAML into the chat path so I can test it" — documented here as: what is the
existing chat path from an HTTP request to an instantiated chat model, and at
which points is `Providers.BAML` currently connected or not connected to it?

This document describes the system as it exists at the commit above. It does not
prescribe changes.

## Summary

A chat request reaches a model through four sequential resolutions, each in a
different layer:

1. **Endpoint string → `agent.provider`.** The raw `endpoint` from the request
   body becomes `agent.provider` verbatim (`packages/api/src/agents/load.ts:150`).
2. **`agent.provider` → initializer + normalized provider.** `getProviderConfig`
   looks the string up in a fixed dispatch table and may overwrite
   `agent.provider` (`packages/api/src/endpoints/config/providers.ts:137-158`,
   applied at `packages/api/src/agents/initialize.ts:1102-1108`).
3. **Initializer → `llmConfig`.** The chosen initializer returns an
   `InitializeResultBase`; its `llmConfig` is folded into `agent.model_parameters`
   (`packages/api/src/agents/initialize.ts:1365`).
4. **`llmConfig` → constructed model.** `createRun` rebuilds `llmConfig` and
   assigns it as `clientOptions` (`packages/api/src/agents/run.ts:1233-1240`,
   `:1379`); inside `@librechat/agents` it reaches
   `new (getChatModelClass(provider))(clientOptions)`
   (`node_modules/@librechat/agents/src/llm/init.ts:29-31`).

`Providers.BAML = 'baml'` exists in the enum
(`node_modules/@librechat/agents/src/common/enum.ts:100`) and `ChatBAML` is a real
class, but three distinct facts keep it off this path:

| # | Fact | Evidence |
|---|---|---|
| 1 | `llmProviders` does not contain a BAML entry, so `getChatModelClass('baml')` throws | `node_modules/@librechat/agents/src/llm/providers.ts:22-36`, throw at `:84` |
| 2 | Registration happens only as an import side effect of the `/baml` subpath, which no production code in this repo imports | `node_modules/@librechat/agents/src/llm/baml/index.ts:10`; repo grep finds only `packages/api/src/baml/adapter.mjs:24` |
| 3 | No route can set `agent.provider = 'baml'` — `providerConfigMap` has no BAML key, and the custom-endpoint YAML `provider` field is a single literal | `packages/api/src/endpoints/config/providers.ts:40-51`; `packages/data-provider/src/config.ts:1022` |

A fourth structural fact concerns data rather than dispatch: `ChatBAML` requires a
`functions: BamlFunctionSet` in its `clientOptions`
(`node_modules/@librechat/agents/dist/types/llm/baml/types.d.ts:99-103`), which is
executable code. Everything that currently flows into `clientOptions` originates
from `agent.model_parameters`, a serializable configuration object
(`packages/api/src/agents/initialize.ts:1365`, `packages/api/src/agents/run.ts:1233-1240`).

## Detailed Findings

### Endpoint arrival and the first provider assignment

Chat requests for every modular endpoint share the `/api/agents/chat` route.
`api/server/middleware/buildEndpointOption.js:28-39` reads `req.body.endpoint` and
routes to `agents.buildOptions` when the endpoint is an agents endpoint or the
base URL is the agents chat route. That calls `loadAgent`
(`api/server/services/Endpoints/agents/build.js:9-20`).

For an ephemeral (unsaved) agent, `loadEphemeralAgent` sets the provider to the
raw endpoint string:

```ts
// packages/api/src/agents/load.ts:147-154
const result: Partial<Agent> = {
  id: ephemeralId,
  instructions,
  provider: endpoint,
  model_parameters: safeModelParameters as AgentModelParameters,
  model,
  tools,
};
```

At this point `agent.provider` is unnormalized — it may be `openAI`, `anthropic`,
or a custom endpoint's own `name` from `librechat.yaml`. `initializeAgent` then
freezes `agent.endpoint` to that same value
(`packages/api/src/agents/initialize.ts:699-700`), after which `endpoint` and
`provider` are free to diverge.

### Provider dispatch — the fixed table

`providerConfigMap` is a module-level object literal, not a registry with an
insertion API:

```ts
// packages/api/src/endpoints/config/providers.ts:40-51
export const providerConfigMap: Record<string, InitializeFn> = {
  [Providers.XAI]: initializeCustom,
  [Providers.DEEPSEEK]: initializeCustom,
  [Providers.MOONSHOT]: initializeCustom,
  [Providers.OPENROUTER]: initializeCustom,
  [Providers.VERTEXAI]: initializeGoogle,
  [EModelEndpoint.openAI]: initializeOpenAI,
  [EModelEndpoint.google]: initializeGoogle,
  [EModelEndpoint.bedrock]: initializeBedrock,
  [EModelEndpoint.azureOpenAI]: initializeOpenAI,
  [EModelEndpoint.anthropic]: initializeAnthropic,
};
```

`getProviderConfig` resolves against it in three stages
(`packages/api/src/endpoints/config/providers.ts:137-158`): exact match, then
lowercase match, then a custom-endpoint lookup by name. The third stage is where
every `librechat.yaml` custom endpoint lands:

```ts
// packages/api/src/endpoints/config/providers.ts:151-158
} else if (!getOptions) {
  customEndpointConfig = getCustomEndpointConfig({ endpoint: provider, appConfig });
  if (!customEndpointConfig) {
    throw new Error(`Provider ${provider} not supported`);
  }
  getOptions = initializeCustom;
  overrideProvider = Providers.OPENAI;
}
```

A custom endpoint therefore resolves to `Providers.OPENAI` unless its config
declares `provider: anthropic`, which forces `Providers.ANTHROPIC`
(`packages/api/src/endpoints/config/providers.ts:210-212`). `initializeAgent`
applies the result:

```ts
// packages/api/src/agents/initialize.ts:1102-1108
const { getOptions, overrideProvider, customEndpointConfig } = getProviderConfig({
  provider,
  appConfig: req.config,
});
if (overrideProvider !== agent.provider) {
  agent.provider = overrideProvider;
}
```

The last write to `agent.provider` is `initialize.ts:1147-1149`, which applies
`options.provider` when an initializer returns one. Only two do: the native
Anthropic custom branch (`packages/api/src/endpoints/custom/initialize.ts:163`)
and OpenRouter detection inside `getOpenAIConfig`
(`packages/api/src/endpoints/openai/config.ts:311-313`).

### What a custom endpoint may declare

The `provider` field on a custom endpoint entry is a single literal, not an open
string:

```ts
// packages/data-provider/src/config.ts:1017-1022
 * `anthropic`, for endpoints that speak the Anthropic `/v1/messages` API
 * (Anthropic itself or Anthropic-compatible gateways). Omit for
 * OpenAI-compatible endpoints.
 */
provider: z.literal(EModelEndpoint.anthropic).optional(),
```

`EModelEndpoint` is likewise a closed enum with no registration API:

```ts
// packages/data-provider/src/schemas.ts:18-28
export enum EModelEndpoint {
  azureOpenAI = 'azureOpenAI',
  openAI = 'openAI',
  google = 'google',
  anthropic = 'anthropic',
  assistants = 'assistants',
  azureAssistants = 'azureAssistants',
  agents = 'agents',
  custom = 'custom',
  bedrock = 'bedrock',
}
```

This enum is consumed as a closed set by the config schema
(`packages/data-provider/src/config.ts:1999-2019`, `.strict()`), app-config
assembly (`packages/data-schemas/src/app/endpoints.ts:81-93`), default endpoint
availability (`api/server/services/Config/EndpointService.js:28-59`), and the
provider dispatch table above. No dynamic-registration mechanism for a new
endpoint *type* was found; what exists is adding further *instances* to the
`endpoints.custom` array.

### Endpoint visibility in the UI

`GET /api/endpoints` is served by `api/server/routes/endpoints.js:9` →
`api/server/controllers/EndpointController.js:1-8` →
`packages/api/src/endpoints/config/endpoints.ts:35-120`, which merges built-in and
custom entries:

```ts
// packages/api/src/endpoints/config/endpoints.ts:38-43
const customEndpointsConfig = loadCustomEndpointsConfig(appConfig?.endpoints?.custom);

const mergedConfig: MutableEndpointsConfig = {
  ...defaultEndpointsConfig,
  ...customEndpointsConfig,
};
```

A custom entry appears only if it survives this filter — otherwise it is silently
absent from the response while still present in `appConfig`:

```ts
// packages/api/src/endpoints/custom/config.ts:20-27
const filteredEndpoints = customEndpoints.filter(
  (endpoint) =>
    endpoint.baseURL &&
    endpoint.apiKey &&
    endpoint.name &&
    endpoint.models &&
    (endpoint.models.fetch || endpoint.models.default),
);
```

### From `createRun` to a constructed model

`createRun` assembles `llmConfig` and assigns it as `clientOptions`:

```ts
// packages/api/src/agents/run.ts:1233-1240
const llmConfig = Object.assign(
  {
    provider,
    streaming,
    streamUsage,
  },
  modelParameters,
) as t.RunLLMConfig;
```

```ts
// packages/api/src/agents/run.ts:1377-1381
  agentId: agent.id,
  tools,
  clientOptions: llmConfig,
  instructions: systemContent,
  additional_instructions: additionalInstructions || undefined,
```

The same object reference then flows, without copying, through
`Run.create` (`packages/api/src/agents/run.ts:1655`) →
`node_modules/@librechat/agents/src/run.ts:603-615` → graph construction →
`AgentContext.fromConfig` (`node_modules/@librechat/agents/src/agents/AgentContext.ts:59-121`,
assignment at `:423`) → the model node
(`node_modules/@librechat/agents/src/graphs/Graph.ts:2400-2406`) →

```ts
// node_modules/@librechat/agents/src/llm/init.ts:29-31
const model =
  override ??
  new (getChatModelClass(provider))(clientOptions ?? ({} as never));
```

### The provider registry and its BAML entry

```ts
// node_modules/@librechat/agents/src/llm/providers.ts:79-88
export const getChatModelClass = <P extends Providers>(
  provider: P
): new (config: ProviderOptionsMap[P]) => ChatModelMap[P] => {
  const ChatModelClass = llmProviders[provider];
  if (!ChatModelClass) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  return ChatModelClass;
};
```

`llmProviders` (`node_modules/@librechat/agents/src/llm/providers.ts:22-36`)
contains XAI, OPENAI, AZURE, VERTEXAI, DEEPSEEK, MISTRALAI, MISTRAL, ANTHROPIC,
OPENROUTER, BEDROCK, GOOGLE, MOONSHOT — no BAML key. `registerChatModel`
(`:48-61`) is the insertion function; it is idempotent for an identical
constructor and throws `Provider already registered` for a conflicting one.

The only production call to it is a documented import side effect:

```ts
// node_modules/@librechat/agents/src/llm/baml/index.ts:1-12
import { registerChatModel } from '@/llm/providers';
import { ChatBAML } from './ChatBAML';
import { Providers } from '@/common';

/**
 * Registration is a deliberate import side-effect: it is the only shape that
 * keeps the root barrel free of this provider without a dynamic import.
 * Do not "clean up" this statement.
 */
registerChatModel(Providers.BAML, ChatBAML);

export { ChatBAML };
```

`node_modules/@librechat/agents/src/index.ts` contains zero occurrences of
`baml` (verified by grep count), and `packages/api/src/agents/run.ts:2` imports
from that root barrel. The `/baml` subpath is a separate export
(`node_modules/@librechat/agents/package.json:17-21`).

### Current state of BAML code in this repo

`packages/api/src/baml/adapter.mjs` implements `BamlFunctionSet` and imports the
subpath at `:24`, which would trigger registration. It is referenced only by
`scripts/baml-host/run.mjs:21`, `scripts/baml-host/boundary.cjs:28`, and
`scripts/baml-host/smoke.cjs:39` — no server code imports it. It is also not a
build entry: `packages/api/tsdown.config.mjs:9` declares
`entry: ['src/index.ts', 'src/telemetry.ts']`.

## Code References

- `api/server/middleware/buildEndpointOption.js:28-39` — request endpoint enters the agents path
- `packages/api/src/agents/load.ts:147-154` — `provider: endpoint`, the first assignment
- `packages/api/src/agents/initialize.ts:699-700` — `agent.endpoint` frozen to the raw value
- `packages/api/src/endpoints/config/providers.ts:24-28` — `isKnownCustomProvider`
- `packages/api/src/endpoints/config/providers.ts:40-51` — `providerConfigMap`
- `packages/api/src/endpoints/config/providers.ts:137-158` — `getProviderConfig` resolution and the unknown-provider throw at `:154`
- `packages/api/src/endpoints/config/providers.ts:210-212` — `provider: anthropic` override
- `packages/api/src/agents/initialize.ts:1102-1108` — `overrideProvider` applied
- `packages/api/src/agents/initialize.ts:1147-1149` — final `agent.provider` write
- `packages/api/src/agents/initialize.ts:1365` — `agent.model_parameters = { ...options.llmConfig }`
- `packages/api/src/agents/run.ts:1233-1240` — `llmConfig` assembly
- `packages/api/src/agents/run.ts:1379` — `clientOptions: llmConfig`
- `packages/api/src/agents/run.ts:1655` — `Run.create(runConfig)`
- `packages/data-provider/src/schemas.ts:18-28` — `EModelEndpoint` closed enum
- `packages/data-provider/src/config.ts:1022` — custom endpoint `provider` literal
- `packages/api/src/endpoints/custom/config.ts:20-27` — endpoint visibility filter
- `packages/api/src/endpoints/config/endpoints.ts:38-43` — endpoints response merge
- `node_modules/@librechat/agents/src/common/enum.ts:100` — `BAML = 'baml'`
- `node_modules/@librechat/agents/src/llm/providers.ts:22-36` — `llmProviders`
- `node_modules/@librechat/agents/src/llm/providers.ts:48-61` — `registerChatModel`
- `node_modules/@librechat/agents/src/llm/providers.ts:84` — unsupported-provider throw
- `node_modules/@librechat/agents/src/llm/baml/index.ts:10` — registration side effect
- `node_modules/@librechat/agents/src/llm/init.ts:29-31` — model construction
- `node_modules/@librechat/agents/src/graphs/Graph.ts:2400-2406` — `initializeModel` call site
- `node_modules/@librechat/agents/src/agents/AgentContext.ts:423` — `clientOptions` retained
- `packages/api/src/baml/adapter.mjs:24` — the repo's only import of the `/baml` subpath
- `packages/api/tsdown.config.mjs:9` — build entries

## Architecture Documentation

**Two identifiers, two purposes.** `agent.endpoint` retains the request's original
endpoint string and is the key for config lookup, display, and model lists.
`agent.provider` is normalized and is the LLM client selector. For custom
endpoints they deliberately diverge (`initialize.ts:699-700` vs `:1102-1108`).

**Dispatch is by fixed table at both layers.** `providerConfigMap`
(`providers.ts:40-51`) selects the option builder; `llmProviders`
(`@librechat/agents/src/llm/providers.ts:22-36`) selects the model class. The
first is a plain object with no insertion API. The second has `registerChatModel`,
whose only production caller is the `/baml` subpath's side effect.

**Extensibility today is by instance, not by type.** A new OpenAI-compatible or
Anthropic-compatible service is added as another entry in `endpoints.custom`. All
such entries share `type: EModelEndpoint.custom` and are distinguished only by
`name` — including in the frontend, which switches on `EModelEndpoint.custom`
across roughly 25 files.

**`clientOptions` is configuration-shaped.** Everything reaching the model
constructor derives from `agent.model_parameters`, which is assigned from
`options.llmConfig` (`initialize.ts:1365`) and is persisted with the agent. The
one existing precedent for a non-serializable value on that object is Bedrock,
which assigns a constructed AWS SDK client to `llmConfig.client`
(`packages/api/src/endpoints/bedrock/initialize.ts:309-311`), and Anthropic
Vertex, which assigns a `createClient` factory function
(`packages/api/src/endpoints/anthropic/llm.ts:213-223`).

## Workflow Closure Map

**Behavior:** a user's chat message on a configured endpoint produces a persisted
assistant message generated by that endpoint's provider.

| Depth | Node | Production evidence | Label | Adds/changes for BAML |
|---|---|---|---|---|
| 0 | endpoint config (`AppConfig.endpoints`) | loaded `api/server/services/Config/loadCustomConfig.js:69,112`; merged `packages/data-schemas/src/app/endpoints.ts:81-93` | production-called | no |
| 1 | chat route → `buildOptions` | `api/server/middleware/buildEndpointOption.js:28-39`; `api/server/services/Endpoints/agents/build.js:9-20` | production-called | no |
| 2 | agent load, `provider = endpoint` | `packages/api/src/agents/load.ts:150` | production-called | no |
| 3 | provider resolution | `packages/api/src/endpoints/config/providers.ts:137-158`; applied `packages/api/src/agents/initialize.ts:1102-1108` | production-called | **yes** |
| 4 | `llmConfig` → `model_parameters` | `packages/api/src/agents/initialize.ts:1365` | production-called | **yes** (`functions` port has no carrier) |
| 5 | `createRun` → `clientOptions` | `packages/api/src/agents/run.ts:1233-1240`, `:1379`, `:1655` | production-called | no |
| 6 | model instantiation | `node_modules/@librechat/agents/src/llm/init.ts:29-31` via `Graph.ts:2400-2406` | production-called | **yes** (registry lookup throws for `baml`) |
| 7 | events → aggregation → SSE → persisted message | handler registry built `api/server/services/Endpoints/agents/initialize.js:358-375`; SSE `api/server/routes/agents/index.js:223-239` | production-called | no |

`highest_new_connector`: **node 3, provider resolution** — the topmost node that
would change.

**Per-edge notes.** Edge 3→4 carries the resolved `InitializeResultBase`
(`packages/api/src/types/endpoints.ts:58-65`); its `llmConfig` is spread, so only
enumerable own properties survive. Edge 5→6 passes the object by reference with no
copy (`AgentContext.ts:423`). Edge 6→7 is where an unregistered provider fails, at
`providers.ts:84`, before any event is emitted.

**Negative evidence.** Reverse-caller search for `registerChatModel` finds no
caller in this repo's source; the sole production caller is
`@librechat/agents/src/llm/baml/index.ts:10`. Reverse-caller search for
`createBamlFunctionSet` finds only `scripts/baml-host/*`. `packages/api/src/baml/`
is `test-only` with respect to the server: present in the tree, not imported by
any server module, and not a build entry (`packages/api/tsdown.config.mjs:9`).

### ClosureMap (structured — derive() input)

```json
{
  "behavior": "A user's chat message on a configured endpoint produces a persisted assistant message generated by that endpoint's provider.",
  "git_commit": "b46393b39265cf4dabe2cf1c81e56c001ef358ae",
  "repo": "/home/maceo/Dev/silmari-chat",
  "nodes": [
    { "id": "endpoint-config", "module": "packages/data-schemas/src/app/endpoints.ts", "is_entrypoint": false, "adds_or_changes": false, "read_path": null, "seedable_store": "AppConfig.endpoints" },
    { "id": "chat-route", "module": "api/server/middleware/buildEndpointOption.js", "is_entrypoint": true, "adds_or_changes": false, "read_path": null, "seedable_store": null },
    { "id": "agent-load", "module": "packages/api/src/agents/load.ts", "is_entrypoint": false, "adds_or_changes": false, "read_path": null, "seedable_store": null },
    { "id": "provider-resolution", "module": "packages/api/src/endpoints/config/providers.ts", "is_entrypoint": false, "adds_or_changes": true, "read_path": null, "seedable_store": null },
    { "id": "llmconfig-assembly", "module": "packages/api/src/agents/initialize.ts", "is_entrypoint": false, "adds_or_changes": true, "read_path": null, "seedable_store": null },
    { "id": "run-create", "module": "packages/api/src/agents/run.ts", "is_entrypoint": false, "adds_or_changes": false, "read_path": null, "seedable_store": null },
    { "id": "model-instantiation", "module": "node_modules/@librechat/agents/src/llm/init.ts", "is_entrypoint": false, "adds_or_changes": true, "read_path": null, "seedable_store": null },
    { "id": "persisted-message", "module": "api/server/controllers/agents/callbacks.js", "is_entrypoint": false, "adds_or_changes": false, "read_path": "getMessages", "seedable_store": null }
  ],
  "edges": [
    { "is_async": false, "cross_boundary": true, "driver": null },
    { "is_async": false, "cross_boundary": false, "driver": null },
    { "is_async": false, "cross_boundary": true, "driver": null },
    { "is_async": false, "cross_boundary": false, "driver": null },
    { "is_async": false, "cross_boundary": false, "driver": null },
    { "is_async": false, "cross_boundary": true, "driver": null },
    { "is_async": true, "cross_boundary": true, "driver": "GenerationJobManager.finishTerminalJob" }
  ]
}
```

### Closure adapter (staged proposal — `2026-08-10-08-13-baml-chat-path-wiring.closure-adapter.py`)

```python
"""Closure adapter (STAGED PROPOSAL — not wired into the repo).
Derived from the ClosureMap for: a user's chat message on a configured endpoint
produces a persisted assistant message generated by that endpoint's provider.
Pin: b46393b39265cf4dabe2cf1c81e56c001ef358ae.
Promote into /home/maceo/Dev/silmari-chat and complete each TODO(promote) before use.
Speaks the 7-op contract apps/closure-oracle already talks to (mock_adapter.py).
"""
import http.server, json, sys
ASYNC_EDGES = ["model-instantiation->persisted-message"]
CONNECTOR = {e: True for e in ASYNC_EDGES}
SINK = []

def handle(op, p):
    if op == "/reset":        SINK.clear(); CONNECTOR.update({e: True for e in ASYNC_EDGES}); return {"ok": True}
    if op == "/set_connector": CONNECTOR[p["edge"]] = p["enabled"]; return {"ok": True}
    if op == "/seed_sink":     SINK.append(p["value"]); return {"ok": True}
    if op == "/seed":
        # TODO(promote): seed AppConfig.endpoints with p["data"]
        #   (packages/data-schemas/src/app/endpoints.ts:81-93)
        return {"ok": True}
    if op == "/trigger":
        # TODO(promote): call the mounted chat route with p["args"]
        #   (api/server/middleware/buildEndpointOption.js:28-39)
        return {"ok": True}
    if op == "/drive":
        if not CONNECTOR.get(p["edge"], True): return {"ok": True}
        # TODO(promote): drain terminal job — GenerationJobManager.finishTerminalJob()
        #   (packages/api/src/stream/GenerationJobManager.ts:3308-3313)
        return {"ok": True}
    if op == "/observe":
        # TODO(promote): return json.dumps(getMessages(conversationId))
        #   (api/server/controllers/agents/callbacks.js — persisted contentParts)
        return {"ok": True, "value": json.dumps(SINK)}
    return {"ok": False, "error": "unknown op"}

class Hn(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        out = json.dumps(handle(self.path, json.loads(self.rfile.read(n) or "{}"))).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Hn).serve_forever()
```

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-08-09-11-24-llm-interface-baml-integration.md` — maps where LLM calls happen across the codebase; §10 carries a falsification banner about v0-vs-v1 BAML claims.
- `thoughts/shared/plans/2026-08-09_baml-turn-loop-tdd-plan.md` — Stage 1 TDD plan (revision 2) for a `TurnExecutor` that bypasses `Run` for eligible text turns. That is a different architecture from the provider port documented here.
- `thoughts/shared/plans/2026-08-09_baml-turn-loop-tdd-plan-REVIEW.md` — the review that forced revision 2.
- `thoughts/shared/handoffs/general/2026-08-09_19-15-59_baml-ntm-orchestration.md` — handoff recording that the plan was complete and the build unstarted.
- `specs/run-orchestration.domain.md` — job/claim lifecycle; confidence marked provisional (no dedicated module boundary).
- `specs/agent.domain.md` — records `Provider = "openai" | "anthropic" | "google" | "bedrock" | "azureOpenAI" | customEndpointName`, matching the closed set documented above.
- `specs/configuration.domain.md` — the YAML/env/DB config resolution pipeline.

## Related Research

- `thoughts/shared/research/2026-08-09-11-24-llm-interface-baml-integration.md`

## Toolchain State at This Commit

Recorded because it bounds what the BAML side can express, verified directly:

- `baml wrapper 0.2.0`, `baml toolchain 0.15.0`, active selector `canary`, status "up to date".
- `@boundaryml/baml-bridge` npm version `0.15.0` (versioned separately from the CLI toolchain).
- Two upstream defects are fixed on `0.15.1-nightly` but not on this canary: the `spawn`+`catch` error escape, and the `output_format.rs:608` panic that blocks runtime-varying tool unions. On this commit both remain live, so the compiled BAML tool union is frozen at build time and `allowedTools` has no carrier into BAML.
- `@boundaryml/baml-bridge-linux-x64-musl` ships a glibc-linked binary; tracked upstream at https://github.com/BoundaryML/baml/issues/4355 and locally as bead `AF-o4v`.

## Open Questions

1. **Where a `BamlFunctionSet` would come from per request.** `clientOptions`
   derives from `agent.model_parameters`, which is persisted and serializable
   (`initialize.ts:1365`). The BAML port is executable and explicitly
   non-serializable across session restore
   (`node_modules/@librechat/agents/docs/providers/baml.md` §7). The Bedrock
   `llmConfig.client` and Anthropic-Vertex `createClient` precedents
   (`bedrock/initialize.ts:309-311`, `anthropic/llm.ts:213-223`) show
   non-serializable values do reach model construction today; whether either
   survives agent persistence was not traced.
2. **Which selection surface would carry `baml`.** Not determined: whether it
   would be a `providerConfigMap` entry, a widened custom-endpoint `provider`
   literal (`config.ts:1022`), or a new `EModelEndpoint` member — each has a
   different blast radius across the config schema, app-config assembly, default
   endpoint availability, and ~25 frontend files.
3. **Title generation.** `ChatBAML` throws `BamlUnsupportedError` from
   `withStructuredOutput`, so only `TitleMethod.COMPLETION` is supported. Which
   title path this repo takes per endpoint was not traced.
4. **Where the `/baml` subpath import would live** such that registration happens
   before any resolution, given `run.ts:2` imports the root barrel and the repo
   has no existing provider-registration import.

> All four questions are resolved below.

## Follow-up Research 2026-08-10T08:22-04:00

Resolutions supplied for Q1, Q3, and Q4. Each claim below was re-verified against
source at the pinned commit; the two refinements found are noted.

### Q1 — resolved: `functions` rides on `llmConfig`, set by the initializer

The carrier already exists and is exercised in production. The concern was whether
`agent.model_parameters` — which receives the spread of `llmConfig` at
`packages/api/src/agents/initialize.ts:1365` — is persisted, which would make an
executable `functions` property a problem.

**It is not persisted on the chat path.** Verified by enumerating every writer:

| `model_parameters` assignment | Path |
|---|---|
| `packages/api/src/agents/initialize.ts:1365` | in-memory request object |
| `api/server/controllers/agents/client.js:2100` | resume context object, not the agent document |
| `api/server/controllers/agents/v1.js:403-404,682-683` | agent CRUD REST API |

Every `updateAgent` call site is likewise an agent-management path, never the chat
path: `packages/api/src/agents/avatars.ts:100`,
`api/server/controllers/agents/v1.js:869,1370,1504`,
`api/server/routes/agents/actions.js:205,292`.

*(Refinement: the supplied answer named only `v1.js`. `avatars.ts` and
`actions.js` also call `updateAgent`. All three are agent-management surfaces, so
the conclusion is unchanged.)*

**Bedrock is the existing proof.** `packages/api/src/endpoints/bedrock/initialize.ts:309-311`
assigns a live `BedrockRuntimeClient` — sockets and credentials — to
`llmConfig.client`, which reaches the model constructor through this same spread.
Anthropic-Vertex does the same with a `createClient` closure
(`packages/api/src/endpoints/anthropic/llm.ts:213-223`). A `BamlFunctionSet` is a
third instance of an established pattern, not a new kind of value.

**Constraint on the shape.** `initialize.ts:1365` is a shallow spread
(`{ ...options.llmConfig }`). An own enumerable property survives as a reference,
so a `functions` object and its methods are intact. A `llmConfig` that were itself
a class instance would lose everything on its prototype at that line.

### Q3 — resolved: title generation needs no work on the default path

`ChatBAML.withStructuredOutput` throws `BamlUnsupportedError`, but the default
path never calls it. Verified:

| Claim | Evidence |
|---|---|
| Library default is completion mode | `node_modules/@librechat/agents/src/run.ts:1624` — `titleMethod = TitleMethod.COMPLETION` |
| Custom endpoints default to completion | `packages/api/src/endpoints/custom/initialize.ts:106` — `titleMethod: endpointConfig.titleMethod ?? 'completion'` |
| The controller passes through, so `undefined` inherits the library default | `api/server/controllers/agents/client.js:3255` — `titleMethod: endpointConfig?.titleMethod` |
| The `json: true` branch is Google-gated and irrelevant here | `api/server/controllers/agents/client.js:3225-3231` — requires `provider === Providers.GOOGLE` **and** a FUNCTIONS/STRUCTURED title method |

The only way to reach the throwing path is an explicit `titleMethod: structured`
or `functions` in `librechat.yaml`. Noted as a candidate for a config-load
validation guard, since the resulting error would otherwise surface at title time,
far from its cause.

### Q4 — resolved: registration at module scope in the BAML initializer; adapter loaded lazily

`packages/api/src/endpoints/config/providers.ts:7-11` imports all five existing
initializers at module scope:

```ts
import { initializeAnthropic } from '../anthropic/initialize';
import { initializeBedrock } from '../bedrock/initialize';
import { initializeCustom } from '../custom/initialize';
import { initializeGoogle } from '../google/initialize';
import { initializeOpenAI } from '../openai/initialize';
```

A BAML initializer imported the same way makes a module-scope
`import '@librechat/agents/baml'` fire when `providerConfigMap` is built — before
node 3 (provider resolution), let alone node 6 (model instantiation).

The two imports are deliberately split by cost:

- **`import '@librechat/agents/baml'` — eager.** Pure JS, idempotent
  (`registerChatModel` is a no-op for an identical constructor,
  `node_modules/@librechat/agents/src/llm/providers.ts:53-55`).
- **the adapter — lazy, inside the initializer function.** It pulls the BAML
  bridge's native `.node` addon. Loading that eagerly would put it in the startup
  path of deployments that never use BAML — which, given the musl defect
  (https://github.com/BoundaryML/baml/issues/4355, bead `AF-o4v`), converts "BAML
  unused" into "server will not boot on Alpine."

**Build gap this exposes.** `packages/api/tsdown.config.mjs:9` declares
`entry: ['src/index.ts', 'src/telemetry.ts']` with `format: ['cjs']` at `:10`.
`packages/api/src/baml/adapter.mjs` is not an entry and is not reachable from
`src/index.ts`, so it is absent from `dist/`. A relative `require('./adapter.mjs')`
resolves in a dev tree and not in the built package. (The running container is
currently unaffected only because `Dockerfile.multi` copies
`packages/api/src/baml` as source — a deployment-specific copy, not a package
build output.)

### Q2 — resolved: the model dropdown is the BAML client selector

Probed against the installed v1 SDK. The v0 documentation does not describe this
toolchain:

| v0 docs | v1 toolchain (installed) |
|---|---|
| `baml_options={"client": "GPT4"}` — a string | `$opts: { client: baml.llm.Client }` — an object |
| `ClientRegistry` | **Absent.** `grep -rc ClientRegistry baml_ts/baml_sdk/` → 0 matches |

Probe results, as reported:

```
✓ override with DECLARED client name (AnthropicEscape)
✗ override with DECLARED name (OpenRouter): env var not found: OPENROUTER_API_KEY
✗ override with UNDECLARED name (Nope): Client resolve function not found: Nope$new
```

Three consequences, all load-bearing:

**Clients are frozen at build time.** `Nope$new not found` shows the runtime
resolves a compiled constructor generated per `client<llm>` declaration. A
`PrimitiveClient` can be constructed at runtime with arbitrary
model/base_url/api_key, but there is no way to feed one in: the override takes a
`Client`, and `Client` resolves by name through compiled bytecode. **Clients
therefore behave exactly like tools — the set is frozen in `.baml`, the selection
is dynamic per call.** One consistent rule across the whole integration.

**Keys belong to BAML, not to LibreChat.** The OpenRouter failure is the proof:
BAML resolved the client, looked for `OPENROUTER_API_KEY` in the server process
env, and panicked when it was absent. Credentials are read by BAML at call time
from the process environment, not passed through `llmConfig`.

**`client` is the only overridable option.** Verified against the generated SDK in
this repo — every LLM function in the `host` namespace emits exactly one optional
parameter:

```ts
// baml_ts/baml_sdk/host/index.ts:116,129
defineFunction("user.host.HostTurn", "sync",  ["user_message", "transcript"], ["client"])
defineFunction("user.host.HostTurn", "async", ["user_message", "transcript"], ["client"])
```

Collecting the optional-parameter lists across every generated `user.host.*`
function yields exactly `["client"]` (plus `["names","args","results"]`, which are
the *required* parameters of the pure `host_transcript` function).

**The resulting shape.** `models.default` in the endpoint config lists
`client<llm>` names, so LibreChat's model dropdown becomes a BAML client selector,
and the adapter maps the selection through:

```ts
const client = new baml.llm.Client({
  name: llmConfig.model,          // e.g. "AnthropicEscape" — a declared client
  client_type: baml.llm.ClientType.Primitive,
  sub_clients: [], retry: null, counter: 0,
});
await toolloop.SelectTool_async(flatTranscript, { client });
```

The selection chain is intact end to end, verified: `models.default`
(`packages/api/src/endpoints/config/models.ts:247-248`) populates the dropdown →
the chosen model arrives as `model` on the ephemeral agent
(`packages/api/src/agents/load.ts:152`) → folded into `model_parameters`
(`packages/api/src/agents/initialize.ts:1365`) → `normalizeAgentModelParameters`
(`packages/api/src/agents/run.ts:428-441`) is a shallow copy that deletes only
null-valued nullable keys, so `model` survives → `llmConfig`
(`run.ts:1233-1240`) → `clientOptions` (`run.ts:1379`).

`baseURL` and `apiKey` in the endpoint YAML are vestigial under this shape,
present only to clear the visibility filter at
`packages/api/src/endpoints/custom/config.ts:20-27`. Because BAML holds the real
values, dummy entries are accurate rather than misleading.

**The constraint that follows.** Since `client` is the only overridable option,
LibreChat's `temperature`, `max_tokens`, and `top_p` controls have no carrier into
BAML. They flow into `llmConfig`, reach `ChatBAML`, and are dropped **silently** —
no error, no warning. Exposing any parameter combination requires its own
`client<llm>` declaration in `.baml`.
