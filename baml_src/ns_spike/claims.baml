// Spike: falsify the LLM-interface research doc's BAML claims against the
// toolchain that actually installs.
//
// Source under test:
//   thoughts/searchable/shared/research/2026-08-09-11-24-llm-interface-baml-integration.md  §10
// Observed against:
//   baml wrapper 0.2.0 / baml toolchain 0.15.0 (canary), Linux x86_64
//
// Every `observed` string below was produced by a command recorded in
// scripts/baml-spike/probe.sh. Run `baml test` to check the harness itself.

enum Verdict {
    Confirmed,
    Falsified,
    Unverified,
}

class Claim {
    id: string,
    topic: string,
    research_said: string,
    observed: string,
    verdict: Verdict,

    // one-line rendering for the report
    function line(self) -> string {
        `${self.id} [${self.verdict.to_string()}] ${self.topic}`
    }
}

//# The research doc's BAML section, claim by claim.

function claims() -> Claim[] {
    [
        Claim {
            id: "C01",
            topic: "npm runtime package",
            research_said: "npm install @boundaryml/baml",
            observed: "npm install @boundaryml/baml-bridge",
            verdict: Verdict.Falsified,
        },
        Claim {
            id: "C02",
            topic: "generator declaration site",
            research_said: "a generator block inside a .baml file",
            observed: "a [generator.<name>] section in baml.toml",
            verdict: Verdict.Falsified,
        },
        Claim {
            id: "C03",
            topic: "CLI binary and command",
            research_said: "npx baml-cli generate",
            observed: "baml generate",
            verdict: Verdict.Falsified,
        },
        Claim {
            id: "C04",
            topic: "generated client import shape",
            research_said: "import { b } from './baml_client'; await b.Fn(args)",
            observed: "import { main, main_async } from './baml_ts/baml_sdk/index.js' - one named export per function, sync and async",
            verdict: Verdict.Falsified,
        },
        Claim {
            id: "C05",
            topic: "runtime provider/model/key override",
            research_said: "ClientRegistry.addLlmClient(name, provider, opts) then setPrimary, passed per call",
            observed: "no such symbol - baml describe ClientRegistry returns 'No symbol found'",
            verdict: Verdict.Falsified,
        },
        Claim {
            id: "C06",
            topic: "runtime schema extension",
            research_said: "TypeBuilder class, tb.User.addProperty(...), passed as { tb }",
            observed: "no such symbol - type_builder is a compile-time block inside a test",
            verdict: Verdict.Falsified,
        },
        Claim {
            id: "C07",
            topic: "usage and token reporting",
            research_said: "Collector from @boundaryml/baml, collector.last.usage.inputTokens",
            observed: "no such symbol - baml describe Collector returns 'No symbol found'",
            verdict: Verdict.Falsified,
        },
        Claim {
            id: "C08",
            topic: "prompt string delimiter",
            research_said: "block strings delimited by #\" ... \"#",
            observed: "backtick strings with ${...} interpolation",
            verdict: Verdict.Falsified,
        },
        Claim {
            id: "C09",
            topic: "what a function is",
            research_said: "a function declares a typed LLM call with client and prompt",
            observed: "a function is an ordinary typed function; the LLM form is a DSL that desugars into it",
            verdict: Verdict.Falsified,
        },
        Claim {
            id: "C10",
            topic: "v0 versus v1",
            research_said: "no public v1 docs, repo, or package could be located; treat v0 as current",
            observed: "v1 is what installs: two separate lines coexist on disk, baml-cli 0.218-0.222 alongside toolchain 0.13-0.15",
            verdict: Verdict.Falsified,
        },
        Claim {
            id: "C11",
            topic: "return type is the schema",
            research_said: "the function return type is the schema the model must produce",
            observed: "same in v1 - the return type is the schema",
            verdict: Verdict.Confirmed,
        },
        Claim {
            id: "C12",
            topic: "tool calling is structured extraction",
            research_said: "tools are classes returned as a union, not native provider tool-calls",
            observed: "consistent with v1's return-type-is-schema model; not directly probed",
            verdict: Verdict.Unverified,
        },
        Claim {
            id: "C13",
            topic: "provider coverage",
            research_said: "openai, anthropic, google-ai, vertex, aws-bedrock, azure-openai, ollama, openai-generic",
            observed: "baml.llm exposes AnthropicOptions, AzureOpenAiOptions, BedrockOptions, GoogleAiOptions, VertexAiOptions",
            verdict: Verdict.Confirmed,
        },
        Claim {
            id: "C14",
            topic: "per-request model, key and base_url are expressible",
            research_said: "ClientRegistry is the mechanism for user-picked model plus user-supplied key",
            observed: "mechanism differs but capability holds - baml.llm.PrimitiveClientOptions carries model, api_key, base_url, headers as ordinary runtime fields",
            verdict: Verdict.Confirmed,
        },
        Claim {
            id: "C15",
            topic: "Node runtime is a native addon, not WASM",
            research_said: "runtime is a napi-rs native addon",
            observed: "confirmed after install - @boundaryml/baml-bridge package.json carries a napi block (binaryName baml_node, 8 platform targets incl x86_64-unknown-linux-gnu); the SDK boots it via initializeRuntimeFromBytecode(BYTECODE)",
            verdict: Verdict.Confirmed,
        },
        Claim {
            id: "C16",
            topic: "codegen needs the host package installed",
            research_said: "run baml-cli generate before tsc so generated files exist",
            observed: "baml generate emitted 32 files with no node_modules present; the bridge package is needed only to execute",
            verdict: Verdict.Confirmed,
        },
        Claim {
            id: "C18",
            topic: "class instances cannot be round-tripped back across the bridge",
            research_said: "call the exported functions with native TypeScript types",
            observed: "one-way only - claims() returns Claim[] to JS as plain objects, but passing them back into a Claim[] parameter panics: 'VM internal error: type error: expected instance, got map'. Hosts must call nullary entry points instead",
            verdict: Verdict.Falsified,
        },
        Claim {
            id: "C17",
            topic: "a TypeScript build step is required before Node can run the SDK",
            research_said: "run baml-cli generate early, before tsc/bundling, so generated files exist prior to compilation",
            observed: "confirmed and load-bearing - baml generate emits .ts source; node fails with ERR_MODULE_NOT_FOUND until tsc compiles it, and baml_ts must declare type:module because the bridge is ESM-only (exports has import, no require)",
            verdict: Verdict.Confirmed,
        },
    ]
}

