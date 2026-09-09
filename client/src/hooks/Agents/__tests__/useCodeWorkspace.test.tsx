import { renderHook } from '@testing-library/react';
import { EModelEndpoint, Tools } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import useCodeWorkspace from '../useCodeWorkspace';

const mockAgentPermissions = jest.fn();
const mockAgentsConfig = jest.fn();
const mockStatus = jest.fn();

jest.mock(
  '../useAgentToolPermissions',
  () =>
    (...args: unknown[]) =>
      mockAgentPermissions(...args),
);
jest.mock('../useGetAgentsConfig', () => () => mockAgentsConfig());
jest.mock('~/data-provider', () => ({
  useCodeEnvironmentStatusQuery: (...args: unknown[]) => mockStatus(...args),
}));

const conversation = (codeWorkspace?: TConversation['codeWorkspace']): TConversation =>
  ({
    conversationId: 'conversation-1',
    endpoint: EModelEndpoint.agents,
    agent_id: 'agent-1',
    codeWorkspace,
  }) as TConversation;

describe('useCodeWorkspace', () => {
  beforeEach(() => {
    mockAgentPermissions.mockReturnValue({
      tools: [Tools.execute_code],
      agent: {
        id: 'agent-1',
        stateful_code_sessions: true,
        code_environment_id: 'personal-vm',
        tools: [Tools.execute_code],
      },
    });
    mockAgentsConfig.mockReturnValue({
      agentsConfig: {
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
    mockStatus.mockReturnValue({
      data: {
        environmentId: 'personal-vm',
        status: 'ready',
        workspaces: [{ id: 'project-a', name: 'Project A' }],
      },
      isLoading: false,
      isError: false,
    });
  });

  it('selects one unambiguous initial workspace', () => {
    const { result } = renderHook(() => useCodeWorkspace(conversation()));

    expect(result.current.state).toBe('ready');
    expect(result.current.selected).toEqual({
      environmentId: 'personal-vm',
      workspaceId: 'project-a',
    });
    expect(mockStatus).toHaveBeenCalledWith('personal-vm', true);
  });

  it('requires an explicit choice when several workspaces are advertised', () => {
    mockStatus.mockReturnValue({
      data: {
        environmentId: 'personal-vm',
        status: 'ready',
        workspaces: [{ id: 'project-a' }, { id: 'project-b' }],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCodeWorkspace(conversation()));

    expect(result.current.state).toBe('choose');
    expect(result.current.selected).toBeUndefined();
  });

  it('does not replace a saved workspace that disappeared', () => {
    const saved = { environmentId: 'personal-vm', workspaceId: 'removed-project' };
    const { result } = renderHook(() => useCodeWorkspace(conversation(saved)));

    expect(result.current.state).toBe('missing');
    expect(result.current.selected).toBeUndefined();
    expect(result.current.resolveSelection(saved)).toBeUndefined();
  });

  it('does not reuse a workspace selection after the environment changes', () => {
    const saved = { environmentId: 'old-vm', workspaceId: 'project-a' };
    const { result } = renderHook(() => useCodeWorkspace(conversation(saved)));

    expect(result.current.state).toBe('missing');
    expect(result.current.selected).toBeUndefined();
  });

  it('rejects a status response for a different environment', () => {
    mockStatus.mockReturnValue({
      data: {
        environmentId: 'another-vm',
        status: 'ready',
        workspaces: [{ id: 'project-a' }],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useCodeWorkspace(conversation()));

    expect(result.current.state).toBe('unavailable');
    expect(result.current.selected).toBeUndefined();
  });

  it('blocks sending when the agent-selected environment is not accessible', () => {
    mockAgentsConfig.mockReturnValue({
      agentsConfig: { statefulCodeSessions: { environments: [] } },
    });

    const { result } = renderHook(() => useCodeWorkspace(conversation()));

    expect(result.current.required).toBe(true);
    expect(result.current.state).toBe('unavailable');
    expect(result.current.selected).toBeUndefined();
    expect(mockStatus).toHaveBeenCalledWith('', false);
  });
});
