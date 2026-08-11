# Spike: tool-result feedback + runtime tool types in BAML v1

Pinned against **toolchain 0.15.0**. Everything runs **offline** — no API key, no
network; turn 1 is a canned model output fed through `$parse`.

Answers two questions the docs leave open:

1. Can a tool **result** be fed back into the next turn? (the tool-calling docs
   show selection but never the loop back)
2. Can a TypeScript host build the tool **type** at runtime? (the dynamic-types
   docs describe the **v0** API, which does not exist in v1)

## Run

```bash
baml check
baml test -x "SelectDynTool::TypeBuilderBlock"     # all offline tests
baml generate && npx tsc -p baml_ts/tsconfig.json
node scripts/baml-toolloop/provider-pattern.mjs    # 11  THE PATTERN — start here
node scripts/baml-toolloop/bridge-loop.mjs         #  8  tool-result feedback
node scripts/baml-toolloop/runtime-union-probe.mjs #  8  runtime types
node scripts/baml-toolloop/dynamic-probe.mjs       #  8  v0-vs-v1 spellings
```

## The pattern (`provider.baml` + `provider-pattern.mjs`)

The working shape given every constraint below. **11/11 offline.**

| Stage | Mechanism | Why |
|---|---|---|
| **Selection** | union declared **statically** in `.baml`, inlined in the signature | static return type ⇒ `${ctx.output_format}` renders, no type-var panic |
| **Narrowing** | `$types: { T: { list: { union: subset } } }` on **`$parse` only** | the runtime-varying half that works today |
| **Dispatch** | read the literal `tool` field **host-side** | union-typed BAML params cannot discriminate a host map |
| **Feedback** | `build_transcript(names[], args[], results[])` — primitives | arrays of instances lower to maps and panic |

Each tool carries a literal discriminator, because the rendered schema is a
structural `{...} or {...}` with **no type names** in it:

```
Answer with a JSON Array using this schema:
[
  { /// the city to look up
    tool: "get_weather", city: string,
  } or { /// the search query
    tool: "web_search", query: string,
  } or { ... }
]
```

Without `tool: "get_weather"` the host cannot tell which tool was picked — and
two tools with the same field shape would be indistinguishable.

`SelectDynTool::TypeBuilderBlock` is excluded because a `test X { functions [...] args {...} }`
block **makes a real LLM request**. It exists to prove `type_builder { dynamic class … }`
compiles; run it only with `OPENAI_API_KEY` set.

## Layout

| Path | What it holds |
|---|---|
| `baml_src/ns_toolloop/tools.baml` | tool classes, the `ToolCall` union, the `ToolInvocation` wrapper |
| `baml_src/ns_toolloop/loop.baml` | `render_transcript`, `SelectTool`, `Answer`, `loop_offline`, `render_transcript_flat` |
| `baml_src/ns_toolloop/generic.baml` | `SelectToolGeneric<T>` — the runtime-type seam |
| `baml_src/ns_toolloop/dynamic.baml` | the v1 `type_builder { dynamic class … }` block |
| `baml_src/ns_toolloop/probes.baml` | bare-union / single-class controls, canned fixtures |
| `scripts/baml-toolloop/*.mjs` | the TypeScript-host halves |

`Answer`'s prompt interpolates `render_transcript(turns)` — the same function the
tests assert — so the tested text and the shipped prompt cannot drift apart.

---

## Finding 1 — tool results DO feed back, if the boundary is primitives

| # | Question | Verdict |
|---|---|---|
| T6 | Does a tool result reach the next turn's prompt? | ✅ |
| B1 | …driven from a TypeScript host, loop kept inside BAML? | ✅ |
| B4 | …with the **host** executing the tool? | ✅ via primitive arrays |

Prior claim **C18** ("class instances are one-way across the bridge") is too
coarse. Actually:

| Shape | Crosses into a BAML param? |
|---|---|
| A single JS-built instance (`WeatherAPI`) | ✅ works |
| An **array** of instances (`ToolTurn[]`) | ❌ `VM internal error: expected instance, got map` |
| An instance with **nested** class fields, round-tripped out and back | ❌ nested field arrives as a map, so `if let w: WeatherAPI` never narrows |
| Reading fields off a returned instance | ✅ works |

A transcript is inherently an array, so `render_transcript_flat(names, args, results)`
takes parallel `string[]`. B4 proves the host-driven loop works through it.

## Finding 2 — v1 DOES have runtime type building; it is not TypeBuilder

The v0 spellings are gone — no `TypeBuilder` export, no `type_builder` module in
the SDK, no `{ tb }` call option (which is rejected loudly: `unknown optional
argument "tb"`). **That is a rename, not a removal.**

v1 does it with **generics + `$types`**. Declare a generic return type:

```baml
function SelectToolGeneric<T>(user_message: string) -> T { client: … prompt: … }
```

Codegen emits `{ typeParams: ["T"] }`, and the host binds `T` per call using the
`BamlType` vocabulary exported by `@boundaryml/baml-bridge`:

```ts
type BamlType = 'int'|'string'|… | BamlClassCtor | { class, args? }
              | { list: BamlType } | { map: [BamlType, BamlType] }
              | { optional: BamlType } | { union: BamlType[] }   // <- runtime union
```

```ts
// the tool set can vary every call
parseGeneric(json, { $types: { T: { list: { union: boundTools } } } })
```

