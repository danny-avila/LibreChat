# Agents API response projection

This module projects an **agent run**, which can include several model invocations and server-executed tools, onto an OpenAI-compatible response. It is not a transparent proxy for a single model completion. Changing tool execution ownership or terminal-turn selection is a separate protocol decision.

## Owners and boundaries

```text
provider adapter -> agents graph -> run-step declarations / argument deltas
                                     |
                              tool-call projection
                              /                  \
                         SSE chunks          JSON accumulator
                              \                  /
                         successful response completion
```

The Express controller and packaged `createAgentChatCompletion` service both use the same tool-call projection in streaming and non-streaming mode. The service's content handlers also share text, reasoning and usage handling between modes. The controller retains its existing run lifecycle, usage recording, artifact writes and authorization boundaries.

## Identity

- A declaring run step owns provider tool-call IDs. Provider IDs may repeat in later steps, so they are not completion-wide identities.
- Outward indexes are allocated once per call across the response. Colliding outward IDs get a suffix; internal tool execution IDs are not rewritten.
- Argument fragments use provider indexes scoped to a model invocation. A graph delta may name the latest step while referring to an earlier parallel call. When available, the SDK's `getStepBaseKey` supplies invocation scope, including stream segments. A step's scope is retained so late fragments cannot acquire a newer segment's identity.
- Callers without the graph object use metadata scope; callers without that metadata are isolated by step. This fallback cannot reconstruct a missing retry/segment identity.
- Explicit and identified provider indexes take precedence over positional fallback. Positions are used only for multi-call declarations. An unbound singleton may adopt its first provider index; it does not absorb arbitrary later indexes.

## Argument representations

A run-step declaration can contain a **snapshot**: native `args` or OpenAI-shaped `function.arguments`. A run-step delta carries an **append-only fragment**. They must never be concatenated as though they were the same representation.

Snapshots are captured separately. Any nonempty argument fragments take precedence over all snapshots for that call, regardless of arrival order. Identified fragments may wait for a name so the first outward chunk can declare both ID and name. Complete-only snapshots are flushed at successful response completion, not when first seen: eager emission could complete a client-side call before later fragments reveal that the snapshot was partial.

Declaration replay is idempotent. Argument fragments are not deduplicated: identical bytes can be legitimate adjacent fragments, and these events have no sequence token. Exactly-once delta dispatch remains an upstream requirement.

## Terminal behavior

`completeOpenAIToolCalls` wraps execution and owns the success/failure boundary. The controller schedules completed-run usage recording before final validation.

| State/event                              | Behavior                                                             |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Open + declaration                       | Allocate identity once; retain snapshot separately                   |
| Open + identified fragment               | Bind provider index and append/buffer fragment                       |
| Successful execution                     | Validate all terminal arguments, then flush complete-only snapshots  |
| Failure, abort or invalid terminal input | Discard pending snapshots; do not synthesize a successful completion |
| Finished                                 | Repeated finish is harmless; later tool events are ignored           |
| Aborted                                  | Later tool events are ignored; finish cannot reopen the response     |

Missing names, missing arguments, malformed JSON or unattributable argument data fail terminal projection with bounded errors that omit provider content. A snapshot never repairs a truncated raw stream. Projection bookkeeping is response-local and released on finish/abort; final accumulated calls remain available to the response builder.

The existing finish-reason policy is preserved: a response with final text after server-executed tools remains `stop`. Historical tool calls are still exposed by this API. This patch does not make it safe to interpret every advertised call as a new instruction for the caller to execute.

## Verification and limits

- `toolCalls.spec.ts`: identity, representations, ordering, replay, malformed input, failure and abort.
- `toolCalls.graph.spec.ts`: real SDK interleaving, complete-only chunks and stream segments.
- `service.spec.ts` and the Express controller spec: both response modes, actual serializers, fallback flush and failure/usage ordering.

These tests do not run a live provider, real tool side effects, a distributed multi-agent deployment or a persisted resume. There is no new database, cache, authorization policy or migration. Code and built packages must deploy together. No cross-version event identity is invented when the upstream source omits it.
