// ═══════════════════════════════════════════════════════════════════════════
// The workaround pattern: a FIXED tool set declared in .baml (so the live path
// renders a real schema and never touches the panicking type-var renderer),
// plus `$types` used ONLY on `$parse`, where runtime binding already works.
//
//   selection  -> static return type   -> $build_request / live call   ✅
//   narrowing  -> $types on $parse     -> { list: { union: [subset] } } ✅
//   feedback   -> primitives only      -> render_transcript_flat        ✅
//
// Each tool carries a literal `tool` discriminator: the rendered schema is a
// structural `{...} or {...}` with no type names, so without one the host
// cannot tell which tool the model picked.
// ═══════════════════════════════════════════════════════════════════════════

class GetWeather {
    tool: "get_weather",
    city: string @description("the city to look up"),
}

class WebSearch {
    tool: "web_search",
    query: string @description("the search query"),
}

class RunCode {
    tool: "run_code",
    language: "python" | "typescript" @description("the language to run"),
    source: string @description("the program to execute"),
}

/// The bound tool set, fixed at build time — the constraint we accepted.
///
/// NOTE: this alias is for signatures that do NOT need `$parse`. Codegen does
/// not emit a `$stream` companion for a type alias, so an LLM function whose
/// return type is the alias fails at parse time with
/// `Unknown type alias: …BoundTool$stream`. LLM functions inline the union.
type BoundTool = GetWeather | WebSearch | RunCode;

/// TURN 1 — selection. The return type is STATIC, so `${ctx.output_format}`
/// renders normally and `$build_request` does not hit the type-var panic.
/// A list-of-union gives parallel tool calls.
function SelectTools(
    user_message: string,
    transcript: string,
) -> (GetWeather | WebSearch | RunCode)[] {
    client: "openai/gpt-5-mini"
    prompt: `
        Select the tools that answer the user's request. Return an empty array if none apply.
        ${transcript}
        ${ctx.output_format}${role("user")}${user_message}
    `
}

/// TURN 2 — the tool results are fed back and the model answers.
function AnswerWithTools(user_message: string, transcript: string) -> string {
    client: "openai/gpt-5-mini"
    prompt: `
        Use the tool results to answer the user.
        ${transcript}
        ${role("user")}${user_message}
    `
}

/// BAML-INTERNAL ONLY. Do not call from a TypeScript host: a host value arrives
/// as a map, and a union-typed parameter cannot discriminate a map — it coerces
/// into the FIRST variant and throws `Missing field ... in external Instance`.
/// From the host, read the literal `tool` field directly (see provider-pattern.mjs).
function tool_of(call: BoundTool) -> string {
    match (call) {
        let g: GetWeather => g.tool,
        let w: WebSearch => w.tool,
        let r: RunCode => r.tool,
    }
}

/// Bridge-safe transcript: parallel primitive arrays, never an array of
/// instances (which lowers to maps and panics — see bridge-loop.mjs B3).
function build_transcript(names: string[], args: string[], results: string[]) -> string {
    let out: string[] = [];
    let i = 0;
    while (i < names.length()) {
        let _ = out.push(`<tool_result name="${names[i]}" args=${args[i]}>${results[i]}</tool_result>`);
        i = i + 1;
    }
    out.join("\n")
}
