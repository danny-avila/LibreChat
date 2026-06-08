import { MAX_SUBAGENTS } from 'librechat-data-provider';
import type { AgentSubagentsConfig } from 'librechat-data-provider';

export function sanitizeRequestSubagents(
  subagents?: AgentSubagentsConfig | null,
): AgentSubagentsConfig | undefined {
  if (!subagents || typeof subagents !== 'object') {
    return undefined;
  }

  const sanitized: AgentSubagentsConfig = {};
  if (typeof subagents.enabled === 'boolean') {
    sanitized.enabled = subagents.enabled;
  }
  if (typeof subagents.allowSelf === 'boolean') {
    sanitized.allowSelf = subagents.allowSelf;
  }
  if (
    Array.isArray(subagents.agent_ids) &&
    subagents.agent_ids.length <= MAX_SUBAGENTS &&
    subagents.agent_ids.every((agentId) => typeof agentId === 'string')
  ) {
    sanitized.agent_ids = subagents.agent_ids;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
