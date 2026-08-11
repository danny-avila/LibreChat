/// Bare-union control. Exists only so a test can pin the `$parse` limitation.
function SelectToolBareUnion(user_message: string) -> ToolCall {
    client: "openai/gpt-5-mini"
    prompt: `${ctx.output_format}${role("user")}${user_message}`
}

/// Single-class control — the `$parse` path that DOES work offline.
function SelectWeatherOnly(user_message: string) -> WeatherAPI {
    client: "openai/gpt-5-mini"
    prompt: `${ctx.output_format}${role("user")}${user_message}`
}

function TURN1_WEATHER() -> string {
    `{"tool":"weather","weather":{"city":"Boston","time_of_day":"2026-08-09T13:00:00Z"},"search":null}`
}

function TURN1_SEARCH() -> string {
    `{"tool":"search","weather":null,"search":{"query":"baml tool calling"}}`
}
