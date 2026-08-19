const { EModelEndpoint, AgentCapabilities } = require('librechat-data-provider');

/**
 * Pins the capability-flag derivation that `AgentClient::useMemory` uses when
 * it calls `initializeAgent` for the memory-extraction agent. The expression
 * is trivial but lives in a controller path that's otherwise hard to unit-
 * test, so a focused regression guard at the pure-logic layer ensures any
 * drift in config-key names (`agents`, `capabilities`) or capability enum
 * values (`execute_code`) surfaces here instead of silently stripping
 * `bash_tool` + `read_file` from memory agents in production.
 *
 * The expression mirrored below is the one in
 * `api/server/controllers/agents/client.js::useMemory`:
 *
 *   new Set(appConfig?.endpoints?.[EModelEndpoint.agents]?.capabilities)
 *     .has(AgentCapabilities.execute_code)
 */
function deriveMemoryCodeEnvAvailable(appConfig) {
  return new Set(appConfig?.endpoints?.[EModelEndpoint.agents]?.capabilities).has(
    AgentCapabilities.execute_code,
  );
}

describe('AgentClient::useMemory — codeEnvAvailable derivation', () => {
  it('returns true when appConfig lists execute_code under the agents endpoint capabilities', () => {
    expect(
      deriveMemoryCodeEnvAvailable({
        endpoints: {
          [EModelEndpoint.agents]: {
            capabilities: [AgentCapabilities.execute_code, AgentCapabilities.file_search],
          },
        },
      }),
    ).toBe(true);
  });

  it('returns false when the agents endpoint omits execute_code', () => {
    expect(
      deriveMemoryCodeEnvAvailable({
        endpoints: {
          [EModelEndpoint.agents]: {
            capabilities: [AgentCapabilities.file_search, AgentCapabilities.web_search],
          },
        },
      }),
    ).toBe(false);
  });

  it('returns false when the capabilities array is absent', () => {
    expect(deriveMemoryCodeEnvAvailable({ endpoints: { [EModelEndpoint.agents]: {} } })).toBe(
      false,
    );
  });

  it('returns false when the agents endpoint config is absent', () => {
    expect(deriveMemoryCodeEnvAvailable({ endpoints: {} })).toBe(false);
  });

  it('returns false when appConfig is null / undefined', () => {
    /* Defensive — `req.config` can be unset in edge-case test harnesses and
       ephemeral-agent flows; the memory path must not throw on access. */
    expect(deriveMemoryCodeEnvAvailable(null)).toBe(false);
    expect(deriveMemoryCodeEnvAvailable(undefined)).toBe(false);
  });

  it('matches the literal string "execute_code" — catches enum rename drift', () => {
    /* Pins the capability enum value so a rename of `AgentCapabilities.execute_code`
       that doesn't propagate to the controllers surfaces here. If this test breaks,
       update the underlying expression in `useMemory` and the helpers in
       `initialize.js` / `openai.js` / `responses.js` to match. */
    expect(AgentCapabilities.execute_code).toBe('execute_code');
    expect(EModelEndpoint.agents).toBe('agents');
  });
});
