import { buildToolSet, BuildToolSetConfig } from './tools';

describe('buildToolSet', () => {
  describe('event-driven mode (toolDefinitions)', () => {
    it('builds toolSet from toolDefinitions when available', () => {
      const agentConfig: BuildToolSetConfig = {
        toolDefinitions: [
          { name: 'tool_search', description: 'Search for tools' },
          { name: 'list_commits_mcp_github', description: 'List commits' },
          { name: 'calculator', description: 'Calculate' },
        ],
        tools: [],
      };

      const toolSet = buildToolSet(agentConfig);

      expect(toolSet.size).toBe(3);
      expect(toolSet.has('tool_search')).toBe(true);
      expect(toolSet.has('list_commits_mcp_github')).toBe(true);
      expect(toolSet.has('calculator')).toBe(true);
    });

    it('includes tool_search in toolSet for deferred tools workflow', () => {
      const agentConfig: BuildToolSetConfig = {
        toolDefinitions: [
          { name: 'tool_search', description: 'Search for deferred tools' },
          { name: 'deferred_tool_1', description: 'A deferred tool', defer_loading: true },
          { name: 'deferred_tool_2', description: 'Another deferred tool', defer_loading: true },
        ],
      };

      const toolSet = buildToolSet(agentConfig);

      expect(toolSet.has('tool_search')).toBe(true);
      expect(toolSet.has('deferred_tool_1')).toBe(true);
      expect(toolSet.has('deferred_tool_2')).toBe(true);
    });

    it('prefers toolDefinitions over tools when both are present', () => {
      const agentConfig: BuildToolSetConfig = {
        toolDefinitions: [{ name: 'from_definitions' }],
        tools: [{ name: 'from_tools' }],
      };

      const toolSet = buildToolSet(agentConfig);

      expect(toolSet.size).toBe(1);
      expect(toolSet.has('from_definitions')).toBe(true);
      expect(toolSet.has('from_tools')).toBe(false);
    });
  });

  describe('legacy mode (tools)', () => {
    it('falls back to tools when toolDefinitions is empty', () => {
      const agentConfig: BuildToolSetConfig = {
        toolDefinitions: [],
        tools: [{ name: 'web_search' }, { name: 'calculator' }],
      };

      const toolSet = buildToolSet(agentConfig);

      expect(toolSet.size).toBe(2);
      expect(toolSet.has('web_search')).toBe(true);
      expect(toolSet.has('calculator')).toBe(true);
    });

    it('falls back to tools when toolDefinitions is undefined', () => {
      const agentConfig: BuildToolSetConfig = {
        tools: [{ name: 'tool_a' }, { name: 'tool_b' }],
      };

      const toolSet = buildToolSet(agentConfig);

      expect(toolSet.size).toBe(2);
      expect(toolSet.has('tool_a')).toBe(true);
      expect(toolSet.has('tool_b')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns empty set when agentConfig is null', () => {
      const toolSet = buildToolSet(null);
      expect(toolSet.size).toBe(0);
    });

    it('returns empty set when agentConfig is undefined', () => {
      const toolSet = buildToolSet(undefined);
      expect(toolSet.size).toBe(0);
    });

    it('returns empty set when both toolDefinitions and tools are empty', () => {
      const agentConfig: BuildToolSetConfig = {
        toolDefinitions: [],
        tools: [],
      };

      const toolSet = buildToolSet(agentConfig);
      expect(toolSet.size).toBe(0);
    });

    it('filters out null/undefined tool entries', () => {
      const agentConfig: BuildToolSetConfig = {
        tools: [{ name: 'valid_tool' }, null, undefined, { name: 'another_valid' }],
      };

      const toolSet = buildToolSet(agentConfig);

      expect(toolSet.size).toBe(2);
      expect(toolSet.has('valid_tool')).toBe(true);
      expect(toolSet.has('another_valid')).toBe(true);
    });

    it('filters out empty string tool names', () => {
      const agentConfig: BuildToolSetConfig = {
        toolDefinitions: [{ name: 'valid' }, { name: '' }, { name: 'also_valid' }],
      };

      const toolSet = buildToolSet(agentConfig);

      expect(toolSet.size).toBe(2);
      expect(toolSet.has('valid')).toBe(true);
      expect(toolSet.has('also_valid')).toBe(true);
      expect(toolSet.has('')).toBe(false);
    });
  });
});
