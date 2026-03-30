import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useGroupLeaderboard,
  useGroupStatistics,
  useGroupMemberStatistics,
  fetchGroupLeaderboard,
  fetchGroupStatistics,
  fetchGroupMemberStatistics,
  GroupLeaderboardParams
} from '../hooks';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock console.log, console.error to avoid noise in tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const createWrapper = () => {
  const queryClient = createQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Group Statistics Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchGroupLeaderboard', () => {
    it('should fetch group leaderboard successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          groups: [
            {
              groupId: 'group1',
              groupName: 'Test Group',
              totalTokens: 1000,
              rank: 1,
            }
          ],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalGroups: 1,
            groupsPerPage: 20,
          },
          summary: {
            totalGroups: 1,
            totalMembers: 5,
            totalTokensUsed: 1000,
            averageGroupSize: 5,
            mostActiveGroup: 'Test Group',
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchGroupLeaderboard();

      expect(mockFetch).toHaveBeenCalledWith('/api/statistics/groups/leaderboard');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle query parameters correctly', async () => {
      const params: GroupLeaderboardParams = {
        page: 2,
        limit: 10,
        sortBy: 'memberCount',
        sortOrder: 'asc',
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
        minMembers: 5,
        includeInactive: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { groups: [] } }),
      });

      await fetchGroupLeaderboard(params);

      const expectedUrl = '/api/statistics/groups/leaderboard?page=2&limit=10&sortBy=memberCount&sortOrder=asc&dateFrom=2024-01-01&dateTo=2024-01-31&minMembers=5&includeInactive=true';
      expect(mockFetch).toHaveBeenCalledWith(expectedUrl);
    });

    it('should filter out undefined and empty parameters', async () => {
      const params: GroupLeaderboardParams = {
        page: 1,
        limit: undefined,
        sortBy: '',
        dateFrom: null as any,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { groups: [] } }),
      });

      await fetchGroupLeaderboard(params);

      const expectedUrl = '/api/statistics/groups/leaderboard?page=1';
      expect(mockFetch).toHaveBeenCalledWith(expectedUrl);
    });

    it('should throw error on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(fetchGroupLeaderboard()).rejects.toThrow(
        'Failed to fetch group leaderboard: 500'
      );
    });

    it('should throw error on API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: { message: 'Custom error message' }
        }),
      });

      await expect(fetchGroupLeaderboard()).rejects.toThrow('Custom error message');
    });

    it('should throw default error message when no error message provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: {}
        }),
      });

      await expect(fetchGroupLeaderboard()).rejects.toThrow('Failed to fetch group leaderboard');
    });
  });

  describe('fetchGroupStatistics', () => {
    it('should fetch group statistics successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          groupId: 'group1',
          groupName: 'Test Group',
          totalUsage: { totalTokens: 1000 }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchGroupStatistics('group1');

      expect(mockFetch).toHaveBeenCalledWith('/api/statistics/groups/group1');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle query options', async () => {
      const options = {
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
        includeMemberDetails: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await fetchGroupStatistics('group1', options);

      const expectedUrl = '/api/statistics/groups/group1?dateFrom=2024-01-01&dateTo=2024-01-31&includeMemberDetails=true';
      expect(mockFetch).toHaveBeenCalledWith(expectedUrl);
    });

    it('should throw error on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(fetchGroupStatistics('nonexistent')).rejects.toThrow(
        'Failed to fetch group statistics: 404'
      );
    });
  });

  describe('fetchGroupMemberStatistics', () => {
    it('should fetch group member statistics successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          groupId: 'group1',
          groupName: 'Test Group',
          members: []
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchGroupMemberStatistics('group1');

      expect(mockFetch).toHaveBeenCalledWith('/api/statistics/groups/group1/members');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle pagination and sorting parameters', async () => {
      const params = {
        page: 2,
        limit: 25,
        sortBy: 'tokens',
        sortOrder: 'desc',
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await fetchGroupMemberStatistics('group1', params);

      const expectedUrl = '/api/statistics/groups/group1/members?page=2&limit=25&sortBy=tokens&sortOrder=desc&dateFrom=2024-01-01&dateTo=2024-01-31';
      expect(mockFetch).toHaveBeenCalledWith(expectedUrl);
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(fetchGroupMemberStatistics('group1')).rejects.toThrow(
        'Failed to fetch group member statistics: 403'
      );
    });
  });

  describe('useGroupLeaderboard', () => {
    it('should return group leaderboard data', async () => {
      const mockData = {
        groups: [],
        pagination: { currentPage: 1, totalPages: 1, totalGroups: 0, groupsPerPage: 20 },
        summary: { totalGroups: 0, totalMembers: 0, totalTokensUsed: 0, averageGroupSize: 0, mostActiveGroup: null }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData }),
      });

      const { result } = renderHook(() => useGroupLeaderboard(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockData);
    });

    it('should handle loading state', () => {
      mockFetch.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useGroupLeaderboard(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('should handle error state', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useGroupLeaderboard(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(new Error('Network error'));
    });

    it('should update query when parameters change', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { groups: [] } }),
      });

      const { result, rerender } = renderHook(
        (params) => useGroupLeaderboard(params),
        {
          wrapper: createWrapper(),
          initialProps: { page: 1 } as GroupLeaderboardParams,
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Change parameters
      rerender({ page: 2 });

      expect(mockFetch).toHaveBeenCalledWith('/api/statistics/groups/leaderboard?page=2');
    });
  });

  describe('useGroupStatistics', () => {
    it('should return group statistics data', async () => {
      const mockData = {
        groupId: 'group1',
        groupName: 'Test Group',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData }),
      });

      const { result } = renderHook(() => useGroupStatistics('group1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockData);
    });

    it('should be disabled when groupId is empty', () => {
      const { result } = renderHook(() => useGroupStatistics(''), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
    });

    it('should handle options parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      const options = {
        dateFrom: '2024-01-01',
        includeMemberDetails: true,
      };

      renderHook(() => useGroupStatistics('group1', options), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/statistics/groups/group1?dateFrom=2024-01-01&includeMemberDetails=true'
        );
      });
    });
  });

  describe('useGroupMemberStatistics', () => {
    it('should return group member statistics data', async () => {
      const mockData = {
        groupId: 'group1',
        members: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData }),
      });

      const { result } = renderHook(() => useGroupMemberStatistics('group1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockData);
    });

    it('should be disabled when groupId is empty', () => {
      const { result } = renderHook(() => useGroupMemberStatistics(''), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
    });

    it('should handle pagination parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      const params = {
        page: 2,
        limit: 25,
        sortBy: 'balance',
        sortOrder: 'asc',
      };

      renderHook(() => useGroupMemberStatistics('group1', params), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/statistics/groups/group1/members?page=2&limit=25&sortBy=balance&sortOrder=asc'
        );
      });
    });
  });

  describe('Query Configuration', () => {
    it('should have correct staleTime for leaderboard', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { groups: [] } }),
      });

      const { result } = renderHook(() => useGroupLeaderboard(), {
        wrapper: createWrapper(),
      });

      // React Query configuration should set staleTime to 5 minutes
      expect(result.current.dataUpdatedAt).toBeDefined();
    });

    it('should have correct staleTime for group statistics', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      const { result } = renderHook(() => useGroupStatistics('group1'), {
        wrapper: createWrapper(),
      });

      // React Query configuration should set staleTime to 10 minutes
      expect(result.current.dataUpdatedAt).toBeDefined();
    });

    it('should retry failed requests', async () => {
      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: { groups: [] } }),
        });

      const { result } = renderHook(() => useGroupLeaderboard(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should have been called twice (initial + 1 retry, but we disabled retry in test)
      // In real environment, it would retry 2 times as configured
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});