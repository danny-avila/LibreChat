# SDK entry points, native outcomes, and usage handoff

Reviewed LibreChat `ba006f3877cd62225a0111bc7a8cb4fdd71e669e` and sibling SDK `554e38f21e483e014c78a022fa7c9c13728dcfac` against SDK `origin/main` `afc97c8c502637f8645b4d35a58dbc312666fcf5`. Runtime comparisons use LibreChat's installed, patched `@librechat/agents@3.8.7` and the sibling SDK's built CJS/ESM outputs. Both use `@langchain/core@1.2.8` and `@langchain/google-genai@2.2.0`. No production code, dependency files, or release state changed.

## SDK1 · P1 · The consumed package's default typed event API bypasses admission

This extends initial finding 01; it is not an additional independent defect count. There are **two distinct public `streamEvents` APIs** in the installed LangChain version:

| API | Consumed CJS and ESM | Reviewed SDK CJS and ESM |
| --- | --- | --- |
| `invoke(messages)` | Host admission runs | Host admission runs |
| `stream(messages)` | Host admission runs | Host admission runs |
| `streamEvents(messages, { version: 'v2' })` | Host admission runs | Host admission runs |
| `streamEvents(messages)` | **Provider HTTP runs without host admission** | Host admission runs |

The diagnostic gives the port a `start` method that always rejects. Each consumed default typed call nevertheless completes a provider request and returns visible content with `start = 0`. All other combinations reject before HTTP. Both packages report `nativeMediaProtocolVersion = 1`, so the startup marker does not establish equivalent behavior.

The new default is a `ChatModelStream`: its `then()` calls `_assembleMessage()`. Awaiting it **does consume it**. The original default-API probe was therefore valid; the temporary interpretation that it merely created an unconsumed iterator was incorrect. Adding `{ version: 'v2' }` changed the entry point. This pass both iterates the typed stream and awaits its assembled result, eliminating that ambiguity.

