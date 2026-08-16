import {
  getResponseSender,
  isEphemeralAgentId,
  parseEphemeralAgentId,
} from 'librechat-data-provider';
import type { Agent, TEndpointOption } from 'librechat-data-provider';

/**
 * Resolves the display name persisted as `message.sender` for a response.
 *
 * Real agents use their own name. Ephemeral agents already carry the resolved
 * label (`modelLabel` → spec label → endpoint `modelDisplayLabel`) encoded in
 * their id by `loadEphemeralAgent`/`loadAddedAgent`, so it is decoded rather
 * than recomputed — keeping the persisted sender identical to what parallel
 * view and the added-convo pill display. `getResponseSender` remains the
 * fallback for label-less agents (model-derived names such as `Claude` or
 * `GPT-5`, family heuristics, `'AI'`).
 */
export function resolveSender({
  agent,
  endpointOption,
}: {
  agent: Partial<Pick<Agent, 'id' | 'name'>>;
  endpointOption: Partial<TEndpointOption>;
}): string {
  if (agent.name != null) {
    return agent.name;
  }
  if (agent.id != null && isEphemeralAgentId(agent.id)) {
    const decoded = parseEphemeralAgentId(agent.id)?.sender;
    if (decoded) {
      return decoded;
    }
  }
  return getResponseSender(endpointOption);
}
