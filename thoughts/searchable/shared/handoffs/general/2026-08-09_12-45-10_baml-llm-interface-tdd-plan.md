---
date: 2026-08-09T12:45:10-04:00
researcher: maceo
git_commit: a577fd2c5c266c4b0389158ca805e9de7145272c
branch: baml-setup
repository: silmari-chat
topic: "BAML as the LLM Interface Layer — Implementation Strategy"
tags: [implementation, strategy, baml, llm-interface, structured-output, agents, endpoints]
status: complete
last_updated: 2026-08-09
last_updated_by: maceo
type: implementation_strategy
---

# Handoff: BAML as the LLM interface layer

## Task(s)

| # | Task | Status |
|---|---|---|
| 1 | DomainMap analysis of the repo — 13 domain specs + INDEX | **completed** |
| 2 | Research the LLM interface for a BAML integration | **completed** (revised twice) |
| 3 | Install BAML, set it up in-repo, spike the research for false assumptions | **completed** — 41/41 ISC, PRD `phase: complete` |
| 4 | Commit generated SDK, gitignore build output | **completed** — commit `a577fd2c5` on branch `baml-setup` |
| 5 | **Create a TDD plan to implement BAML as the LLM interface layer** | **planned — this is your task** |

**Read this before scoping task 5.** The user named `MEMORY/WORK/baml-spike/PRD.md` as the basis. That PRD is a **spike** PRD — every one of its 41 criteria is about proving the toolchain installs and behaves, not about integrating BAML into LibreChat. It is the right source for *constraints* and *what is already proven*, and the wrong source for *scope*. Derive scope from the research document's §2/§3 (the integration seam) and §8 (the discrete call sites), listed under Critical References.

## Critical References

