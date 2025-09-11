import { renderHook } from '@testing-library/react';
import { Tools } from 'librechat-data-provider';
import useAgentToolPermissions from '../useAgentToolPermissions';

// Mock the dependencies
jest.mock('~/data-provider', () => ({
  useGetAgentByIdQuery: jest.fn(),
}));

jest.mock('~/Providers', () => ({
  useAgentsMapContext: jest.fn(),
}));

const mockUseGetAgentByIdQuery = jest.requireMock('~/data-provider').useGetAgentByIdQuery;
const mockUseAgentsMapContext = jest.requireMock('~/Providers').useAgentsMapContext;

describe('useAgentToolPermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when no agentId is provided', () => {
    it('should allow all tools for ephemeral agents', () => {
      mockUseAgentsMapContext.mockReturnValue({});
      mockUseGetAgentByIdQuery.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(null));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toBeUndefined();
    });

    it('should allow all tools when agentId is undefined', () => {
      mockUseAgentsMapContext.mockReturnValue({});
      mockUseGetAgentByIdQuery.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(undefined));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toBeUndefined();
    });

    it('should allow all tools when agentId is empty string', () => {
      mockUseAgentsMapContext.mockReturnValue({});
      mockUseGetAgentByIdQuery.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(''));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toBeUndefined();
    });
  });

  describe('when agentId is provided but agent not found', () => {
    it('should disallow all tools', () => {
      mockUseAgentsMapContext.mockReturnValue({});
      mockUseGetAgentByIdQuery.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions('non-existent-agent'));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toBeUndefined();
    });
  });

  describe('when agent is found with tools', () => {
    it('should allow tools that are included in the agent tools array', () => {
      const agentId = 'test-agent';
      const agent = {
        id: agentId,
        tools: [Tools.file_search],
      };

      mockUseAgentsMapContext.mockReturnValue({ [agentId]: agent });
      mockUseGetAgentByIdQuery.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toEqual([Tools.file_search]);
    });

    it('should allow both tools when both are included', () => {
      const agentId = 'test-agent';
      const agent = {
        id: agentId,
        tools: [Tools.file_search, Tools.execute_code],
      };

      mockUseAgentsMapContext.mockReturnValue({ [agentId]: agent });
      mockUseGetAgentByIdQuery.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toEqual([Tools.file_search, Tools.execute_code]);
    });

    it('should use data from API query when available', () => {
      const agentId = 'test-agent';
      const agentMapData = {
        id: agentId,
        tools: [Tools.file_search],
      };
      const agentApiData = {
        id: agentId,
        tools: [Tools.execute_code, Tools.file_search],
      };

      mockUseAgentsMapContext.mockReturnValue({ [agentId]: agentMapData });
      mockUseGetAgentByIdQuery.mockReturnValue({ data: agentApiData });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      // API data should take precedence
      expect(result.current.fileSearchAllowedByAgent).toBe(true);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toEqual([Tools.execute_code, Tools.file_search]);
    });

    it('should fallback to agent map data when API data is not available', () => {
      const agentId = 'test-agent';
      const agentMapData = {
        id: agentId,
        tools: [Tools.execute_code],
      };

      mockUseAgentsMapContext.mockReturnValue({ [agentId]: agentMapData });
      mockUseGetAgentByIdQuery.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(true);
      expect(result.current.tools).toEqual([Tools.execute_code]);
    });
  });

  describe('when agent has no tools', () => {
    it('should disallow all tools with empty array', () => {
      const agentId = 'test-agent';
      const agent = {
        id: agentId,
        tools: [],
      };

      mockUseAgentsMapContext.mockReturnValue({ [agentId]: agent });
      mockUseGetAgentByIdQuery.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toEqual([]);
    });

    it('should disallow all tools with undefined tools', () => {
      const agentId = 'test-agent';
      const agent = {
        id: agentId,
        tools: undefined,
      };

      mockUseAgentsMapContext.mockReturnValue({ [agentId]: agent });
      mockUseGetAgentByIdQuery.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useAgentToolPermissions(agentId));

      expect(result.current.fileSearchAllowedByAgent).toBe(false);
      expect(result.current.codeAllowedByAgent).toBe(false);
      expect(result.current.tools).toBeUndefined();
    });
  });
});
