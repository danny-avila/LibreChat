client AnthropicEscape {
  provider anthropic
  options {
    model "claude-sonnet-4-5-20250929"
    api_key "sk-test"
    base_url "http://127.0.0.1:8791"
    headers {
      "anthropic-beta" "prompt-caching-2024-07-31"
    }
    request_body {
      thinking {
        type "enabled"
        budget_tokens 2048
      }
      tool_choice {
        type "auto"
      }
    }
  }
}

function EscapeProbe(user_message: string) -> string {
  client: AnthropicEscape
  prompt: `${role("user")}${user_message}`
}

/// Streaming selection against the local capture server.
function StreamTools(user_message: string) -> (GetWeather | WebSearch | RunCode)[] {
  client: AnthropicEscape
  prompt: `${ctx.output_format}${role("user")}${user_message}`
}
