import { renderHook } from '@testing-library/react';
import { EModelEndpoint, Tools } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import useCodeWorkspace from '../useCodeWorkspace';

const mockAgentPermissions = jest.fn();
const mockAgentsConfig = jest.fn();
const mockStatus = jest.fn();
const mockAgentsMap = jest.fn();
const mockAccess = jest.fn();
jest.mock('~/hooks/Roles/useHasAccess', () => () => mockAccess());

jest.mock(
  '../useAgentToolPermissions',
  () =>
    (...args: unknown[]) =>
      mockAgentPermissions(...args),
);
jest.mock('../useGetAgentsConfig', () => () => mockAgentsConfig());
jest.mock('~/Providers', () => ({ useAgentsMapContext: () => mockAgentsMap() }));
jest.mock('~/data-provider', () => ({
  useCodeEnvironmentStatusQueries: (...args: unknown[]) => mockStatus(...args),
}));

const conversation = (codeWorkspaces?: TConversation['codeWorkspaces']): TConversation =>
  ({
    conversationId: 'conversation-1',
    endpoint: EModelEndpoint.agents,
    agent_id: 'agent-1',
    codeWorkspaces,
  }) as TConversation;

describe('useCodeWorkspace', () => {
  beforeEach(() => {
    mockAccess.mockReturnValue(true);
    mockAgentPermissions.mockReturnValue({
      tools: [Tools.execute_code],
      agent: {
        id: 'agent-1',
        stateful_code_sessions: true,
        code_environment_id: 'personal-vm',
        tools: [Tools.execute_code],
      },
    });
    mockAgentsMap.mockReturnValue({});
    mockAgentsConfig.mockReturnValue({
      agentsConfig: {
        capabilities: ['execute_code', 'stateful_code_sessions'],
        statefulCodeSessions: {
          environments: [
            {
              id: 'personal-vm',
              name: 'Personal VM',
              type: 'attached',
              baseURL: 'https://code.example.com',
            },
          ],
        },
      },
    });
    mockStatus.mockReturnValue([
      {
        data: {
          environmentId: 'personal-vm',
          status: 'ready',
          statefulWorkspace: true,
          workspaces: [{ id: 'project-a', name: 'Project A' }],
        },
        isLoading: false,
        isError: false,
      },
    ]);
  });

  it.each(['role', 'execute_code', 'stateful_code_sessions'])(
    'does not require a workspace when %s permission is disabled',
    (gate) => {
      if (gate === 'role') mockAccess.mockReturnValue(false);
      else {
        const config = mockAgentsConfig();
        config.agentsConfig.capabilities = config.agentsConfig.capabilities.filter(
          (value: string) => value !== gate,
        );
      }
      const { result } = renderHook(() => useCodeWorkspace(conversation()));
      expect(result.current.required).toBe(false);
      expect(result.current.state).toBe('not_required');
      expect(mockStatus).toHaveBeenLastCalledWith(['personal-vm'], false);
    },
  );

  it('selects one unambiguous initial workspace', () => {
    const { result } = renderHook(() => useCodeWorkspace(conversation()));

    expect(result.current.state).toBe('ready');
    expect(result.current.selections).toEqual([
      { environmentId: 'personal-vm', workspaceId: 'project-a' },
    ]);
    expect(mockStatus).toHaveBeenCalledWith(['personal-vm'], true);
  });

  it.each(['ephemeral', 'openAI__gpt-4o'])('does not block ephemeral agent %s', (agent_id) => {
    mockAgentPermissions.mockReturnValue({});
    const { result } = renderHook(() => useCodeWorkspace({ ...conversation(), agent_id }));
    expect(result.current.required).toBe(false);
    expect(result.current.state).toBe('not_required');
    expect(mockStatus).toHaveBeenLastCalledWith([], false);
  });

  it('still blocks missing saved-agent metadata alongside an ephemeral agent', () => {
    mockAgentPermissions.mockReturnValue({});
    const { result } = renderHook(() =>
      useCodeWorkspace(
        { ...conversation(), agent_id: 'ephemeral' },
        { ...conversation(), agent_id: 'agent_missing' },
      ),
    );
    expect(result.current.required).toBe(true);
    expect(result.current.state).toBe('unavailable');
  });

  it.each([false, undefined])('rejects non-stateful worker support: %s', (statefulWorkspace) => {
    const statuses = mockStatus();
    statuses[0].data.statefulWorkspace = statefulWorkspace;
    const selection = { environmentId: 'personal-vm', workspaceId: 'project-a' };
    const { result } = renderHook(() => useCodeWorkspace(conversation([selection])));
    expect(result.current.state).toBe('unavailable');
    expect(result.current.selections).toBeUndefined();
    expect(result.current.resolveSelections([selection])).toBeUndefined();
  });

  it('requires an explicit choice when several workspaces are advertised', () => {
    mockStatus.mockReturnValue([
      {
        data: {
          environmentId: 'personal-vm',
          status: 'ready',
          statefulWorkspace: true,
          workspaces: [{ id: 'project-a' }, { id: 'project-b' }],
        },
        isLoading: false,
        isError: false,
      },
    ]);

    const { result } = renderHook(() => useCodeWorkspace(conversation()));

    expect(result.current.state).toBe('choose');
    expect(result.current.selections).toBeUndefined();
  });

  it('does not replace a saved workspace that disappeared', () => {
    const saved = { environmentId: 'personal-vm', workspaceId: 'removed-project' };
    const { result } = renderHook(() => useCodeWorkspace(conversation([saved])));

    expect(result.current.state).toBe('missing');
    expect(result.current.selections).toBeUndefined();
    expect(result.current.resolveSelections([saved])).toBeUndefined();
  });

  it('does not reuse a workspace selection after the environment changes', () => {
    const saved = { environmentId: 'old-vm', workspaceId: 'project-a' };
    const { result } = renderHook(() => useCodeWorkspace(conversation([saved])));

    expect(result.current.state).toBe('choose');
    expect(result.current.selections).toBeUndefined();
  });

  it('rejects a status response for a different environment', () => {
    mockStatus.mockReturnValue([
      {
        data: {
          environmentId: 'another-vm',
          status: 'ready',
          statefulWorkspace: true,
          workspaces: [{ id: 'project-a' }],
        },
        isLoading: false,
        isError: false,
      },
    ]);

    const { result } = renderHook(() => useCodeWorkspace(conversation()));

    expect(result.current.state).toBe('unavailable');
    expect(result.current.selections).toBeUndefined();
  });

  it('blocks sending when the agent-selected environment is not accessible', () => {
    mockAgentsConfig.mockReturnValue({
      agentsConfig: {
        capabilities: ['execute_code', 'stateful_code_sessions'],
        statefulCodeSessions: { environments: [] },
      },
    });

    const { result } = renderHook(() => useCodeWorkspace(conversation()));

    expect(result.current.required).toBe(true);
    expect(result.current.state).toBe('unavailable');
    expect(result.current.selections).toBeUndefined();
    expect(mockStatus).toHaveBeenCalledWith([], false);
  });

  it.each(['subagent', 'handoff'])('collects every attached environment through %s', (kind) => {
    const primary = {
      id: 'agent-1',
      stateful_code_sessions: true,
      code_environment_id: 'personal-vm',
      tools: [Tools.execute_code],
      subagents: { enabled: true, agent_ids: ['child'] },
      ...(kind === 'handoff'
        ? {
            subagents: { enabled: false, agent_ids: [] },
            edges: [{ from: 'agent-1', to: 'child', edgeType: 'handoff' }],
          }
        : {}),
    };
    mockAgentPermissions.mockImplementation((id?: string) => ({
      agent: id === 'agent-1' ? primary : undefined,
      tools: id === 'agent-1' ? primary.tools : undefined,
    }));
    mockAgentsMap.mockReturnValue({
      child: {
        id: 'child',
        stateful_code_sessions: true,
        code_environment_id: 'team-vm',
        tools: [Tools.execute_code],
      },
    });
    mockAgentsConfig.mockReturnValue({
      agentsConfig: {
        capabilities: ['execute_code', 'stateful_code_sessions'],
        statefulCodeSessions: {
          environments: [
            { id: 'personal-vm', type: 'attached', baseURL: 'https://one.example.com' },
            { id: 'team-vm', type: 'attached', baseURL: 'https://two.example.com' },
          ],
        },
      },
    });
    mockStatus.mockReturnValue([
      {
        data: {
          environmentId: 'personal-vm',
          status: 'ready',
          statefulWorkspace: true,
          workspaces: [{ id: 'project-a' }],
        },
        isLoading: false,
        isError: false,
      },
      {
        data: {
          environmentId: 'team-vm',
          status: 'ready',
          statefulWorkspace: true,
          workspaces: [{ id: 'project-b' }],
        },
        isLoading: false,
        isError: false,
      },
    ]);

    const { result } = renderHook(() => useCodeWorkspace(conversation()));

    expect(result.current.state).toBe('ready');
    expect(result.current.selections).toEqual([
      { environmentId: 'personal-vm', workspaceId: 'project-a' },
      { environmentId: 'team-vm', workspaceId: 'project-b' },
    ]);
  });
});
