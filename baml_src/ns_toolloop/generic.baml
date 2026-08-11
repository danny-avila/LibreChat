/// v1 runtime type binding: the return type is a GENERIC parameter, so the host
/// supplies the concrete type (including a UNION built at runtime) via `$types`.
/// This is the seam that replaces v0's TypeBuilder.
function SelectToolGeneric<T>(user_message: string) -> T {
    client: "openai/gpt-5-mini"
    prompt: `${ctx.output_format}${role("user")}${user_message}`
}
