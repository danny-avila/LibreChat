import type { PluginHookSource } from '~/agents/hooks/source';
import type { ToolApprovalAdmissionAgent } from './admission';
import type { ToolApprovalHook } from './hooks';
import { canAgentGraphPause } from './admission';

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

describe('canAgentGraphPause', () => {
  test.each([
    ['configured tool names', { tools: ['read_file'] }, 'read_file'],
    ['loaded tool objects', { tools: [{ name: 'read_file' }] }, 'read_file'],
    ['tool definitions', { toolDefinitions: [{ name: 'read_file' }] }, 'read_file'],
    ['tool registries', { toolRegistry: new Map([['read_file', {}]]) }, 'read_file'],
  ])('discovers %s', (_label, agent, toolName) => {
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass', ask: [toolName] },
        agents: [agent],
      }),
    ).toBe(true);
  });

  test.each([
    ['initialized children', { subagentAgentConfigs: [{ tools: ['write_file'] }] }],
    ['lazy children', { lazySubagentConfigs: [{ tools: ['write_file'] }] }],
    ['graph members', { subagentGraphConfigs: [{ memberConfigs: [{ tools: ['write_file'] }] }] }],
    ['graph member metadata', { subagentGraphMemberMetadata: [{ tools: ['write_file'] }] }],
  ])('intersects approval policy with %s', (_label, agent) => {
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass', ask: ['write_*'] },
        agents: [agent],
      }),
    ).toBe(true);
  });

  test('fails closed for an unresolved lazy tool surface that could pause', () => {
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass', ask: ['write_*'] },
        agents: [{ lazySubagentConfigs: [{}] }],
      }),
    ).toBe(true);
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass' },
        agents: [{ lazySubagentConfigs: [{}] }],
      }),
    ).toBe(false);
  });

  test('does not match an approval rule outside the reachable tool surface', () => {
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass', ask: ['delete_*'] },
        agents: [{ tools: ['read_file'] }],
      }),
    ).toBe(false);
  });

  test('matches static and request-scoped rules against MCP aliases', () => {
    const agent: ToolApprovalAdmissionAgent = {
      tools: ['mcp__server__read_file'],
      mcpToolAliases: [{ name: 'mcp__server__read_file', aliasName: 'read_file' }],
    };
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass', ask: ['read_file'] },
        agents: [agent],
      }),
    ).toBe(true);
    expect(
      canAgentGraphPause({
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
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass' },
        agents: [{ tools: ['read_file', 'write_file'] }],
        pluginHookSource: pluginSource(hasToolApprovalHooks),
      }),
    ).toBe(true);
    expect(hasToolApprovalHooks).toHaveBeenCalledWith(['read_file']);
    expect(hasToolApprovalHooks).toHaveBeenCalledWith(['write_file']);
  });

  test('classifies top-level ask_user_question unless it is filtered or denied', () => {
    const agents = [{ tools: ['ask_user_question'] }];
    expect(canAgentGraphPause({ policy: undefined, agents })).toBe(true);
    expect(
      canAgentGraphPause({
        policy: { enabled: true, deny: ['ask_*'] },
        agents,
      }),
    ).toBe(false);
    expect(
      canAgentGraphPause({
        policy: { enabled: true },
        agents,
        askUserQuestionAdminDisabled: true,
      }),
    ).toBe(false);
  });

  test('does not promote nested ask_user_question to a parent pause capability', () => {
    expect(
      canAgentGraphPause({
        policy: undefined,
        agents: [{ subagentAgentConfigs: [{ tools: ['ask_user_question'] }] }],
      }),
    ).toBe(false);
  });
});
