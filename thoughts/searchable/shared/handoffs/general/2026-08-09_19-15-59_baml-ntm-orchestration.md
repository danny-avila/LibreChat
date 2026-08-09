---
date: 2026-08-09T19:15:59-04:00
researcher: maceo
git_commit: a577fd2c5c266c4b0389158ca805e9de7145272c
branch: baml-setup
repository: silmari-chat
topic: "BAML Stage 1 turn generation — plan complete, ntm orchestration next"
tags: [implementation, strategy, baml, agents, run-orchestration, streaming, ntm]
status: complete
last_updated: 2026-08-09
last_updated_by: maceo
type: implementation_strategy
---

# Handoff: BAML Stage 1 — plan is done, you orchestrate the build

## Task(s)

| # | Task | Status |
|---|---|---|
| 1 | Resume the BAML LLM-interface handoff, verify its claims | **completed** |
| 2 | Establish where the real LLM calls live and what BAML would own | **completed** — see Learnings |
| 3 | Write the TDD plan | **completed** — revision 1 |
| 4 | Fix ALL issues from the plan review (10 critical findings) | **completed** — revision 2 |
| 5 | Add system/sequence/data-flow diagrams and per-seam interface grammar | **completed** |
| 6 | Spawn an ntm session (`--cc=3 --cod=2`) and orchestrate the build | **blocked — this is your task** |

**You are ORCHESTRATING an ntm session. Use `ntm --help` to learn the ntm commands.**

Task 6 is blocked on one thing, described under Action Items: **53 files are uncommitted
and none are in HEAD**, so a fresh worktree would contain none of the work.

## Critical References

1. `thoughts/searchable/shared/plans/2026-08-09_baml-turn-loop-tdd-plan.md` — **the plan**, revision 2, ~1170 lines. Read it fully before directing any agent. Contains 5 mermaid diagrams, 10 EBNF grammar blocks (seams S1–S7), six numbered contracts, and a review-disposition table.
2. `thoughts/searchable/shared/plans/2026-08-09_baml-turn-loop-tdd-plan-REVIEW.md` — the review that forced revision 2. Its acceptance checklist is the bar for the next review.
3. `scripts/baml-toolloop/README.md` — another agent's tool-typing spike. **Do not re-derive it.** The plan defers to it rather than restating it.

## Recent changes

- `thoughts/searchable/shared/plans/2026-08-09_baml-turn-loop-tdd-plan.md` — created, then rewritten as revision 2, then extended with diagrams and grammar.
- `scripts/baml-toolloop/README.md:17` — replaced a stale hard-coded "17 offline tests" with non-volatile wording (the suite reports 20).

No source files were modified. Temporary `.baml` probe files were created and removed; `baml generate` was re-run each time to restore generated output.

## Learnings

### The main chat model call is not in this repo

`packages/api/src/agents/run.ts:1655` hands off to `Run.create` in `@librechat/agents@3.4.0`.
That package builds the provider client and runs the loop. What remains in this repo are
side calls: activity labels, titles, memory extraction, two legacy assistants paths.

**Correction to the prior handoff:** it said that package's source was unavailable. It is
available now — `node_modules/@librechat/agents/src/` ships 512 `.ts` files (the earlier
research predated `npm install`). Its own repo is still absent (`/home/danny/agentus`).

### Verified BAML facts that took real work to establish

All probed against `baml wrapper 0.2.0` / `toolchain 0.15.0`. Several contradict the
earlier handoff, the spike PRD, or `docs.boundaryml.com`.