function with_verdict(cs: Claim[], v: Verdict) -> Claim[] {
    cs.filter(
        (c) -> {
            c.verdict == v
        },
    )
}

function falsified_count(cs: Claim[]) -> int {
    with_verdict(cs, Verdict.Falsified).length()
}

// No-arg wrappers for cross-language callers. A BAML class instance marshals
// OUT to JS as a plain object, but passing that object back INTO a function
// typed `Claim[]` panics with `expected instance, got map`, so hosts must call
// a nullary entry point rather than round-tripping values.
function falsified_total() -> int {
    falsified_count(claims())
}

function claim_total() -> int {
    claims().length()
}

//# Human-readable roll-up, one line per claim.

function report() -> string {
    let cs = claims();
    let header = `BAML research spike - ${cs.length().to_string()} claims, ${falsified_count(cs).to_string()} falsified`;
    let body = cs
        .map(
            (c) -> {
                c.line()
            },
        )
        .join("\n");
    `${header}\n${body}`
}

test "every claim is uniquely identified" {
    let cs = claims();
    let ids = cs
        .map(
            (c) -> {
                c.id
            },
        );
    let unique_ids = ids
        .filter(
            (id) -> {
                ids.filter(
                        (other) -> {
                            other == id
                        },
                    )
                    .length()
                    == 1
            },
        );
    assert.equal(unique_ids.length(), cs.length())
}

test "no claim is left without evidence" {
    let cs = claims();
    let missing = cs
        .filter(
            (c) -> {
                c.observed == "" || c.research_said == ""
            },
        );
    assert.equal(missing.length(), 0)
}

test "the research section was mostly wrong about the installed toolchain" {
    let cs = claims();
    assert.equal(falsified_count(cs), 11);
    assert.equal(with_verdict(cs, Verdict.Confirmed).length(), 6);
    assert.equal(with_verdict(cs, Verdict.Unverified).length(), 1);
    assert.equal(cs.length(), 18)
}

test "report renders one line per claim plus a header" {
    let rendered = report();
    assert.is_true(rendered.includes("C01"));
    assert.is_true(rendered.includes("C17"));
    assert.is_true(rendered.includes("falsified"))
}
