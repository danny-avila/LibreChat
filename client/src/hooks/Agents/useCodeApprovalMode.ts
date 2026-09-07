import { useMemo } from 'react';
import {
  EModelEndpoint,
  Tools,
  getAllowedCodeApprovalModes,
  CODE_APPROVAL_MODES,
} from 'librechat-data-provider';
import type { Agent, TAgentsMap, TConfig, TPublicCodeEnvironment } from 'librechat-data-provider';
import type { CodeApprovalMode, TConversation } from 'librechat-data-provider';
import useAgentToolPermissions from './useAgentToolPermissions';
import useGetAgentsConfig from './useGetAgentsConfig';
import { useAgentsMapContext } from '~/Providers';

export default function useCodeApprovalMode(
  conversation: TConversation | null,
  addedConversation?: TConversation | null,
): {
  available: boolean;
  modes: CodeApprovalMode[];
  selected?: CodeApprovalMode;
} {
  const { agentsConfig } = useGetAgentsConfig();
  const agentsMap = useAgentsMapContext();
  const { agent: primaryAgent } = useAgentToolPermissions(conversation?.agent_id);
  const { agent: addedAgent } = useAgentToolPermissions(addedConversation?.agent_id);
  const statefulCodeSessions = agentsConfig?.statefulCodeSessions as
    | TConfig['statefulCodeSessions']
    | undefined;
  const environments = statefulCodeSessions?.environments;
  const attachedEnvironments = useMemo(
    () =>
      collectReachableAgents([primaryAgent, addedAgent], agentsMap)
        .filter(
          (agent) =>
            agent.stateful_code_sessions === true && agent.tools?.includes(Tools.execute_code),
        )
        .map((agent) => findExecutionEnvironment(agent, environments))
        .filter(
          (environment): environment is TPublicCodeEnvironment => environment?.type === 'attached',
        ),
    [addedAgent, agentsMap, environments, primaryAgent],
  );
  const supported =
    (conversation?.endpointType ?? conversation?.endpoint) === EModelEndpoint.agents &&
    statefulCodeSessions?.approvalsEnabled === true;
  const endpointModes = statefulCodeSessions?.approvalModes;
  const available =
    supported && endpointModes?.includes('ask') === true && attachedEnvironments.length > 0;
  const modes = useMemo(() => {
    if (!available) return [];
    const allowed = new Set<CodeApprovalMode>(endpointModes?.includes('ask') ? ['ask'] : []);
    for (const environment of attachedEnvironments) {
      const environmentModes = getAllowedCodeApprovalModes({
        environment: 'attached',
        allowedModes: CODE_APPROVAL_MODES,
        configSchema: environment.configSchema,
        settings: environment.settings,
      });
      if (endpointModes?.includes('acceptEdits') && environmentModes.includes('acceptEdits')) {
        allowed.add('acceptEdits');
      }
    }
    return CODE_APPROVAL_MODES.filter((mode) => allowed.has(mode));
  }, [attachedEnvironments, available, endpointModes]);
  const requested = conversation?.codeApprovalMode ?? 'ask';
  /**
   * Fail closed while agent/environment metadata is incomplete. An affirmative
   * server capability means `ask` is safe to submit even before an attached
   * environment is discoverable; the server ignores it when no BYOM tool is
   * active. Never preserve `acceptEdits` until current policy authorizes it.
   */
  let selected: CodeApprovalMode | undefined;
  if (supported) {
    selected = available && modes.includes(requested) ? requested : 'ask';
  }

  return { available, modes, selected };
}

function findExecutionEnvironment(
  agent: Agent,
  environments?: TPublicCodeEnvironment[],
): TPublicCodeEnvironment | undefined {
  return agent.code_environment_id
    ? environments?.find((candidate) => candidate.id === agent.code_environment_id)
    : environments?.find((candidate) => candidate.default === true);
}

function collectReachableAgents(roots: Array<Agent | undefined>, agentsMap?: TAgentsMap): Agent[] {
  const pending = roots.filter((agent): agent is Agent => agent != null);
  const visited = new Set<string>();
  const agents: Agent[] = [];
  while (pending.length > 0) {
    const agent = pending.pop();
    if (agent == null || visited.has(agent.id)) continue;
    visited.add(agent.id);
    agents.push(agent);
    if (agent.subagents?.enabled !== true) continue;
    const edgeIds = agent.edges?.flatMap((edge) => (Array.isArray(edge.to) ? edge.to : [edge.to]));
    const graphIds = agent.subagents.graphs?.flatMap((graph) => graph.agent_ids);
    const ids = [
      ...(agent.agent_ids ?? []),
      ...(agent.subagents?.agent_ids ?? []),
      ...(edgeIds ?? []),
      ...(graphIds ?? []),
    ];
    for (const id of ids) {
      const candidate = agentsMap?.[id];
      if (candidate != null) pending.push(candidate);
    }
  }
  return agents;
}
