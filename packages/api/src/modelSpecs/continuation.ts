import { EModelEndpoint } from 'librechat-data-provider';
import type { TSpecsConfig } from 'librechat-data-provider';
import { readScheduleFireContext } from '~/schedules/trigger';

interface AgentTriggerModelSpecRequest {
  _isAgentTrigger?: boolean;
  user?: { id?: string; tenantId?: string };
  config?: { modelSpecs?: TSpecsConfig | null };
  body?: Record<string, unknown>;
  resolvedConversation?: {
    user?: string;
    tenantId?: string;
    conversationId: string;
    agent_id?: string;
    spec?: string | null;
  } | null;
}

/** Restore server-started turns without changing the agent already authorized by the route. */
export function restoreAgentTriggerModelSpec(req: AgentTriggerModelSpecRequest): void {
  const { body } = req;
  const modelSpecs = req.config?.modelSpecs;
  if (
    req._isAgentTrigger !== true ||
    body == null ||
    body.spec != null ||
    body.endpoint !== EModelEndpoint.agents ||
    !modelSpecs?.enforce ||
    !modelSpecs.list?.length ||
    typeof body.agent_id !== 'string' ||
    !req.user?.id
  ) {
    return;
  }

  const matchesAgent = (spec: NonNullable<TSpecsConfig['list']>[number]): boolean =>
    spec.preset.endpoint === EModelEndpoint.agents && spec.preset.agent_id === body.agent_id;

  if (body.conversationId != null) {
    // The subagent turn guard resolves this even on the cached authorization path.
    const conversation = req.resolvedConversation;
    if (
      conversation == null ||
      conversation.conversationId !== body.conversationId ||
      conversation.user !== req.user.id ||
      (conversation.tenantId ?? undefined) !== (req.user.tenantId ?? undefined) ||
      conversation.agent_id !== body.agent_id
    ) {
      return;
    }
    const spec = modelSpecs.list.find((entry) => entry.name === conversation.spec);
    if (spec != null && matchesAgent(spec)) {
      body.spec = spec.name;
    }
    return;
  }

  if (readScheduleFireContext(req) == null) {
    return;
  }
  // A schedule has no conversation yet. Never guess between different presets for one agent.
  let selected: string | undefined;
  for (const spec of modelSpecs.list) {
    if (!matchesAgent(spec)) {
      continue;
    }
    if (selected != null) {
      return;
    }
    selected = spec.name;
  }
  if (selected != null) {
    body.spec = selected;
  }
}
