---
date: 2026-08-09T11:24:00-04:00
researcher: maceo
git_commit: 45cc53c40b47645b887c3bb996168e06aaa83f4c
branch: main
repository: silmari-chat
topic: "The LLM interface, mapped for a prospective BAML integration"
tags: [research, codebase, llm-interface, providers, streaming, structured-output, baml, agents]
status: complete
last_updated: 2026-08-09
last_updated_by: maceo
last_updated_note: "Revised §8 after the final research agent reported: corrected the summarisation entry (host-side path is unreachable dead code) and the vision-prompt entry (it is a real separate model call on the legacy assistants path); added the activity-label untraced fallback, memory LLM defaults, and title endpoint-redirect detail."
---

# Research: The LLM interface, mapped for a prospective BAML integration

**Date**: 2026-08-09T11:24:00-04:00
**Researcher**: maceo
**Git Commit**: `45cc53c40b47645b887c3bb996168e06aaa83f4c`
**Branch**: `main`
**Repository**: silmari-chat (LibreChat monorepo)

> **Permalinks.** This commit is present on `origin/main` (<https://github.com/tha-hammer/silmari-chat>). Every `path:line` reference below resolves to a permanent GitHub link by prefixing it as
> `https://github.com/tha-hammer/silmari-chat/blob/45cc53c40b47645b887c3bb996168e06aaa83f4c/<path>#L<line>`.
> References are kept in `path:line` form so they stay clickable in the editor.

## Research Question

Research the LLM interface in order to integrate BAML. Reference given by the requester: <https://docs.boundaryml.com/guide/framework-integration/react-next-js/building-a-chatbot>

## Summary

**BAML is not present in this repository.** The only `baml`-named artifact is `.baml/`, which contains five `.bamlprof` profiler files and a `.gitignore` whose entire contents are `*`. No `baml_src/`, no `baml_client/`, no `generator` block, and no `baml` entry in any of the four workspace `package.json` files.

The LLM interface in this codebase is a **three-layer stack** with one narrow, well-defined seam:

1. **Provider-config layer** (`packages/api/src/endpoints/`) — resolves a provider string plus request parameters plus credentials into a single `llmConfig` object. The dispatch point is `getProviderConfig` (`packages/api/src/endpoints/config/providers.ts:137`), which maps a provider to one of five initializer functions through `providerConfigMap` (`providers.ts:40-51`). Every initializer returns `InitializeResultBase { llmConfig: ClientOptions, configOptions?, endpointTokenConfig?, useLegacyContent?, provider?, tools? }` (`packages/api/src/types/endpoints.ts:58-65`).
2. **Run-orchestration layer** (`packages/api/src/agents/run.ts`) — folds `llmConfig` onto each agent as `clientOptions` (`run.ts:1379`) and hands the assembled `runConfig` to `Run.create` (`run.ts:1655`).
3. **The SDK boundary** — `@librechat/agents@^3.4.0`, an external package whose source is not in this checkout. It constructs the actual provider client (`ChatOpenAI`, `ChatAnthropic`, …) from `clientOptions` and runs a LangGraph graph. It also re-exports LangChain under subpaths (`@librechat/agents/langchain/messages`, `/langchain/tools`, `/langchain/prompts`, `/langchain/runnables`), so LangChain is a transitive, not direct, dependency of this repo.

**Two structural facts bear directly on the cited guide.** First, the client is a **Vite 8 + React 18 + React Router 7 SPA** (`client/package.json:97,108,166`; `client/vite.config.ts:1,4,49,193`) — there is no Next.js anywhere in the client workspace, so the `useChat` / server-action hooks in the linked BAML guide have no host. Second, streaming is a **custom SSE protocol** with its own event vocabulary (`event: message` frames carrying `{final}` / `{created}` / `{event, data}` / `{sync}` envelopes, written at `api/server/routes/agents/index.js:223-239`), consumed by `sse.js` in `client/src/hooks/SSE/useSSE.ts:103` and `useResumableSSE.ts:1380`, including a resume-after-disconnect path. BAML's documented TypeScript surface for a plain Node backend (`import { b } from './baml_client'`, `b.stream.Fn(...)`, `ClientRegistry`, `TypeBuilder`) is framework-independent and does not require any of that; the React-hook layer in the cited guide does.

**Where discrete, BAML-shaped calls already exist.** The main chat turn is a multi-turn agentic graph and is not a single structured call. But the codebase contains several *single-call, prompt-in / shape-out* sites that are currently hand-rolled: conversation titles (`api/server/controllers/agents/client.js:3089-3311`), activity labels (`packages/api/src/agents/activityLabels/runtime.ts:371-461`), memory extraction (`packages/api/src/agents/memory.ts:84-113,928`), assistants-path titles (`api/server/services/Endpoints/assistants/title.js:16-37`), the legacy vision-description call (`api/server/controllers/assistants/chatV1.js:407`), and image tools that call a model directly (`api/app/clients/tools/structured/GeminiImageGen.js:386`, `OpenAIImageTools.js:164`). Each of these already pairs a hand-built prompt string with hand-written output parsing.

One prompt pair — `SUMMARY_PROMPT` and `CUT_OFF_PROMPT` in `api/app/clients/prompts/summaryPrompts.js` — is defined but **unreachable**: `BaseClient.summarizeMessages` is an abstract throw with no implementation left in the repo (`api/app/clients/BaseClient.js:228-229`). Live context summarisation happens inside the SDK instead, configured via `createRun`'s `summarizationConfig` (`packages/api/src/agents/run.ts:1081`).

## Detailed Findings

### 1. Current BAML footprint in the repository

| Fact | Evidence |
|---|---|
| `.baml/` exists but is fully ignored | `.baml/.gitignore` contains exactly `*` |
| Contents are profiler output only | `.baml/profiles/*.bamlprof` (5 files) |
| No BAML source or generated client | no `baml_src/` or `baml_client/` anywhere in the tree |
| No dependency | `grep baml package.json api/package.json packages/*/package.json client/package.json` returns nothing |
| No source references | repo-wide `grep -rl "baml\|BAML"` (excluding `node_modules`, `.git`) returns no source file |

`node_modules/` is not installed in this checkout, so no runtime inspection of `@librechat/agents` was possible; its source path named in `CLAUDE.md` (`/home/danny/agentus`) does not exist on this machine.

### 2. The provider-config seam — where an LLM client is defined

`getProviderConfig({ provider, appConfig })` (`packages/api/src/endpoints/config/providers.ts:137`) returns `{ getOptions, overrideProvider, customEndpointConfig }`. The map:

```
providerConfigMap  (providers.ts:40-51)
  xai, deepseek, moonshot, openrouter  -> initializeCustom
  vertexai                             -> initializeGoogle
  openAI, azureOpenAI                  -> initializeOpenAI
  google                               -> initializeGoogle
  bedrock                              -> initializeBedrock
  anthropic                            -> initializeAnthropic
  (unmatched)                          -> initializeCustom, overrideProvider = Providers.OPENAI  (providers.ts:151-158)
```

`InitializeFn` is `(params: BaseInitializeParams) => Promise<InitializeResultBase>` (`providers.ts:17`). `BaseInitializeParams` (`packages/api/src/types/endpoints.ts:43-52`) carries `{ req, endpoint, model_parameters?, db }`, where `db` supplies `getUserKey` / `getUserKeyValues` (`endpoints.ts:33-38`) — **this is the user-supplied-API-key path**. `initializeOpenAI` reads env keys or, when the endpoint is user-provided, calls `db.getUserKeyValues({ userId, name: endpoint })`.

Per-provider builders:

| Provider | Config builder | Notes |
|---|---|---|
| OpenAI / Azure / custom | `getOpenAIConfig` (`packages/api/src/endpoints/openai/config.ts:93`), delegating to `getOpenAILLMConfig` (`openai/llm.ts:501`, called at `config.ts:194`) | `knownOpenAIParams` allow-list at `openai/llm.ts:22`; `response_format` is a passthrough member (`llm.ts:56`) |
| Anthropic | `packages/api/src/endpoints/anthropic/llm.ts`; `knownAnthropicParams` at `:93` | Vertex variant in `anthropic/vertex.ts` (direct `@anthropic-ai/sdk` import) |
| Google / Vertex | `packages/api/src/endpoints/google/llm.ts` | thinking-budget handling; error classification in `google/errors.ts` |
| Bedrock | `packages/api/src/endpoints/bedrock/initialize.ts` | `@aws-sdk/credential-providers`, `@aws-sdk/client-bedrock-runtime` |
| Custom endpoints | `packages/api/src/endpoints/custom/initialize.ts`, `custom/config.ts` | defaults to the OpenAI-compatible client; `provider: anthropic` routes to native `/v1/messages` (`providers.ts:202-209`) |

An **ambiguity guard** exists for case-insensitive custom-endpoint matching: multiple case-insensitive matches throw rather than silently picking the first (`providers.ts:189-194`).

### 3. The chat-turn call spine

Verified call order, HTTP to provider:

| # | Step | Location |
|---|---|---|
| 1 | Route + middleware chain | `api/server/routes/agents/chat.js:74-80` (`restoreResumeContext`, `createMessageFilterPii`, `moderateText`, `checkAgentAccess`, `checkAgentResourceAccess`, `validateConvoAccess`, `buildEndpointOption`) |
| 2 | Request body split into `model_parameters` | `api/server/services/Endpoints/agents/build.js:10` — everything not in `{spec, iconURL, agent_id, chatProjectId}` becomes `model_parameters` |
| 3 | Controller | `api/server/controllers/agents/request.js:312` `ResumableAgentController` (`AgentController` at `:1937` forwards to it) |
| 4 | Job creation, immediate HTTP response | `request.js:872-900`, `:930-935` — the POST returns `{streamId, conversationId, status:'started'}`; generation continues in background from `startGeneration` (`:1180`, invoked `:1817`) |
| 5 | Client construction | `request.js:1028-1036` calls `initializeClient`, which is `api/server/services/Endpoints/agents/initialize.js:130`; returns `{ client, userMCPAuthMap }` (`initialize.js:1092`) |
| 6 | Agent + provider + credential resolution | `initializeAgent` (`packages/api/src/agents/initialize.ts:578`), called at `initialize.js:463` |
| 7 | Provider dispatch | `initialize.ts:1102` `getProviderConfig(...)`; `:1115-1120` `await getOptions({req, endpoint: provider, model_parameters, db})` |
| 8 | `llmConfig` written onto the agent | `initialize.ts:1365` `agent.model_parameters = { ...options.llmConfig }`; `configOptions` folded in at `:1366-1368` |
| 9 | `sendMessage` | `request.js:1331` `client.sendMessage(text, messageOptions)` — inherited from `BaseClient` (`api/app/clients/BaseClient.js:550`) |
| 10 | Message assembly | `AgentClient.buildMessages` (`api/server/controllers/agents/client.js:1019`), using the local `formatMessage` (`api/app/clients/prompts/formatMessages.js:48`) |
| 11 | Completion | `AgentClient.sendCompletion` (`client.js:1749`) → `AgentClient.chatCompletion` (`client.js:2212`) |
| 12 | LangChain message conversion | `client.js:2325` `formatAgentMessages(...)` — the **SDK** version imported at `client.js:99`, not the same-named local helper |
| 13 | Run construction | `client.js:2521` `createRun({...})` → `packages/api/src/agents/run.ts:1067` |
| 14 | `llmConfig` assembly | `run.ts:1233-1240` `Object.assign({provider, streaming, streamUsage}, modelParameters)`; assigned as `clientOptions` at `run.ts:1379` |
| 15 | **SDK boundary** | `run.ts:1655` `Run.create(runConfig)` |
| 16 | Execution | `client.js:2607` `run.processStream({messages}, config, {callbacks:{[Callback.TOOL_ERROR]: logToolError}})` |
| 17 | HITL pause check | `client.js:2616` `handleRunInterrupt(run, streamId)` (method at `client.js:2075`) |

System-prompt assembly happens in `run.ts:1242-1255`: `systemContent = [joinInstructionMap(agent.toolContextMap), agent.instructions ?? ''].join('\n').trim()`, with `additional_instructions` built the same way from `dynamicToolContextMap`. `agent.instructions` had `{{current_date}}`-style special vars resolved earlier at `initialize.ts:1370-1379`.

Note on `BaseClient`: repo-wide, only two classes extend it — `AgentClient` (`client.js:132`) and the test double `FakeClient` (`api/app/clients/specs/FakeClient.js:4`). `OllamaClient.js:42` does not extend it and has no importer under `api/`.

### 4. The `@librechat/agents` boundary

Declared as `"@librechat/agents": "^3.4.0"` in both `api/package.json:49` and `packages/api/package.json:110`. 96 files import from it or its subpaths.

Symbols imported at the LLM-invocation spine:

| From | Symbols | Site |
|---|---|---|
| `@librechat/agents` | `Run`, `Callback`, `Providers`, `TitleMethod`, `formatMessage`, `formatAgentMessages`, `createMetadataAggregator` | `api/server/controllers/agents/client.js:93-101` |
| `@librechat/agents` | `createContentAggregator` | `api/server/services/Endpoints/agents/initialize.js:2` |
| `@librechat/agents` | `Run`, `Providers`, `Constants`, `HookRegistry` + types `RunConfig`, `AgentInputs`, `IState`, `LCTool`, `LCToolRegistry`, `StreamPreemption`, `HookCallback`, … | `packages/api/src/agents/run.ts:2` region |
| `@librechat/agents/langchain/messages` | `getBufferString`, `HumanMessage`, type `BaseMessage` | `client.js:3`, `run.ts` types |
| `@librechat/agents/langchain/tools` | `Tool`, `tool` | `api/app/clients/tools/structured/*.js`, `tools/util/fileSearch.js:3` |
| `@librechat/agents/langchain/prompts` | `PromptTemplate` | `api/app/clients/prompts/summaryPrompts.js:1` |
| `@librechat/agents/langchain/openai`, `/language_models/chat_models`, `/google-common` | `AzureOpenAIInput`, `BindToolsInput`, `GoogleAIToolType` | `packages/api/src/endpoints/openai/config.ts`, `google/llm.ts` |

Direct provider SDK imports (bypassing the SDK boundary) exist in a small set of files: `openai` in `packages/api/src/endpoints/openai/llm.ts`, `api/server/services/Endpoints/assistants/initalize.js`, `azureAssistants/initialize.js`, `api/app/clients/tools/structured/DALLE3.js` and `OpenAIImageTools.js`; `@anthropic-ai/sdk` in `packages/api/src/endpoints/anthropic/vertex.ts`; `@google/genai` in `api/app/clients/tools/structured/GeminiImageGen.js:4`; `@aws-sdk/client-bedrock-runtime` in `packages/api/src/endpoints/bedrock/initialize.ts`.

### 5. Streaming contract

**Event vocabulary.** `getDefaultHandlers()` (`api/server/controllers/agents/callbacks.js:337-647`) registers handlers keyed by `GraphEvents`/`UsageEvents` names. Handled events: `CHAT_MODEL_END` (`callbacks.js:394-398`), `TOOL_END` (`:399`), `ON_RUN_STEP` (`:400-429`), `ON_RUN_STEP_DELTA` (`:430-447`), `ON_RUN_STEP_COMPLETED` (`:448-490`), `ON_MESSAGE_DELTA` (`:491-506`), `ON_REASONING_DELTA` (`:507-522`), `ON_TOOL_EXECUTE` (`:525-527`), `ON_SUBAGENT_UPDATE` (`:529-576`), `ON_SUMMARIZE_START|DELTA|COMPLETE` (`:578-605`), `ON_AGENT_LOG` (`:607`, server-log only, never forwarded), `ON_CONTEXT_USAGE` (`:610-644`, feature-guarded for older SDK versions).

The literal string values these switch on are mirrored in `packages/data-provider/src/types/runs.ts:4-69` (`ContentTypes`, `StepTypes`, `StepEvents`, `UsageEvents`, `ApprovalEvents`).

**Wire format.** `writeEvent` (`api/server/routes/agents/index.js:223-239`) writes:

```
event: ${eventName ?? 'message'}\ndata: ${JSON.stringify(event)}\n\n
```

then `res.flush()` if available. Headers set at `index.js:212-218`: `Content-Encoding: identity`, `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`, plus a generation-protocol version header. The non-resumable path uses `sendEvent` (`packages/api/src/utils/events.ts:8-13`), same shape with `event: message` hardcoded; `handleError` (`events.ts:20-23`) writes `event: error` and ends the response.

**Payload union.** `ServerSentEvent = StreamEvent | CreatedEvent | FinalEvent` (`packages/api/src/types/events.ts:64`):
- `StreamEvent = { event: string; data: string | Record<string, unknown> }` (`events.ts:4-7`)
- `CreatedEvent = { created: true; message: {...}; streamId: string }` (`events.ts:10-24`)
- `FinalEvent = { final: true; reconcile?; reconcileReason?; terminalStatus?; generationCreatedAt?; requestMessage?; responseMessage?; conversation?; title?; aborted?; earlyAbort?; runMessages?; pendingSteers?; error? }` (`events.ts:41-62`)

**Job manager surface** (`packages/api/src/stream/GenerationJobManager.ts`): `createJob` (`:1879`), `subscribe` (`:3862`), `subscribeWithResume` (`:4608`), `emitChunk` (`:5089`), `emitDone` (`:6359`), `emitError` (`:6391`), `abortJob` (`:3498`), `expireApproval` (`:6420`). Metadata shape at `packages/api/src/types/stream.ts:5-51`; `GenerationJobStatus = 'running'|'complete'|'error'|'aborted'|'requires_action'` (`stream.ts:53`).

**Partial to final.** `createContentAggregator()` (invoked at `api/server/services/Endpoints/agents/initialize.js:165`) returns `{contentParts, aggregateContent, stepMap}`; every content handler calls `aggregateContent({event, data})` at the same site where it forwards the SSE frame (`callbacks.js:408,438,474,499,515,589,598`), so persistence and the live stream are driven off one event. `AgentClient.sendCompletion` returns `filterMalformedContentParts(this.contentParts)` (`client.js:1749-1760`); `BaseClient` assigns it to `responseMessage.content` for the agents endpoint (`BaseClient.js:747-774`); the resumable controller re-saves idempotently at `request.js:1602-1614` and publishes FINAL at `request.js:1671-1674`.

**HITL.** `packages/api/src/stream/ApprovalLifecycle.ts:65` implements `running --pause--> requires_action --resolve--> running` (`pause` `:76`, `resolve` `:313`, `expire` `:367`), with a pause-persistence barrier at `:138-282`. Announced on the wire as `ApprovalEvents.ON_PENDING_ACTION` (`packages/data-provider/src/types/runs.ts:67-69`). Mid-run steering is the parallel mechanism in `SteeringLifecycle.ts:112` (`enqueue` `:120`, `drain` `:165`, `park`/`claim` `:281-360`).

### 6. Frontend request and consumption path

- **Stack**: `client/package.json:97` React 18.2, `:108` react-router-dom 7.18, `:114` recoil, `:79` jotai, `:62` @tanstack/react-query 4.28, `:122` `sse.js` 2.8, `:166` vite 8.0.16, `:148` @vitejs/plugin-react 6.0.2. `client/vite.config.ts:55` dev server port 3090 proxying `/api` to 3080 (`:57-66`); static build output at `:193`. No Next.js.
- **Payload**: `packages/data-provider/src/createPayload.ts:14-64` — target `/api/agents/chat/${endpoint}` (`:38`, resolved via `EndpointURLs` in `packages/data-provider/src/config.ts:2260-2264`); assistants target `/api/assistants/v2/chat` (`:39-43`).
- **Transports**: `useAdaptiveSSE` (`client/src/hooks/SSE/useAdaptiveSSE.ts:19-41`) picks `useSSE` for assistants, `useResumableSSE` otherwise. `useSSE.ts:103-106` opens one POST SSE with an `Authorization` header. `useResumableSSE.ts:3157-3179` POSTs to start, then `:1367-1387` opens a GET SSE at `/api/agents/chat/stream/:streamId` with `?resume=true` reconnection.
- **Dispatch**: `useSSE.ts:117-249` branches on payload shape — `{final}` (`:120`), `{created}` (`:136`), `event === 'title'` (`:146`), `UsageEvents.ON_CONTEXT_USAGE` (`:148`), `ON_TOKEN_USAGE` (`:150`), `ApprovalEvents.ON_PENDING_ACTION` (`:152`), generic `data.event` step handling (`:167-174`), `{sync}` (`:175`).
- **State**: message content lives in the **React Query cache** (`getMessages`/`setMessages` over `[QueryKeys.messages, conversationId]`, `client/src/hooks/Chat/useChatHelpers.ts:107-125`); lifecycle flags are **Recoil** (`isSubmittingFamily`, `useChatHelpers.ts:95`; `showStopButtonByIndex`, `useSSE.ts:45`). `finalHandler` (`useEventHandlers.ts:657-903`) replaces the streamed draft with the server-persisted messages at `:745-748`.
- **Existing hook layer**: `useChatFunctions.ts:267` `ask`, `:700` `regenerate`; `useChatHelpers.ts` composes them; `useSubmitMessage.ts:21-70` is the composer-facing wrapper; wiring root at `client/src/components/Chat/ChatView.tsx:76,79,123`.
- **Abort**: `useChatHelpers.ts:345-351` → `:199-343` `stopGenerating` → POST `/api/agents/chat/abort` (`client/src/data-provider/SSE/mutations.ts:40-48`); server replies by emitting a normal FINAL frame with `aborted: true`.

### 7. Structured-output patterns that exist today

| Mechanism | Location | Shape |
|---|---|---|
| JSON Schema → Zod for MCP tools | `packages/api/src/mcp/zod.ts:804` `convertJsonSchemaToZod` (marked `@deprecated`), `:238` `resolveJsonSchemaRefs`, `:378` `normalizeJsonSchema`, `:647` `sanitizeGeminiSchema` | provider-portability layer; node budget `MAX_RESOLVED_SCHEMA_NODES = 50_000` at `:221` |
| OpenAPI → Zod for Actions | `packages/data-provider/src/actions.ts:60-122` `schemaTypeHandlers`, `:115` `openAPISchemaToZod`, `:455-579` `openapiToFunction` | produces `zodSchemas[operationId]` |
| Classic function-tool JSON | `packages/data-provider/src/actions.ts:140-155` `FunctionSignature.toObjectTool()` | `{type:'function', function:{name, description, parameters, strict}}` |
| Hand-written JSON Schema tool defs | `packages/api/src/tools/registry/definitions.ts:19,38,69`; `packages/api/src/agents/tools.ts:147-407` (frozen literals) | built-in tools |
| Zod tool schema + JSON-Schema twin | `packages/api/src/agents/hitl/askUserQuestionTool.ts:53-98` (zod), `:102-184` (JSON Schema) | duality noted in-file at `:131-134` |
| Memory tools, two representations | `packages/api/src/agents/memory.ts:260,332` (zod runtime), `:360-401` `getMemoryToolDefinitions` (JSON Schema) | `set_memory` / `delete_memory` |
| Provider-native JSON mode | `api/server/controllers/agents/client.js:3225-3231` — sets `clientOptions.json = true` when `provider === Providers.GOOGLE` and `titleMethod` is `FUNCTIONS` or `STRUCTURED` | the only provider-native structured-mode toggle found in this repo |
| `titleMethod` config union | `packages/data-provider/src/config.ts:608-610` — `'completion' \| 'functions' \| 'structured'` | the structured-output selector, consumed by `Run.generateTitle` inside the SDK |
| Output repair | `packages/api/src/utils/sanitizeTitle.ts:14-35` (strips leaked `<think>` blocks); `packages/api/src/agents/activityLabels/runtime.ts:228-237` `normalizeLabelOutput`, `:448-461` `extractText`; `client/src/hooks/Artifacts/useArtifacts.ts:38-136` (streaming fence parser); `client/src/utils/artifacts.ts:525-564` (adaptive fence length) | all hand-rolled |
| Tool-argument validation | `packages/api/src/agents/toolValidation.ts:38-49` `parseToolInputValidationError`, `:51-63` `recordToolInputValidationError`, `:70-91` `getToolInputValidationDetails`; consumed at `packages/api/src/agents/hitl/askUserQuestionTool.ts:232-245` | post-processes the error LangChain already threw; does not re-validate |

### 8. Non-chat LLM call sites

| Call | Entry point | Model selection | Output handling |
|---|---|---|---|
| Conversation title (agents) | `api/server/services/Endpoints/agents/title.js:35` `addTitle` → `client.titleConvo` (`title.js:93`) → `api/server/controllers/agents/client.js:3089`, `:3250` `this.run.generateTitle(...)` | `endpointConfig.titleModel` falling back to the agent's model; `endpointConfig.titleEndpoint` can redirect the call to a different endpoint's credentials (`client.js:3140-3156`, matching the three `getProviderConfig` call sites at `client.js:3120,3142,3154`); `omitTitleOptions` filter (`packages/api/src/agents/client.ts:17-27`); timing from `resolveTitleTiming` (`packages/api/src/endpoints/config/providers.ts:65`) | `sanitizeTitle(titleResult.title)` (`client.js:3311`); usage tagged `context: 'title'` (`client.js:3297-3309`) |
| Conversation title (assistants) | `api/server/services/Endpoints/assistants/title.js:16-37` | **hardcoded** `gpt-3.5-turbo`, `temperature: 0.7`, `max_tokens: 20` (`:26-33`) | `completion.choices[0]?.message?.content?.trim()` with `'New conversation'` fallback (`:35`) |
| Activity labels | `packages/api/src/agents/activityLabels/runtime.ts:478` `createActivityLabelHook`; prompt built at `:384` `buildPrompt` from `ACTIVITY_INSTRUCTION` (`:371-382`) | `resolveActivityLabelModel` (`activityLabels/host.ts:205`) | `extractText` (`:448`) + `normalizeLabelOutput` (`:228`), capped at `LABEL_OUTPUT_CHAR_LIMIT = 200` (`:220`) |
| Memory extraction | `packages/api/src/agents/memory.ts:928` `createMemoryProcessor` → `processMemory` (`:689`) → its own `Run.create` (`:879-891`); triggered fire-and-forget from `AgentClient.runMemory` (`client.js:1669`), invoked at `client.js:2447-2449` in parallel with the primary run and bounded by `awaitMemoryWithTimeout(…, 3000)` (`client.js:1432-1455`, called at `:2722`) | `config.llmConfig` merged over defaults `{provider: OPENAI, model: 'gpt-4.1-mini', temperature: 0.4, streaming: false, disableStreaming: true}` (`memory.ts:758-764`) | tool-calling: the model's output *is* the `set_memory`/`delete_memory` calls, which write to the DB during the run; artifacts read at `:990-1037`, `:1048-1072` |
| Activity labels — untraced fallback | `packages/api/src/agents/activityLabels/runtime.ts:593-616` — `initializeModel({provider, clientOptions})` then `.invoke(directPromptText, {signal, callbacks})` | same resolution as above | `extractText(response?.content)`; used only when the SDK bridge is absent or declines (the preferred path bridges to `run.generateActivityLabel` via `client.js:948-950`) |
| Summarisation — SDK-side (live) | `summarizationConfig` threaded through `createRun` (`packages/api/src/agents/run.ts:1081`) into the SDK | `appConfig.summarization` | streamed back as `ON_SUMMARIZE_START/DELTA/COMPLETE` (`callbacks.js:578-605`); the call itself happens inside `@librechat/agents` |
| Summarisation — legacy host-side (**unreachable**) | `api/app/clients/prompts/summaryPrompts.js:1` defines `SUMMARY_PROMPT` and `CUT_OFF_PROMPT` as `PromptTemplate`s | — | `BaseClient.summarizeMessages` is an abstract throw (`api/app/clients/BaseClient.js:228-229`) with **no implementation anywhere in `api/` or `packages/`**, and `this.shouldSummarize` is never assigned `true` in production code — only read at `BaseClient.js:896` and `client.js:1024`, and nulled at `api/server/cleanup.js:225-226`. The prompts are defined but no code path reaches them. |
| Moderation | `api/server/middleware/moderateText.js:71-72`; registered twice — chat route `api/server/routes/agents/chat.js:76`, steer route `api/server/routes/agents/index.js:896`, both after the PII filter | direct `axios.post` to `OPENAI_MODERATION_REVERSE_PROXY` or `https://api.openai.com/v1/moderations` | classification API, not a completion; `results.some(r => r.flagged)` (`moderateText.js:85`) → `denyRequest` (`api/server/middleware/denyRequest.js:23-67`) |
| Vision description (**legacy assistants only**) | prompt at `api/app/clients/prompts/createVisionPrompt.js:6`; **a genuinely separate model call** at `api/server/controllers/assistants/chatV1.js:404` (prompt set) and `:407` `openai.chat.completions.create({messages: [visionMessage], max_tokens: 4000})` | no `model` parameter is passed on that call | stashed as `openai.visionPromise` (`chatV1.js:530`), awaited by `processVisionRequest` (`api/server/services/ToolService.js:193`, dispatched at `:283`), and returned as raw `completion.choices[0].message.content` for the assistant run's required action. No equivalent exists on the agents endpoint. |
| Artifact instructions | `packages/api/src/prompts/artifacts/index.ts` | system-prompt text instructing a `:::artifact{...}` fenced format | parsed client-side (`client/src/hooks/Artifacts/useArtifacts.ts`) |
| Gemini image generation | `api/app/clients/tools/structured/GeminiImageGen.js:386` `ai.models.generateContent(...)`; client built at `:99`/`:105`/`:119` from `@google/genai` (`:4`) | tool-local key resolution | charges Billing directly at `:287` |
| OpenAI image generation | `api/app/clients/tools/structured/OpenAIImageTools.js:164` `openai.images.generate(...)`; `require('openai')` at `:3` | tool-local | image bytes |

**Modules checked and confirmed *not* to make their own model call.** `packages/api/src/agents/intent.ts` injects an `intent` argument as the first key of an opted-in tool's schema (`:167` `injectIntentParam`, `:47` `INTENT_ARG`, `:325` `applyIntentLabels`) so the model already handling the turn states its own per-call intent — no auxiliary invocation. `discovery.ts`, `contact.ts`, and `selection.ts` all exist under `packages/api/src/agents/` but contain no `initializeModel`, `.invoke(`, `Run.create`, `generateContent`, or `completions.create` — `discovery.ts` performs agent-graph and permission discovery, `contact.ts` is a pure shape module. The design rationale for tool intents is in the repo-root `tool-intent-spec.md`.

No classification or routing LLM call was found anywhere in the repository beyond the auxiliary calls tabulated above.

### 9. Observability and usage accounting

Token usage is collected from `CHAT_MODEL_END` (`callbacks.js:41-204`) into `collectedUsage`, aggregated by `packages/api/src/agents/usage.ts`, and spent via `spendTokens` (`packages/data-schemas/src/methods/spendTokens.ts`) — called from `packages/api/src/agents/usage.ts:653`, `api/server/middleware/abortMiddleware.js:163`, `api/server/services/Threads/manage.js:510`, `api/app/clients/tools/structured/GeminiImageGen.js:287`, and `api/server/controllers/agents/client.js:3337`/`:3356`.

Tracing is Langfuse, configured by `buildLangfuseConfig` (`packages/api/src/langfuse/config.ts:130`) and attached to `runConfig.langfuse` at `packages/api/src/agents/run.ts:1617-1622`. The trace id is derived deterministically from `runId` (`packages/api/src/langfuse/trace.ts:3` `traceIdForMessage`) so message feedback can be scored without a lookup. Sampling and tenant routing live in `packages/api/src/langfuse/policy.ts` and `tenantDestinations.ts`.

### 10. BAML's documented API surface (external research, with links)

> **⚠️ FALSIFIED against the installed toolchain — 2026-08-09.** This section
> describes **BAML v0**, the line documented at `docs.boundaryml.com`. A spike run
> the same day installed the toolchain and found that **v1 is what installs**
> (`baml wrapper 0.2.0` / `baml toolchain 0.15.0`), with a different CLI, project
> model, package name, and client API. **Eleven of eighteen claims were
> falsified; six confirmed, one unverified.** The section is kept as-written
> because it remains accurate *for v0*, and because the delta is the point.
>
> Falsification harness: `baml_src/ns_spike/claims.baml` (run `baml test`, then
> `baml run -e 'root.spike.report()'`). Reproduce every observation with
> `./scripts/baml-spike/probe.sh`.
>
> | | v0 (this section) | v1 (installed) |
> |---|---|---|
> | CLI | `npx baml-cli generate` | `baml generate` |
> | Generator declared in | a `generator` block in a `.baml` file | `[generator.<name>]` in `baml.toml` |
> | Node runtime package | `@boundaryml/baml` | `@boundaryml/baml-bridge` |
> | Client import | `import { b } from './baml_client'` | one named export per function, sync + async, from `baml_sdk` |
> | Runtime provider override | `ClientRegistry` | **no such symbol**; `baml.llm.PrimitiveClientOptions` carries `model` / `api_key` / `base_url` as ordinary runtime fields |
> | Runtime schema extension | `TypeBuilder` | **no such symbol**; `type_builder` is a compile-time block inside a `test` |
> | Usage reporting | `Collector` | **no such symbol** |
> | Prompt strings | `#"…"#` | backticks with `${…}` interpolation |
> | What a `function` is | always an LLM call | an ordinary typed function; the LLM form is a DSL that desugars into it |
> | Passing values back in | "call the exported functions with native TypeScript types" | **one-way only** — a `Claim[]` returned to JS comes back as plain objects, and feeding them into a `Claim[]` parameter panics `VM internal error: type error: expected instance, got map`. Hosts must call nullary entry points. |
>
> Confirmed and load-bearing for this repository: the **return type is the
> schema**; **per-request model, key, and base URL are expressible at runtime**
> (mechanism differs from `ClientRegistry`, capability holds — proven in
> `baml_src/ns_spike/runtime_client.baml`, two tenants with distinct
> `base_url`/`api_key`/`model` in one process); the Node runtime **is** a napi
> native addon (`napi.binaryName = baml_node`, eight platform targets); and
> codegen runs **without** `node_modules`, though executing the SDK needs `tsc`
> plus `"type": "module"` because the bridge is ESM-only.
>
> Open Question 1 below is thereby resolved: v1 is real, is separate, and is what
> `brew install baml` gives you.

Reported from <https://docs.boundaryml.com>. Every claim below is a statement about BAML's documentation, not about this repository.

- **Core model** — `.baml` files in `baml_src/` define `function`, `class`, `enum`, `client<llm>`, `template_string`, `test`. `npx baml-cli generate` emits a `baml_client/` directory containing `types.ts`, an async client, a `sync_client`, a `type_builder`, and partial types for streaming. [What is BAML?](https://docs.boundaryml.com/guide/introduction/what-is-baml) · [generate CLI](https://docs.boundaryml.com/ref/baml-cli/generate)
- **Generator config** — `output_type` (`"typescript"`, `"python/pydantic"`, `"go"`, `"ruby"`, `"rest/openapi"`), `output_dir`, `version`, `module_format` (`esm`/`cjs`), `default_client_mode`, `on_generate`. [generator reference](https://docs.boundaryml.com/ref/baml/generator)
- **Plain Node/Express usage** — `import { b } from './baml_client'`; `await b.Fn(args)`; `b.stream.Fn(args)` returns an async iterable of partials with `getFinalResponse()`. A "modular API" also exposes `b.request.Fn(...)`, `b.stream_request.Fn(...)`, `b.parse.Fn(rawText)`, `b.parse_stream.Fn(...)` for callers that want to issue the HTTP request themselves. Nothing Next.js-specific is required. [TypeScript install](https://docs.boundaryml.com/guide/installation-language/typescript) · [client reference](https://docs.boundaryml.com/ref/baml_client/client) · [Modular API](https://docs.boundaryml.com/guide/baml-advanced/modular-api)
- **Runtime provider/model/key override** — `ClientRegistry` from `@boundaryml/baml`: `cr.addLlmClient(name, provider, options)` then `cr.setPrimary(name)`, passed per call as `b.Fn(args, { clientRegistry: cr })`. `setPrimary` can also point at a client declared statically in `.baml`. [ClientRegistry](https://docs.boundaryml.com/ref/baml_client/client-registry) · [client&lt;llm&gt;](https://docs.boundaryml.com/ref/baml/client-llm)
- **Runtime schema extension** — `@@dynamic` on a class/enum plus `TypeBuilder` (`tb.User.addProperty(...)`, `tb.add_class()`, `tb.add_baml()`), passed as `{ tb }`. [Dynamic Types](https://docs.boundaryml.com/guide/baml-advanced/dynamic-types)
- **Providers** — `openai`, `anthropic`, `google-ai`, `vertex`, `aws-bedrock`, `azure-openai`, `microsoft-foundry`, `ollama`, and `openai-generic` for any OpenAI-compatible base URL with custom `headers`/`api_key`. [openai-generic](https://docs.boundaryml.com/ref/llm-client-providers/openai-generic) · [aws-bedrock](https://docs.boundaryml.com/ref/llm-client-providers/aws-bedrock) · [azure-openai](https://docs.boundaryml.com/ref/llm-client-providers/open-ai-from-azure)
- **Tool calling** — modeled as ordinary BAML classes with a string-literal discriminator, returned as a union from a function; prompt-injected via `{{ ctx.output_format }}` rather than the provider's native tool-call protocol. Multi-turn agentic loops are written by the host application; BAML does not manage conversation or tool-call history. [Tools / Function Calling](https://docs.boundaryml.com/examples/prompt-engineering/tools-function-calling)
- **Streaming semantics** — `@stream.done` (field appears only when complete), `@stream.not_null` (parent not emitted until field present); otherwise fields stream as partials. Generated partial types live in a `partial_types` module. [Streaming](https://docs.boundaryml.com/guide/baml-basics/streaming)
- **Usage reporting** — `Collector` from `@boundaryml/baml`, passed as `{ collector }`; exposes `collector.last?.usage.{inputTokens,outputTokens,cachedInputTokens}`, cumulative `collector.usage`, and `collector.logs` with raw request/response and `timing.duration_ms`. No cost field — token counts multiplied by your own pricing table. Boundary Studio is the separate hosted product. [Collector](https://docs.boundaryml.com/guide/baml-advanced/collector-track-tokens)
- **Deployment** — `baml-cli` is a Rust binary delivered via npm postinstall (build-time codegen); the runtime `@boundaryml/baml` is a **native Node addon (napi-rs), not WASM**. Documented Docker pattern is `RUN npx baml-cli generate --from path-to-baml_src` before `tsc`, with `--no-tests` for smaller prod images. [Docker deployment](https://docs.boundaryml.com/guide/development/deploying/docker)
- **v0 vs v1 — unresolved.** `docs.boundaryml.com` currently carries a banner stating it documents "BAML v0, the legacy DSL" and that "BAML v1 is a separate, fully featured programming language in public beta." A changelog entry for **v0.221.0 (2026-04-14)** does include the chore *"brand legacy releases as BAML v0"*, so the rebrand is real. However, no public v1 docs URL, repo, npm package, or announcement describing v1 could be located, and BoundaryML's own [Roadmap to BAML 1.0](https://boundaryml.com/blog/launch-week-day-5) describes 1.0 as stabilisation of the existing language rather than a separate one. Everything documented above is the currently-installable, currently-documented v0 surface. [What is BAML? (banner)](https://docs.boundaryml.com/guide/introduction/what-is-baml) · [Changelog](https://docs.boundaryml.com/changelog/changelog)

## Code References

- `packages/api/src/endpoints/config/providers.ts:17` — `InitializeFn` type
- `packages/api/src/endpoints/config/providers.ts:40-51` — `providerConfigMap`
- `packages/api/src/endpoints/config/providers.ts:137` — `getProviderConfig`
- `packages/api/src/types/endpoints.ts:43-52` — `BaseInitializeParams` (carries `db.getUserKeyValues`)
- `packages/api/src/types/endpoints.ts:58-65` — `InitializeResultBase` (`llmConfig`)
- `packages/api/src/endpoints/openai/config.ts:93` — `getOpenAIConfig`
- `packages/api/src/endpoints/openai/llm.ts:501` — `getOpenAILLMConfig`
- `packages/api/src/agents/initialize.ts:578` — `initializeAgent`
- `packages/api/src/agents/initialize.ts:1102-1120` — provider dispatch + credential resolution
- `packages/api/src/agents/initialize.ts:1365` — `agent.model_parameters = { ...options.llmConfig }`
- `packages/api/src/agents/run.ts:1067` — `createRun`
- `packages/api/src/agents/run.ts:1233-1240` — `llmConfig` assembly
- `packages/api/src/agents/run.ts:1379` — `clientOptions: llmConfig`
- `packages/api/src/agents/run.ts:1655` — `Run.create` (the SDK boundary)
- `api/server/controllers/agents/client.js:2212` — `AgentClient.chatCompletion`
- `api/server/controllers/agents/client.js:2521` — `createRun` call
- `api/server/controllers/agents/client.js:2607` — `run.processStream`
- `api/server/controllers/agents/client.js:3089` — `AgentClient.titleConvo`
- `api/server/controllers/agents/client.js:3225-3231` — Google JSON-mode toggle for structured titles
- `api/server/controllers/agents/client.js:3250` — `run.generateTitle`
- `api/server/controllers/agents/client.js:3311` — `sanitizeTitle(titleResult.title)`
- `api/server/routes/agents/index.js:223-239` — SSE `writeEvent`
- `packages/api/src/types/events.ts:41-62` — `FinalEvent`
- `packages/api/src/utils/events.ts:8-13` — `sendEvent`
- `packages/api/src/stream/GenerationJobManager.ts:5089` — `emitChunk`
- `packages/api/src/agents/activityLabels/runtime.ts:371-382` — `ACTIVITY_INSTRUCTION`
- `packages/api/src/agents/activityLabels/runtime.ts:384` — `buildPrompt`
- `packages/api/src/agents/activityLabels/runtime.ts:228` — `normalizeLabelOutput`
- `packages/api/src/agents/memory.ts:84-113` — memory system prompt
- `packages/api/src/agents/memory.ts:928` — `createMemoryProcessor`
- `packages/api/src/agents/activityLabels/runtime.ts:593-616` — untraced direct-model fallback for labels
- `packages/api/src/agents/memory.ts:758-764` — memory default LLM config
- `api/app/clients/BaseClient.js:228-229` — `summarizeMessages` abstract throw, no implementation in the repo
- `api/server/controllers/assistants/chatV1.js:404-411` — the vision-description model call (legacy assistants only)
- `api/server/services/ToolService.js:193` — `processVisionRequest` consumes `visionPromise`
- `packages/api/src/agents/toolValidation.ts:38-91` — tool-input validation error handling
- `packages/api/src/mcp/zod.ts:804` — `convertJsonSchemaToZod`
- `packages/data-provider/src/actions.ts:115` — `openAPISchemaToZod`
- `packages/data-provider/src/config.ts:608-610` — `titleMethod` union
- `packages/data-provider/src/createPayload.ts:14-64` — chat request payload
- `client/src/hooks/SSE/useSSE.ts:103-249` — SSE open + event dispatch
- `client/src/hooks/SSE/useResumableSSE.ts:1367-1387` — resumable GET stream
- `client/vite.config.ts:49,193` — Vite SPA build

## Architecture Documentation

**Layering.** The repository already separates *what model to talk to* (`packages/api/src/endpoints/`) from *how to run a turn* (`packages/api/src/agents/`) from *how to talk to the model* (`@librechat/agents`). The interface between the first two is a single object — `llmConfig` — that travels by being assigned onto the agent (`initialize.ts:1365`) and then read back out (`run.ts:1228`). This is the codebase's narrowest LLM-facing contract.

**Two prompt-authoring idioms coexist.** Prompts that belong to a *run* are assembled from agent fields inside `buildAgentInput` (`run.ts:1242-1255`). Prompts that belong to a *discrete auxiliary call* are string constants next to their parser: `ACTIVITY_INSTRUCTION` beside `normalizeLabelOutput`, `getDefaultInstructions` beside the memory tool schemas, the assistants title prompt beside its `choices[0]` read. The second idiom is the one that already has an eval harness: `scripts/activity-labels/` grades instruction variants against a fixed corpus (`scripts/activity-labels/README.md`), and its README records that two intuitively-obvious hypotheses were disproved under measurement.

**Structured output is achieved three different ways today.** (a) Tool calling with zod or JSON-Schema parameter definitions — memory, MCP tools, actions, `ask_user_question`. (b) A provider-native JSON/structured mode, used in exactly one place, gated on `titleMethod` and only for Google (`client.js:3225-3231`), with the actual structured call delegated into the SDK's `Run.generateTitle`. (c) Free-text plus a hand-written parser — activity labels, assistants titles, artifacts.

**Schema definitions are frequently duplicated.** `ask_user_question` carries a zod schema and a hand-written JSON-Schema twin (`askUserQuestionTool.ts:53-98` and `:102-184`, with an in-file comment explaining the duality at `:131-134`). The memory tools do the same (`memory.ts:260,332` versus `:360-401`). The reason in both cases is two loader paths: a definitions-only registry and an executing instance.

**Multi-provider parameter translation is substantial and provider-specific.** `getOpenAILLMConfig` alone spans `openai/llm.ts:501` onward, handling reasoning-effort formats, verbosity, prompt caching, penalties, and per-model parameter drops; `sanitizeGeminiSchema` (`mcp/zod.ts:647`) exists because Gemini accepts a strict subset of JSON Schema.

## Workflow Closure Map

The research covered a behavior with a clear source-to-sink lineage: **a conversation acquires its title**. This chain was selected because it is the smallest complete `input → effect → observable result` path in the LLM interface, and it is the site where a BAML function would most directly substitute for hand-rolled prompt-plus-parse code (`client.js:3250` + `:3311`).

The enclosing chat-turn chain (§3 above) is documented in prose in Detailed Findings rather than mapped structurally, because a chat turn is a multi-turn graph inside an external SDK whose source is not in this checkout — the `Run.create` node cannot be resolved to a citable symbol here.

### Nodes and edges

| Depth | Node | Production registration | Closure label |
|---|---|---|---|
| 0 | `conversations` collection (source of truth) | Mongoose model built at `packages/data-schemas/src/models/convo.ts:7`; written via `saveConvo`, read via `getConvo` (`packages/data-schemas/src/methods/conversation.ts:104`) | production-called |
| 1 | `addTitle` (trigger) | Imported at `api/server/routes/agents/chat.js:21`, passed into the controller at `:83`; invoked at `api/server/controllers/agents/request.js:1334` (immediate), `:1721` (final), `:2252` | **production-called** |
| 2 | `AgentClient.titleConvo` → `run.generateTitle` (the model call) | `api/server/controllers/agents/client.js:3089`, called from `api/server/services/Endpoints/agents/title.js:93`; model call at `client.js:3250` | **production-called** |
| 3 | `sanitizeTitle` + title cache write | `packages/api/src/utils/sanitizeTitle.ts:14`, called at `client.js:3311`; cache set at `title.js:121` | **production-called** |
| 4 | `saveConvo` (durable write) | `api/server/services/Endpoints/agents/title.js:155`, `{ noUpsert: true }` | **production-called** |
| 5 | `getConvo` (observable) | `packages/data-schemas/src/methods/conversation.ts:104` | production read path |

Closure labels above are the `retrieval: semgrep` verdicts from the reverse-caller pass (`addTitle`, `titleConvo`, `sanitizeTitle`, `saveConvo`, `titleHandler` all `production-called`; zero `errors`).

**Per-edge evidence.**

| Edge | Producer | Consumer | Contract / constraints | Runtime context | Error behavior |
|---|---|---|---|---|---|
| 0→1 | conversation row exists (or does not, in immediate mode) | `addTitle(req, {text, client, conversationId, immediate, convoReady, signal, discardSignal, onTitleGenerated})` (`title.js:35-49`) | `conversationId` required, else early return (`title.js:65-68`) | `req.user.id`, `req.config`, `req.body.isTemporary` | returns silently when `TITLE_CONVO` disabled (`title.js:50-53`), when `client.options.titleConvo === false` (`:55-57`), or when temporary (`:59-62`) |
| 1→2 | `title.js:91-99` | `AgentClient.titleConvo` (`client.js:3089`) | raced against a 45s timeout (`title.js:74-79`) | `abortController` derived from the request `signal` (`title.js:83-90`) | model errors are caught and logged, resolving to `undefined` (`title.js:99-101`); the outer `catch` logs at `title.js:167` |
| 2→3 | `run.generateTitle` result (`client.js:3250-3271`) | `sanitizeTitle` (`client.js:3311`) | strips leaked `<think>` blocks, truncates code-point-safely, falls back to `DEFAULT_TITLE_FALLBACK` | Langfuse `handleLLMEnd` callback attached at `client.js:3262` | whole `titleConvo` body wrapped in `try/catch` returning `undefined` (`client.js:3312-3315`) |
| 3→4 | cached title (`title.js:121`, TTL 120000ms) | `saveConvo` (`title.js:155`) | **`noUpsert: true`** — a silent no-op if the conversation row is absent | gated on `await convoReady` (`title.js:148-150`) | `discardSignal` aborts persistence and clears the cache only if it still holds this title (`title.js:139-146`) |
| 4→5 | `conversations.title` | `getConvo` / conversation list | tenant-scoped by the `applyTenantIsolation` plugin (`packages/data-schemas/src/models/convo.ts:10`) | `userId` | — |

**Parallel (non-durable) branch.** `onTitleGenerated` (`title.js:125`) calls `emitTitleEvent` (`request.js:1210`), which emits `{event:'title', data:{conversationId, title}}` through `GenerationJobManager.emitChunk` (`request.js:1225`) fenced on `expectedCreatedAt: jobCreatedAt`. The browser consumes it at `client/src/hooks/SSE/useSSE.ts:146-147` → `titleHandler` (`client/src/hooks/SSE/useEventHandlers.ts:621`). Emission failures are caught and logged only (`request.js:1234-1236`), so a title can be persisted without ever being pushed live, and vice versa (the cache serves the live UI when `noUpsert` drops the write).

**Negative evidence.** `resolveConvoReady` is an in-module closure (`request.js:1188-1190`), resolved at `:1506`, `:1549`, `:1635`, `:1748` — it is not exported, so a closure test cannot drive that barrier through a public symbol. This is the one node in the chain whose driver is not independently addressable, and the structured map below marks that edge async accordingly, which fails safe.

**`highest_new_connector`**: `agent-title-model-call` (depth 2) — the node a BAML function would replace.

### ClosureMap (structured — derive() input)

```json
{
  "behavior": "A new conversation acquires a generated title that the user can read back in their conversation list.",
  "git_commit": "45cc53c40b47645b887c3bb996168e06aaa83f4c",
  "repo": "/home/maceo/Dev/silmari-chat",
  "nodes": [
    { "id": "conversation-row", "module": "packages/data-schemas", "is_entrypoint": false, "adds_or_changes": false, "read_path": null, "seedable_store": "saveConvo" },
    { "id": "add-title-trigger", "module": "api/server/services/Endpoints/agents", "is_entrypoint": true, "adds_or_changes": false, "read_path": null, "seedable_store": null },
    { "id": "agent-title-model-call", "module": "api/server/controllers/agents", "is_entrypoint": false, "adds_or_changes": true, "read_path": null, "seedable_store": null },
    { "id": "title-sanitize-and-cache", "module": "packages/api/src/utils", "is_entrypoint": false, "adds_or_changes": false, "read_path": null, "seedable_store": null },
    { "id": "title-durable-write", "module": "api/server/services/Endpoints/agents", "is_entrypoint": false, "adds_or_changes": false, "read_path": null, "seedable_store": null },
    { "id": "conversation-title-observable", "module": "packages/data-schemas", "is_entrypoint": false, "adds_or_changes": false, "read_path": "getConvo", "seedable_store": null }
  ],
  "edges": [
    { "is_async": false, "cross_boundary": false, "driver": null },
    { "is_async": false, "cross_boundary": true, "driver": null },
    { "is_async": false, "cross_boundary": true, "driver": null },
    { "is_async": true, "cross_boundary": true, "driver": "resolveConvoReady" },
    { "is_async": false, "cross_boundary": false, "driver": null }
  ]
}
```

Symbol resolvability at `45cc53c4`: `saveConvo` — `api/server/services/Endpoints/agents/title.js:155` (caller), defined in `packages/data-schemas/src/methods/conversation.ts`, semgrep verdict `production-called`. `getConvo` — `packages/data-schemas/src/methods/conversation.ts:104`, declared on the methods interface at `:58`. `resolveConvoReady` — `api/server/controllers/agents/request.js:1188`, resolved at `:1506`, `:1549`, `:1635`, `:1748`; **it is an in-module closure variable, not an exported function**, so promoting the adapter will require either exporting a driver or reproducing the barrier in the harness.

### Closure adapter (staged proposal — `2026-08-09-11-24-llm-interface-baml-integration.closure-adapter.py`)

```python
"""Closure adapter (STAGED PROPOSAL — not wired into the repo).
Derived from the ClosureMap for: a new conversation acquires a generated title.
Pin: 45cc53c40b47645b887c3bb996168e06aaa83f4c.
Promote into /home/maceo/Dev/silmari-chat and complete each TODO(promote) before use.
Speaks the 7-op contract apps/closure-oracle already talks to (mock_adapter.py).
"""
import http.server, json, sys
ASYNC_EDGES = ["title-sanitize-and-cache->title-durable-write"]
CONNECTOR = {e: True for e in ASYNC_EDGES}
SINK = []

def handle(op, p):
    if op == "/reset":        SINK.clear(); CONNECTOR.update({e: True for e in ASYNC_EDGES}); return {"ok": True}
    if op == "/set_connector": CONNECTOR[p["edge"]] = p["enabled"]; return {"ok": True}
    if op == "/seed_sink":     SINK.append(p["value"]); return {"ok": True}
    if op == "/seed":
        # TODO(promote): seed the conversations collection via saveConvo with p["data"]
        #                (packages/data-schemas/src/methods/conversation.ts; caller
        #                 api/server/services/Endpoints/agents/title.js:155)
        return {"ok": True}
    if op == "/trigger":
        # TODO(promote): call addTitle(req, p["args"])
        #                (api/server/services/Endpoints/agents/title.js:35;
        #                 production callers api/server/controllers/agents/request.js:1334, :1721)
        return {"ok": True}
    if op == "/drive":
        if not CONNECTOR.get(p["edge"], True): return {"ok": True}  # oracle disabled = red-at-seam
        # TODO(promote): resolve the convoReady barrier for p["edge"] — resolveConvoReady()
        #                (api/server/controllers/agents/request.js:1188; resolved :1506, :1549, :1635, :1748)
        #                NOTE: in-module closure, not exported — export a driver or reproduce the barrier.
        return {"ok": True}
    if op == "/observe":
        # TODO(promote): return json.dumps(getConvo(userId, conversationId).title)
        #                (packages/data-schemas/src/methods/conversation.ts:104)
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

The `thoughts/` directory did not exist in this repository before this research pass; it was created to hold this document. There is therefore no prior `thoughts/` material on this topic.

Repository-level prior art that bears on the question:

- `tool-intent-spec.md` (repo root) — a full feature spec for tool intent and outcome labels. Its §11 describes activity labels as "the settled, per-block, fast-model layer" and ties both intents and labels to Langfuse trace anchoring. It also documents the tool-capability family (`defer_loading`, `allowed_callers`, `run_in_background`) that new tool-level capabilities are expected to mirror.
- `scripts/activity-labels/README.md` — an eval harness that grades fast-model prompt variants against a fixed corpus, with a stated finding that the aggregate score is a regression guard while the per-case tables are the recall instrument.
- `CONTEXT.md` (repo root) — defines the "agent run envelope" as the versioned, JSON-safe request contract created after ingress authentication and protocol validation but before agent, provider, tool, or MCP initialization.
- `CLAUDE.md` (repo root) — workspace boundaries: all new backend code is TypeScript in `packages/api`, `/api` changes kept minimal.

No beads database exists in this repository (`bd list --status=open` reports "no beads database found"), so no issue linkage was possible and no issues were created.

## Related Research

- `specs/INDEX.md` and the 13 per-domain specs in `specs/` (produced earlier in this session by the DomainMap skill). Most relevant here: `specs/agent.domain.md` (agent definition versus execution), `specs/run-orchestration.domain.md` (the generation-job lifecycle), `specs/tooling.domain.md` (the three tool subsystems), and `specs/billing.domain.md` (the five token-spend call sites).

## Open Questions

1. ~~**BAML v0 versus v1.**~~ **RESOLVED 2026-08-09 by spike.** v1 is real and is what installs. `/home/maceo/.baml/` holds both lines side by side: `baml-cli-0.218.1` … `baml-cli-0.222.0` (v0) alongside the wrapper plus toolchain `0.13.0`/`0.15.0` (v1). v1 is a general-purpose statically-typed language with an LLM DSL layered on it, a bytecode VM (`initializeRuntimeFromBytecode`), namespaces via `ns_*` directories, green-thread concurrency (`spawn`/`await`), pattern matching, interfaces, and `defer`/`cleanup`. Its documentation is the CLI itself — `baml describe <symbol>` — not the website. See the correction banner in §10.
2. **`@librechat/agents` internals.** `Run.create`, `Run.processStream`, `Run.generateTitle`, `GraphEvents`, and `StepTypes` are all defined outside this checkout. The `node_modules/` tree is not installed and the source path named in `CLAUDE.md` (`/home/danny/agentus`) does not exist on this machine, so the shape of `RunConfig.graphConfig[].clientOptions` as the SDK consumes it was inferred from this repo's construction sites only.
3. **`titleMethod: 'structured'` semantics.** The config union exists (`packages/data-provider/src/config.ts:608-610`) and one provider-specific toggle keys off it (`client.js:3225-3231`), but the structured call itself happens inside `Run.generateTitle`. What "structured" means per provider is not observable from this repository.
4. **`@librechat/agents` default title and activity-label prompts.** For both `Run.generateTitle` and `Run.generateActivityLabel`, this repository supplies the model config and an optional prompt override (`titlePrompt`/`titlePromptTemplate` from `librechat.yaml`, schema at `packages/data-provider/src/config.ts:604-612`; `activityPrompt` for labels), but the default prompt text and the completion-versus-function-calling implementation live in the SDK and could not be inspected here. What `titleMethod: 'structured'` actually emits per provider is therefore unknown from this checkout.
5. **Native-addon deployment.** BAML's Node runtime is documented as a napi-rs native addon. Whether it resolves prebuilt bindings on this project's deploy base images (see `Dockerfile`, `Dockerfile.multi`, `helm/`) was not tested.
