# Fix plan: memory awareness before the first saved memory

Status: planning only. No runtime implementation is included in this branch.

## Problem and evidence

With memory enabled and no stored memories, a user asks the assistant to remember
something. Memory can be saved successfully, yet the chat model says it lacks
persistent memory. A later conversation can retrieve the saved information.

The source confirms a prompt-construction defect consistent with that report:

- `packages/data-schemas/src/methods/memory.ts:getFormattedMemories` returns
  `{ withKeys: '', withoutKeys: '', ... }` for an empty partition.
- `api/server/controllers/agents/client.js:buildMessages` defines a local
  `buildMemoryContext` formatter that returns no context for an empty string.
- `packages/api/src/agents/memory.ts:buildInlineMemoryContext` also returns an empty
  string when `memories.withKeys` is empty. This helper feeds the OpenAI-compatible
  Chat Completions and Responses controllers, including their discovered agents.
- `AgentClient.useMemory` can initialize `processMemory` even when the returned
  memory text is empty. Extraction runs separately from the chat response, so
  omitting the chat instructions does not disable persistence.
- Inline tool registration already adds an explicit-request usage guard. An empty
  store therefore does not remove all memory-related instructions from every
  model. It specifically removes the shared memory-awareness context.

The graph located symbols and dependencies at `59da55290497`. Relevant source was
also checked at fetched `origin/dev`, `f13b0eaef465c`; these memory files were
unchanged between those commits. Graph relationships do not establish the exact
response a provider model will generate. A live first-save conversation remains
necessary to verify that experience.

## Recommended change

Separate **memory availability** from **memory contents**, using one formatter in
`packages/api/src/agents/memory.ts` for both chat and API requests.

1. Replace the unconditional automatic-write wording in `memoryInstructions` with
   a short, neutral capability statement. Suggested wording:

   > LibreChat provides persistent memory across conversations within the current
   > memory scope. Saved memories, when available, are supplied below. An absence
   > of supplied memories does not mean persistent memory is disabled. Use only
   > available memory tools and do not claim that an update succeeded without
   > confirmation.

   This describes platform persistence without inventing access to full chat
   histories or promising that a read-only agent can save data. Keep the existing
   explicit-request tool guard and tool permissions unchanged. Do not advertise
   automatic extraction merely because memory configuration exists; extraction
   requires separate explicit enablement.

2. Introduce a small exported TypeScript formatter with these semantics:

   | Input                                           | Prompt output                                                     |
   | ----------------------------------------------- | ----------------------------------------------------------------- |
   | No eligible/loaded memory context (`undefined`) | No memory context                                                 |
   | Eligible context with empty text (`''`)         | Capability instructions only                                      |
   | Eligible context with saved text                | Capability instructions plus the existing memory heading and text |

   Do not add a dummy memory, an empty memory heading, or a claim that the database
   contains no records. Preserve the keyed versus unkeyed formatting of actual
   stored entries.

3. Have `buildInlineMemoryContext` call the formatter after its existing
   `memoryAvailable` and `agentHasInlineMemoryTools` checks and request-scoped
   load. Keep thrown-load-error behavior unchanged.

4. Replace the local formatter in `AgentClient.buildMessages` with the shared
   package export. Keep the current per-agent inclusion rules, partition lookup,
   and keyed/unkeyed selection. Add no new CJS behavior or database calls.

5. Leave the OpenAI-compatible controllers wired to `buildInlineMemoryContext`.
   They should inherit the fix without duplicate prompt logic. Verify both routes
   in their existing tests.

## Boundaries and failure behavior

- **Disabled is not empty.** Missing/disabled configuration, user opt-out, and
  denied read access must not gain memory context. Denied inline registration
  must not grant tools; an independently authorized read-only route can still
  receive neutral context. An explicit `memoryToolsRegistered: false` remains
  authoritative over a raw `memory` marker.
- **Reading is not writing.** Primary agents can receive memory values without
  inline tools or automatic extraction. Neutral instructions must not promise
  write access. Do not add an extra writer-mode API for this focused fix.
- **Empty is not confirmed absent.** The current database formatter catches read
  failures and returns the same empty shape as an empty store. This patch must
  not turn that fallback into “you have no memories.” Separately consider making
  load status explicit in the data-schemas contract; that is not required for this
  prompt fix and should not be silently bundled into it.
