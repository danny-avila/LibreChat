# `catch` at an `await` site silently drops errors from any spawned task but the first

**Version:** toolchain `0.15.0` (wrapper `0.2.0`, channel `canary`)
**Platform:** Debian 13 (trixie), Linux 6.12.85 x86_64
**Repro:** `scripts/baml-toolloop/repro-spawn-catch/` — bare `spawn`, no `TaskGroup`, no host language

## Summary

When more than one task is `spawn`ed, a `throw` from any task **other than the
first** escapes its per-`await` `catch` arm and propagates out of the function.
It is nondeterministic, and the escape rate climbs with the number of concurrent
tasks.

A throw from the *first* spawned task is always caught. A single spawned task is
always caught.

## Reproduction

```baml
class Bad {
  offset: int,
}

function boom(i: int) -> int throws Bad {
  throw Bad { offset: i }
}

function fine(i: int) -> int {
  i
}

function main() -> int {
  let a = spawn { fine(1) };
  let b = spawn { boom(7) };
  (await a) + ((await b) catch (e) { Bad => e.offset })
}
```

```console
$ baml run -e 'main()'
8                                              # expected — about 40% of runs
$ baml run -e 'main()'
error: uncaught throw: user.Bad {offset: 7}    # the catch arm was skipped
```

A single run proves nothing — `./measure.sh 20` reports the rate.

## Expected

`main()` returns `8` on every run: `fine(1)` plus the `catch` arm converting
`Bad { offset: 7 }` into `7`.

## Actual

`Bad` propagates out of `main()` on ~60% of runs, despite the `catch` arm at that
exact `await` site.

## Measured rates

20 runs per shape:

| Shape | caught | escaped |
|---|---|---|
| 1 spawn, throws | 20/20 | 0/20 |
| 2 spawns, **first** throws | 20/20 | 0/20 |
| 2 spawns, **second** throws | 8/20 | **12/20** |
| 2 spawns, both throw | 6/20 | **14/20** |
| 3 spawns, all throw | 2/20 | **18/20** |
| `TaskGroup.new(2)`, 1 of 3 throws | 6/20 | **14/20** |

## Scope

Things that are **not** the cause, already ruled out:

- **Not `TaskGroup`.** Bare `spawn` reproduces it; a `TaskGroup` only changes the
  rate. `spawn` + `TaskGroup` with no throwing task is stable 25/25.
- **Not the host binding.** Reproduces under `baml run` with no host language.
  Calling through the generated Node SDK shifts the rate (sync ~15%, async ~35%)
  but is not required.
- **Not `spawn`/`await` generally.** The canonical three-task example
  (`spawn { work(1) }` … `(await a) + (await b) + (await c)`, no throws) is
  stable 25/25.
- **Not the catch syntax.** The identical `catch` arm works 20/20 when the
  throwing task is the only one, or the first one.

## Possibly related

`baml test` intermittently fails to enumerate a testset that contains `spawn`
work, reporting `(testset error)` and counting the whole testset as one failure:

```
FAIL testing::* [outcome=error]
  failed: toolloop_parallel/(testset error)
error: test failures — 17 passed, 1 failed, 18 total     # 18, not 20
```

Measured 10 runs with and without that testset:

- without the `spawn` testset — 10/10 clean
- with it — 3/10 runs fail

Same suite, same machine. Given both involve error propagation out of spawned
tasks, these may share a root cause.

## Impact

This blocks per-task error isolation for any fan-out. In our case the pattern is
an agent tool-call batch: each tool runs concurrently, and a failing tool must
become an error result while its siblings complete. With this bug one failing
task aborts the whole batch, nondeterministically.

The workaround — funnelling every fallible task through a result union instead of
`throws` — costs the ergonomics that make `spawn` + `catch` worth using.
