// ── The feedback path ────────────────────────────────────────────────────────

/// The single renderer for prior tool turns. `Answer` interpolates THIS
/// function, so what the offline tests assert is the exact text the model sees
/// — the test and the production prompt cannot drift apart.
function render_transcript(turns: ToolTurn[]) -> string {
    turns
        .map(
            (t) -> {
                `<tool_result name="${t.tool_name}" args=${t.arguments_json}>${t.result_json}</tool_result>`
            },
        )
        .join("\n")
}

/// TURN 1 — model selects a tool.
function SelectTool(user_message: string) -> ToolInvocation {
    client: "openai/gpt-5-mini"
    prompt: `
        Select the tool that answers the user's request.
        ${ctx.output_format}${role("user")}${user_message}
    `
}

/// TURN 2 — the tool result is fed back in and the model answers.
function Answer(user_message: string, turns: ToolTurn[]) -> string {
    client: "openai/gpt-5-mini"
    prompt: `
        You called tools. Use their results to answer the user.
        ${render_transcript(turns)}
        ${role("user")}${user_message}
    `
}

/// One full turn-1 -> execute -> turn-2 cycle, with turn 1 supplied as a canned
/// model output so the whole loop runs offline with no API key.
function loop_offline(user_message: string, turn1_model_output: string) -> string {
    let inv = SelectTool$parse(turn1_model_output);
    let call = invocation_to_call(inv);
    let turns = [
        ToolTurn {
            tool_name: tool_name(call),
            arguments_json: tool_arguments_json(call),
            result_json: execute_tool(call),
        },
    ];
    render_transcript(turns)
}

/// Same cycle against a live model. Needs OPENAI_API_KEY; not run by `baml test`.
function loop_live(user_message: string) -> string {
    let call = invocation_to_call(SelectTool(user_message));
    let turns = [
        ToolTurn {
            tool_name: tool_name(call),
            arguments_json: tool_arguments_json(call),
            result_json: execute_tool(call),
        },
    ];
    Answer(user_message, turns)
}

/// Bridge-safe transcript renderer. A JS host cannot hand BAML a `ToolTurn[]`
/// (arrays of class instances lower to maps — see B3), so the host-driven path
/// passes parallel primitive arrays instead. Same output as `render_transcript`.
function render_transcript_flat(names: string[], args: string[], results: string[]) -> string {
    let out: string[] = [];
    let i = 0;
    while (i < names.length()) {
        let _ = out.push(`<tool_result name="${names[i]}" args=${args[i]}>${results[i]}</tool_result>`);
        i = i + 1;
    }
    out.join("\n")
}
