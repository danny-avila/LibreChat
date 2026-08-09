// MINIMAL REPRO — BAML toolchain 0.15.0
//
// Any path that renders `ctx.output_format` for a GENERIC return type panics.
//
//   baml run -e 'Pick$build_request<Weather>("hi")'
//     -> panicked at crates/sys_llm/src/types/output_format.rs:608:17
//        internal error: entered unreachable code: non-data type TypeVar("T", ...)
//        should not reach output_format
//
//   baml run -e 'Pick$parse<Weather>("{\"city\":\"Boston\"}")'   -> works
//   baml run -e 'PickConcrete$build_request("hi")'                -> works

class Weather {
  city: string,
}

/// Generic return type — the type variable is not substituted before
/// `ctx.output_format` is rendered.
function Pick<T>(msg: string) -> T {
  client: "openai/gpt-5-mini"
  prompt: `${ctx.output_format}${role("user")}${msg}`
}

/// Non-generic control — identical prompt, no panic.
function PickConcrete(msg: string) -> Weather {
  client: "openai/gpt-5-mini"
  prompt: `${ctx.output_format}${role("user")}${msg}`
}
