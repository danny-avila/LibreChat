---
name: baml-core
description: Minimal BAML skill. BAML is a statically-typed, expression-oriented language with first-class LLM functions — TypeScript-like, snake_case methods, etc. Useful for building ai workflows, agents, evals.
---

# baml

BAML is a statically-typed, expression-oriented *language* — TypeScript with `snake_case` methods, `name: type,` fields, enums, interfaces, generics, closures, optional chaining, backtick strings with `${...}` interpolation, `.to_string()` on any value, a real stdlib. And a declarative *DSL* for LLM calls (`function … { client: prompt: }`, `test`) that desugars into it, so a model's structured output is just a typed return value.

**The CLI is the documentation. Discover via `baml describe`:**

```bash
brew install baml                # CLI binary: `baml`

baml init                        # new project (baml.toml + baml_src/)
baml help <command>              # CLI options and examples
baml describe baml.json          # ← THE reference for any module/type/method/signature/keyword
baml describe Array --budget 120 #   (Array, String, Map, assert, match, patterns, spawn, python, ...)
                                 #   ends with "… N more lines"? re-run with `--budget <N>`
baml check                       # compile-check the project
baml run -e 'expr'               # eval an expression — fast feedback + syntax check
baml test --list && baml test    # run every test/testset block
baml fmt baml_src/main.baml      # canonicalize the project's formatting
```

`baml describe <name>` prints the **full source body** of stdlib functions — the fastest way to verify behavior, and the only path for embedded builtins like `assert` (no on-disk file). Pure functions need no test/client — check them with `baml run -e 'add(2, 3)'`.

Don’t describe APIs already demonstrated below unless you run into some errors. You can start based off the examples and use it if you run into more errors or you want actual stdlib details.

Mostly it behaves like JavaScript/TypeScript, with very similar syntax — but BAML is more sound/strict.

## Best practices and info

