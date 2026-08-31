import { ErrorTypes } from 'librechat-data-provider';

export const AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE = 'AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE';

export function createStatefulCodeEnvironmentPolicyError(environment: string): Error {
  return Object.assign(
    new Error(`Stateful code environment is not allowed by this deployment: ${environment}`),
    {
      code: ErrorTypes.STATEFUL_CODE_ENVIRONMENT_NOT_ALLOWED,
      status: 403,
      statusCode: 403,
    },
  );
}

export interface FatalAgentInitializationOptions {
  /**
   * Skill `allowed-tools` may add an MCP tool beyond the agent's configured
   * baseline. That union load is allowed to retry without the skill extras;
   * a second failure from the baseline still propagates normally.
   */
  allowExpectedMCPFallback?: boolean;
}

function getErrorCode(error: unknown): unknown {
  if (error == null || typeof error !== 'object') {
    return undefined;
  }
  return (error as { code?: unknown }).code;
}

/**
 * Returns whether agent initialization must abort instead of using the
 * legacy soft-failure behavior for unavailable optional tools or agents.
 * Keep fatal initialization policy centralized here so every topology and
 * ingress path makes the same decision when new invariant errors are added.
 */
export function isFatalAgentInitializationError(
  error: unknown,
  options: FatalAgentInitializationOptions = {},
): boolean {
  const code = getErrorCode(error);
  return (
    code === ErrorTypes.RESOURCE_RECOVERY_REQUIRED ||
    code === ErrorTypes.STATEFUL_CODE_ENVIRONMENT_NOT_ALLOWED ||
    (code === AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE && options.allowExpectedMCPFallback !== true)
  );
}
