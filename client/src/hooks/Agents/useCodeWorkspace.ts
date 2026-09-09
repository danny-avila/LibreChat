import { useCallback, useMemo } from 'react';
import { EModelEndpoint, Tools } from 'librechat-data-provider';
import type {
  CodeWorkspaceDescriptor,
  CodeWorkspaceSelection,
  TConfig,
  TConversation,
  TPublicCodeEnvironment,
} from 'librechat-data-provider';
import { useCodeEnvironmentStatusQuery } from '~/data-provider';
import useAgentToolPermissions from './useAgentToolPermissions';
import useGetAgentsConfig from './useGetAgentsConfig';

export type CodeWorkspaceState =
  | 'not_required'
  | 'loading'
  | 'choose'
  | 'ready'
  | 'missing'
  | 'unavailable'
  | 'unsupported';

export interface CodeWorkspaceResult {
  required: boolean;
  state: CodeWorkspaceState;
  environment?: TPublicCodeEnvironment;
  workspaces: CodeWorkspaceDescriptor[];
  selected?: CodeWorkspaceSelection;
  resolveSelection: (selection?: CodeWorkspaceSelection) => CodeWorkspaceSelection | undefined;
}

function findEnvironment(
  environmentId: string | null | undefined,
  environments: TPublicCodeEnvironment[] | undefined,
): TPublicCodeEnvironment | undefined {
  return environmentId
    ? environments?.find(({ id }) => id === environmentId)
    : environments?.find(({ default: isDefault }) => isDefault === true);
}

export default function useCodeWorkspace(conversation: TConversation | null): CodeWorkspaceResult {
  const { agentsConfig } = useGetAgentsConfig();
  const { agent, tools } = useAgentToolPermissions(conversation?.agent_id);
  const statefulCodeSessions = agentsConfig?.statefulCodeSessions as
    | TConfig['statefulCodeSessions']
    | undefined;
  const environment = useMemo(
    () => findEnvironment(agent?.code_environment_id, statefulCodeSessions?.environments),
    [agent?.code_environment_id, statefulCodeSessions?.environments],
  );
  const usesStatefulCode =
    (conversation?.endpointType ?? conversation?.endpoint) === EModelEndpoint.agents &&
    agent?.stateful_code_sessions === true &&
    tools?.includes(Tools.execute_code) === true;
  const required =
    usesStatefulCode &&
    (environment?.type === 'attached' ||
      (typeof agent?.code_environment_id === 'string' &&
        agent.code_environment_id.length > 0 &&
        environment == null));
  const status = useCodeEnvironmentStatusQuery(
    environment?.id ?? '',
    required && environment != null,
  );
  const workspaces = useMemo(
    () =>
      status.data?.status === 'ready' && Array.isArray(status.data.workspaces)
        ? status.data.workspaces
        : [],
    [status.data?.status, status.data?.workspaces],
  );

  const resolveSelection = useCallback(
    (selection?: CodeWorkspaceSelection): CodeWorkspaceSelection | undefined => {
      if (
        !required ||
        environment == null ||
        status.data?.status !== 'ready' ||
        status.data.environmentId !== environment.id
      ) {
        return undefined;
      }
      if (selection != null) {
        if (
          selection.environmentId !== environment.id ||
          !workspaces.some(({ id }) => id === selection.workspaceId)
        ) {
          return undefined;
        }
        return { environmentId: environment.id, workspaceId: selection.workspaceId };
      }
      if (workspaces.length !== 1) return undefined;
      return { environmentId: environment.id, workspaceId: workspaces[0].id };
    },
    [environment, required, status.data?.environmentId, status.data?.status, workspaces],
  );

  const selected = resolveSelection(conversation?.codeWorkspace);
  let state: CodeWorkspaceState = 'not_required';
  if (required) {
    if (environment == null) state = 'unavailable';
    else if (status.isLoading) state = 'loading';
    else if (
      status.isError ||
      status.data?.status !== 'ready' ||
      status.data.environmentId !== environment?.id
    ) {
      state = 'unavailable';
    } else if (status.data.workspaces == null) state = 'unsupported';
    else if (selected != null) state = 'ready';
    else if (conversation?.codeWorkspace != null) state = 'missing';
    else state = 'choose';
  }

  return { required, state, environment, workspaces, selected, resolveSelection };
}
