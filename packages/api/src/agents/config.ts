import type { TAgentsEndpoint } from 'librechat-data-provider';

const DEFAULT_RECURSION_LIMIT = 50;

/**
 * Resolves the effective recursion limit for an agent run via a 3-step cascade:
 * 1. YAML endpoint config default (falls back to 50)
 * 2. Per-agent DB override (if set and positive)
 * 3. Global max cap from YAML (if set and positive)
 */
export function resolveRecursionLimit(
  agentsEConfig: TAgentsEndpoint | undefined,
  agent: { recursion_limit?: number } | undefined,
): number {
  let limit = agentsEConfig?.recursionLimit ?? DEFAULT_RECURSION_LIMIT;

  if (typeof agent?.recursion_limit === 'number' && agent.recursion_limit > 0) {
    limit = agent.recursion_limit;
  }

  if (
    typeof agentsEConfig?.maxRecursionLimit === 'number' &&
    agentsEConfig.maxRecursionLimit > 0 &&
    limit > agentsEConfig.maxRecursionLimit
  ) {
    limit = agentsEConfig.maxRecursionLimit;
  }

  return limit;
}