| Fact | Note |
|---|---|
| `require('./baml_ts/dist/index.js')` works from CommonJS | node 20.19.2 and 24.16.0, ~91ms init. The CJS/ESM fear in the prior handoff was unfounded |
| `require('@boundaryml/baml-bridge')` fails | `ERR_PACKAGE_PATH_NOT_EXPORTED`; reachable only by `await import(...)` |
| An **array of class instances** as a BAML parameter panics | `expected instance, got map`. A *single* instance is fine. Not a round-trip issue — fresh JS instances fail identically. Pass arrays as a JSON string |
| `$ctx` and `$types` are the **only** option keys | `define_function.js:138,144`; anything else throws at `:153` |
| **`$ctx` is never emitted into generated TypeScript** | runtime-only. Needs a typed wrapper, not `as any` |
| **Collectors are unreachable** | generated wrapper hardcodes `rt.callFunction(fqn, argsProto, null, null)`. `Collector` exists on the bridge but nothing passes one. Billing must use `StreamAccumulator` |
| `BamlStream` has **no iterator and no close** | complete surface is `next`/`nextAsync`/`final`/`finalAsync` (`dist/stream.d.ts:9-22`). No `Symbol.asyncIterator`, no cancellation hook. **`BamlCallContext.abort()` is the only cancellation lever** |
| `$types` binding works on `$parse`, **panics on the live call** | so the model's selection schema must be static |
| Unrecognized `$types` tokens degrade **silently** to the top type | a wrong binding looks like a working one |
| `@@dynamic` parses in v1 and does nothing | `$parse` drops extra fields identically to a rigid class; `render_output_format` is byte-identical |
| `docs.boundaryml.com` documents **v0** | its own banner says so. v0's `TypeBuilder`/`ClientRegistry`/`Collector` are real *in v0*, absent or inert here. `baml describe <symbol>` is the reference |

### Things the review caught that I had wrong

Worth internalising, because they are the shape of mistake this integration invites:

- I named `Collector` as the billing surface. The class exists; the *call path* never uses it.
  Declaration-level evidence is not call-path evidence.
- I required `on_run_step_completed` on the text path. That event belongs to tool completion
  (`stream.ts:895-915`); the text path does not emit it (`:1814-1881`).
- I assigned final/abort emission to the adapter. Terminal state is a three-primitive claim
  protocol on the job manager (`claimTerminalJob` → `publishTerminalClaim` →
  `finishTerminalJob`) whose later primitives **throw** if the claim was not issued by that
  manager. Encoded as grammar G7.
- `RunStep.index` is **rewritten by the aggregator** before storage (`stream.ts:2477-2481`),
  so emitted index ≠ stored index. Assert on the stored value.

### Four silent-drop hazards

Each is a way a wrong event transcript passes a naive test. All are in the plan as required
negative tests: unmatched delta ids (`stream.ts:2518,2549,2562`), missing `runStep`
(`:1841-1858`), mixed text/reasoning arrays matching neither branch (`:1942-1966`, **no warning
at all**), and `ModelEndHandler` without graph (`callbacks.js:82-85`, which also skips
`finalize` and swallows a pending refusal error).

## Artifacts

- `thoughts/searchable/shared/plans/2026-08-09_baml-turn-loop-tdd-plan.md` — the plan (revision 2)
- `thoughts/searchable/shared/plans/2026-08-09_baml-turn-loop-tdd-plan-REVIEW.md` — the review
- `thoughts/searchable/shared/research/2026-08-09-11-24-llm-interface-baml-integration.md` — the LLM-interface map; **§10 carries a falsification banner, read it before trusting any v0 claim**
- `thoughts/searchable/shared/handoffs/general/2026-08-09_12-45-10_baml-llm-interface-tdd-plan.md` — the prior handoff (its CJS/ESM and class-round-trip claims are superseded above)
- `baml_src/ns_toolloop/` + `scripts/baml-toolloop/` — the other agent's tool-typing spike, 35 offline assertions
- `baml_src/ns_spike/` + `scripts/baml-spike/` — the original install spike
- `specs/INDEX.md` + 13 `specs/*.domain.md` — DomainMap output; the plan's diagram and EBNF conventions are copied from these
- `/home/maceo/.claude/MEMORY/WORK/baml-spike/PRD.md` — spike PRD, 41/41. Its `Collector` entry is superseded

## Action Items & Next Steps

### 1. Commit first — this blocks everything

53 files are uncommitted and **zero** are in HEAD (`git ls-tree -r HEAD` confirms). A
`git worktree add` branches from `a577fd2c5` and copies neither modified nor untracked
files, so the spawned agents would land in a tree with no plan, no spike, no specs.

Uncommitted: `thoughts/` (188K), `specs/` (288K), `baml_src/ns_toolloop/`,
`scripts/baml-toolloop/` (4.5M), `baml_ts/baml_sdk/` regeneration, and modified
`.gitignore`, `AGENTS.md`, `CLAUDE.md`.

**Some of it is not this session's work** — `CLAUDE.md`, `AGENTS.md`, `.gitignore` and the
whole `ns_toolloop` spike came from a concurrent agent session. Confirm with the user
before committing them.

