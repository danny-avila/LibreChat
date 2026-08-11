// ═══════════════════════════════════════════════════════════════════════════
// The host turn surface behind `Providers.BAML` in @librechat/agents.
//
// Separate from ns_toolloop on purpose: that namespace is a spike that pins
// toolchain limitations with negative assertions, and its functions target a
// local capture server. This one is the real thing the host adapter drives.
//
// Shape follows the pattern ns_toolloop proved, and for the same reasons:
//   selection  -> union declared STATICALLY, inlined in the signature
//                 (a runtime `$types` binding panics in output_format.rs:608)
//   dispatch   -> host reads the literal `tool` field
//                 (a union-typed parameter cannot discriminate a host map)
//   feedback   -> parallel primitive arrays
//                 (an array of class instances panics: "expected instance, got map")
// ═══════════════════════════════════════════════════════════════════════════

/// OpenRouter is OpenAI-wire-compatible, so the openai provider plus a base_url
/// is the whole configuration. The key is read from the environment at call
/// time; a missing variable panics on every network path by design.
///
/// The model is a literal rather than `env.OPENROUTER_MODEL` because an unset
/// env option fails the OFFLINE paths too — `$render_prompt` and
/// `$build_request` both raise `missing required option 'model'`, which would
/// make schema fingerprinting depend on the environment. Per-request model
/// selection belongs to the runtime `client` option and is a follow-up.
/// The free pool is shared and rate-limits hard — an observed 429 carried
/// `retry_after_seconds: 24`. Retrying belongs at the client, not in the
/// adapter: a 429 is a transport error, the port contract makes transport a
/// rejection, and a rejection ends the turn. Absorb it below the port.
retry_policy FreePoolBackoff {
  max_retries 4
  strategy {
    type exponential_backoff
  }
}

client OpenRouter {
  provider openai
  retry_policy FreePoolBackoff
  options {
    // A free model, but NOT `openrouter/free`. That id is a router that
    // "selects free models at random", and the pool includes classifiers with
    // no instruction-following: a run routed to
    // nvidia/nemotron-3.5-content-safety:free, which answered "User Safety: safe"
    // and failed the TurnPlan coercion. A tool loop needs a model that can be
    // relied on to emit the schema, so the free model is pinned rather than drawn.
    model "openai/gpt-oss-20b:free"
    api_key env.OPENROUTER_API_KEY
    base_url "https://openrouter.ai/api/v1"
  }
}

class GetWeather {
    tool: "get_weather",
    city: string @description("the city to look up"),
}

class WebSearch {
    tool: "web_search",
    query: string @description("the search query"),
}

/// One turn is ONE decision: answer, or call tools. Splitting it into a
/// "select tools" call followed by an "answer" call is what the first version
/// did, and it does not survive contact with a real model — on turn 2 the
/// selector re-picked the tool whose result was already in the transcript, so
/// the loop never terminated. Asking once, with both outcomes in the schema,
/// makes "I already have what I need" an expressible answer rather than a
/// negative instruction the model has to remember to obey.
///
/// Also halves the round-trips: one provider call per turn, not two.
class TurnPlan {
    reply: string? @description("your answer to the user; null when you are calling tools"),
    tools: (GetWeather | WebSearch)[] @description("tools to call; empty when you are answering"),
}

/// The return type is static, so `${ctx.output_format}` renders a real schema
/// and the live path never reaches the type-var renderer that panics.
/// `tools` being a list-of-union is what allows parallel tool calls in one turn.
function HostTurn(user_message: string, transcript: string) -> TurnPlan {
    client: OpenRouter
    prompt: `
        You are answering the user. Decide exactly one of:

        1. If the transcript already contains the tool results you need, or no
           tool is required, write your answer in "reply" and leave "tools" empty.
           Quote the concrete values from any tool results.
        2. Otherwise leave "reply" null and list the tools to call in "tools".

        Never call a tool whose result already appears in the transcript.

        ${transcript}
        ${ctx.output_format}${role("user")}${user_message}
    `
}

/// Bridge-safe transcript: parallel primitive arrays only. An array of class
/// instances lowers to maps and panics, so the host flattens before crossing.
function host_transcript(names: string[], args: string[], results: string[]) -> string {
    let out: string[] = [];
    let i = 0;
    while (i < names.length()) {
        let _ = out.push(`<tool_result name="${names[i]}" args=${args[i]}>${results[i]}</tool_result>`);
        i = i + 1;
    }
    out.join("\n")
}
