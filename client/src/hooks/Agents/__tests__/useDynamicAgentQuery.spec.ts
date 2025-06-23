import { renderHook } from '@testing-library/react';
import { useDynamicAgentQuery } from '../useDynamicAgentQuery';
import {
  useGetPromotedAgentsQuery,
  useGetAgentsByCategoryQuery,
  useSearchAgentsQuery,
} from '~/data-provider';

// Mock the data provider queries
jest.mock('~/data-provider', () => ({
  useGetPromotedAgentsQuery: jest.fn(),
  useGetAgentsByCategoryQuery: jest.fn(),
  useSearchAgentsQuery: jest.fn(),
}));

const mockUseGetPromotedAgentsQuery = useGetPromotedAgentsQuery as jest.MockedFunction<
  typeof useGetPromotedAgentsQuery
>;
const mockUseGetAgentsByCategoryQuery = useGetAgentsByCategoryQuery as jest.MockedFunction<
  typeof useGetAgentsByCategoryQuery
>;
const mockUseSearchAgentsQuery = useSearchAgentsQuery as jest.MockedFunction<
  typeof useSearchAgentsQuery
>;

describe('useDynamicAgentQuery', () => {
  const defaultMockQueryResult = {
    data: undefined,
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set default mock returns
    mockUseGetPromotedAgentsQuery.mockReturnValue(defaultMockQueryResult as any);
    mockUseGetAgentsByCategoryQuery.mockReturnValue(defaultMockQueryResult as any);
    mockUseSearchAgentsQuery.mockReturnValue(defaultMockQueryResult as any);
  });

  describe('Search Query Type', () => {
    it('should use search query when searchQuery is provided', () => {
      const mockSearchResult = {
        ...defaultMockQueryResult,
        data: { agents: [], pagination: { hasMore: false } },
      };
      mockUseSearchAgentsQuery.mockReturnValue(mockSearchResult as any);

      const { result } = renderHook(() =>
        useDynamicAgentQuery({
          category: 'hr',
          searchQuery: 'test search',
          page: 1,
          limit: 6,
        }),
      );

      // Should call search query with correct parameters
      expect(mockUseSearchAgentsQuery).toHaveBeenCalledWith(
        {
          q: 'test search',
          category: 'hr',
          page: 1,
          limit: 6,
        },
        expect.objectContaining({
          enabled: true,
          staleTime: 120000,
          refetchOnWindowFocus: false,
          keepPreviousData: true,
          refetchOnMount: false,
          refetchOnReconnect: false,
          retry: 1,
        }),
      );

      // Should return search query result
      expect(result.current.data).toBe(mockSearchResult.data);
      expect(result.current.queryType).toBe('search');
    });

    it('should not include category in search when category is "all" or "promoted"', () => {
      renderHook(() =>
        useDynamicAgentQuery({
          category: 'all',
          searchQuery: 'test search',
          page: 1,
          limit: 6,
        }),
      );

      expect(mockUseSearchAgentsQuery).toHaveBeenCalledWith(
        {
          q: 'test search',
          page: 1,
          limit: 6,
          // No category parameter should be included
        },
        expect.any(Object),
      );
    });
  });

  describe('Promoted Query Type', () => {
    it('should use promoted query when category is "promoted" and no search', () => {
      const mockPromotedResult = {
        ...defaultMockQueryResult,
        data: { agents: [], pagination: { hasMore: false } },
      };
      mockUseGetPromotedAgentsQuery.mockReturnValue(mockPromotedResult as any);

      const { result } = renderHook(() =>
        useDynamicAgentQuery({
          category: 'promoted',
          searchQuery: '',
          page: 2,
          limit: 8,
        }),
      );

      // Should call promoted query with correct parameters (no showAll)
      expect(mockUseGetPromotedAgentsQuery).toHaveBeenCalledWith(
        {
          page: 2,
          limit: 8,
        },
        expect.objectContaining({
          enabled: true,
        }),
      );

      expect(result.current.data).toBe(mockPromotedResult.data);
      expect(result.current.queryType).toBe('promoted');
    });
  });

  describe('All Agents Query Type', () => {
    it('should use promoted query with showAll when category is "all" and no search', () => {
      const mockAllResult = {
        ...defaultMockQueryResult,
        data: { agents: [], pagination: { hasMore: false } },
      };

      // Mock the second call to useGetPromotedAgentsQuery (for "all" category)
      mockUseGetPromotedAgentsQuery
        .mockReturnValueOnce(defaultMockQueryResult as any) // First call for promoted
        .mockReturnValueOnce(mockAllResult as any); // Second call for all

      const { result } = renderHook(() =>
        useDynamicAgentQuery({
          category: 'all',
          searchQuery: '',
          page: 1,
          limit: 6,
        }),
      );

      // Should call promoted query with showAll parameter
      expect(mockUseGetPromotedAgentsQuery).toHaveBeenCalledWith(
        {
          page: 1,
          limit: 6,
          showAll: 'true',
        },
        expect.objectContaining({
          enabled: true,
        }),
      );

      expect(result.current.queryType).toBe('all');
    });
  });

  describe('Category Query Type', () => {
    it('should use category query for specific categories', () => {
      const mockCategoryResult = {
        ...defaultMockQueryResult,
        data: { agents: [], pagination: { hasMore: false } },
      };
      mockUseGetAgentsByCategoryQuery.mockReturnValue(mockCategoryResult as any);

      const { result } = renderHook(() =>
        useDynamicAgentQuery({
          category: 'finance',
          searchQuery: '',
          page: 3,
          limit: 10,
        }),
      );

      expect(mockUseGetAgentsByCategoryQuery).toHaveBeenCalledWith(
        {
          category: 'finance',
          page: 3,
          limit: 10,
        },
        expect.objectContaining({
          enabled: true,
        }),
      );

      expect(result.current.data).toBe(mockCategoryResult.data);
      expect(result.current.queryType).toBe('category');
    });
  });

  describe('Query Configuration', () => {
    it('should apply correct query configuration to all queries', () => {
      renderHook(() =>
        useDynamicAgentQuery({
          category: 'hr',
          searchQuery: '',
          page: 1,
          limit: 6,
        }),
      );

      const expectedConfig = expect.objectContaining({
        staleTime: 120000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retry: 1,
        keepPreviousData: true,
      });

      expect(mockUseGetAgentsByCategoryQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expectedConfig,
      );
    });

    it('should enable only the correct query based on query type', () => {
      renderHook(() =>
        useDynamicAgentQuery({
          category: 'hr',
          searchQuery: '',
          page: 1,
          limit: 6,
        }),
      );

      // Category query should be enabled
      expect(mockUseGetAgentsByCategoryQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ enabled: true }),
      );

      // Other queries should be disabled
      expect(mockUseSearchAgentsQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ enabled: false }),
      );

      expect(mockUseGetPromotedAgentsQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ enabled: false }),
      );
    });
  });

  describe('Default Parameters', () => {
    it('should use default page and limit when not provided', () => {
      renderHook(() =>
        useDynamicAgentQuery({
          category: 'general',
          searchQuery: '',
        }),
      );

      expect(mockUseGetAgentsByCategoryQuery).toHaveBeenCalledWith(
        {
          category: 'general',
          page: 1,
          limit: 6,
        },
        expect.any(Object),
      );
    });
  });

  describe('Return Values', () => {
    it('should return all necessary query properties', () => {
      const mockResult = {
        data: { agents: [{ id: '1', name: 'Test Agent' }] },
        isLoading: true,
        error: null,
        isFetching: false,
        refetch: jest.fn(),
      };

      mockUseGetAgentsByCategoryQuery.mockReturnValue(mockResult as any);

      const { result } = renderHook(() =>
        useDynamicAgentQuery({
          category: 'it',
          searchQuery: '',
          page: 1,
          limit: 6,
        }),
      );

      expect(result.current).toEqual({
        data: mockResult.data,
        isLoading: mockResult.isLoading,
        error: mockResult.error,
        isFetching: mockResult.isFetching,
        refetch: mockResult.refetch,
        queryType: 'category',
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty search query as no search', () => {
      renderHook(() =>
        useDynamicAgentQuery({
          category: 'promoted',
          searchQuery: '', // Empty string should not trigger search
          page: 1,
          limit: 6,
        }),
      );

      // Should use promoted query, not search query
      expect(mockUseGetPromotedAgentsQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ enabled: true }),
      );

      expect(mockUseSearchAgentsQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ enabled: false }),
      );
    });

    it('should fallback to promoted query for unknown query types', () => {
      const mockPromotedResult = {
        ...defaultMockQueryResult,
        data: { agents: [] },
      };
      mockUseGetPromotedAgentsQuery.mockReturnValue(mockPromotedResult as any);

      const { result } = renderHook(() =>
        useDynamicAgentQuery({
          category: 'unknown-category',
          searchQuery: '',
          page: 1,
          limit: 6,
        }),
      );

      // Should determine this as 'category' type and use category query
      expect(result.current.queryType).toBe('category');
    });
  });
});
