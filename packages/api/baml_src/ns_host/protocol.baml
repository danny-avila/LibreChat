// ═══════════════════════════════════════════════════════════════════════════
// The turn protocol: one schema and one prompt, shared by every direct client
// function so selecting a client cannot change the contract.
//
// Shape follows what the toolloop spike proved, and for the same reasons:
//   selection  -> union declared STATICALLY, inlined in the signature
//                 (a runtime `$types` binding panics in output_format.rs:608)
//   dispatch   -> host reads the literal `tool` field
//                 (a union-typed parameter cannot discriminate a host map)
// ═══════════════════════════════════════════════════════════════════════════

class GetWeather {
    tool: "get_weather",
    city: string @description("the city to look up"),
}

class WebSearch {
    tool: "web_search",
    query: string @description("the search query"),
}

/// One turn is ONE decision: answer, or call tools. Asking once, with both
/// outcomes in the schema, makes "I already have what I need" an expressible
/// answer rather than a negative instruction the model has to remember to obey.
/// `tools` being a list-of-union is what allows parallel tool calls in one turn.
class TurnPlan {
    reply: string? @description("your answer to the user; null when you are calling tools"),
    tools: (GetWeather | WebSearch)[] @description("tools to call; empty when you are answering"),
}

/// The one prompt definition. Every direct client function interpolates this,
/// so two clients differ only by provider model and retry policy — which is
/// exactly what the compiled-runtime acceptance test asserts.
///
/// `allowed_tools` is the caller's CURRENT bound subset, never the compiled
/// superset: a tool that exists in `TurnPlan` but is not bound this turn must
/// not be offered.
function turn_protocol(transcript: string, allowed_tools: string[]) -> string {
    let tools = if allowed_tools.length() == 0 {
        "none — answer directly"
    } else {
        allowed_tools.join(", ")
    };

    `You are answering the user. Decide exactly one of:

1. If the transcript already contains the tool results you need, or no tool is
   required, write your answer in "reply" and leave "tools" empty. Quote the
   concrete values from any tool results.
2. Otherwise leave "reply" null and list the tools to call in "tools".

Never call a tool whose result already appears in the transcript.
Tools you may call this turn: ${tools}

${transcript}`
}
