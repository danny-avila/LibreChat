import { useCallback, useMemo } from 'react';
import { AgentCapabilities, PermissionTypes, Permissions } from 'librechat-data-provider';
import { EModelEndpoint, Tools, isCodeWorkspaceSelections } from 'librechat-data-provider';
import type {
  CodeWorkspaceDescriptor,
  CodeWorkspaceSelection,
  TConfig,
  TCodeEnvironmentStatusResponse,
  TConversation,
  TPublicCodeEnvironment,
} from 'librechat-data-provider';
import { collectReachableAgents, findExecutionEnvironment } from './useCodeApprovalMode';
import { useCodeEnvironmentStatusQueries } from '~/data-provider';
import useAgentToolPermissions from './useAgentToolPermissions';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import useGetAgentsConfig from './useGetAgentsConfig';
import { useAgentsMapContext } from '~/Providers';

export type CodeWorkspaceState =
  | 'not_required'
  | 'loading'
  | 'choose'
  | 'ready'
  | 'missing'
  | 'unavailable'
  | 'unsupported';

export interface CodeWorkspaceEnvironmentResult {
  environment: TPublicCodeEnvironment;
  state: Exclude<CodeWorkspaceState, 'not_required'>;
  workspaces: CodeWorkspaceDescriptor[];
  selected?: CodeWorkspaceSelection;
}

export interface CodeWorkspaceResult {
  required: boolean;
  state: CodeWorkspaceState;
  environments: CodeWorkspaceEnvironmentResult[];
  selections?: CodeWorkspaceSelection[];
  resolveSelections: (
    selections?: CodeWorkspaceSelection[],
  ) => CodeWorkspaceSelection[] | undefined;
}

function aggregateState(
  required: boolean,
  complete: boolean,
  environments: CodeWorkspaceEnvironmentResult[],
  selections: CodeWorkspaceSelection[] | undefined,
): CodeWorkspaceState {
  if (!required) return 'not_required';
  if (!complete || environments.some(({ state }) => state === 'unavailable')) return 'unavailable';
  if (environments.some(({ state }) => state === 'unsupported')) return 'unsupported';
  if (environments.some(({ state }) => state === 'missing')) return 'missing';
  if (environments.some(({ state }) => state === 'loading')) return 'loading';
  if (selections == null) return 'choose';
  return 'ready';
}

function resolveEnvironmentSelection({
  environment,
  status,
  workspaces,
  stored,
  hasStoredSelections,
}: {
  environment: TPublicCodeEnvironment;
  status?: TCodeEnvironmentStatusResponse;
  workspaces: CodeWorkspaceDescriptor[];
  stored?: CodeWorkspaceSelection;
  hasStoredSelections: boolean;
}): CodeWorkspaceSelection | undefined {
  if (status?.status !== 'ready' || status.environmentId !== environment.id) return undefined;
  if (stored != null && workspaces.some(({ id }) => id === stored.workspaceId)) {
    return { environmentId: environment.id, workspaceId: stored.workspaceId };
  }
  if (!hasStoredSelections && workspaces.length === 1) {
    return { environmentId: environment.id, workspaceId: workspaces[0].id };
  }
  return undefined;
}

