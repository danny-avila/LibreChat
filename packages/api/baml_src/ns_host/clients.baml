// ═══════════════════════════════════════════════════════════════════════════
// Selectable compiled clients.
//
// A client is chosen STATICALLY, by calling the direct generated function that
// binds it. Passing a runtime `llm.Client`, a `PrimitiveClient`, a string, or a
// map through the `client` option panics inside the host execution boundary on
// bridge 0.15.0 (`SdkPanic: expected variant, got string`), so per-request
// routing is a lookup over compiled function pairs instead — see
// `src/baml/manifest.ts`.
//
// Adding a selectable client is one atomic change: this file, the direct
// function in `turn.baml`, the generated artifacts, the manifest, the example
// config, and the test fixtures.
//
// Transport and credentials belong here, not to the LibreChat endpoint config.
// A BAML custom endpoint declares no `apiKey`, `baseURL`, or `headers`; the
// variables below are the authoritative ownership boundary.
//   OPENROUTER_API_KEY       provider credential
//   BAML_OPENROUTER_BASE_URL provider base URL (production:
//                            https://openrouter.ai/api/v1; tests point it at a
//                            loopback fixture so the shipped functions run
//                            unchanged)
// ═══════════════════════════════════════════════════════════════════════════

/// The shared free pool rate-limits hard — an observed 429 carried
/// `retry_after_seconds: 24`. Retrying belongs to the compiled client: the port
/// contract makes transport a rejection, and a rejection ends the turn, so the
/// backoff has to absorb it below the port.
retry_policy FreePoolBackoff {
  max_retries 4
  strategy {
    type exponential_backoff
  }
}

/// The fast pool is smaller and cheaper; it gets a shorter budget so a caller
/// choosing it trades resilience for latency deliberately.
retry_policy FastPoolBackoff {
  max_retries 2
  strategy {
    type exponential_backoff
  }
}

/// OpenRouter is OpenAI-wire-compatible, so the openai provider plus a base_url
/// is the whole configuration.
client OpenRouter {
  provider openai
  retry_policy FreePoolBackoff
  options {
    model "openai/gpt-oss-120b"
    api_key env.OPENROUTER_API_KEY
    base_url env.BAML_OPENROUTER_BASE_URL
  }
}

client OpenRouterFast {
  provider openai
  retry_policy FastPoolBackoff
  options {
    model "openai/gpt-oss-20b"
    api_key env.OPENROUTER_API_KEY
    base_url env.BAML_OPENROUTER_BASE_URL
  }
}
