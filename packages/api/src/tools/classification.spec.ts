import {
  parseToolList,
  toolMatchesPatterns,
  getServerNameFromTool,
  buildToolRegistryFromEnv,
  buildToolRegistryFromAgentOptions,
  buildToolClassification,
  agentHasDeferredTools,
  agentHasProgrammaticTools,
  isAgentAllowedForClassification,
} from './classification';
import type { ToolDefinition, LCToolRegistry } from './classification';
import type { GenericTool } from '@librechat/agents';
import type { AgentToolOptions } from 'librechat-data-provider';

describe('classification.ts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear classification-related env vars
    delete process.env.TOOL_PROGRAMMATIC_ONLY;
    delete process.env.TOOL_PROGRAMMATIC_ONLY_EXCLUDE;
    delete process.env.TOOL_DUAL_CONTEXT;
    delete process.env.TOOL_DUAL_CONTEXT_EXCLUDE;
    delete process.env.TOOL_DEFERRED;
    delete process.env.TOOL_DEFERRED_EXCLUDE;
    delete process.env.TOOL_CLASSIFICATION_AGENT_IDS;
    delete process.env.TOOL_CLASSIFICATION_FROM_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('parseToolList', () => {
    it('should return empty set for undefined input', () => {
      const result = parseToolList(undefined);
      expect(result.size).toBe(0);
    });

    it('should return empty set for empty string', () => {
      const result = parseToolList('');
      expect(result.size).toBe(0);
    });

    it('should return empty set for whitespace-only string', () => {
      const result = parseToolList('   ');
      expect(result.size).toBe(0);
    });

    it('should parse comma-separated tool names', () => {
      const result = parseToolList('tool1,tool2,tool3');
      expect(result.size).toBe(3);
      expect(result.has('tool1')).toBe(true);
      expect(result.has('tool2')).toBe(true);
      expect(result.has('tool3')).toBe(true);
    });

    it('should trim whitespace from tool names', () => {
      const result = parseToolList('  tool1  ,  tool2  ');
      expect(result.size).toBe(2);
      expect(result.has('tool1')).toBe(true);
      expect(result.has('tool2')).toBe(true);
    });

    it('should filter out empty entries', () => {
      const result = parseToolList('tool1,,tool2,,,tool3');
      expect(result.size).toBe(3);
    });
  });

  describe('getServerNameFromTool', () => {
    it('should extract server name from MCP tool name', () => {
      const result = getServerNameFromTool('list_files_mcp_Google-Workspace');
      expect(result).toBe('Google-Workspace');
    });

    it('should return undefined for non-MCP tool', () => {
      const result = getServerNameFromTool('simple_tool');
      expect(result).toBeUndefined();
    });

    it('should handle multiple delimiters', () => {
      const result = getServerNameFromTool('some_tool_mcp_Server_Name');
      expect(result).toBe('Server_Name');
    });
  });

  describe('toolMatchesPatterns', () => {
    it('should return true for exact match', () => {
      const patterns = new Set(['tool1', 'tool2']);
      const excludes = new Set<string>();
      expect(toolMatchesPatterns('tool1', patterns, excludes)).toBe(true);
    });

    it('should return false for non-matching tool', () => {
      const patterns = new Set(['tool1', 'tool2']);
      const excludes = new Set<string>();
      expect(toolMatchesPatterns('tool3', patterns, excludes)).toBe(false);
    });

    it('should return false when tool is in excludes', () => {
      const patterns = new Set(['tool1', 'tool2']);
      const excludes = new Set(['tool1']);
      expect(toolMatchesPatterns('tool1', patterns, excludes)).toBe(false);
    });

    it('should match server-wide pattern', () => {
      const patterns = new Set(['sys__all__sys_mcp_Google-Workspace']);
      const excludes = new Set<string>();
      expect(toolMatchesPatterns('list_files_mcp_Google-Workspace', patterns, excludes)).toBe(true);
    });

    it('should respect excludes for server-wide patterns', () => {
      const patterns = new Set(['sys__all__sys_mcp_Google-Workspace']);
      const excludes = new Set(['list_files_mcp_Google-Workspace']);
      expect(toolMatchesPatterns('list_files_mcp_Google-Workspace', patterns, excludes)).toBe(
        false,
      );
    });
  });

  describe('buildToolRegistryFromEnv', () => {
    it('should set defer_loading based on TOOL_DEFERRED env var', () => {
      process.env.TOOL_DEFERRED = 'tool1,tool2';

      const tools: ToolDefinition[] = [
        { name: 'tool1', description: 'Tool 1' },
        { name: 'tool2', description: 'Tool 2' },
        { name: 'tool3', description: 'Tool 3' },
      ];

      const registry = buildToolRegistryFromEnv(tools);

      expect(registry.get('tool1')?.defer_loading).toBe(true);
      expect(registry.get('tool2')?.defer_loading).toBe(true);
      expect(registry.get('tool3')?.defer_loading).toBe(false);
    });

    it('should respect TOOL_DEFERRED_EXCLUDE', () => {
      process.env.TOOL_DEFERRED = 'sys__all__sys_mcp_TestServer';
      process.env.TOOL_DEFERRED_EXCLUDE = 'tool2_mcp_TestServer';

      const tools: ToolDefinition[] = [
        { name: 'tool1_mcp_TestServer', description: 'Tool 1' },
        { name: 'tool2_mcp_TestServer', description: 'Tool 2' },
      ];

      const registry = buildToolRegistryFromEnv(tools);

      expect(registry.get('tool1_mcp_TestServer')?.defer_loading).toBe(true);
      expect(registry.get('tool2_mcp_TestServer')?.defer_loading).toBe(false);
    });

    it('should set allowed_callers based on TOOL_PROGRAMMATIC_ONLY', () => {
      process.env.TOOL_PROGRAMMATIC_ONLY = 'tool1';

      const tools: ToolDefinition[] = [
        { name: 'tool1', description: 'Tool 1' },
        { name: 'tool2', description: 'Tool 2' },
      ];

      const registry = buildToolRegistryFromEnv(tools);

      expect(registry.get('tool1')?.allowed_callers).toEqual(['code_execution']);
      expect(registry.get('tool2')?.allowed_callers).toEqual(['direct']);
    });

    it('should set dual context callers based on TOOL_DUAL_CONTEXT', () => {
      process.env.TOOL_DUAL_CONTEXT = 'tool1';

      const tools: ToolDefinition[] = [{ name: 'tool1', description: 'Tool 1' }];

      const registry = buildToolRegistryFromEnv(tools);

      expect(registry.get('tool1')?.allowed_callers).toEqual(['direct', 'code_execution']);
    });
  });

  describe('buildToolRegistryFromAgentOptions', () => {
    it('should use agent tool options for defer_loading', () => {
      const tools: ToolDefinition[] = [
        { name: 'tool1', description: 'Tool 1' },
        { name: 'tool2', description: 'Tool 2' },
      ];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
        tool2: { defer_loading: false },
      };

      const registry = buildToolRegistryFromAgentOptions(tools, agentToolOptions);

      expect(registry.get('tool1')?.defer_loading).toBe(true);
      expect(registry.get('tool2')?.defer_loading).toBe(false);
    });

    it('should default defer_loading to false when not specified', () => {
      const tools: ToolDefinition[] = [{ name: 'tool1', description: 'Tool 1' }];

      const agentToolOptions: AgentToolOptions = {};

      const registry = buildToolRegistryFromAgentOptions(tools, agentToolOptions);

      expect(registry.get('tool1')?.defer_loading).toBe(false);
    });

    it('should use agent allowed_callers when specified', () => {
      const tools: ToolDefinition[] = [{ name: 'tool1', description: 'Tool 1' }];

      const agentToolOptions: AgentToolOptions = {
        tool1: { allowed_callers: ['code_execution'] },
      };

      const registry = buildToolRegistryFromAgentOptions(tools, agentToolOptions);

      expect(registry.get('tool1')?.allowed_callers).toEqual(['code_execution']);
    });
  });

  describe('agentHasDeferredTools', () => {
    it('should return true when registry has deferred tools', () => {
      const registry: LCToolRegistry = new Map([
        ['tool1', { name: 'tool1', allowed_callers: ['direct'], defer_loading: true }],
        ['tool2', { name: 'tool2', allowed_callers: ['direct'], defer_loading: false }],
      ]);

      expect(agentHasDeferredTools(registry)).toBe(true);
    });

    it('should return false when no tools are deferred', () => {
      const registry: LCToolRegistry = new Map([
        ['tool1', { name: 'tool1', allowed_callers: ['direct'], defer_loading: false }],
        ['tool2', { name: 'tool2', allowed_callers: ['direct'], defer_loading: false }],
      ]);

      expect(agentHasDeferredTools(registry)).toBe(false);
    });

    it('should return false for empty registry', () => {
      const registry: LCToolRegistry = new Map();
      expect(agentHasDeferredTools(registry)).toBe(false);
    });
  });

  describe('agentHasProgrammaticTools', () => {
    it('should return true when registry has programmatic tools', () => {
      const registry: LCToolRegistry = new Map([
        ['tool1', { name: 'tool1', allowed_callers: ['code_execution'], defer_loading: false }],
      ]);

      expect(agentHasProgrammaticTools(registry)).toBe(true);
    });

    it('should return true for dual context tools', () => {
      const registry: LCToolRegistry = new Map([
        [
          'tool1',
          { name: 'tool1', allowed_callers: ['direct', 'code_execution'], defer_loading: false },
        ],
      ]);

      expect(agentHasProgrammaticTools(registry)).toBe(true);
    });

    it('should return false when no programmatic tools', () => {
      const registry: LCToolRegistry = new Map([
        ['tool1', { name: 'tool1', allowed_callers: ['direct'], defer_loading: false }],
      ]);

      expect(agentHasProgrammaticTools(registry)).toBe(false);
    });
  });

  describe('isAgentAllowedForClassification', () => {
    it('should return true when TOOL_CLASSIFICATION_AGENT_IDS is not set', () => {
      expect(isAgentAllowedForClassification('any-agent-id')).toBe(true);
    });

    it('should return true when agent is in allowed list', () => {
      process.env.TOOL_CLASSIFICATION_AGENT_IDS = 'agent1,agent2,agent3';
      expect(isAgentAllowedForClassification('agent2')).toBe(true);
    });

    it('should return false when agent is not in allowed list', () => {
      process.env.TOOL_CLASSIFICATION_AGENT_IDS = 'agent1,agent2';
      expect(isAgentAllowedForClassification('agent3')).toBe(false);
    });

    it('should return false when agentId is undefined and list is set', () => {
      process.env.TOOL_CLASSIFICATION_AGENT_IDS = 'agent1';
      expect(isAgentAllowedForClassification(undefined)).toBe(false);
    });
  });

  describe('buildToolClassification with deferredToolsEnabled', () => {
    const mockLoadAuthValues = jest.fn().mockResolvedValue({});

    const createMCPTool = (name: string, description?: string) =>
      ({
        name,
        description,
        mcp: true,
        mcpJsonSchema: { type: 'object', properties: {} },
      }) as unknown as GenericTool;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return hasDeferredTools: false when deferredToolsEnabled is false', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1'), createMCPTool('tool2')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
        tool2: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: false,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.hasDeferredTools).toBe(false);
      expect(result.additionalTools.length).toBe(0);
    });

    it('should clear defer_loading from all tools when deferredToolsEnabled is false', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1'), createMCPTool('tool2')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
        tool2: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: false,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.toolRegistry).toBeDefined();
      expect(result.toolRegistry?.get('tool1')?.defer_loading).toBe(false);
      expect(result.toolRegistry?.get('tool2')?.defer_loading).toBe(false);
    });

    it('should preserve defer_loading when deferredToolsEnabled is true', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1'), createMCPTool('tool2')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
        tool2: { defer_loading: false },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: true,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.hasDeferredTools).toBe(true);
      expect(result.toolRegistry?.get('tool1')?.defer_loading).toBe(true);
      expect(result.toolRegistry?.get('tool2')?.defer_loading).toBe(false);
    });

    it('should create tool search when deferredToolsEnabled is true and has deferred tools', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: true,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.hasDeferredTools).toBe(true);
      expect(result.additionalTools.some((t) => t.name === 'tool_search')).toBe(true);
    });

    it('should NOT create tool search when deferredToolsEnabled is false', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: false,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.hasDeferredTools).toBe(false);
      expect(result.additionalTools.some((t) => t.name === 'tool_search')).toBe(false);
    });

    it('should default deferredToolsEnabled to true when not specified', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.hasDeferredTools).toBe(true);
    });

    it('should return early when no MCP tools are present', async () => {
      const loadedTools: GenericTool[] = [
        { name: 'regular_tool', mcp: false } as unknown as GenericTool,
      ];

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        deferredToolsEnabled: true,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(result.toolRegistry).toBeUndefined();
      expect(result.hasDeferredTools).toBe(false);
      expect(result.additionalTools.length).toBe(0);
    });
  });
});