- **LLM function = typed return.** The RETURN TYPE *is* the schema the model must produce (`class`, `enum`, literal union, `string[]`, `T?`). Structured output is just a typed value — hand it to ordinary code.
- **Prompts are backtick strings with `${...}` interpolation.** Write `prompt:` ``… ${arg} …``, and **always inject `${ctx.output_format}`** for a structured return. Escape with `\`` / `\${`; nest with extra backticks.
- **Shape the schema with field attributes.** `@description("…")` adds a `///` hint the model sees in `${ctx.output_format}`; `@alias("name")` renames the emitted JSON key. Chain: `tags: string[] @alias("labels") @description("…")`.
- **Test the pure code, not the model.** Unit-test orchestration/post-processing on literal data with `assert.`*. Calling an LLM function in a `test` makes a real request — not an offline test. (`f$parse`/`f$render_prompt`/`f$build_request` exist for debugging.)
- **Build strings with interpolation, not coercion.** ``score=${n}`` stringifies any value (implicit `.to_string()`); call `.to_string()` for the string alone. `+` needs both sides already strings (`"n=" + 5` won't compile).
- `**catch` for some, `catch_all` for all.** `expr catch (e) { baml.errors.ParseError => fallback }` handles a *specific* error; `expr catch_all (e) { _ => fallback }` is *exhaustive* — for a workflow top / entrypoint. Errors propagate implicitly; callers needn't re-declare. **Raise** with `throw baml.errors.InvalidArgument { message: "…" }` (error types are the builtin `baml.errors.*` classes — `InvalidArgument`/`ParseError`/`Io`/`Timeout`/…; `baml describe baml.errors`); annotate a fallible signature with `-> T throws ErrType`. Prefer a typed result **union** (`type R = Ok | Err`) over throwing for ordinary control flow.
- **Interfaces = shared behavior + dynamic dispatch.** `interface I { function m(self) -> T }` (methods may have default bodies); a class opts in via `implements I { … }`; a value typed `I` (or `I[]`) dispatches to the implementor at runtime.
- **Pattern matching.** `match (v) { … }` over values/types; arms are `pattern => expr` — literals, `let x: T` (bind + narrow), class destructure `T { f: let y }`, or-patterns `A | B`, guards `… if cond`, `_`; must be exhaustive. Also `v is T` → bool (narrows) and `if let x: T = v { … } else { … }`. `baml describe patterns`.
- **Concurrency = green threads.** `spawn { … }` returns a `Future`; `await` collects it. Combine many with `baml.future.all` / `all_complete` / `race` / `any` (JS `Promise.*`). Configure a spawn with a `with` clause: `spawn with baml.spawn.options(group = g, cancel = tok, detach = true) { … }` — `baml.spawn.TaskGroup.new(n)` caps concurrency (excess spawns queue FIFO), a `baml.spawn.CancelToken` cancels cooperatively. `baml describe spawn` / `baml describe baml.future`.
- **Resource safety — `defer`, `cleanup`, `catch (e, ctx)`.** `defer { … }` runs a block at scope exit, LIFO, on *every* path (return / throw / fall-through) — like Go. A class method named `function cleanup(self) -> void` is a **finalizer**: it runs at most once per instance whether you call it, `defer` it, or the GC reclaims it. `catch (e, ctx)` binds an **`ErrorContext`** alongside the error — an error thrown while handling another chains onto it, so `ctx.root_cause()` / `ctx.cause` walk back to the original failure and `ctx.to_string()` renders the whole chain (Python `__context__`-style). `while let PATTERN = expr { … }` loops until the pattern fails (e.g. draining a `T?`-returning `.pop()`).
- **Call BAML from Python / TS.** Declare a `[generator.<name>]` in `baml.toml`, run `baml generate`, then import the typed `baml_sdk`. Install + usage: `baml describe python` / `baml describe typescript` / `baml describe baml_sdk`.
- **Safe access over indexing.** Subscript panics on a missing index/key; use `.at(i)`/`.get(k)` (→ `T?`), reach through with `?.`, default with `??` (parenthesize: `(m.get(k) ?? 0) + 1`).
- **Stdlib methods are snake_case, called on a value.** Some return new, some mutate in place, a few do both (`sort_by_key` sorts the receiver *and* returns it) — to read the docs, `baml describe <word/type/identifier/keyword/etc>`.
- **Class fields `name: type,`; construct `Type { field: val }`.** Methods take a bare `self`; factories are free functions. **Fields are mutable** (like TS): `obj.field = v` and `obj.field += n` work, and a `self` method can mutate in place — a side-effect method returns `void`. **Classes are reference types**: `find`/`at(i)`/subscript return a *live alias*, not a copy, so mutating the result mutates that element inside the array (`xs.find(p)?.n += 1` updates `xs`), and a class passed to a function can be mutated by the callee. There's **no struct-update/spread** syntax; reconstruct or mutate. **Empty classes are legal** (`class Marker {}`) — handy as union variants. **Enums are plain variants — no methods, no associated data** (`E.A.foo()` won't compile); put behavior in free functions that `match`. `enum E { A, B }`, access `E.A`.
- **Blocks are expressions** — last expression is the value (no `;`); `return x;` for early exit. A side-effect-only function's return type is `-> null` (canonical — `baml describe void`; `-> void` also works); its block's unit *value* is just bare `null` (writing `-> null` in *value* position is a parse error). `for (let x in xs)` iterates VALUES; `while (cond) { … }` loops. Closures `(x) -> { ... }` infer param/return from context (annotate `(x: T) -> R` only when ambiguous; the `->` is required). `.map`/`.filter` return arrays directly (no `.collect()`). Empty map needs a type: `let m: map<string, int> = {};`.
- **No ternary — `if/else` is the expression.** There's no `cond ? a : b`; `if (cond) { a } else { b }` *is* an expression that returns a value, so assign it directly: `let label = if (x > 3) { "big" } else { "small" };`. Each branch is a block whose last expression is its value (no `return`). Chain with `else if`, and pair with `if let PATTERN = expr { … } else { … }` for bind-and-narrow.
- **Arrays have a JS-like method set** — `map`/`filter`/`filter_map`/`reduce`/`find`/`some`/`every`/`flat_map`/`slice`/`concat`/`join`/`includes`/length(), plus in-place `push`/`pop`/`shift`/`unshift`/`sort_by`/`sort_by_key`. Most take closures that can `throws`. `baml describe Array` gives more info.
- Local let bindings are reassignable (x = x + 1) — no mut keyword (it's TS let, not Rust); there's no const either.
- **Args: defaults with `=`, keyword calls with `=` (never `:`).** Declare a default in the signature: `function f(a: int, b: int = 10)`; call `f(1)` or `f(1, b = 2)`. A **defaulted param must be passed by name** — `f(1, 2)` is an error (`defaulted parameter 'b' must be passed by name`). Any param (even required) may be passed by name (`f(a = 1, b = 2)`), and you can skip a middle default to set a later one (`f(1, c = 9)`). Keyword syntax is `name = value`; `name: value` won't parse (`:` is for types/fields). **`T?` does NOT make an argument optional** — unlike TS `b?: T`, a `b: T?` param is still *required* (you must pass `null`, else `expected N argument(s), got …`); add `= null` to make it omittable. Built-ins follow this: `baml.http.fetch(url, timeout = baml.time.Duration.from_seconds(10))`.
- **Where it diverges from TS (the silent traps):** arithmetic is *type-driven*, not TS-style. `int / int` is **truncating integer division** (`285 / 100 == 2`, NOT `2.85`) and `%` is the remainder (`285 % 100 == 85`); this compiles fine and just gives a quietly-wrong number, so it's the highest-value gotcha. Mix in a float to get float division (`285 / 100.0 == 2.85`, `285.0 / 100 == 2.85`); any mixed `int`/`float` op promotes to `float` (`5 + 2.0 == 7.0`). There is **no `.to_float()`** — convert an int with `n * 1.0` (or divide by a float). An `int` result does **not** auto-coerce to `float` on assignment (`let x: float = 285 / 100` is a compile error). `+` is **numeric-only**: string concat needs both sides already `string` (`"n=" + 5` won't compile — use `${...}` interpolation). Comparisons (`==`, `<`, …, structural `==`) and `&&`/`||`/`!` are TS-like.
- **Tests:** lone `test "name" { ... }` (no wrapper); `testset` only GROUPS. Asserts (only 4): `assert.equal`/`is_true`/`not_null`/`contains`. `assert.equal` compares structurally; `baml.deep_equals(a, b)` is the bool form. Last assert: no trailing `;`. Run one: `baml test -i "Testset::TestName"` (`-x` to exclude) — the selector keys on `testset::test`, so a top-level `test` with no testset is `-i "::TestName"`; `baml test --list` prints valid selectors.
- **Namespaces =** `ns_*` **directories, no imports.** A folder `ns_<name>/` under `baml_src/` puts its files in namespace `<name>`; files in `baml_src/` itself are the `root` namespace (nesting stacks — `ns_a/ns_b/` → `root.a.b`; non`ns_` folders don't namespace). Same namespace = same scope: files share definitions with no import. To reach *another* namespace, use the **absolute** path `root.<ns>.<name>` `root.llm.Response`) — a bare `Response` from outside is rejected `did you mean root.Response?`). Run a target by its namespace-relative path `baml run agent.main`), but `baml run -e` evaluates in the root scope, so reach in with the absolute form: `baml run -e 'root.agent.main()'`. It's more idiomatic to keep namespaces as flat as possible, like Go packages.
- Run `baml fmt` when you're done with a feature.
- BAML functions/methods/types etc are accessible from other languages (python, typescript). Run `baml describe baml_sdk` for setup instructions. You might want to see if the current dir is near a python or TS project to setup the wiring for the user. The baml.toml toolchain version must match the installed python/ts baml package. Keep AI-related things and workflow logic in BAML as much as possible.
- BAML has `log.info(..)` or `log.debug(..)`
- `baml pack` can create a binary.
- Use backtics instead of \#" "# like baml used to have.


For anything not shown (signatures, niche stdlib, advanced features), run `**baml describe <name>`** — the CLI is the docs; never guess the stdlib.

## Example 1 — LLM DSL + glue (schema, attributes, client, backtick prompt, post-processing)

```baml
// The return type IS the schema; @description/@alias shape what the model sees.
enum Priority { High, Low }

class LineItem {
    name: string,
    amount: float,
    priority: Priority,
}

class Invoice {
    vendor: string @alias("seller"),
    status: "draft" | "final" @description("invoice state"),
    items: LineItem[],
    note: string?,
}

client<llm> Fast {
    provider: openai,
    options: { model: "gpt-4o-mini", api_key: env.OPENAI_API_KEY },
}

function Extract(raw: string) -> Invoice {
    client: Fast                                  // or shorthand: "openai/gpt-4o-mini"
    prompt: `Extract the invoice. ${ctx.output_format}\n${raw}`
}

// Structured output is just a typed value — hand it to ordinary code.
// Closure params/return infer from context; only the -> is required.
// `min_amount` has a default — omit it, or pass it BY NAME (`min_amount = …`).
function high_total(inv: Invoice, min_amount: float = 0.0) -> float {
    inv.items
        .filter((i) -> { i.priority == Priority.High && i.amount >= min_amount })
        .reduce((a, i) -> { a + i.amount }, 0.0)
}

test "post-process a literal Invoice — no model call" {
    let inv = Invoice {
        vendor: "Acme", status: "final", note: null,
        items: [LineItem { name: "srv", amount: 900.0, priority: Priority.High },
                LineItem { name: "mug", amount: 12.0, priority: Priority.Low }],
    };
    assert.is_true(baml.deep_equals(high_total(inv), 900.0));          // default min_amount = 0.0
    assert.is_true(baml.deep_equals(high_total(inv, min_amount = 1000.0), 0.0))  // keyword arg
}
```

## Example 2 — the language (methods, interpolation, closures, maps, json, errors). Mutations work like Typescript

```baml
// BAML is a real language — no LLM here.
enum Tier { Free, Pro }

class User {
    name: string,
    tier: Tier,
    score: int,
    // method (bare self) + ${} interpolation (implicit .to_string() on the int)
    function label(self) -> string { `${self.name.to_upper_case()}:${self.score}` }
    // fields are MUTABLE like TS: assign / += on self in place; a side-effect method returns void
    function celebrate(self) -> void { self.score += 100 }
}

function make_user(name: string, score: int) -> User { User { name: name, tier: Tier.Pro, score: score } }

// inferred closures; sort_by_key; optional chaining + ?? over a possibly-null .at
function top_label(us: User[]) -> string {
    us.sort_by_key((u) -> { 0 - u.score }).at(0)?.label() ?? "none"
}

// map<string,int> via for-let-in; .get ?? default; explicit .to_string()
function tier_counts(us: User[]) -> map<string, int> {
    let counts: map<string, int> = {};
    for (let u in us) { let _ = counts.set(u.tier.to_string(), (counts.get(u.tier.to_string()) ?? 0) + 1); }
    counts
}

function roundtrip(u: User) -> User { baml.json.from_string<User>(baml.json.to_string(u)) }

// `catch` with a typed arm handles ONE specific error
function safe_parse(s: string) -> int { baml.Int.parse(s) catch (e) { baml.errors.ParseError => -1 } }

test "lang" {
    let us = [make_user("ada", 90), make_user("bo", 30)];
    log.info(us);
    assert.equal(top_label(us), "ADA:90");
    assert.equal((tier_counts(us).get("Pro") ?? 0), 2);
    let kit = make_user("kit", 5);
    kit.celebrate();            // mutate in place
    kit.tier = Tier.Free;       // direct field assignment — no struct-update syntax
    assert.equal(kit.score, 105);
    assert.equal(roundtrip(make_user("zoe", 7)).name, "zoe");
    assert.equal(safe_parse("42"), 42);
    assert.equal(safe_parse("x"), -1)
}
```

## Example 3 — interfaces (shared behavior, default method, dynamic dispatch)

```baml
interface Animal {
    function sound(self) -> string
    function describe(self) -> string { `${self.sound()}!` } // default method
}

class Dog {
    name: string,
    implements Animal { function sound(self) -> string { "woof" } }
}

class Cat {
    indoor: bool,
    implements Animal {
        function sound(self) -> string { "meow" }
        function describe(self) -> string { `quiet ${self.sound()}` } // override
    }
}

// an Animal[] holds any implementor; calls dispatch dynamically
function chorus(animals: Animal[]) -> string {
    animals.map((a) -> { a.describe() }).join(" ")
}

test "interfaces" {
    let animals: Animal[] = [Dog { name: "Rex" }, Cat { indoor: true }];
    assert.equal(chorus(animals), "woof! quiet meow")
}
```

## Example 4 — pattern matching (`match` over values + types, `is`, `if let`)

```baml
class Circle { r: int }
class Rect { w: int, h: int }
type Shape = Circle | Rect

function area(s: Shape) -> int {
    match (s) {
        Circle { r: 0 } => 0,                           // literal field, no binding
        let c: Circle => 3 * c.r * c.r,                 // typed binding (matches + narrows)
        Rect { w: let w, h: let h } if w == h => w * w, // destructure + guard
        _ => 0,                                         // wildcard
    }
}

function classify(n: int) -> string {
    match (n) {
        0 => "zero",
        1 | 2 | 3 => "small",     // or-pattern
        let x if x < 0 => "neg",  // binding + guard
        _ => "big",
    }
}

// `is` -> bool (and narrows); `if let PATTERN = expr { } else { }`
function label(s: Shape) -> string {
    if (s is Circle) {
        "circle"
    } else if let r: Rect = s {
        `rect ${r.w}x${r.h}`
    } else {
        "?"
    }
}

test "patterns" {
    assert.equal(area(Circle { r: 2 }), 12);
    assert.equal(area(Rect { w: 3, h: 3 }), 9);
    assert.equal(classify(2), "small");
    assert.equal(classify(-5), "neg");
    assert.equal(label(Circle { r: 1 }), "circle");
    assert.equal(label(Rect { w: 2, h: 4 }), "rect 2x4")
}
```

## Example 5 — resource safety + structured concurrency (defer, cleanup, ErrorContext, spawn options, futures, while-let)

```baml
class DbConn {
    log: string[],
    // `cleanup` is a magic method (recognized by name): runs at most once per
    // instance — whether called explicitly, deferred, or reclaimed by the GC.
    function cleanup(self) -> void { self.log.push("closed") }
}

function use_conn() -> string[] {
    let c = DbConn { log: [] };
    {
        defer { c.cleanup() }              // deferred blocks run LIFO at scope exit,
        defer { c.log.push("commit") }     // on every path (return / throw / fall-through)
        c.log.push("query")
    }
    c.log                                  // ["query", "commit", "closed"]
}

function fail_a() -> string { throw baml.errors.Io { message: "disk full" } }
function fail_b() -> string { throw baml.errors.Timeout { message: "retry timed out" } }

// `catch (e, ctx)` binds the error AND its ErrorContext; throwing while handling
// chains the new error onto the one being handled, so root_cause() walks to the origin.
function root_cause_demo() -> string {
    fail_a() catch (e, ctx) {
        _ => fail_b() catch (e2, ctx2) {
            _ => match (ctx2.root_cause().error) {      // ctx.to_string() renders the full chain
                let io: baml.errors.Io => io.message,   // "disk full" — the original cause
                _ => "unknown",
            }
        }
    }
}

// spawn returns a Future; baml.future.all/all_complete/race/any combine many (JS Promise.*).
function concurrent_squares(xs: int[]) -> int {
    let futures = xs.map((x) -> { spawn { x * x } });   // all run concurrently
    let squares = await baml.future.all(futures);
    squares.reduce((a, b) -> { a + b }, 0)
}

// Configure a spawn with `with baml.spawn.options(...)`: a TaskGroup caps concurrency
// (excess spawns queue), a CancelToken cancels cooperatively, detach reparents the task.
function rate_limited() -> int {
    let g = baml.spawn.TaskGroup.new(2);
    let a = spawn with baml.spawn.options(group = g) { 1 };
    let b = spawn with baml.spawn.options(group = g) { 2 };
    (await a) + (await b)
}

// while-let drains an optional-returning source; the loop exits when the pattern fails.
function drain(stack: string[]) -> string {
    let out = "";
    while let item: string = stack.pop() { out = out + item; }
    out
}

test "resources + concurrency" {
    assert.equal(use_conn(), ["query", "commit", "closed"]);
    assert.equal(root_cause_demo(), "disk full");
    assert.equal(concurrent_squares([1, 2, 3]), 14);
    assert.equal(rate_limited(), 3);
    assert.equal(drain(["a", "b", "c"]), "cba")
}
```

## Concurrency — green threads (parallelize LLM / HTTP calls)

`spawn { … }` launches a background task; `await` collects it; `baml.future.all(list)` awaits many in order. Run `baml describe spawn` for the details.

```baml
function fetch_all(urls: string[]) -> string[] {
    // each request runs concurrently; await all results in order
    await baml.future.all(urls.map((u) -> { spawn { baml.http.fetch(u).text() } }))
}
```

**Workflow: sketch → `baml run -e` / `baml check` constantly → `baml describe` anything unfamiliar → `baml test`.**

Also just start writing some code. This is plenty of information already. Pretend you're writing some typescript but with this new syntax etc.

## BAML workflow visualizer annotations
Use '//#' to add comments that will show up in the BAML visualizer. Useful for annotating branches, general flow of the program. When you write baml code you should add some of these in general flow of the program. No need to annotate _everything_.
e.g.
```baml
function hello() -> void {
    //# Start loading data
    ...
    //# Iterate over things...
    ...
}
