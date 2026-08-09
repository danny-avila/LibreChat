// ── v1 `dynamic`: a prefix inside a test's `type_builder` block ──────────────
// NOT the v0 `@@dynamic` class suffix. `baml describe dynamic` is the source.
// For HOST-side runtime types, see generic.baml + runtime-union-probe.mjs.

class Envelope {
    tool: string @description("the tool to call"),
}

function SelectDynTool(user_message: string) -> Envelope {
    client: "openai/gpt-5-mini"
    prompt: `${ctx.output_format}${role("user")}${user_message}`
}

test TypeBuilderBlock {
    functions: [SelectDynTool],
    type_builder {
        dynamic class Envelope {
            runtime_field: string,
        }
        class RuntimeTool {
            name: string,
        }
    },
    args: {
        user_message: "what's the weather",
    },
}

testset "toolloop_dynamic" {
    test "D1 the static shape parses offline" {
        assert.equal(SelectDynTool$parse(`{"tool":"weather"}`).tool, "weather")
    }
}
