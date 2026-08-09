// ── Tool surface ─────────────────────────────────────────────────────────────
class WeatherAPI {
    city: string @description("the user's city"),
    time_of_day: string @description("an ISO8601 timestamp"),
}

class SearchAPI {
    query: string @description("the search query"),
}

type ToolCall = WeatherAPI | SearchAPI;

/// Discriminated wrapper. A bare union return cannot be `$parse`d offline
/// ("Unions must be flattened"), so the loop selects through this instead.
class ToolInvocation {
    tool: "weather" | "search" @description("which tool to call"),
    weather: WeatherAPI? @description("arguments when tool=weather"),
    search: SearchAPI? @description("arguments when tool=search"),
}

class ToolTurn {
    tool_name: string,
    arguments_json: string,
    result_json: string,
}

function tool_name(call: ToolCall) -> string {
    match (call) {
        let _w: WeatherAPI => "weather",
        let _s: SearchAPI => "search",
    }
}

function tool_arguments_json(call: ToolCall) -> string {
    match (call) {
        let w: WeatherAPI => `{"city":"${w.city}","time_of_day":"${w.time_of_day}"}`,
        let s: SearchAPI => `{"query":"${s.query}"}`,
    }
}

/// Host-side tool execution stand-in. Takes a class INSTANCE back as a
/// parameter — the in-BAML half of the C18 round-trip question.
function execute_tool(call: ToolCall) -> string {
    match (call) {
        let w: WeatherAPI => `{"temp_f":58,"city":"${w.city}"}`,
        let s: SearchAPI => `{"hits":3,"query":"${s.query}"}`,
    }
}

/// Narrow the wrapper back to the union so the rest of the loop is typed.
function invocation_to_call(inv: ToolInvocation) -> ToolCall throws baml.errors.InvalidArgument {
    if let w: WeatherAPI = inv.weather {
        return w;
    }
    if let s: SearchAPI = inv.search {
        return s;
    }
    throw baml.errors.InvalidArgument { message: `no arguments for tool ${inv.tool}` }
}
