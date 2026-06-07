import type { AgentToolOptions } from 'librechat-data-provider';
import type { GenericTool } from '@librechat/agents';
import type { LCToolRegistry } from './classification';
import {
  buildToolRegistryFromAgentOptions,
  agentHasProgrammaticTools,
  buildToolClassification,
  getServerNameFromTool,
  agentHasDeferredTools,
} from './classification';
import { resolveToolNameForExecution } from './names';

type MCPNameMetadata = {
  canonicalName?: string;
  providerToolName?: string;
  mcpRawName?: string;
};

describe('classification.ts', () => {
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

  describe('buildToolRegistryFromAgentOptions', () => {
    it('should use agent tool options for defer_loading', () => {
      const tools = [
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
      const tools = [{ name: 'tool1', description: 'Tool 1' }];

      const agentToolOptions: AgentToolOptions = {};

      const registry = buildToolRegistryFromAgentOptions(tools, agentToolOptions);

      expect(registry.get('tool1')?.defer_loading).toBe(false);
    });

    it('should use agent allowed_callers when specified', () => {
      const tools = [{ name: 'tool1', description: 'Tool 1' }];

      const agentToolOptions: AgentToolOptions = {
        tool1: { allowed_callers: ['code_execution'] },
      };

      const registry = buildToolRegistryFromAgentOptions(tools, agentToolOptions);

      expect(registry.get('tool1')?.allowed_callers).toEqual(['code_execution']);
    });

    it('should default allowed_callers to direct when not specified', () => {
      const tools = [{ name: 'tool1', description: 'Tool 1' }];

      const agentToolOptions: AgentToolOptions = {
        tool1: { defer_loading: true },
      };

      const registry = buildToolRegistryFromAgentOptions(tools, agentToolOptions);

      expect(registry.get('tool1')?.allowed_callers).toEqual(['direct']);
    });

    it('should alias long MCP names and preserve canonical tool options', () => {
      const rawName = 'search_records_with_a_very_long_raw_name';
      const canonicalName = `${rawName}_mcp_server_with_a_very_long_name_that_exceeds_limits`;
      const tools = [{ name: canonicalName, description: 'Long MCP tool' }];

      const agentToolOptions: AgentToolOptions = {
        [canonicalName]: {
          defer_loading: true,
          allowed_callers: ['code_execution'],
        },
      };

      const registry = buildToolRegistryFromAgentOptions(tools, agentToolOptions, 64);
      const [providerToolName, toolDef] = Array.from(registry.entries())[0];
      const metadata = toolDef as typeof toolDef & MCPNameMetadata;

      expect(providerToolName).not.toBe(canonicalName);
      expect(providerToolName.length).toBeLessThanOrEqual(64);
      expect(toolDef.name).toBe(providerToolName);
      expect(toolDef.defer_loading).toBe(true);
      expect(toolDef.allowed_callers).toEqual(['code_execution']);
      expect(metadata.canonicalName).toBe(canonicalName);
      expect(metadata.providerToolName).toBe(providerToolName);
      expect(metadata.mcpRawName).toBe(rawName);
      expect(resolveToolNameForExecution(providerToolName, registry)).toBe(canonicalName);
      expect(resolveToolNameForExecution(rawName, registry)).toBe(canonicalName);
    });

    it('should not resolve ambiguous raw MCP names', () => {
      const rawName = 'search_records';
      const firstCanonicalName = `${rawName}_mcp_server_one`;
      const secondCanonicalName = `${rawName}_mcp_server_two`;
      const registry = buildToolRegistryFromAgentOptions(
        [{ name: firstCanonicalName }, { name: secondCanonicalName }],
        {},
      );

      expect(resolveToolNameForExecution(rawName, registry)).toBe(rawName);
    });

    it('should expose duplicate canonical MCP definitions once', () => {
      const canonicalName =
        'search_records_with_a_very_long_raw_name_mcp_server_with_a_very_long_name';
      const registry = buildToolRegistryFromAgentOptions(
        [{ name: canonicalName }, { name: canonicalName }],
        {},
        64,
      );

      expect(registry.size).toBe(1);
      const [providerToolName] = Array.from(registry.keys());
      expect(resolveToolNameForExecution(providerToolName, registry)).toBe(canonicalName);
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

  describe('buildToolClassification with deferredToolsEnabled', () => {
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
      });

      expect(result.toolRegistry).toBeUndefined();
      expect(result.hasDeferredTools).toBe(false);
      expect(result.additionalTools.length).toBe(0);
    });
  });

  describe('buildToolClassification with definitionsOnly', () => {
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

    it('should NOT create tool instances when definitionsOnly=true', async () => {
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
        programmaticToolsEnabled: true,
        codeExecutionEnabled: true,
        definitionsOnly: true,
      });

      expect(result.additionalTools.length).toBe(0);
    });

    it('should still add tool_search definition when definitionsOnly=true and has deferred tools', async () => {
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
        programmaticToolsEnabled: true,
        codeExecutionEnabled: true,
        definitionsOnly: true,
      });

      expect(result.toolDefinitions.some((d) => d.name === 'tool_search')).toBe(true);
      expect(result.toolRegistry?.has('tool_search')).toBe(true);
    });

    it('should add PTC definition when definitionsOnly=true and capabilities allow programmatic tools', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { allowed_callers: ['code_execution'] },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        deferredToolsEnabled: true,
        programmaticToolsEnabled: true,
        codeExecutionEnabled: true,
        definitionsOnly: true,
      });

      expect(result.toolDefinitions.some((d) => d.name === 'run_tools_with_bash')).toBe(true);
      expect(result.toolRegistry?.has('run_tools_with_bash')).toBe(true);
      expect(result.additionalTools.length).toBe(0);
    });

    it('should create bash PTC tool when capabilities allow programmatic tools', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1')];

      const agentToolOptions: AgentToolOptions = {
        tool1: { allowed_callers: ['code_execution'] },
      };

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions,
        programmaticToolsEnabled: true,
        codeExecutionEnabled: true,
      });

      expect(result.additionalTools.some((t) => t.name === 'run_tools_with_bash')).toBe(true);
      expect(result.additionalTools.some((t) => t.name === 'run_tools_with_code')).toBe(false);
      expect(result.toolDefinitions.some((d) => d.name === 'run_tools_with_bash')).toBe(true);
    });

    it('should not add PTC when programmatic tools capability is disabled', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1')];

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions: {
          tool1: { allowed_callers: ['code_execution'] },
        },
        codeExecutionEnabled: true,
      });

      expect(result.additionalTools.some((t) => t.name === 'run_tools_with_bash')).toBe(false);
      expect(result.toolDefinitions.some((d) => d.name === 'run_tools_with_bash')).toBe(false);
      expect(result.toolRegistry?.has('run_tools_with_bash')).toBe(false);
    });

    it('should not add PTC when code execution is not enabled for the agent', async () => {
      const loadedTools: GenericTool[] = [createMCPTool('tool1')];

      const result = await buildToolClassification({
        loadedTools,
        userId: 'user1',
        agentId: 'agent1',
        agentToolOptions: {
          tool1: { allowed_callers: ['code_execution'] },
        },
        programmaticToolsEnabled: true,
      });

      expect(result.additionalTools.some((t) => t.name === 'run_tools_with_bash')).toBe(false);
      expect(result.toolDefinitions.some((d) => d.name === 'run_tools_with_bash')).toBe(false);
      expect(result.toolRegistry?.has('run_tools_with_bash')).toBe(false);
    });

    it('should create tool instances when definitionsOnly=false (default)', async () => {
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
      });

      expect(result.additionalTools.some((t) => t.name === 'tool_search')).toBe(true);
    });
  });
});