- **Capability is not success.** Automatic extraction runs independently. Do not
  add a blocking wait or promise successful storage from the capability prompt.
  Preserve actual tool results and memory artifacts as confirmation signals.
- **Scope stays intact.** Preserve user and agent partition isolation, runtime-ID
  normalization, parallel-agent routing, and request-cache invalidation after
  writes. Never expose keys to agents that currently receive only values.
- **No new latency or migration.** Reuse loaded data and the request cache. No new
  queries, configuration flags, API fields, migrations, or frontend changes.
- **Protection stays intact.** Continue inspecting actual memory content through
  existing model-bound protection paths; do not treat supplied memory values as
  trusted instructions or replace canonical data with prompt text.

## Regression coverage

Add tests against real formatter/context code, not copied controller expressions.
Use substitutes only at database/provider boundaries.

| Case                                                             | Required assertion                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Enabled, no records                                              | Nonempty capability context, with no fabricated memory or empty heading               |
| Existing records                                                 | Same stored content and keyed/unkeyed selection; updated capability prefix            |
| Disabled or opted out                                            | No newly injected memory context or tools                                             |
| Permission or registration denied                                | Existing denial behavior remains unchanged                                            |
| Read-only primary agent                                          | Persistence awareness without invented write tools or automatic-save promises         |
| Automatic extraction, empty store                                | Chat gets capability guidance and extraction remains independently scheduled          |
| Inline agent, empty store                                        | Capability guidance and existing explicit-request tool guard coexist                  |
| Parallel/discovered agents                                       | Existing eligibility rules and partition isolation hold for empty and populated pools |
| Rejected load                                                    | Existing error handling, no false empty-store or save-success assertion               |
| Formatter's swallowed read error                                 | Capability-only text makes no claim about whether records exist                       |
| Empty, save, fresh conversation, delete last, fresh conversation | Capability survives every state; saved values appear only in the correct scope        |
| Repeated agents in one partition                                 | No extra memory reads from formatting; cache invalidation remains effective           |

Primary test files:

- `packages/api/src/agents/memory.spec.ts`: formatter and inline-context cases.
- `api/server/controllers/agents/client.test.js`: real `buildMessages` and
  `useMemory` paths, including automatic extraction and parallel agents.
- `api/server/controllers/agents/__tests__/openai.spec.js` and
  `api/server/controllers/agents/__tests__/responses.unit.spec.js`: verify the
  computed context reaches each eligible runtime agent. Do not mock away the new
  formatter in the tests intended to prove the empty-state behavior.

Run the focused memory/context cases first, then affected memory tool and
processor cases in `packages/api/src/agents/__tests__/memory.test.ts`. These are
explicit regression targets, not a claimed complete dependency closure. Use the
codegraph test selector at implementation time if available; SQL dependencies
alone give only a lower bound.

Implementation checks:

- Focused Jest runs in each affected workspace, including the new regression.
- `npx tsc --noEmit` in `packages/api`.
- Build `@librechat/api` before testing CJS consumers of its new export.
- Import sorting and lint on touched source files only, then `npm run static-checks`.
- `npm run lighthouse`, because prompt construction is on the message-loading path.
- Manual fresh-user test with a real configured provider: request a first memory,
  observe actual persistence, open a fresh conversation, verify scoped recall,
  delete the final memory, and repeat. Check disabled and read-only configurations
  too. Assess response meaning, not exact provider wording.

## Acceptance

An enabled, eligible agent receives persistent-memory guidance before any record
exists, across normal chat and both compatible API routes. Saving and reading
continue to work without a placeholder record. Disabled, unauthorized, unrelated
agent scopes, and failed saves do not gain capabilities or misleading success
claims. The application guarantees the supplied context, not deterministic prose
from every model.

## Planning validation

Source inspection and documentation formatting checks are complete. The focused
baseline command was attempted from
`packages/api`:

```sh
npx --no-install jest --runTestsByPath src/agents/memory.spec.ts \
  --testNamePattern buildInlineMemoryContext --runInBand
```

Jest could not start because the available dependency installation is missing
`@jest/pattern`. No tests executed. The shared dependency installation was not
modified. No runtime reproduction, implementation, typecheck, Lighthouse result,
provider smoke test, CI pass, or review approval is claimed by this planning work.
