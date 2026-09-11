import { renderHook } from '@testing-library/react';
import { EModelEndpoint, Tools } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import useCodeWorkspace from '../useCodeWorkspace';

const mockAgentPermissions = jest.fn();
const mockAgentsConfig = jest.fn();
const mockStatus = jest.fn();
const mockAgentsMap = jest.fn();
const mockAccess = jest.fn();
const mockPreference = jest.fn();
jest.mock('../workspacePreferences', () => ({
  useWorkspacePreferences: () => ({ get: mockPreference }),
}));
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
    agent_id: 'agent_primary',
    codeWorkspaces,
  }) as TConversation;

describe('useCodeWorkspace', () => {
  beforeEach(() => {
    mockPreference.mockReset();
    mockAccess.mockReturnValue(true);
    mockAgentPermissions.mockReturnValue({
      tools: [Tools.execute_code],
      agent: {
        id: 'agent_primary',
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
    expect(result.current.canSubmit).toBe(true);
    expect(result.current.selections).toEqual([
      { environmentId: 'personal-vm', workspaceId: 'project-a' },
    ]);
    expect(mockStatus).toHaveBeenCalledWith(['personal-vm'], true);
  });

  it('uses an agent default ahead of the last used workspace only for new chats', () => {
    mockStatus()[0].data.workspaces.push({ id: 'project-b', name: 'Project B' });
    mockAgentPermissions().agent.code_workspace_id = 'project-b';
    mockPreference.mockReturnValue('project-a');
    const { result, rerender } = renderHook(
      ({ id }) => useCodeWorkspace({ ...conversation(), conversationId: id }),
      {
        initialProps: { id: 'new' },
      },
    );
    expect(result.current.selections?.[0].workspaceId).toBe('project-b');
    rerender({ id: 'existing' });
    expect(result.current.canSubmit).toBe(false);
  });

  it('uses a valid last choice and preserves an explicit conversation binding', () => {
    mockStatus()[0].data.workspaces.push({ id: 'project-b', name: 'Project B' });
    mockPreference.mockReturnValue('project-b');
    const { result } = renderHook(() =>
      useCodeWorkspace({ ...conversation(), conversationId: 'new' }),
    );
    expect(result.current.selections?.[0].workspaceId).toBe('project-b');
    const saved = [{ environmentId: 'personal-vm', workspaceId: 'project-a' }];
    const existing = renderHook(() =>
      useCodeWorkspace({ ...conversation(saved), conversationId: 'new' }),
    );
    expect(existing.result.current.selections).toEqual(saved);
  });

  it('ignores stale remembered choices but never silently replaces a missing agent default', () => {
    mockPreference.mockReturnValue('gone');
    const { result, rerender } = renderHook(() =>
      useCodeWorkspace({ ...conversation(), conversationId: 'new' }),
    );
    expect(result.current.selections?.[0].workspaceId).toBe('project-a');
    mockAgentPermissions.mockReturnValue({
      ...mockAgentPermissions(),
      agent: { ...mockAgentPermissions().agent, code_workspace_id: 'gone' },
    });
    rerender();
    expect(result.current.state).toBe('missing');
    expect(result.current.canSubmit).toBe(false);
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

  it.each([false, undefined])(
    'selects native roots without runtime sessions: %s',
    (statefulWorkspace) => {
      const statuses = mockStatus();
      statuses[0].data.statefulWorkspace = statefulWorkspace;
      const selection = { environmentId: 'personal-vm', workspaceId: 'project-a' };
      const { result } = renderHook(() => useCodeWorkspace(conversation([selection])));
      expect(result.current.state).toBe('ready');
      expect(result.current.selections).toEqual([selection]);
      expect(result.current.resolveSelections([selection])).toEqual([selection]);
    },
  );

  it('automatically selects a sole native root without runtime sessions', () => {
    mockStatus()[0].data.statefulWorkspace = false;
    const { result } = renderHook(() => useCodeWorkspace(conversation()));
    expect(result.current.state).toBe('ready');
    expect(result.current.selections).toEqual([
      { environmentId: 'personal-vm', workspaceId: 'project-a' },
    ]);
  });

  it.each(['offline', 'starting'])('rejects a native worker that is %s', (status) => {
    Object.assign(mockStatus()[0].data, { status, statefulWorkspace: false });
    const { result } = renderHook(() => useCodeWorkspace(conversation()));
    expect(result.current.state).toBe('unavailable');
    expect(result.current.selections).toBeUndefined();
  });

  it('rejects a ready native worker without advertised roots', () => {
    Object.assign(mockStatus()[0].data, { statefulWorkspace: false, workspaces: undefined });
    const { result } = renderHook(() => useCodeWorkspace(conversation()));
    expect(result.current.state).toBe('unsupported');
    expect(result.current.selections).toBeUndefined();
  });

  it('requires a workspace in full access mode and enables submission after explicit selection', () => {
    mockStatus.mockReturnValue([
      {
        data: {
          environmentId: 'personal-vm',
          status: 'ready',
          statefulWorkspace: true,
          workspaces: [{ id: 'primary' }, { id: 'canary-a' }, { id: 'canary-b' }],
        },
        isLoading: false,
        isError: false,
      },
    ]);

    const initialConversation: TConversation = {
      ...conversation(),
      codeApprovalMode: 'fullAccess',
    };
    const { result, rerender } = renderHook(({ current }) => useCodeWorkspace(current), {
      initialProps: { current: initialConversation },
    });

    expect(result.current.state).toBe('choose');
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.selections).toBeUndefined();
    expect(result.current.resolveSubmission()).toBeUndefined();

    const selection = { environmentId: 'personal-vm', workspaceId: 'canary-a' };
    rerender({ current: { ...initialConversation, codeWorkspaces: [selection] } });

    expect(result.current.state).toBe('ready');
    expect(result.current.canSubmit).toBe(true);
    expect(result.current.resolveSubmission([selection])).toEqual({ codeWorkspaces: [selection] });
  });

  it('submits an explicit selection from several advertised workspaces', () => {
    const selection = { environmentId: 'personal-vm', workspaceId: 'canary-a' };
    mockStatus.mockReturnValue([
      {
        data: {
          environmentId: 'personal-vm',
          status: 'ready',
          workspaces: [{ id: 'primary' }, { id: 'canary-a' }, { id: 'canary-b' }],
        },
        isLoading: false,
        isError: false,
      },
    ]);

    const { result } = renderHook(() => useCodeWorkspace(conversation([selection])));

    expect(result.current.canSubmit).toBe(true);
    expect(result.current.resolveSubmission([selection])).toEqual({
      codeWorkspaces: [selection],
    });
  });

  it('blocks submission while the required worker status is loading', () => {
    mockStatus.mockReturnValue([{ data: undefined, isLoading: true, isError: false }]);

    const { result } = renderHook(() => useCodeWorkspace(conversation()));

    expect(result.current.required).toBe(true);
    expect(result.current.state).toBe('loading');
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.resolveSubmission()).toBeUndefined();
  });

  it('blocks submission while endpoint capabilities are loading', () => {
    mockAgentsConfig.mockReturnValue({ agentsConfig: null, endpointsConfig: undefined });

    const { result } = renderHook(() => useCodeWorkspace(conversation()));

    expect(result.current.required).toBe(true);
    expect(result.current.state).toBe('loading');
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.resolveSubmission()).toBeUndefined();
    expect(mockStatus).toHaveBeenLastCalledWith([], false);
  });

  it('does not replace a saved workspace that disappeared', () => {
    const saved = { environmentId: 'personal-vm', workspaceId: 'removed-project' };
    const { result } = renderHook(() => useCodeWorkspace(conversation([saved])));

    expect(result.current.state).toBe('missing');
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.selections).toBeUndefined();
    expect(result.current.resolveSelections([saved])).toBeUndefined();
  });

  it('does not reuse a workspace selection after the environment changes', () => {
    const saved = { environmentId: 'old-vm', workspaceId: 'project-a' };
    const { result } = renderHook(() => useCodeWorkspace(conversation([saved])));

    expect(result.current.state).toBe('choose');
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.selections).toBeUndefined();
  });

  it('invalidates readiness when current agent metadata changes environments', () => {
    let environmentId = 'personal-vm';
    mockAgentPermissions.mockImplementation((agentId?: string) =>
      agentId == null
        ? {}
        : {
            tools: [Tools.execute_code],
            agent: {
              id: agentId,
              stateful_code_sessions: true,
              code_environment_id: environmentId,
              tools: [Tools.execute_code],
            },
          },
    );
    mockAgentsConfig.mockReturnValue({
      agentsConfig: {
        capabilities: ['execute_code', 'stateful_code_sessions'],
        statefulCodeSessions: {
          environments: [
            { id: 'personal-vm', type: 'attached' },
            { id: 'team-vm', type: 'attached' },
          ],
        },
      },
    });
    mockStatus.mockImplementation((ids: string[]) =>
      ids.map((id) => ({
        data: {
          environmentId: id,
          status: 'ready',
          workspaces: [{ id: id === 'personal-vm' ? 'project-a' : 'project-b' }],
        },
        isLoading: false,
        isError: false,
      })),
    );
    const saved = { environmentId: 'personal-vm', workspaceId: 'project-a' };
    const { result, rerender } = renderHook(() => useCodeWorkspace(conversation([saved])));
    expect(result.current.canSubmit).toBe(true);

    environmentId = 'team-vm';
    rerender();

    expect(result.current.state).toBe('choose');
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.resolveSubmission([saved])).toBeUndefined();
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

  it('does not gate a non-agent conversation', () => {
    const { result } = renderHook(() =>
      useCodeWorkspace({ ...conversation(), endpoint: EModelEndpoint.openAI }),
    );

    expect(result.current.required).toBe(false);
    expect(result.current.state).toBe('not_required');
    expect(result.current.canSubmit).toBe(true);
    expect(result.current.resolveSubmission()).toEqual({});
  });

  it.each(['subagent', 'handoff'])('collects every attached environment through %s', (kind) => {
    const primary = {
      id: 'agent_primary',
      stateful_code_sessions: true,
      code_environment_id: 'personal-vm',
      tools: [Tools.execute_code],
      subagents: { enabled: true, agent_ids: ['child'] },
      ...(kind === 'handoff'
        ? {
            subagents: { enabled: false, agent_ids: [] },
            edges: [{ from: 'agent_primary', to: 'child', edgeType: 'handoff' }],
          }
        : {}),
    };
    mockAgentPermissions.mockImplementation((id?: string) => ({
      agent: id === 'agent_primary' ? primary : undefined,
      tools: id === 'agent_primary' ? primary.tools : undefined,
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