export default function useCodeWorkspace(
  conversation: TConversation | null,
  addedConversation?: TConversation | null,
): CodeWorkspaceResult {
  const { agentsConfig } = useGetAgentsConfig();
  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });
  const codeEnabled =
    canRunCode &&
    agentsConfig?.capabilities?.includes(AgentCapabilities.execute_code) === true &&
    agentsConfig.capabilities.includes(AgentCapabilities.stateful_code_sessions);
  const agentsMap = useAgentsMapContext();
  const { agent: primaryAgent } = useAgentToolPermissions(conversation?.agent_id);
  const { agent: addedAgent } = useAgentToolPermissions(addedConversation?.agent_id);
  const statefulCodeSessions = agentsConfig?.statefulCodeSessions as
    | TConfig['statefulCodeSessions']
    | undefined;
  const reachable = useMemo(
    () =>
      collectReachableAgents([primaryAgent, addedAgent], agentsMap, [
        conversation?.agent_id,
        addedConversation?.agent_id,
      ]),
    [addedAgent, agentsMap, primaryAgent, conversation?.agent_id, addedConversation?.agent_id],
  );
  const workspaceMetadata = useMemo(() => {
    const unique = new Map<string, TPublicCodeEnvironment>();
    let complete = true;
    for (const agent of reachable.agents) {
      if (agent.stateful_code_sessions !== true || !agent.tools?.includes(Tools.execute_code)) {
        continue;
      }
      const environment = findExecutionEnvironment(agent, statefulCodeSessions?.environments);
      if (agent.code_environment_id && environment == null) complete = false;
      if (environment?.type === 'attached') unique.set(environment.id, environment);
    }
    return {
      complete,
      environments: [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)),
    };
  }, [reachable.agents, statefulCodeSessions?.environments]);
  const isAgentsConversation =
    (conversation?.endpointType ?? conversation?.endpoint) === EModelEndpoint.agents;
  const expectedRoot = conversation?.agent_id != null || addedConversation?.agent_id != null;
  const attachedEnvironments = workspaceMetadata.environments;
  const metadataComplete =
    !isAgentsConversation || !expectedRoot || (reachable.complete && workspaceMetadata.complete);
  const required =
    codeEnabled && isAgentsConversation && (!metadataComplete || attachedEnvironments.length > 0);
  const statuses = useCodeEnvironmentStatusQueries(
    attachedEnvironments.map(({ id }) => id),
    required && metadataComplete,
  );
  const storedSelections = conversation?.codeWorkspaces;
  const environmentResults = attachedEnvironments.map((environment, index) => {
    const status = statuses[index];
    const workspaces =
      status?.data?.status === 'ready' && Array.isArray(status.data.workspaces)
        ? status.data.workspaces
        : [];
    const stored = storedSelections?.find(({ environmentId }) => environmentId === environment.id);
    const selected = resolveEnvironmentSelection({
      environment,
      status: status?.data,
      workspaces,
      stored,
      hasStoredSelections: storedSelections != null,
    });
    let state: CodeWorkspaceEnvironmentResult['state'] = 'choose';
    if (status == null || status.isLoading) state = 'loading';
    else if (
      status.isError ||
      status.data?.status !== 'ready' ||
      status.data.environmentId !== environment.id
    ) {
      state = 'unavailable';
    } else if (status.data.workspaces == null) state = 'unsupported';
    else if (selected != null) state = 'ready';
    else if (stored != null) state = 'missing';
    return { environment, state, workspaces, selected };
  });

  const resolveSelections = useCallback(
    (selections?: CodeWorkspaceSelection[]): CodeWorkspaceSelection[] | undefined => {
      if (!required || !metadataComplete || !isCodeWorkspaceSelections(selections ?? [])) {
        return undefined;
      }
      const resolved: CodeWorkspaceSelection[] = [];
      for (const result of environmentResults) {
        const requested = selections?.find(
          ({ environmentId }) => environmentId === result.environment.id,
        );
        if (
          requested != null &&
          result.state !== 'loading' &&
          result.state !== 'unavailable' &&
          result.state !== 'unsupported' &&
          result.workspaces.some(({ id }) => id === requested.workspaceId)
        ) {
          resolved.push({
            environmentId: result.environment.id,
            workspaceId: requested.workspaceId,
          });
          continue;
        }
        if (selections == null && result.workspaces.length === 1 && result.state === 'ready') {
          resolved.push({
            environmentId: result.environment.id,
            workspaceId: result.workspaces[0].id,
          });
          continue;
        }
        return undefined;
      }
      return resolved.sort((a, b) => a.environmentId.localeCompare(b.environmentId));
    },
    [environmentResults, metadataComplete, required],
  );

  const selections = resolveSelections(storedSelections);
  const state = aggregateState(required, metadataComplete, environmentResults, selections);
  return { required, state, environments: environmentResults, selections, resolveSelections };
}
