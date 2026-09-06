import type { IAgentFadingTier, IAgentFadingTierEntry } from '~/types/convo';

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

/**
 * Whether a persisted value is a well-formed per-agent tier entry. Agent IDs
 * are server-generated and unbounded (an ephemeral agent's ID encodes its
 * endpoint, model and sender), so only emptiness is rejected.
 */
export function isAgentFadingTierEntry(value: unknown): value is IAgentFadingTierEntry {
  if (!isAgentFadingTier(value)) {
    return false;
  }
  const { agentId } = value as Partial<Record<'agentId', unknown>>;
  return typeof agentId === 'string' && agentId.length > 0;
}

/** Whether a persisted value is a list of per-agent tier entries with unique agent IDs. */
export function isAgentFadingTierEntries(value: unknown): value is IAgentFadingTierEntry[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isAgentFadingTierEntry(entry) || seen.has(entry.agentId)) {
      return false;
    }
    seen.add(entry.agentId);
  }
  return true;
}
