import { renderHook } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';
import useCodeApprovalMode from '../useCodeApprovalMode';

const mockUseGetAgentsConfig = jest.fn();
const mockUseAgentToolPermissions = jest.fn();
const mockUseAgentsMapContext = jest.fn();

jest.mock('../useGetAgentsConfig', () => () => mockUseGetAgentsConfig());
jest.mock(
  '../useAgentToolPermissions',
  () => (agentId?: string) => mockUseAgentToolPermissions(agentId),
);
jest.mock('~/Providers', () => ({ useAgentsMapContext: () => mockUseAgentsMapContext() }));

const conversation = {
  conversationId: 'conversation-1',
  endpoint: 'agents',
  agent_id: 'agent-1',
  title: 'Code',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  codeApprovalMode: 'acceptEdits',
} as TConversation;

describe('useCodeApprovalMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAgentsMapContext.mockReturnValue({});
    mockUseAgentToolPermissions.mockReturnValue({
      agent: {
        id: 'agent-1',
        tools: ['execute_code'],
        stateful_code_sessions: true,
        code_environment_id: 'mac',
      },
    });
    mockUseGetAgentsConfig.mockReturnValue({
      agentsConfig: {
        statefulCodeSessions: {
          approvalsEnabled: true,
          approvalModes: ['ask', 'acceptEdits'],
          environments: [
            {
              id: 'mac',
              name: 'Mac',
              type: 'attached',
              configSchema: {
                permissions: {
                  fileWrite: { allowed: ['ask', 'allow'], default: 'ask' },
                  commandExecution: { allowed: ['ask'], default: 'ask' },
                },
              },
            },
          ],
        },
      },
    });
  });

  test('returns the selected mode when the attached environment permits it', () => {
    const { result } = renderHook(() => useCodeApprovalMode(conversation));

    expect(result.current).toEqual({
      available: true,
      modes: ['ask', 'acceptEdits'],
      selected: 'acceptEdits',
    });
  });

  test('falls back to ask when a saved mode is no longer permitted', () => {
    mockUseGetAgentsConfig.mockReturnValue({
      agentsConfig: {
        statefulCodeSessions: {
          approvalsEnabled: true,
          approvalModes: ['ask', 'acceptEdits'],
          environments: [
            {
              id: 'mac',
              name: 'Mac',
              type: 'attached',
              configSchema: {
                permissions: { fileWrite: { allowed: ['ask'], default: 'ask' } },
              },
            },
          ],
        },
      },
    });

    const { result } = renderHook(() => useCodeApprovalMode(conversation));

    expect(result.current.selected).toBe('ask');
    expect(result.current.modes).toEqual(['ask']);
  });

  test('omits the mode when approvals are administratively disabled', () => {
    mockUseGetAgentsConfig.mockReturnValue({
      agentsConfig: {
        statefulCodeSessions: {
          approvalsEnabled: false,
          approvalModes: [],
          environments: [{ id: 'mac', name: 'Mac', type: 'attached' }],
        },
      },
    });

    const { result } = renderHook(() => useCodeApprovalMode(conversation));

    expect(result.current).toEqual({ available: false, modes: [], selected: undefined });
  });

  test('requires an affirmative server approval capability', () => {
    mockUseGetAgentsConfig.mockReturnValue({
      agentsConfig: {
        statefulCodeSessions: {
          environments: [{ id: 'mac', name: 'Mac', type: 'attached' }],
        },
      },
    });

    const { result } = renderHook(() => useCodeApprovalMode(conversation));

    expect(result.current).toEqual({ available: false, modes: [], selected: undefined });
  });

  test('keeps ask fail-closed when an older server does not advertise approval modes', () => {
    mockUseGetAgentsConfig.mockReturnValue({
      agentsConfig: {
        statefulCodeSessions: {
          approvalsEnabled: true,
          environments: [{ id: 'mac', name: 'Mac', type: 'attached' }],
        },
      },
    });

    const { result } = renderHook(() => useCodeApprovalMode(conversation));

    expect(result.current).toEqual({ available: false, modes: [], selected: 'ask' });
  });

  test('keeps ask fail-closed while agent metadata is unavailable', () => {
    mockUseAgentToolPermissions.mockReturnValue({ agent: undefined });

    const { result } = renderHook(() => useCodeApprovalMode(conversation));

    expect(result.current).toEqual({ available: false, modes: [], selected: 'ask' });
  });

  test('includes attached subagents while preserving their mandatory asks', () => {
    const primary = {
      id: 'agent-1',
      tools: [],
      stateful_code_sessions: false,
      subagents: { enabled: true, agent_ids: ['child-1', 'child-2'] },
    };
    mockUseAgentToolPermissions.mockReturnValue({ agent: primary });
    mockUseAgentsMapContext.mockReturnValue({
      'child-1': {
        id: 'child-1',
        tools: ['execute_code'],
        stateful_code_sessions: true,
        code_environment_id: 'mac',
      },
      'child-2': {
        id: 'child-2',
        tools: ['execute_code'],
        stateful_code_sessions: true,
        code_environment_id: 'restricted',
      },
    });
    mockUseGetAgentsConfig.mockReturnValue({
      agentsConfig: {
        statefulCodeSessions: {
          approvalsEnabled: true,
          approvalModes: ['ask', 'acceptEdits'],
          environments: [
            {
              id: 'mac',
              name: 'Mac',
              type: 'attached',
              configSchema: {
                permissions: { fileWrite: { allowed: ['ask', 'allow'], default: 'ask' } },
              },
            },
            {
              id: 'restricted',
              name: 'Restricted',
              type: 'attached',
              configSchema: {
                permissions: { fileWrite: { allowed: ['ask'], default: 'ask' } },
              },
            },
          ],
        },
      },
    });

    const { result } = renderHook(() => useCodeApprovalMode(conversation));

    expect(result.current.available).toBe(true);
    expect(result.current.modes).toEqual(['ask', 'acceptEdits']);
  });

  test('includes the active parallel conversation agent', () => {
    const primary = {
      id: 'agent-1',
      tools: [],
      stateful_code_sessions: false,
    };
    const addedAgent = {
      id: 'agent-2',
      tools: ['execute_code'],
      stateful_code_sessions: true,
      code_environment_id: 'mac',
    };
    mockUseAgentToolPermissions.mockImplementation((agentId?: string) => ({
      agent: agentId === 'agent-2' ? addedAgent : primary,
    }));
    const addedConversation = { endpoint: 'agents', agent_id: 'agent-2' } as TConversation;

    const { result } = renderHook(() => useCodeApprovalMode(conversation, addedConversation));

    expect(result.current.available).toBe(true);
    expect(result.current.modes).toEqual(['ask', 'acceptEdits']);
  });

  test('does not traverse disabled subagent configurations', () => {
    mockUseAgentToolPermissions.mockReturnValue({
      agent: {
        id: 'agent-1',
        tools: ['execute_code'],
        stateful_code_sessions: true,
        code_environment_id: 'restricted',
        subagents: { enabled: false, agent_ids: ['child-1'] },
      },
    });
    mockUseAgentsMapContext.mockReturnValue({
      'child-1': {
        id: 'child-1',
        tools: ['execute_code'],
        stateful_code_sessions: true,
        code_environment_id: 'mac',
      },
    });
    mockUseGetAgentsConfig.mockReturnValue({
      agentsConfig: {
        statefulCodeSessions: {
          approvalsEnabled: true,
          approvalModes: ['ask', 'acceptEdits'],
          environments: [
            {
              id: 'mac',
              name: 'Mac',
              type: 'attached',
              configSchema: {
                permissions: { fileWrite: { allowed: ['ask', 'allow'], default: 'ask' } },
              },
            },
            {
              id: 'restricted',
              name: 'Restricted',
              type: 'attached',
              configSchema: {
                permissions: { fileWrite: { allowed: ['ask'], default: 'ask' } },
              },
            },
          ],
        },
      },
    });

    const { result } = renderHook(() => useCodeApprovalMode(conversation));

    expect(result.current.modes).toEqual(['ask']);
    expect(result.current.selected).toBe('ask');
  });
});