Evidence: installed [entry-point dispatch](../../../../node_modules/@langchain/core/dist/language_models/chat_models.cjs#L119), [thenable assembly](../../../../node_modules/@langchain/core/dist/language_models/stream.cjs#L438), SDK [native event override](../../../../../agents-media-studio-sdk/src/llm/google/index.ts#L345), and the consumed [patch](../../../../patches/@librechat+agents+3.8.7.patch#L94), which adds `_streamResponseChunks` handling but lacks that event override. The existing LibreChat graph uses the legacy event API; this experiment establishes the exported package-contract bypass, not a demonstrated default-typed HTTP route in LibreChat.

Ship one reviewed SDK artifact and assert all four public modes at the consumed-package boundary. Include both module formats while the hand-maintained patch exists. Keep the protocol marker, but pair it with behavioral release checks. Header/modality serialization and signed-empty-text parity remain the other observed portions of finding 01.

## SDK2 · P2 · Provider-blocked native generations are persisted as successful

A Google response containing `promptFeedback.blockReason = 'SAFETY'` and no candidates is durably stored as a **succeeded native job with zero outputs**. This reproduces through the actual LibreChat native factory and real MongoDB for both the consumed package and SDK head, using `invoke`, `stream`, and legacy `streamEvents`.

In `invoke`, the SDK [calls `native.complete()`](../../../../../agents-media-studio-sdk/src/llm/google/index.ts#L329) before indexing `generations[0].text`; the latter throws a `TypeError` for this valid blocked-response shape. [NativeMediaSession.fail](../../../../../agents-media-studio-sdk/src/llm/google/native.ts#L79) then declines to report failure because completion already marked the session finished. Streaming [skips the candidate-less response](../../../../../agents-media-studio-sdk/src/llm/google/index.ts#L446) and reaches normal completion. Consequently, invoke reports a chat error while native history says succeeded; stream and legacy events emit an empty successful completion. The provider's block reason is not represented by the native lifecycle.

The host [completion callback](../../../../packages/api/src/media/native.ts#L262) and [database completion method](../../../../packages/data-schemas/src/methods/mediaNative.ts#L323) convert the callback into persisted success. In every matching positive control, a valid text caption becomes succeeded with one output and a normal LLM completion. Empty output alone is not the proposed failure rule: a valid text-only result must remain valid.

Classify provider refusal/empty-invalid output before completing the recording; preserve an actionable provider outcome in the native failure contract. Complete only after validating the result that callers will receive. Cover prompt-level blocks, candidate-level finish reasons, successful text-only output, and successful mixed output, including the job projection visible after reloading Studio.

## SDK3 · P2 · A storage error discards provider usage already received

When Google returns an image and reports **11 input tokens and 1,290 output tokens**, an injected failure of the host's `part` persistence causes both reviewed packages to expose only `storage unavailable`. All six tested combinations (`invoke`, `stream`, legacy events × two packages) produce zero `handleLLMEnd` callbacks and zero usage-bearing token callbacks. `native.fail` receives only `{ modelRunId, reason: 'storage' }`, so it cannot carry that already-known usage either.

The non-streaming wrapper computes usage before [persisting content](../../../../../agents-media-studio-sdk/src/llm/google/index.ts#L311), then throws before returning it. Streaming accumulates `lastUsageMetadata`, but [emits usage only after all parts finish](../../../../../agents-media-studio-sdk/src/llm/google/index.ts#L428); a persistence error prevents that terminal emission. This is a post-provider storage failure introduced by the native port, with known provider consumption available before failure.

The SDK's ordinary [ModelEndHandler](../../../../../agents-media-studio-sdk/src/events.ts#L67) collects usage from completed model output. LibreChat's native port explicitly leaves debit ownership with chat, and its failure callback records only the reason. [AgentClient.recordTokenUsage](../../../../api/server/controllers/agents/client.js#L6203) routes missing recorded usage to [recordFallbackTokenUsage](../../../../packages/api/src/agents/usage.ts#L737), which takes caller-provided text estimates. Those estimates are not a substitute for the image generation's known provider usage.

Preserve usage independently of output-storage success and route it exactly once through existing chat accounting and telemetry. A typed partial-failure result or usage observer must distinguish provider consumption from successful persistence without marking the generation successful or emitting unstored image bytes. Validate success, storage failure, cancellation after provider response, and retry without double charging.

The executable assertion stops at the SDK callback/port boundary. This pass did **not** run the full AgentClient billing route or measure a resulting Balance/Transaction discrepancy; the caller fallback path above is source-traced. It establishes loss of known usage, not an exact unbilled dollar amount.

## Reproduction and coverage

```powershell
node docs/research/media-studio/audit/probes/sdk-contracts.cjs
```

[sdk-contracts.cjs](probes/sdk-contracts.cjs) passed in 5.34 seconds, with 34 observations: 16 admission comparisons, 12 blocked/success persistence comparisons, and six storage-failure usage observations. Exit 0 asserts the **current defects and controls**, not corrected behavior. It intercepts Google HTTP with synthetic responses and keys, creates and tears down a standalone MongoDB, and invokes current SDK wrappers, the actual native host factory, and real persistence methods. For the storage-usage case the injected host port throws at its documented persistence boundary. No live provider inference or cloud storage is used.

The port lifecycle, request-local selection, replay serialization, callback flow, shared stream aggregation, CJS/ESM entry points, declarations/exports, patch provenance, and relevant tests were inspected. Existing SDK HTTP tests already cover concurrent modality/system-instruction isolation, storage cancellation, signed replay, and stream smoothing at SDK head. This pass confirms no additional independent concurrency or replay-order defect. Existing findings 01 and 23 cover source/artifact and CI-cache drift; they are not counted again here. No full SDK-suite rerun, live tracing project, pristine npm installation, or published-package build was performed in this pass. Runtime source did not change, so the previous same-head typechecks and focused tests remain the baseline verification rather than fresh claims from this diagnostic.
