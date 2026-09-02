import type { IAgentFadingTier } from '~/types/convo';

/** Version of the persisted context-fading tier shape; must match `@librechat/agents`. */
export const AGENT_FADING_TIER_VERSION = 1;

/** Whether a persisted value is a well-formed context-fading tier. */
export function isAgentFadingTier(value: unknown): value is IAgentFadingTier {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { v, budgetTokens, masked } = value as Partial<Record<keyof IAgentFadingTier, unknown>>;
  return (
    v === AGENT_FADING_TIER_VERSION &&
    typeof budgetTokens === 'number' &&
    Number.isFinite(budgetTokens) &&
    budgetTokens > 0 &&
    typeof masked === 'boolean'
  );
}
