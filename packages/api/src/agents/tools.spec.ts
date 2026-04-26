/**
 * `@librechat/agents` may ship without the skill-flavored tool definitions on
 * older installed versions. Stub them so `registerCodeExecutionTools` (which
 * consumes only the three exports below) can be exercised deterministically.
 * Mirrors the same pattern used in `__tests__/skills.test.ts`.
 */
jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  ReadFileToolDefinition: {
    name: 'read_file',
    description: 'read file',
    parameters: { type: 'object', properties: {} },
    responseFormat: 'content',
  },
  BashExecutionToolDefinition: {
    name: 'bash_tool',
    description: 'bash',
    schema: { type: 'object', properties: {} },
  },
  /**
   * Deterministic stub mirroring the SDK's `buildBashExecutionToolDescription`:
   * appends an LLM-facing reference-syntax marker only when
   * `enableToolOutputReferences` is true.
   */
  buildBashExecutionToolDescription: ({
    enableToolOutputReferences,
  }: {
    enableToolOutputReferences?: boolean;
  } = {}): string =>
    enableToolOutputReferences === true ? 'bash {{tool<idx>turn<turn>}}' : 'bash',
}));

import type { LCTool, LCToolRegistry } from '@librechat/agents';
import { buildToolSet, BuildToolSetConfig, registerCodeExecutionTools } from './tools';

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

describe('registerCodeExecutionTools', () => {
  const makeRegistry = (): LCToolRegistry => new Map() as unknown as LCToolRegistry;

  describe('fresh run (no pre-existing defs or registry entries)', () => {
    it('registers read_file + bash_tool when includeBash=true', () => {
      const toolRegistry = makeRegistry();
      const result = registerCodeExecutionTools({
        toolRegistry,
        toolDefinitions: [],
        includeBash: true,
      });

      const names = result.toolDefinitions.map((d) => d.name).sort();
      expect(names).toEqual(['bash_tool', 'read_file']);
      expect(result.registered.sort()).toEqual(['bash_tool', 'read_file']);
      expect(toolRegistry.has('read_file')).toBe(true);
      expect(toolRegistry.has('bash_tool')).toBe(true);
    });

    it('registers read_file only when includeBash=false', () => {
      const toolRegistry = makeRegistry();
      const result = registerCodeExecutionTools({
        toolRegistry,
        toolDefinitions: [],
        includeBash: false,
      });

      expect(result.toolDefinitions.map((d) => d.name)).toEqual(['read_file']);
      expect(result.registered).toEqual(['read_file']);
      expect(toolRegistry.has('read_file')).toBe(true);
      expect(toolRegistry.has('bash_tool')).toBe(false);
    });

    it('preserves pre-existing unrelated tool definitions', () => {
      const toolRegistry = makeRegistry();
      const existing: LCTool[] = [
        { name: 'calculator', description: 'calc', parameters: undefined } as LCTool,
      ];
      const result = registerCodeExecutionTools({
        toolRegistry,
        toolDefinitions: existing,
        includeBash: true,
      });

      const names = result.toolDefinitions.map((d) => d.name);
      expect(names).toEqual(['calculator', 'read_file', 'bash_tool']);
    });
  });

  describe('idempotence (second call in same run)', () => {
    it('is a no-op when both tools already live in the registry', () => {
      const toolRegistry = makeRegistry();
      const first = registerCodeExecutionTools({
        toolRegistry,
        toolDefinitions: [],
        includeBash: true,
      });
      /* Second call simulates skills-path + execute_code-path overlap. */
      const second = registerCodeExecutionTools({
        toolRegistry,
        toolDefinitions: first.toolDefinitions,
        includeBash: true,
      });

      expect(second.registered).toEqual([]);
      expect(second.toolDefinitions).toHaveLength(2);
      const names = second.toolDefinitions.map((d) => d.name).sort();
      expect(names).toEqual(['bash_tool', 'read_file']);
    });

    it('is a no-op when tools already live in toolDefinitions (no registry available)', () => {
      const existing: LCTool[] = [
        { name: 'read_file', description: 'pre', parameters: undefined } as LCTool,
        { name: 'bash_tool', description: 'pre', parameters: undefined } as LCTool,
      ];
      const result = registerCodeExecutionTools({
        toolRegistry: undefined,
        toolDefinitions: existing,
        includeBash: true,
      });

      expect(result.registered).toEqual([]);
      expect(result.toolDefinitions).toEqual(existing);
    });

    it('only adds the missing half when one is already registered', () => {
      const toolRegistry = makeRegistry();
      toolRegistry.set('read_file', {
        name: 'read_file',
        description: 'prev',
        parameters: undefined,
      } as LCTool);
      const result = registerCodeExecutionTools({
        toolRegistry,
        toolDefinitions: [],
        includeBash: true,
      });

      expect(result.registered).toEqual(['bash_tool']);
      const names = result.toolDefinitions.map((d) => d.name);
      expect(names).toEqual(['bash_tool']);
      expect(toolRegistry.has('read_file')).toBe(true);
      expect(toolRegistry.has('bash_tool')).toBe(true);
    });
  });

  describe('no-registry variant', () => {
    it('still returns merged toolDefinitions when toolRegistry is undefined', () => {
      const result = registerCodeExecutionTools({
        toolRegistry: undefined,
        toolDefinitions: [],
        includeBash: true,
      });

      const names = result.toolDefinitions.map((d) => d.name).sort();
      expect(names).toEqual(['bash_tool', 'read_file']);
      expect(result.registered.sort()).toEqual(['bash_tool', 'read_file']);
    });
  });

  describe('enableToolOutputReferences', () => {
    const findBashDef = (defs: LCTool[]): LCTool | undefined =>
      defs.find((d) => d.name === 'bash_tool');

    it('appends the {{tool<idx>turn<turn>}} guide when flag is true', () => {
      const result = registerCodeExecutionTools({
        toolRegistry: makeRegistry(),
        toolDefinitions: [],
        includeBash: true,
        enableToolOutputReferences: true,
      });

      const bash = findBashDef(result.toolDefinitions);
      expect(bash?.description).toContain('{{tool<idx>turn<turn>}}');
    });

    it('omits the {{tool<idx>turn<turn>}} guide when flag is false', () => {
      const result = registerCodeExecutionTools({
        toolRegistry: makeRegistry(),
        toolDefinitions: [],
        includeBash: true,
        enableToolOutputReferences: false,
      });

      const bash = findBashDef(result.toolDefinitions);
      expect(bash?.description).not.toContain('{{tool<idx>turn<turn>}}');
    });

    it('omits the guide by default when flag is unspecified', () => {
      const result = registerCodeExecutionTools({
        toolRegistry: makeRegistry(),
        toolDefinitions: [],
        includeBash: true,
      });

      const bash = findBashDef(result.toolDefinitions);
      expect(bash?.description).not.toContain('{{tool<idx>turn<turn>}}');
    });
  });
});