| # | Check | Result |
|---|---|---|
| R1 | `$types` binds `T` to a host-chosen class | ✅ |
| R1b | the same call site binds a different type next call | ✅ |
| R2 | `{ list: { union: [...] } }` parses at runtime | ✅ |
| R2b | the union assembled from a **varying** tool list | ✅ |
| R3 | a **bare** `{ union: [...] }` | ❌ `InvalidArgument: Unions must be flattened` — wrap it |
| R4 | binding a mismatched type | ⚠️ **coerces**, does not throw |

## Finding 3 — the blocker is a v1 **bug**, not a missing feature

`$build_request` renders `${ctx.output_format}` for the bound return type — it is
what *tells the model which tools exist*. On 0.15.0 the type variable is not
substituted before that renderer runs, and the runtime **panics**:

```
internal error: entered unreachable code: non-data type TypeVar("T", …)
should not reach output_format
crates/sys_llm/src/types/output_format.rs:608
```

It trips for **any** `$types` binding — a plain class as well as a union (R5, R5b).

So today a runtime-bound tool union can be **parsed** but cannot be **described
to the model**. That is an unimplemented path, worth filing upstream. R5/R5b are
written as negative assertions so this probe goes red the moment it is fixed.

**Consequence for a `Providers.BAML` entry in `@librechat/agents`:** the design is
sound and the seam exists — `getToolsForBinding()` maps directly onto
`$types: { T: { list: { union: tools } } }`. It is blocked on this one panic.

## Finding 4 — three more edges the pattern has to route around

Found while building the workaround, all pinned by `provider-pattern.mjs`:

| Edge | Symptom | Route around it |
|---|---|---|
| A `type` alias as an LLM return type | `InvalidArgument: Unknown type alias: …BoundTool$stream` — codegen emits no `$stream` companion for an alias | inline the union in the signature; keep the alias for non-`$parse` signatures |
| A host value into a **union-typed** BAML param | `TypeMismatch: Missing field \`city\` in external Instance for class GetWeather` — it coerces into the FIRST variant | dispatch host-side on the literal field; keep union-param functions BAML-internal |
| The rendered schema | carries **no type names**, only field shapes | give every tool a literal `tool: "name"` discriminator |

## Finding 5 — `spawn` + per-await `catch` drops errors (upstream bug)

Bisected from your simple example down to 6 lines in `repro-spawn-catch/`.
Measured 20 runs per shape on 0.15.0 (`./repro-spawn-catch/measure.sh`):

| Shape | caught | escaped |
|---|---|---|
| 1 spawn, throws | 20/20 | 0/20 |
| 2 spawns, **first** throws | 20/20 | 0/20 |
| 2 spawns, **second** throws | 8/20 | **12/20** |
| 2 spawns, both throw | 6/20 | **14/20** |
| 3 spawns, all throw | 2/20 | **18/20** |
| TaskGroup, 1 of 3 throws | 6/20 | **14/20** |

**Rule: a throw from the FIRST spawned task is always caught; a throw from any
later one escapes its `catch` nondeterministically, and the rate climbs with
concurrency.** A `TaskGroup` is not required — bare `spawn` reproduces it. The
host binding (sync vs async) only shifts the rate.

```baml
function main() -> int {
  let a = spawn { fine(1) };
  let b = spawn { boom(7) };
  (await a) + ((await b) catch (e) { Bad => e.offset })   // escapes ~60% of runs
}
```

This blocks per-call tool-error isolation: `ToolNode` turns a failed call into an
error `ToolMessage` and keeps the batch going
(`src/tools/ToolNode.ts:1490-1592`). It is very likely the same root cause as the
~30% `baml test` testset-enumeration flake (10/10 clean without a spawn testset,
3/10 failing with one).

## Finding 6 — two async-discipline rules

- **Use `_async` companions.** The sync ones block the Node event loop; a
  `$stream` driven alongside an in-process HTTP server deadlocks under sync and
  does not under async.
- **Never capture a `while`-loop binding in a `spawn` body.** The binding is
  reused, not re-created, so every task observes the LAST iteration's values —
  all three tool calls came back as the third one's result. Pair up first, then
  `.map`, so each closure owns its element. Pinned as `async-probe.mjs` A2.

## Incidental

- Importing `baml_ts/dist/<ns>/index.js` directly throws *"BAML runtime has not
  been initialized"* — only the **root** barrel calls `initializeRuntimeFromBytecode`.
- `$parse_stream` returns `Stream<T$stream | null, T>` where `T$stream` is the
  all-nullable partial, so incremental parsing (what streamed tool-call arguments
  need) does exist.
- A bare union return cannot be `$parse`d even when written in `.baml` source, so
  tool *selection* is untestable offline unless routed through a wrapper class —
  which is why `SelectTool` returns `ToolInvocation`, not `ToolCall`.
- `dynamic` is a **prefix** inside a test's `type_builder` block
  (`dynamic class Foo { … }`), not the v0 `@@dynamic` suffix. `baml describe dynamic`.

## Negative assertions

B2b, B3, R3, R5, R5b, D1–D1d assert that things **fail**. Deliberate: if BAML
fixes any of them the spike goes red and says so, instead of the limitation
quietly outliving its truth.

## Not covered

- `loop_live()` and `SelectDynTool::TypeBuilderBlock` need `OPENAI_API_KEY`.
- Whether a model reliably fills the discriminated wrapper (prompt quality, not mechanism).
- Streamed tool-call arguments end to end — `$parse_stream` exists; it was not driven.
