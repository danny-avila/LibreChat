import { ErrorTypes } from 'librechat-data-provider';
import { AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE, isFatalAgentInitializationError } from './errors';

describe('isFatalAgentInitializationError', () => {
  it.each([
    ErrorTypes.RESOURCE_RECOVERY_REQUIRED,
    ErrorTypes.STATEFUL_CODE_ENVIRONMENT_NOT_ALLOWED,
    AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE,
  ])('classifies %s as fatal', (code) => {
    expect(isFatalAgentInitializationError({ code })).toBe(true);
  });

  it('allows skill-added MCP tools to fall back while keeping resource recovery fatal', () => {
    const options = { allowExpectedMCPFallback: true };
    expect(
      isFatalAgentInitializationError({ code: AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE }, options),
    ).toBe(false);
    expect(
      isFatalAgentInitializationError({ code: ErrorTypes.RESOURCE_RECOVERY_REQUIRED }, options),
    ).toBe(true);
  });

  it.each([undefined, null, new Error('optional tool failed'), { code: 'OPTIONAL_TOOL_FAILED' }])(
    'keeps non-fatal failures eligible for legacy soft handling',
    (error) => {
      expect(isFatalAgentInitializationError(error)).toBe(false);
    },
  );
});