### 2. Then spawn

Dry run already validated:

```bash
bash ~/.claude/skills/ntm-worktree-spawn/scripts/ntm-worktree-spawn.sh \
  baml-turn-loop-YYYY-MM-DD-HH-MM --cc=3 --cod=2
```

The dry run reported `proc_count` at level `critical`. Spawns of ≥4 agents can be refused
under critical pressure and you are requesting 5. A `pressure_critical` refusal is the gate
working — wait, or drop to `--cc=2 --cod=1`. Do not raise the caps.

### 3. Direct the build in plan order

Phase 0 first, and treat it as a real gate rather than setup:

1. Pin the toolchain **and** `@boundaryml/baml-bridge` to exact versions.
2. Build the workspaces — `npm run build:data-provider && npm run build:data-schemas && npm run build:api`. Nothing is built today; `packages/api/dist` and `packages/data-provider/dist` do not exist.
3. Prove the export boundary loads from the CommonJS API package **inside the built Linux image**. `Dockerfile.multi:109-116` copies only `packages/*/dist` and never `baml_ts`, so the production image does not currently contain the generated SDK.
4. **Measure whether `BamlCallContext.abort()` actually terminates an in-flight `nextAsync()`.** It is the only cancellation lever. If it does not work, Stage 1 has no cancellation and the plan stops there. Assign this early — it can kill the approach.

Phases 1–2 are parallelisable across agents (envelope contract vs. wire shape / partial
semantics). Phase 3 is blocked until contracts 1–6 are implemented. Phase 4 is blocked
until Phase 3 passes.

### 4. Re-review before enabling anything

The review's acceptance checklist is the bar. Do not enable the flag on the strength of
"tests pass" — the equivalence comparison covers event transcripts, persisted content,
terminal state, usage records, and spend outcomes, not final text.

## Other Notes

- **Node.** `.nvmrc` says 24.16.0, `packageManager` says npm@11.13.0, ambient shell node is v20.19.2. `nvm use 24.16.0` before any npm work.
- **BAML on PATH.** `~/.baml/bin` is not on the default PATH; `export PATH="$HOME/.baml/bin:$PATH"`.
- **A `baml test` form that costs money.** `test Name { functions: [...], args: {...} }` issues a real request. `test "name" { assert… }` does not. The toolloop suite excludes exactly one by selector: `baml test -x "SelectDynTool::TypeBuilderBlock"`. **If CI ever runs `baml test` without that exclusion, it bills.**
- **Beads.** `.beads` now exists (`bd where` → prefix `silmari-chat`, embedded dolt), created after this session started. `bd list --status=in_progress` returns `AF-*` issues belonging to a different project's dataset. **No issue was created for this work** — create one if you want tracking, and confirm the prefix resolves correctly first.
- **Agent Mail.** No identity was registered this session. Ten in-process subagents were spawned via the Agent tool; all completed. Three (`grammar-events`, `grammar-stream`, `grammar-baml`) wrote 43–50 KB extraction files to the session scratchpad; **those files are ephemeral and their corrections are already folded into the plan**, so nothing is lost when they vanish. The other seven delivered nothing usable — every fact in the plan was verified first-hand regardless.
- **A concurrent agent session is active** on this repo, working the "agents portion" (`baml_src/ns_toolloop/`). Two peer sessions were visible via `ntm`/ListAgents as `native-adapter-extraction-2f` and `native-adapter-extraction-bf`. Coordinate before editing `baml_src/`, `scripts/baml-toolloop/`, `CLAUDE.md`, or `AGENTS.md`.
- **Where things live.** Provider config `packages/api/src/endpoints/`; agent run `packages/api/src/agents/run.ts`; streaming `packages/api/src/stream/`; SSE handlers `api/server/controllers/agents/callbacks.js`; the legacy JS server `api/server/`. Per CLAUDE.md all new backend code is TypeScript in `packages/api`, and `/api` changes stay minimal.
- **Three SSE producers, not one** — `writeEvent` (parameterized name, injects protocol version on final frames), `sendEvent` (hardcodes `event: message`, drops empty-string data), `handleError` (hardcodes `event: error`, serializes a bare JSON string). Equivalence tests must compare frames from the same producer on both runners.
