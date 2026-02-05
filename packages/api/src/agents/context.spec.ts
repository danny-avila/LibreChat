import { z } from 'zod';
import { Constants } from 'librechat-data-provider';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { Logger } from 'winston';
import type { MCPManager } from '~/mcp/MCPManager';
import {
  extractMCPServers,
  getMCPInstructionsForServers,
  buildAgentInstructions,
  applyContextToAgent,
} from './context';

// Test schema for DynamicStructuredTool
const testSchema = z.object({});

describe('Agent Context Utilities', () => {
  describe('extractMCPServers', () => {
    it('should return empty array when agent has no tools', () => {
      const agent = { id: 'test-agent' };
      expect(extractMCPServers(agent)).toEqual([]);
    });

    it('should return empty array when agent tools array is empty', () => {
      const agent = { id: 'test-agent', tools: [] };
      expect(extractMCPServers(agent)).toEqual([]);
    });

    it('should extract unique MCP server names from tools', () => {
      const tool1 = new DynamicStructuredTool({
        name: `tool1${Constants.mcp_delimiter}server1`,
        description: 'Test tool 1',
        schema: testSchema,
        func: async () => 'result',
      });

      const tool2 = new DynamicStructuredTool({
        name: `tool2${Constants.mcp_delimiter}server2`,
        description: 'Test tool 2',
        schema: testSchema,
        func: async () => 'result',
      });

      const agent = { id: 'test-agent', tools: [tool1, tool2] };
      const result = extractMCPServers(agent);

      expect(result).toContain('server1');
      expect(result).toContain('server2');
      expect(result).toHaveLength(2);
    });

    it('should return unique server names when multiple tools use same server', () => {
      const tool1 = new DynamicStructuredTool({
        name: `tool1${Constants.mcp_delimiter}server1`,
        description: 'Test tool 1',
        schema: testSchema,
        func: async () => 'result',
      });

      const tool2 = new DynamicStructuredTool({
        name: `tool2${Constants.mcp_delimiter}server1`,
        description: 'Test tool 2',
        schema: testSchema,
        func: async () => 'result',
      });

      const agent = { id: 'test-agent', tools: [tool1, tool2] };
      const result = extractMCPServers(agent);

      expect(result).toEqual(['server1']);
      expect(result).toHaveLength(1);
    });

    it('should ignore tools without MCP delimiter', () => {
      const mcpTool = new DynamicStructuredTool({
        name: `tool1${Constants.mcp_delimiter}server1`,
        description: 'MCP tool',
        schema: testSchema,
        func: async () => 'result',
      });

      const regularTool = new DynamicStructuredTool({
        name: 'regular_tool',
        description: 'Regular tool',
        schema: testSchema,
        func: async () => 'result',
      });

      const agent = { id: 'test-agent', tools: [mcpTool, regularTool] };
      const result = extractMCPServers(agent);

      expect(result).toEqual(['server1']);
      expect(result).toHaveLength(1);
    });

    it('should handle mixed tool types (string and DynamicStructuredTool)', () => {
      const mcpTool = new DynamicStructuredTool({
        name: `tool1${Constants.mcp_delimiter}server1`,
        description: 'MCP tool',
        schema: testSchema,
        func: async () => 'result',
      });

      const agent = { id: 'test-agent', tools: [mcpTool, 'string-tool'] };
      const result = extractMCPServers(agent);

      expect(result).toEqual(['server1']);
    });

    it('should filter out empty server names', () => {
      const toolWithEmptyServer = new DynamicStructuredTool({
        name: `tool1${Constants.mcp_delimiter}`,
        description: 'Tool with empty server',
        schema: testSchema,
        func: async () => 'result',
      });

      const agent = { id: 'test-agent', tools: [toolWithEmptyServer] };
      const result = extractMCPServers(agent);

      expect(result).toEqual([]);
    });
  });

  describe('getMCPInstructionsForServers', () => {
    let mockMCPManager: jest.Mocked<MCPManager>;
    let mockLogger: Logger;

    beforeEach(() => {
      mockMCPManager = {
        formatInstructionsForContext: jest.fn(),
      } as unknown as jest.Mocked<MCPManager>;

      mockLogger = {
        debug: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger;
    });

    it('should return empty string when server array is empty', async () => {
      const result = await getMCPInstructionsForServers([], mockMCPManager, mockLogger);

      expect(result).toBe('');
      expect(mockMCPManager.formatInstructionsForContext).not.toHaveBeenCalled();
    });

    it('should fetch and return MCP instructions successfully', async () => {
      const instructions = '# MCP Instructions\nUse these tools carefully';
      mockMCPManager.formatInstructionsForContext.mockResolvedValue(instructions);

      const result = await getMCPInstructionsForServers(
        ['server1', 'server2'],
        mockMCPManager,
        mockLogger,
      );

      expect(result).toBe(instructions);
      expect(mockMCPManager.formatInstructionsForContext).toHaveBeenCalledWith([
        'server1',
        'server2',
      ]);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[AgentContext] Fetched MCP instructions for servers:',
        ['server1', 'server2'],
      );
    });

    it('should return empty string when MCP manager returns empty', async () => {
      mockMCPManager.formatInstructionsForContext.mockResolvedValue('');

      const result = await getMCPInstructionsForServers(['server1'], mockMCPManager, mockLogger);

      expect(result).toBe('');
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and log them', async () => {
      const error = new Error('MCP fetch failed');
      mockMCPManager.formatInstructionsForContext.mockRejectedValue(error);

      const result = await getMCPInstructionsForServers(['server1'], mockMCPManager, mockLogger);

      expect(result).toBe('');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AgentContext] Failed to get MCP instructions:',
        error,
      );
    });

    it('should work without logger', async () => {
      const instructions = 'Test instructions';
      mockMCPManager.formatInstructionsForContext.mockResolvedValue(instructions);

      const result = await getMCPInstructionsForServers(['server1'], mockMCPManager);

      expect(result).toBe(instructions);
      // Should not throw even without logger
    });

    it('should handle errors without logger', async () => {
      mockMCPManager.formatInstructionsForContext.mockRejectedValue(new Error('Test error'));

      const result = await getMCPInstructionsForServers(['server1'], mockMCPManager);

      expect(result).toBe('');
      // Should not throw even without logger
    });
  });

  describe('buildAgentInstructions', () => {
    it('should combine all parts with double newlines', () => {
      const result = buildAgentInstructions({
        sharedRunContext: 'Shared context',
        baseInstructions: 'Base instructions',
        mcpInstructions: 'MCP instructions',
      });

      expect(result).toBe('Shared context\n\nBase instructions\n\nMCP instructions');
    });

    it('should filter out empty parts', () => {
      const result = buildAgentInstructions({
        sharedRunContext: 'Shared context',
        baseInstructions: '',
        mcpInstructions: 'MCP instructions',
      });

      expect(result).toBe('Shared context\n\nMCP instructions');
    });

    it('should return undefined when all parts are empty', () => {
      const result = buildAgentInstructions({
        sharedRunContext: '',
        baseInstructions: '',
        mcpInstructions: '',
      });

      expect(result).toBeUndefined();
    });

    it('should handle only shared context', () => {
      const result = buildAgentInstructions({
        sharedRunContext: 'Shared context only',
      });

      expect(result).toBe('Shared context only');
    });

    it('should handle only base instructions', () => {
      const result = buildAgentInstructions({
        baseInstructions: 'Base instructions only',
      });

      expect(result).toBe('Base instructions only');
    });

    it('should handle only MCP instructions', () => {
      const result = buildAgentInstructions({
        mcpInstructions: 'MCP instructions only',
      });

      expect(result).toBe('MCP instructions only');
    });

    it('should trim whitespace from combined result', () => {
      const result = buildAgentInstructions({
        sharedRunContext: '  Shared context  ',
        baseInstructions: '  Base instructions  ',
      });

      expect(result).toBe('Shared context  \n\n  Base instructions');
    });

    it('should handle undefined parts', () => {
      const result = buildAgentInstructions({
        sharedRunContext: undefined,
        baseInstructions: 'Base',
        mcpInstructions: undefined,
      });

      expect(result).toBe('Base');
    });
  });

  describe('applyContextToAgent', () => {
    let mockMCPManager: jest.Mocked<MCPManager>;
    let mockLogger: Logger;

    beforeEach(() => {
      mockMCPManager = {
        formatInstructionsForContext: jest.fn(),
      } as unknown as jest.Mocked<MCPManager>;

      mockLogger = {
        debug: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger;
    });

    it('should apply context successfully with all components', async () => {
      const agent = {
        id: 'test-agent',
        instructions: 'Original instructions',
        tools: [
          new DynamicStructuredTool({
            name: `tool${Constants.mcp_delimiter}server1`,
            description: 'Test tool',
            schema: testSchema,
            func: async () => 'result',
          }),
        ],
      };

      mockMCPManager.formatInstructionsForContext.mockResolvedValue('MCP instructions');

      await applyContextToAgent({
        agent,
        sharedRunContext: 'Shared context',
        mcpManager: mockMCPManager,
        agentId: 'test-agent',
        logger: mockLogger,
      });

      expect(agent.instructions).toBe(
        'Shared context\n\nOriginal instructions\n\nMCP instructions',
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[AgentContext] Applied context to agent: test-agent',
      );
    });

    it('should use ephemeral agent MCP servers when provided', async () => {
      const agent = {
        id: 'test-agent',
        instructions: 'Base instructions',
        tools: [],
      };

      mockMCPManager.formatInstructionsForContext.mockResolvedValue('Ephemeral MCP');

      await applyContextToAgent({
        agent,
        sharedRunContext: 'Context',
        mcpManager: mockMCPManager,
        ephemeralAgent: { mcp: ['ephemeral-server'] },
        logger: mockLogger,
      });

      expect(mockMCPManager.formatInstructionsForContext).toHaveBeenCalledWith([
        'ephemeral-server',
      ]);
      expect(agent.instructions).toContain('Ephemeral MCP');
    });

    it('should prefer agent tools over empty ephemeral MCP array', async () => {
      const agent = {
        id: 'test-agent',
        instructions: 'Base',
        tools: [
          new DynamicStructuredTool({
            name: `tool${Constants.mcp_delimiter}agent-server`,
            description: 'Test tool',
            schema: testSchema,
            func: async () => 'result',
          }),
        ],
      };

      mockMCPManager.formatInstructionsForContext.mockResolvedValue('Agent MCP');

      await applyContextToAgent({
        agent,
        sharedRunContext: '',
        mcpManager: mockMCPManager,
        ephemeralAgent: { mcp: [] },
        logger: mockLogger,
      });

      expect(mockMCPManager.formatInstructionsForContext).toHaveBeenCalledWith(['agent-server']);
    });

    it('should work without agentId', async () => {
      const agent = {
        id: 'test-agent',
        instructions: 'Base',
        tools: [],
      };

      mockMCPManager.formatInstructionsForContext.mockResolvedValue('');

      await applyContextToAgent({
        agent,
        sharedRunContext: 'Context',
        mcpManager: mockMCPManager,
        logger: mockLogger,
      });

      expect(agent.instructions).toBe('Context\n\nBase');
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should work without logger', async () => {
      const agent = {
        id: 'test-agent',
        instructions: 'Base',
        tools: [
          new DynamicStructuredTool({
            name: `tool${Constants.mcp_delimiter}server1`,
            description: 'Test tool',
            schema: testSchema,
            func: async () => 'result',
          }),
        ],
      };

      mockMCPManager.formatInstructionsForContext.mockResolvedValue('MCP');

      await applyContextToAgent({
        agent,
        sharedRunContext: 'Context',
        mcpManager: mockMCPManager,
      });

      expect(agent.instructions).toBe('Context\n\nBase\n\nMCP');
    });

    it('should handle MCP fetch error gracefully and set fallback instructions', async () => {
      const agent = {
        id: 'test-agent',
        instructions: 'Base instructions',
        tools: [
          new DynamicStructuredTool({
            name: `tool${Constants.mcp_delimiter}server1`,
            description: 'Test tool',
            schema: testSchema,
            func: async () => 'result',
          }),
        ],
      };

      const error = new Error('MCP fetch failed');
      mockMCPManager.formatInstructionsForContext.mockRejectedValue(error);

      await applyContextToAgent({
        agent,
        sharedRunContext: 'Shared context',
        mcpManager: mockMCPManager,
        agentId: 'test-agent',
        logger: mockLogger,
      });

      // getMCPInstructionsForServers catches the error and returns empty string
      // So agent still has shared context + base instructions (without MCP)
      expect(agent.instructions).toBe('Shared context\n\nBase instructions');
      // Error is logged by getMCPInstructionsForServers, not applyContextToAgent
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AgentContext] Failed to get MCP instructions:',
        error,
      );
    });

    it('should handle invalid tools gracefully without throwing', async () => {
      const agent = {
        id: 'test-agent',
        instructions: 'Base',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: null as any, // Invalid tools - should not crash
      };

      mockMCPManager.formatInstructionsForContext.mockResolvedValue('');

      await applyContextToAgent({
        agent,
        sharedRunContext: 'Context',
        mcpManager: mockMCPManager,
        logger: mockLogger,
      });

      // extractMCPServers handles null tools gracefully, returns []
      // getMCPInstructionsForServers returns early with '', so no MCP instructions
      // Agent should still have shared context + base instructions
      expect(agent.instructions).toBe('Context\n\nBase');
      expect(mockMCPManager.formatInstructionsForContext).not.toHaveBeenCalled();
    });

    it('should preserve empty base instructions', async () => {
      const agent = {
        id: 'test-agent',
        instructions: '',
        tools: [
          new DynamicStructuredTool({
            name: `tool${Constants.mcp_delimiter}server1`,
            description: 'Test tool',
            schema: testSchema,
            func: async () => 'result',
          }),
        ],
      };

      mockMCPManager.formatInstructionsForContext.mockResolvedValue('MCP only');

      await applyContextToAgent({
        agent,
        sharedRunContext: 'Shared',
        mcpManager: mockMCPManager,
      });

      expect(agent.instructions).toBe('Shared\n\nMCP only');
    });

    it('should handle missing instructions field on agent', async () => {
      const agent = {
        id: 'test-agent',
        instructions: undefined,
        tools: [],
      };

      mockMCPManager.formatInstructionsForContext.mockResolvedValue('');

      await applyContextToAgent({
        agent,
        sharedRunContext: 'Context',
        mcpManager: mockMCPManager,
      });

      expect(agent.instructions).toBe('Context');
    });
  });
});
