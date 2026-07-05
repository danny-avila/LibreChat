import { AgentCapabilities, ArtifactModes } from 'librechat-data-provider';
import type { AgentItem } from '../types';
import { makePlugin, makeSkill, makeMcpServer, makeAction } from 'test/itemFactories';
import { computeToggleAction, skillsEnabledTransition } from '../mutations';

const builtinCode: AgentItem = {
  kind: 'builtin',
  id: 'execute_code',
  name: 'Code',
  description: '',
  iconKey: 'execute_code',
};

const builtinArtifacts: AgentItem = {
  kind: 'builtin',
  id: 'artifacts',
  name: 'Art',
  description: '',
  iconKey: 'artifacts',
};

const tool: AgentItem = {
  kind: 'tool',
  id: 'dalle',
  name: 'DALL-E',
  description: '',
  iconKey: 'tool',
  plugin: makePlugin({ pluginKey: 'dalle' }),
};

const skill: AgentItem = {
  kind: 'skill',
  id: 's1',
  name: 'Skill',
  description: '',
  iconKey: 'skill',
  skill: makeSkill({ _id: 's1' }),
};

const mcp: AgentItem = {
  kind: 'mcp',
  id: 'srv',
  name: 'srv',
  description: '',
  iconKey: 'mcp',
  server: makeMcpServer({ serverName: 'srv' }),
  toolCount: 0,
};

const action: AgentItem = {
  kind: 'action',
  id: 'a1',
  name: 'A1',
  description: '',
  iconKey: 'action',
  action: makeAction({ action_id: 'a1', agent_id: 'agt' }),
  endpointCount: 1,
};

describe('computeToggleAction', () => {
  test('toggling execute_code on writes the boolean flag', () => {
    expect(computeToggleAction(builtinCode, { selected: false })).toEqual({
      type: 'builtin',
      field: AgentCapabilities.execute_code,
      value: true,
    });
  });

  test('toggling execute_code off writes false', () => {
    expect(computeToggleAction(builtinCode, { selected: true })).toEqual({
      type: 'builtin',
      field: AgentCapabilities.execute_code,
      value: false,
    });
  });

  test('toggling artifacts on writes the default mode', () => {
    expect(computeToggleAction(builtinArtifacts, { selected: false })).toEqual({
      type: 'builtin',
      field: AgentCapabilities.artifacts,
      value: ArtifactModes.DEFAULT,
    });
  });

  test('toggling artifacts off writes empty string', () => {
    expect(computeToggleAction(builtinArtifacts, { selected: true })).toEqual({
      type: 'builtin',
      field: AgentCapabilities.artifacts,
      value: '',
    });
  });

  test('toggling a tool emits a tools-array patch', () => {
    expect(computeToggleAction(tool, { selected: false })).toEqual({
      type: 'tool-add',
      id: 'dalle',
    });
    expect(computeToggleAction(tool, { selected: true })).toEqual({
      type: 'tool-remove',
      id: 'dalle',
    });
  });

  test('toggling a skill emits a skills-array patch', () => {
    expect(computeToggleAction(skill, { selected: false })).toEqual({
      type: 'skill-add',
      id: 's1',
    });
  });

  test('toggling an MCP server emits add/remove patches keyed by server name', () => {
    expect(computeToggleAction(mcp, { selected: false })).toEqual({
      type: 'mcp-add',
      serverName: 'srv',
    });
    expect(computeToggleAction(mcp, { selected: true })).toEqual({
      type: 'mcp-remove',
      serverName: 'srv',
    });
  });

  test('toggling an action emits add/remove patches keyed by action id', () => {
    expect(computeToggleAction(action, { selected: false })).toEqual({
      type: 'action-add',
      actionId: 'a1',
    });
    expect(computeToggleAction(action, { selected: true })).toEqual({
      type: 'action-remove',
      actionId: 'a1',
    });
  });
});

describe('skillsEnabledTransition', () => {
  test('adding the first skill turns the master flag on', () => {
    expect(skillsEnabledTransition([], ['s1'], undefined)).toBe(true);
    expect(skillsEnabledTransition([], ['s1'], false)).toBe(true);
  });

  test('adding the first skill leaves an already-on flag alone', () => {
    expect(skillsEnabledTransition([], ['s1'], true)).toBeUndefined();
  });

  test('removing the last skill turns the master flag off', () => {
    expect(skillsEnabledTransition(['s1'], [], true)).toBe(false);
  });

  test('removing the last skill leaves an off flag alone', () => {
    expect(skillsEnabledTransition(['s1'], [], false)).toBeUndefined();
    expect(skillsEnabledTransition(['s1'], [], undefined)).toBeUndefined();
  });

  test('edits within a non-empty selection never touch the flag', () => {
    expect(skillsEnabledTransition(['s1'], ['s1', 's2'], true)).toBeUndefined();
    expect(skillsEnabledTransition(['s1'], ['s1', 's2'], false)).toBeUndefined();
    expect(skillsEnabledTransition(['s1', 's2'], ['s1'], true)).toBeUndefined();
    expect(skillsEnabledTransition(['s1', 's2'], ['s1'], false)).toBeUndefined();
  });
});