1. `thoughts/searchable/shared/research/2026-08-09-11-24-llm-interface-baml-integration.md` — the LLM-interface map. §2 is the provider seam, §3 the chat-turn call spine, §7 existing structured-output patterns, §8 the non-chat call sites, and §10 carries a **falsification banner** (11 of 18 claims wrong — it documented BAML v0, v1 is what installs). It also contains a **Workflow Closure Map with a machine-readable `ClosureMap` JSON and a staged closure adapter** for the title-generation behavior — directly consumable by `create_tdd_plan`.
2. `/home/maceo/.claude/MEMORY/WORK/baml-spike/PRD.md` — the spike PRD (note: the user's message said `EMORY/...`; the real path is under `~/.claude/`). Its Decisions section is the authoritative list of toolchain gotchas.
3. `.claude/skills/baml-core/SKILL.md` — the installed BAML v1 reference. **The website is wrong for v1; `baml describe <symbol>` is the documentation.** Also available as the `baml-core` skill.

## Recent changes

Commit `a577fd2c5` on branch `baml-setup`, 44 files:

- `baml.toml` — `[generator.node_client]`, `output_type = "typescript/node"`, `output_dir = "./baml_ts"`
- `baml_src/main.baml:1` — `function main() -> string { "hello from baml" }`
- `baml_src/ns_spike/claims.baml` — 18 research claims as typed data; `report()`, `claim_total()`, `falsified_total()`
- `baml_src/ns_spike/runtime_client.baml` — per-request `base_url`/`api_key`/`model` proof; `build_call()`, `describe_calls()`
- `baml_ts/baml_sdk/**` — 38 generated files, committed
- `baml_ts/package.json:1` — `{"type":"module"}` (required; see Learnings)
- `baml_ts/tsconfig.json` — nodenext, `rootDir: ./baml_sdk`, `outDir: ./dist`
- `scripts/baml-spike/probe.sh` — reproduces every recorded observation
- `scripts/baml-spike/bridge-smoke.mjs` — BAML → tsc → Node → native addon proof
- `.gitignore:190` — `baml_ts/dist/`
- `package.json` — `+ "@boundaryml/baml-bridge": "^0.15.0"` (root dependency)

Uncommitted and intentionally so: `specs/`, `thoughts/`, `.agents/`.

## Learnings

### The integration seam is one object

`InitializeResultBase.llmConfig` (`packages/api/src/types/endpoints.ts:58-65`). Flow: `getProviderConfig` (`packages/api/src/endpoints/config/providers.ts:137`) → a provider initializer → `llmConfig` → written onto the agent at `packages/api/src/agents/initialize.ts:1365` → read back at `packages/api/src/agents/run.ts:1228` → `clientOptions` at `run.ts:1379` → `Run.create` at `run.ts:1655`. Everything past `Run.create` is the external `@librechat/agents` package (source not in this checkout).

### BAML v1 constraints that will shape the plan

- **No `ClientRegistry`, no `TypeBuilder`, no `Collector`** — all three return `No symbol found`. Runtime provider control is instead `baml.llm.PrimitiveClientOptions` (`model`, `base_url`, `api_key`, `headers`, `provider_options`) as ordinary class fields.
- **Class instances are one-way across the bridge.** Returning `Claim[]` to JS gives plain objects; passing them back into a `Claim[]` parameter panics `VM internal error: type error: expected instance, got map`. **Host callers must use nullary or primitive-argument entry points.** This is the single biggest API-shape constraint.
- **`baml generate` emits TypeScript source.** Node fails `ERR_MODULE_NOT_FOUND` until `tsc` runs, and the consuming directory needs `"type": "module"` because the bridge is ESM-only (`exports` has `import`, no `require`) — otherwise `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **Codegen needs no `node_modules`;** only execution needs the bridge.
- Only **four asserts** exist: `assert.equal`, `is_true`, `not_null`, `contains`. Last assert takes no trailing `;`.
- **Calling an LLM function inside a `test` makes a real request.** Test pure code; use `f$build_request` / `baml.llm.build_request` to assert wire shape offline.
- Syntax traps found the hard way: `//#` comments are a parse error inside a class body; `String` has `includes` not `contains`; `?.` does **not** carry through into a following method call (`xs.at(0)?.headers.get(k)` is a compile error); `int / int` truncates.

### Existing patterns BAML would replace

Research §7. Structured output is achieved three ways today: zod/JSON-Schema tool definitions (frequently **duplicated** — `packages/api/src/agents/hitl/askUserQuestionTool.ts:53-98` zod plus `:102-184` a hand-written JSON-Schema twin, same for memory at `packages/api/src/agents/memory.ts:260,332` vs `:360-401`); one provider-native JSON toggle (`api/server/controllers/agents/client.js:3225-3231`, Google only); and free text plus a hand-rolled parser. The 2026-06-07 PRD recorded the original motivation as *"reduce zod errors, reduce parse errors"* — that duplication is the target.

### Best first integration targets, ranked

1. **Activity labels** — `packages/api/src/agents/activityLabels/runtime.ts:371` (`ACTIVITY_INSTRUCTION`), `:384` (`buildPrompt`), `:228` (`normalizeLabelOutput`). It already has a **fixed-corpus eval harness at `scripts/activity-labels/`** whose README records that two intuitive hypotheses failed under measurement. That harness is a ready-made TDD oracle: port to BAML, run it, compare. Lowest risk, directly measurable.
2. **Conversation title** — `api/server/services/Endpoints/agents/title.js:35` → `api/server/controllers/agents/client.js:3089` → `:3250` `run.generateTitle` → `:3311` `sanitizeTitle`. The research already contains a verified closure map + `ClosureMap` JSON + staged adapter for this chain.
3. **Memory extraction** — `packages/api/src/agents/memory.ts:928`. Higher complexity: the model's output *is* tool calls that write to the DB during the run.

## Artifacts

- `thoughts/searchable/shared/research/2026-08-09-11-24-llm-interface-baml-integration.md` — the map (read §2, §3, §7, §8, §10 banner, Workflow Closure Map)
- `thoughts/searchable/shared/research/2026-08-09-11-24-llm-interface-baml-integration.closure-adapter.py` — staged, not wired in
- `/home/maceo/.claude/MEMORY/WORK/baml-spike/PRD.md` — spike PRD, 41/41, `phase: complete`
- `specs/INDEX.md` + 13 `specs/*.domain.md` — DomainMap. Most relevant: `specs/agent.domain.md`, `specs/run-orchestration.domain.md`, `specs/billing.domain.md`
- `baml_src/ns_spike/claims.baml`, `baml_src/ns_spike/runtime_client.baml`
- `scripts/baml-spike/probe.sh`, `scripts/baml-spike/bridge-smoke.mjs`
- `.claude/skills/baml-core/SKILL.md`

## Action Items & Next Steps

1. **Read the research §10 banner first.** If you carry forward any v0 assumption (`ClientRegistry`, `import { b } from './baml_client'`, `#"…"#` prompts), the plan is wrong before it starts.
2. **Pick one call site.** Recommend activity labels — the existing eval corpus gives the plan a red/green oracle that does not require an API key on every run.
3. **Decide the test strategy for model calls.** CLAUDE.md mandates real logic over mocks, but a BAML `test` that calls an LLM issues a real request. Proposed split: assert wire shape offline via `build_request`, and gate live-model tests behind a key-present check. **This decision belongs in the plan, made explicitly.**
4. **Resolve the three open unknowns** below before committing to a phase that depends on them.
5. Re-run `baml test` and `node scripts/baml-spike/bridge-smoke.mjs` as the regression baseline; both are green at `a577fd2c5` (8/8 and 6/6).

### Open unknowns that block a full integration

- **Usage and cost reporting.** `Collector` does not exist in v1 and no replacement was found. LibreChat has five `spendTokens` call sites (research §9 and `specs/billing.domain.md`); if a BAML-issued call cannot report tokens, billing breaks. **Probe `baml describe` for a usage/telemetry surface before planning any billing-touching phase.**
- **Streaming vs the SSE contract.** The generated SDK emits `*$stream` partial classes, but nothing was probed against LibreChat's SSE envelope (`api/server/routes/agents/index.js:223-239`, `packages/api/src/types/events.ts:41-62`). Claim C12 (tool calling as structured extraction) is still `Unverified`.
- **Live provider reachability.** The runtime-client spike proves the values are *expressible* and reach a wire-format request; it never sent one. No `.env` and no `*_API_KEY` on this machine.

## Other Notes

- **Beads: unavailable.** `bd list --status=in_progress` → `Error: no beads database found`. No issue IDs to reference; run `bd init` if you want tracking.
- **Agent mail: not used.** No agent identity was registered this session. Seven in-process subagents were used for the research phase via the Agent tool and have all completed; none are outstanding.
- **NTM: not in an ntm session** (`TMUX` unset). `ntm` is installed at `~/.bun/bin/ntm` if you want one.
- **Toolchain is on the `canary` channel**, updated 0.13.0 → 0.15.0 this session. `baml.toml` does not pin a version. The skill notes the toolchain version must match the installed TS package — both are 0.15.0 now, but canary drifts. **Pinning is worth an early phase.**
- **Node.** `.nvmrc` says 24.16.0 and `packageManager` says npm@11.13.0; the ambient shell node is v20.19.2. Use `nvm use 24.16.0` before any npm work or you will write a lockfile nobody can reproduce.
- **`_inlinedbaml.ts` is 2.5 MB** and regenerates on every `baml generate`, so every `.baml` edit produces a large diff in that one committed file. If that churn becomes a problem, the alternative is gitignoring `baml_ts/baml_sdk/` and generating in CI — the user chose committing it.
- **Where things live:** provider config `packages/api/src/endpoints/`, agent run `packages/api/src/agents/run.ts`, streaming `packages/api/src/stream/`, the legacy JS server `api/server/`. Per CLAUDE.md all new backend code is TypeScript in `packages/api`, and `/api` changes should stay minimal.
