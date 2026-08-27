import type { PluginHookSource } from '~/agents/hooks/source';
import type { ToolApprovalAdmissionAgent } from './admission';
import type { ToolApprovalHook } from './hooks';
import { canAgentGraphPauseForToolApproval } from './admission';

const askHook: ToolApprovalHook = async () => ({ decision: 'ask' });

function pluginSource(
  hasToolApprovalHooks: PluginHookSource['hasToolApprovalHooks'],
): PluginHookSource {
  return {
    hasHooks: () => true,
    hasToolApprovalHooks,
    register: () => 0,
  };
}

describe('canAgentGraphPauseForToolApproval', () => {
  test.each([
    ['configured tool names', { tools: ['read_file'] }, 'read_file'],
    ['loaded tool objects', { tools: [{ name: 'read_file' }] }, 'read_file'],
    ['tool definitions', { toolDefinitions: [{ name: 'read_file' }] }, 'read_file'],
    ['tool registries', { toolRegistry: new Map([['read_file', {}]]) }, 'read_file'],
  ])('discovers %s', (_label, agent, toolName) => {
    expect(
      canAgentGraphPauseForToolApproval({
        policy: { enabled: true, mode: 'bypass', ask: [toolName] },
        agents: [agent],
      }),
    ).toBe(true);
  });

  test('intersects approval policy with the reachable agent tool surface', () => {
    const child: ToolApprovalAdmissionAgent = { tools: ['write_file'] };
    const root: ToolApprovalAdmissionAgent = {
      tools: ['read_file'],
      subagentAgentConfigs: [child],
    };
    expect(
      canAgentGraphPauseForToolApproval({
        policy: { enabled: true, mode: 'bypass', ask: ['write_*'] },
        agents: [root],
      }),
    ).toBe(true);
    expect(
      canAgentGraphPauseForToolApproval({
        policy: { enabled: true, mode: 'bypass', ask: ['delete_*'] },
        agents: [root],
      }),
    ).toBe(false);
  });

  test('matches static and request-scoped rules against MCP aliases', () => {
    const agent: ToolApprovalAdmissionAgent = {
      tools: ['mcp__server__read_file'],
      mcpToolAliases: [{ name: 'mcp__server__read_file', aliasName: 'read_file' }],
    };
    expect(
      canAgentGraphPauseForToolApproval({
        policy: { enabled: true, mode: 'bypass', ask: ['read_file'] },
        agents: [agent],
      }),
    ).toBe(true);
    expect(
      canAgentGraphPauseForToolApproval({
        policy: { enabled: true, mode: 'bypass' },
        agents: [agent],
        resolvedProgrammaticHooks: [{ hook: askHook, matcher: '^read_file$' }],
      }),
    ).toBe(true);
  });

  test('asks deployment hook sources only about concrete runtime tool names', () => {
    const hasToolApprovalHooks = jest.fn(
      (names?: readonly string[]) => names?.includes('write_file') === true,
    );
    expect(
      canAgentGraphPauseForToolApproval({
        policy: { enabled: true, mode: 'bypass' },
        agents: [{ tools: ['read_file', 'write_file'] }],
        pluginHookSource: pluginSource(hasToolApprovalHooks),
      }),
    ).toBe(true);
    expect(hasToolApprovalHooks).toHaveBeenCalledWith(['read_file']);
    expect(hasToolApprovalHooks).toHaveBeenCalledWith(['write_file']);
  });

  test('leaves ask_user_question and disabled approval to their dedicated gates', () => {
    expect(
      canAgentGraphPauseForToolApproval({
        policy: { enabled: true },
        agents: [{ tools: ['ask_user_question'] }],
      }),
    ).toBe(false);
    expect(
      canAgentGraphPauseForToolApproval({
        policy: { enabled: false },
        agents: [{ tools: ['read_file'] }],
        resolvedProgrammaticHooks: [{ hook: askHook }],
        pluginHookSource: pluginSource(() => true),
      }),
    ).toBe(false);
  });
});
