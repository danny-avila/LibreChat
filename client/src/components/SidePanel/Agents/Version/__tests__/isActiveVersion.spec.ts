import { isActiveVersion } from '../isActiveVersion';
import type { AgentState, VersionRecord } from '../VersionPanel';

describe('isActiveVersion', () => {
  const createVersion = (overrides = {}): VersionRecord => ({
    name: 'Test Agent',
    description: 'Test Description',
    instructions: 'Test Instructions',
    artifacts: 'default',
    tools: ['tool1', 'tool2'],
    capabilities: ['capability1', 'capability2'],
    ...overrides,
  });

  const createAgentState = (overrides = {}): AgentState => ({
    name: 'Test Agent',
    description: 'Test Description',
    instructions: 'Test Instructions',
    artifacts: 'default',
    tools: ['tool1', 'tool2'],
    capabilities: ['capability1', 'capability2'],
    ...overrides,
  });

  test('returns true for the first version in versions array when currentAgent is null', () => {
    const versions = [
      createVersion({ name: 'First Version' }),
      createVersion({ name: 'Second Version' }),
    ];

    expect(isActiveVersion(versions[0], null, versions)).toBe(true);
    expect(isActiveVersion(versions[1], null, versions)).toBe(false);
  });

  test('returns true when all fields match exactly', () => {
    const version = createVersion();
    const currentAgent = createAgentState();
    const versions = [version];

    expect(isActiveVersion(version, currentAgent, versions)).toBe(true);
  });

  test('returns false when names do not match', () => {
    const version = createVersion();
    const currentAgent = createAgentState({ name: 'Different Name' });
    const versions = [version];

    expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
  });

  test('returns false when descriptions do not match', () => {
    const version = createVersion();
    const currentAgent = createAgentState({ description: 'Different Description' });
    const versions = [version];

    expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
  });

  test('returns false when instructions do not match', () => {
    const version = createVersion();
    const currentAgent = createAgentState({ instructions: 'Different Instructions' });
    const versions = [version];

    expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
  });

  test('returns false when artifacts do not match', () => {
    const version = createVersion();
    const currentAgent = createAgentState({ artifacts: 'different_artifacts' });
    const versions = [version];

    expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
  });

  test('matches tools regardless of order', () => {
    const version = createVersion({ tools: ['tool1', 'tool2'] });
    const currentAgent = createAgentState({ tools: ['tool2', 'tool1'] });
    const versions = [version];

    expect(isActiveVersion(version, currentAgent, versions)).toBe(true);
  });

  test('returns false when tools arrays have different lengths', () => {
    const version = createVersion({ tools: ['tool1', 'tool2'] });
    const currentAgent = createAgentState({ tools: ['tool1', 'tool2', 'tool3'] });
    const versions = [version];

    expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
  });

  test('returns false when tools do not match', () => {
    const version = createVersion({ tools: ['tool1', 'tool2'] });
    const currentAgent = createAgentState({ tools: ['tool1', 'different'] });
    const versions = [version];

    expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
  });

  test('matches capabilities regardless of order', () => {
    const version = createVersion({ capabilities: ['capability1', 'capability2'] });
    const currentAgent = createAgentState({ capabilities: ['capability2', 'capability1'] });
    const versions = [version];

    expect(isActiveVersion(version, currentAgent, versions)).toBe(true);
  });

  test('returns false when capabilities arrays have different lengths', () => {
    const version = createVersion({ capabilities: ['capability1', 'capability2'] });
    const currentAgent = createAgentState({
      capabilities: ['capability1', 'capability2', 'capability3'],
    });
    const versions = [version];

    expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
  });

  test('returns false when capabilities do not match', () => {
    const version = createVersion({ capabilities: ['capability1', 'capability2'] });
    const currentAgent = createAgentState({ capabilities: ['capability1', 'different'] });
    const versions = [version];

    expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
  });

  describe('edge cases', () => {
    test('handles missing tools arrays', () => {
      const version = createVersion({ tools: undefined });
      const currentAgent = createAgentState({ tools: undefined });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(true);
    });

    test('handles when version has tools but agent does not', () => {
      const version = createVersion({ tools: ['tool1', 'tool2'] });
      const currentAgent = createAgentState({ tools: undefined });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
    });

    test('handles when agent has tools but version does not', () => {
      const version = createVersion({ tools: undefined });
      const currentAgent = createAgentState({ tools: ['tool1', 'tool2'] });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
    });

    test('handles missing capabilities arrays', () => {
      const version = createVersion({ capabilities: undefined });
      const currentAgent = createAgentState({ capabilities: undefined });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(true);
    });

    test('handles when version has capabilities but agent does not', () => {
      const version = createVersion({ capabilities: ['capability1', 'capability2'] });
      const currentAgent = createAgentState({ capabilities: undefined });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
    });

    test('handles when agent has capabilities but version does not', () => {
      const version = createVersion({ capabilities: undefined });
      const currentAgent = createAgentState({ capabilities: ['capability1', 'capability2'] });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
    });

    test('handles null values in fields', () => {
      const version = createVersion({ name: null });
      const currentAgent = createAgentState({ name: null });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(true);
    });

    test('handles empty versions array', () => {
      const version = createVersion();
      const currentAgent = createAgentState();
      const versions = [];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
    });

    test('handles empty arrays for tools', () => {
      const version = createVersion({ tools: [] });
      const currentAgent = createAgentState({ tools: [] });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(true);
    });

    test('handles empty arrays for capabilities', () => {
      const version = createVersion({ capabilities: [] });
      const currentAgent = createAgentState({ capabilities: [] });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(true);
    });

    test('handles missing artifacts field', () => {
      const version = createVersion({ artifacts: undefined });
      const currentAgent = createAgentState({ artifacts: undefined });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(true);
    });

    test('handles when version has artifacts but agent does not', () => {
      const version = createVersion();
      const currentAgent = createAgentState({ artifacts: undefined });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
    });

    test('handles when agent has artifacts but version does not', () => {
      const version = createVersion({ artifacts: undefined });
      const currentAgent = createAgentState();
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(false);
    });

    test('handles empty string for artifacts', () => {
      const version = createVersion({ artifacts: '' });
      const currentAgent = createAgentState({ artifacts: '' });
      const versions = [version];

      expect(isActiveVersion(version, currentAgent, versions)).toBe(true);
    });
  });
});
