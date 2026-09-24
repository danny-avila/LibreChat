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

- A declaring run step owns call identity. Optional provider IDs are aliases, not a prerequisite. Declaration slots keep id-less calls distinct and make snapshot replay idempotent. Provider IDs can repeat in later steps and are not completion-wide identities.
- Outward indexes are allocated once per call across the response. Raw ID substrings are assembled by provider index; shared prefixes such as `call_` are never cross-call aliases. Calls without IDs receive `call_<index>`; collisions receive a suffix. Internal tool execution IDs are not rewritten.
- Argument fragments use provider indexes scoped to a model invocation. A graph delta may name the latest step while referring to an earlier parallel call. When available, the SDK's `getStepBaseKey` supplies invocation scope, including stream segments. A step's scope is retained so late fragments cannot acquire a newer segment's identity.
- Callers without the graph object use metadata scope; callers without that metadata are isolated by step. This fallback cannot reconstruct a missing retry/segment identity.
- Explicit and identified provider indexes take precedence over positional fallback. Positions are used only for multi-call declarations. An unbound singleton may adopt its first provider index; it does not absorb arbitrary later indexes.

## Argument representations

A run-step declaration can contain a **snapshot**: native `args` or OpenAI-shaped `function.arguments`. A run-step delta carries an **append-only fragment**. They must never be concatenated as though they were the same representation.

Both snapshot argument fields accept JSON **strings or objects**, using the shared `Agents.ToolCall` and `Agents.AgentFunctionToolCall` field types. Strings are retained verbatim; objects are serialized once. Nonempty argument fragments take precedence over all snapshots for that call, regardless of arrival order.

### Publication timing

Tool-call IDs and names can also arrive as substrings. There is no per-field completion seal in these events, and the OpenAI-compatible consumer freezes the name on its first chunk. Emitting `get_` and later correcting it to `get_weather` does not work.

Consequently, **tool-call chunks are published only at successful response completion**, after assembling identity and validating arguments. The first chunk contains the complete ID/name; the next carries the complete arguments at the same index. Text and reasoning continue streaming while the run executes. This deliberately sacrifices incremental tool-input display, rather than guessing which names are complete or breaking existing clients. Native JSON responses receive the same completed calls.

Name/ID/argument fragments are append-only and take precedence over the corresponding declaration snapshot. Snapshot replay is idempotent; raw fragments are not deduplicated because identical adjacent fragments can be legitimate and the events carry no sequence token. Split IDs require a provider index for unambiguous correlation. Exactly-once raw dispatch remains an upstream requirement.

## Terminal behavior

`completeOpenAIToolCalls` wraps execution and owns the success/failure boundary. The controller schedules completed-run usage recording before final validation.

| State/event                              | Behavior                                                         |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Open + declaration                       | Allocate identity once; retain snapshot separately               |
| Open + identified fragment               | Bind provider index and append/buffer fragment                   |
| Successful execution                     | Assemble and validate all calls before publishing tool chunks    |
| Failure, abort or invalid terminal input | Discard pending calls; publish no tool-call chunks               |
| Finished                                 | Repeated finish is harmless; later tool events are ignored       |
| Aborted                                  | Later tool events are ignored; finish cannot reopen the response |

Missing names, missing arguments, malformed JSON or unattributable argument data fail terminal projection with bounded errors that omit provider content. A snapshot never repairs a truncated raw stream. Projection bookkeeping is response-local and released on finish/abort; only successfully validated calls are materialized for the response builder. Publication seals before calling the transport, so a transport error or reentrant finish cannot duplicate calls. Already transmitted frames cannot be retracted.

The existing finish-reason policy is preserved: a response with final text after server-executed tools remains `stop`. Historical tool calls are still exposed by this API. This patch does not make it safe to interpret every advertised call as a new instruction for the caller to execute.

## Verification and limits

- `toolCalls.contract.spec.ts`: shared field types, strings/objects, partial names and IDs, optional IDs, declaration order and transport reentrancy.
- `toolCalls.spec.ts`: identity, representations, ordering, replay, malformed input, failure and abort.
- `toolCalls.graph.spec.ts`: real SDK interleaving, complete-only chunks and stream segments.
- `service.spec.ts` and the Express controller spec: both response modes, actual serializers, fallback flush and failure/usage ordering.

These tests do not run a live provider, real tool side effects, a distributed multi-agent deployment or a persisted resume. There is no new database, cache, authorization policy or migration. Code and built packages must deploy together. No cross-version event identity is invented when the upstream source omits it.
