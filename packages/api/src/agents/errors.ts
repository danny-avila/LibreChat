import {
  ErrorTypes,
  parseLangChainErrorCode,
  stripLangChainTroubleshootingUrl,
} from 'librechat-data-provider';

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

/** Fallback shown when provider error text must not reach the user. */
export const GENERIC_PROVIDER_ERROR = 'An error occurred while processing the request';

/**
 * LangChain error codes we answer with localized copy. Codes absent here keep the provider's own
 * message (minus the docs URL), which is more specific than any generic string we could write.
 */
const LANGCHAIN_ERROR_TYPES: Record<string, ErrorTypes> = {
  MODEL_NOT_FOUND: ErrorTypes.MODEL_NOT_FOUND,
  MODEL_RATE_LIMIT: ErrorTypes.MODEL_RATE_LIMIT,
};

/**
 * Reads LangChain's classification off the error, falling back to the docs URL it stamps into the
 * message so a re-thrown or serialized error still classifies.
 */
export function getLangChainErrorCode(error: unknown): string | undefined {
  if (error == null || typeof error !== 'object') {
    return parseLangChainErrorCode(error);
  }
  const { lc_error_code: code, message } = error as { lc_error_code?: unknown; message?: unknown };
  if (typeof code === 'string' && code.length > 0) {
    return code.toUpperCase();
  }
  return parseLangChainErrorCode(message);
}

/**
 * Typed payload the client localizes for a classified LangChain failure, or `undefined` when the
 * code has no localized copy and the provider's own message should be shown instead.
 */
export function resolveLangChainError(error: unknown): string | undefined {
  const code = getLangChainErrorCode(error);
  const type = code == null ? undefined : LANGCHAIN_ERROR_TYPES[code];
  return type == null ? undefined : JSON.stringify({ type });
}

/**
 * Provider failure text for OpenAI-compatible responses, which carry raw strings rather than the
 * typed payloads the LibreChat client localizes.
 */
export function getUserFacingProviderError(error: unknown, protectionEnabled: boolean): string {
  if (protectionEnabled) {
    return GENERIC_PROVIDER_ERROR;
  }
  if (!(error instanceof Error)) {
    return 'An error occurred';
  }
  return stripLangChainTroubleshootingUrl(error.message) || GENERIC_PROVIDER_ERROR;
}

/**
 * LangGraph's stable machine identifier for "the graph ran out of supersteps".
 * Set as `lc_error_code` on the `GraphRecursionError` thrown by the Pregel loop
 * when `loop.status === 'out_of_steps'`.
 */
const GRAPH_RECURSION_LIMIT_CODE = 'GRAPH_RECURSION_LIMIT';

/** Bounded `cause` walk: a graph error may be rethrown wrapped by an outer node. */
const MAX_CAUSE_DEPTH = 4;

/**
 * Whether `error` is the agent graph exhausting its per-turn step budget
 * (`recursionLimit`), as opposed to anything actually going wrong.
 *
 * This is a normal terminal condition, not a failure: the turn is persisted as
 * `unfinished` with `Constants.TOOL_CALL_LIMIT_FINISH_REASON` so the UI can offer
 * to continue, instead of surfacing a red error bubble the user cannot act on.
 *
 * Both markers are checked because they fail independently. `lc_error_code` is the
 * documented contract but is only present on errors constructed with the fields
 * argument, while `name` is assigned in the constructor body and therefore survives
 * class-name minification. Either one alone is sufficient evidence.
 */
export function isStepLimitError(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current != null; depth++) {
    if (typeof current !== 'object') {
      return false;
    }
    const candidate = current as { lc_error_code?: unknown; name?: unknown; cause?: unknown };
    if (
      candidate.lc_error_code === GRAPH_RECURSION_LIMIT_CODE ||
      candidate.name === 'GraphRecursionError'
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}
