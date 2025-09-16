import { renderHook } from '@testing-library/react';
import { Tools, Constants } from 'librechat-data-provider';
import useAgentToolPermissions from '../useAgentToolPermissions';

// Mock dependencies
jest.mock('~/data-provider', () => ({
  useGetAgentByIdQuery: jest.fn(),
}));

jest.mock('~/Providers', () => ({
  useAgentsMapContext: jest.fn(),
}));

// Import mocked functions after mocking
import { useGetAgentByIdQuery } from '~/data-provider';
import { useAgentsMapContext } from '~/Providers';

describe('useAgentToolPermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Ephemeral Agent Scenarios', () => {
    it('should return true for all tools when agentId is null', () => {
      (useAgentsMapContext as jest.Mock).mockReturnValue({});
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(null));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toBeUndefined();
    });

    it('should return true for all tools when agentId is undefined', () => {
      (useAgentsMapContext as jest.Mock).mockReturnValue({});
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(undefined));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toBeUndefined();
    });

    it('should return true for all tools when agentId is empty string', () => {
      (useAgentsMapContext as jest.Mock).mockReturnValue({});
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(''));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toBeUndefined();
    });

    it('should return true for all tools when agentId is EPHEMERAL_AGENT_ID', () => {
      (useAgentsMapContext as jest.Mock).mockReturnValue({});
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => 
        useAgentToolPermissions(Constants.EPHEMERAL_AGENT_ID)
      );

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toBeUndefined();
    });
  });

  describe('Regular Agent with Tools', () => {
    it('should allow file_search when agent has the tool', () => {
      const agentId = 'agent-123';
      const mockAgent = {
        id: agentId,
        tools: [Tools.file_search, 'other_tool'],
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue({
        [agentId]: mockAgent,
      });
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toEqual([Tools.file_search, 'other_tool']);
    });

    it('should allow execute_code when agent has the tool', () => {
      const agentId = 'agent-456';
      const mockAgent = {
        id: agentId,
        tools: [Tools.execute_code, 'another_tool'],
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue({
        [agentId]: mockAgent,
      });
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toEqual([Tools.execute_code, 'another_tool']);
    });

    it('should allow both tools when agent has both', () => {
      const agentId = 'agent-789';
      const mockAgent = {
        id: agentId,
        tools: [Tools.file_search, Tools.execute_code, 'custom_tool'],
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue({
        [agentId]: mockAgent,
      });
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toEqual([Tools.file_search, Tools.execute_code, 'custom_tool']);
    });

    it('should disallow both tools when agent has neither', () => {
      const agentId = 'agent-no-tools';
      const mockAgent = {
        id: agentId,
        tools: ['custom_tool1', 'custom_tool2'],
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue({
        [agentId]: mockAgent,
      });
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toEqual(['custom_tool1', 'custom_tool2']);
    });

    it('should handle agent with empty tools array', () => {
      const agentId = 'agent-empty-tools';
      const mockAgent = {
        id: agentId,
        tools: [],
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue({
        [agentId]: mockAgent,
      });
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toEqual([]);
    });

    it('should handle agent with undefined tools', () => {
      const agentId = 'agent-undefined-tools';
      const mockAgent = {
        id: agentId,
        tools: undefined,
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue({
        [agentId]: mockAgent,
      });
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toBeUndefined();
    });
  });

  describe('Agent Data from Query', () => {
    it('should prioritize agentData tools over selectedAgent tools', () => {
      const agentId = 'agent-with-query-data';
      const mockAgent = {
        id: agentId,
        tools: ['old_tool'],
      };
      const mockAgentData = {
        id: agentId,
        tools: [Tools.file_search, Tools.execute_code],
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue({
        [agentId]: mockAgent,
      });
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: mockAgentData });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toEqual([Tools.file_search, Tools.execute_code]);
    });

    it('should fallback to selectedAgent tools when agentData has no tools', () => {
      const agentId = 'agent-fallback';
      const mockAgent = {
        id: agentId,
        tools: [Tools.file_search],
      };
      const mockAgentData = {
        id: agentId,
        tools: undefined,
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue({
        [agentId]: mockAgent,
      });
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: mockAgentData });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toEqual([Tools.file_search]);
    });
  });

  describe('Agent Not Found Scenarios', () => {
    it('should disallow all tools when agent is not found in map', () => {
      const agentId = 'non-existent-agent';

      (useAgentsMapContext as jest.Mock).mockReturnValue({});
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toBeUndefined();
    });

    it('should disallow all tools when agentsMap is null', () => {
      const agentId = 'agent-with-null-map';

      (useAgentsMapContext as jest.Mock).mockReturnValue(null);
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toBeUndefined();
    });

    it('should disallow all tools when agentsMap is undefined', () => {
      const agentId = 'agent-with-undefined-map';

      (useAgentsMapContext as jest.Mock).mockReturnValue(undefined);
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toBeUndefined();
    });
  });

  describe('Memoization and Performance', () => {
    it('should memoize results when inputs do not change', () => {
      const agentId = 'memoized-agent';
      const mockAgent = {
        id: agentId,
        tools: [Tools.file_search],
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue({
        [agentId]: mockAgent,
      });
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result, rerender } = renderHook(() => useAgentToolPermissions(agentId));

      const firstResult = result.current;

      // Rerender without changing inputs
      rerender();

      const secondResult = result.current;

      // The hook returns a new object each time, but the values should be equal
      expect(firstResult.fileSearchAllowedByAgent).toBe(secondResult.fileSearchAllowedByAgent);
      expect(firstResult.codeAllowedByAgent).toBe(secondResult.codeAllowedByAgent);
      // Tools array reference should be the same since it comes from useMemo
      expect(firstResult.tools).toBe(secondResult.tools);
      
      // Verify the actual values are correct
      expect(secondResult.fileSearchAllowedByAgent).toBe(true);
      expect(secondResult.codeAllowedByAgent).toBe(false);
      expect(secondResult.tools).toEqual([Tools.file_search]);
    });

    it('should recompute when agentId changes', () => {
      const agentId1 = 'agent-1';
      const agentId2 = 'agent-2';
      const mockAgents = {
        [agentId1]: { id: agentId1, tools: [Tools.file_search] },
        [agentId2]: { id: agentId2, tools: [Tools.execute_code] },
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue(mockAgents);
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result, rerender } = renderHook(
        ({ agentId }) => useAgentToolPermissions(agentId),
        { initialProps: { agentId: agentId1 } }
      );

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(false);

      // Change agentId
      rerender({ agentId: agentId2 });

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(true);
    });

    it('should handle switching between ephemeral and regular agents', () => {
      const regularAgentId = 'regular-agent';
      const mockAgent = {
        id: regularAgentId,
        tools: [],
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue({
        [regularAgentId]: mockAgent,
      });
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result, rerender } = renderHook(
        ({ agentId }) => useAgentToolPermissions(agentId),
        { initialProps: { agentId: null } }
      );

      // Start with ephemeral agent (null)
      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);

      // Switch to regular agent
      rerender({ agentId: regularAgentId });
      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);

      // Switch back to ephemeral
      rerender({ agentId: '' });
      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle agents with null tools gracefully', () => {
      const agentId = 'agent-null-tools';
      const mockAgent = {
        id: agentId,
        tools: null as any,
      };

      (useAgentsMapContext as jest.Mock).mockReturnValue({
        [agentId]: mockAgent,
      });
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toBeNull();
    });

    it('should handle whitespace-only agentId as ephemeral', () => {
      // Note: Based on the current implementation, only empty string is treated as ephemeral
      // Whitespace-only strings would be treated as regular agent IDs
      const whitespaceId = '   ';

      (useAgentsMapContext as jest.Mock).mockReturnValue({});
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(whitespaceId));

      // Whitespace ID is not considered ephemeral in current implementation
      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
    });

    it('should handle query loading state', () => {
      const agentId = 'loading-agent';
      
      (useAgentsMapContext as jest.Mock).mockReturnValue({});
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ 
        data: undefined,
        isLoading: true,
        error: null,
      });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      // During loading, should return false for non-ephemeral agents
      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toBeUndefined();
    });

    it('should handle query error state', () => {
      const agentId = 'error-agent';
      
      (useAgentsMapContext as jest.Mock).mockReturnValue({});
      (useGetAgentByIdQuery as jest.Mock).mockReturnValue({ 
        data: undefined,
        isLoading: false,
        error: new Error('Failed to fetch agent'),
      });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      // On error, should return false for non-ephemeral agents
      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toBeUndefined();
    });
  });
});
