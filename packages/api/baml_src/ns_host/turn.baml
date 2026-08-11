// ═══════════════════════════════════════════════════════════════════════════
// One direct LLM function per selectable client.
//
// Direct, because a wrapper is not equivalent: wrapping an LLM function in an
// ordinary BAML function yields an `_async` entrypoint but NO `$stream_async`
// entrypoint on bridge 0.15.0, and the chat path needs both. Each function
// below therefore binds its client in the declaration and shares the protocol
// through `turn_protocol` rather than through a wrapper.
//
// Every function has the same declared arguments — `user_message`,
// `transcript`, `allowed_tools` — so `src/baml/manifest.ts` can hold them in
// one homogeneous `{ take, stream }` map keyed by logical client name.
//
// No `retry_policy` or `client` override is ever passed at call time: the
// compiled policy IS the promise, and overriding it is the mechanism that
// panics.
// ═══════════════════════════════════════════════════════════════════════════

function HostTurnOpenRouter(user_message: string, transcript: string, allowed_tools: string[]) -> TurnPlan {
    client: OpenRouter
    prompt: `
        ${turn_protocol(transcript, allowed_tools)}
        ${ctx.output_format}${role("user")}${user_message}
    `
}

function HostTurnOpenRouterFast(user_message: string, transcript: string, allowed_tools: string[]) -> TurnPlan {
    client: OpenRouterFast
    prompt: `
        ${turn_protocol(transcript, allowed_tools)}
        ${ctx.output_format}${role("user")}${user_message}
    `
}
