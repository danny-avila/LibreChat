> # ⛔ DO NOT FILE — FIXED UPSTREAM (retested 2026-08-10)
>
> Every path that panicked on `0.15.0` passes on
> `0.15.1-nightly.20260731.a`. Same repro, same machine, `./check.sh`:
>
> | Expression | `0.15.0` | nightly `20260731.a` |
> |---|---|---|
> | `Pick$parse<Weather>(…)` | ok | ok |
> | `Pick$render_prompt<Weather>("hi")` | **PANIC 608** | **ok** |
> | `Pick$build_request<Weather>("hi")` | **PANIC 608** | **ok** |
> | `Pick$build_request_stream<Weather>("hi")` | **PANIC 608** | **ok** |
> | `PickConcrete$build_request("hi")` | ok | ok |
>
> Not yet on the stable channel — latest canary is still `0.15.0`.
>
> **This unblocks Phase 1 of the Providers.BAML port.** The TDD plan defers the
> runtime-varying tool union and streamed tool-argument deltas explicitly behind
> this panic. `$types` runtime binding already worked on `$parse`; the prompt
> path was the only thing missing.
>
> **Before acting on that**, re-verify the `$types` runtime-union path
> specifically via `../runtime-union-probe.mjs` — that probe goes through the
> Node bridge npm package, which is versioned separately from the CLI toolchain
> and needs its own check.
>
> Tracked as `AF-ln0` (closed).

# Panic: a generic return type reaches `output_format` unsubstituted

**Version:** toolchain `0.15.0` (wrapper `0.2.0`, channel `canary`)
**Platform:** Debian 13 (trixie), Linux 6.12.85 x86_64
**Repro:** `scripts/baml-toolloop/repro-generic-output-format/` — pure BAML, no host language
**Deterministic:** yes, every run

## Summary

An LLM function with a **generic return type** panics on every path that renders
`ctx.output_format`. The type variable is not substituted before the
output-format renderer runs:

```
thread 'main' panicked at crates/sys_llm/src/types/output_format.rs:608:17:
internal error: entered unreachable code: non-data type TypeVar("T", TyAttr {
sap_parse_without_null: Unset, sap_pending_never: Unset,
sap_in_progress_never: Unset }) should not reach output_format
```

The parse path handles the same generic correctly, so the substitution machinery
works — it just does not run before `output_format`.

## Reproduction

```baml
class Weather {
  city: string,
}

function Pick<T>(msg: string) -> T {
  client: "openai/gpt-5-mini"
  prompt: `${ctx.output_format}${role("user")}${msg}`
}

function PickConcrete(msg: string) -> Weather {
  client: "openai/gpt-5-mini"
  prompt: `${ctx.output_format}${role("user")}${msg}`
}
```

```console
$ baml run -e 'Pick$build_request<Weather>("hi")'
thread 'main' panicked at crates/sys_llm/src/types/output_format.rs:608:17
```

No API key or network needed — it panics while building the request.

## Affected paths

`./check.sh`:

| Expression | Result |
|---|---|
| `Pick$parse<Weather>("{\"city\":\"Boston\"}")` | ✅ `Weather {city: "Boston"}` |
| `Pick$render_prompt<Weather>("hi")` | ❌ panic |
| `Pick$build_request<Weather>("hi")` | ❌ panic |
| `Pick$build_request_stream<Weather>("hi")` | ❌ panic |
| `PickConcrete$build_request("hi")` (non-generic control) | ✅ ok |

So: **parse works, every prompt-rendering path panics, non-generic is unaffected.**

## Expected

`Pick$build_request<Weather>("hi")` renders the same request
`PickConcrete$build_request("hi")` does — `T` bound to `Weather`, its schema in
`ctx.output_format`.

## Actual

Rust panic, unsubstituted `TypeVar("T")`.

## Also reachable from the Node SDK

Same panic when the type variable is bound from the host via `$types`, including
runtime-constructed types:

```ts
// all three panic identically
Pick$build_request('hi', { $types: { T: Weather } })
Pick$build_request('hi', { $types: { T: { union: [Weather, Search] } } })
Pick$build_request('hi', { $types: { T: { list: { union: [Weather, Search] } } } })
```

The corresponding `$parse` calls all succeed, including
`{ list: { union: [...] } }` built at runtime from a varying array.

One adjacent rough edge on the parse path: a **bare** top-level union
(`$types: { T: { union: [A, B] } }`) is rejected with
`InvalidArgument: Unions must be flattened`, while the wrapped form
`{ list: { union: [A, B] } }` works. Same error appears for a bare union written
directly as a `.baml` return type.

## Impact

This is the one thing standing between us and a runtime-varying schema. Our host
binds a different tool set on every turn (MCP servers, a tool registry, deferred
loading), which maps cleanly onto
`$types: { T: { list: { union: boundTools } } }` — and that already parses
correctly today. But because the request path panics, the model can never be
*told* which tools exist, so the union has to be frozen into `.baml` at build
time and runtime-discovered tools cannot participate.

With this fixed, runtime schema binding works end to end for us.
