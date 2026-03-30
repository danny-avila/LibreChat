import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import GroupLeaderboard from '../GroupLeaderboard';
import * as hooks from '../../hooks';

// Mock the hooks
jest.mock('../../hooks');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

// Mock utility functions
jest.mock('~/utils', () => ({
  formatNumber: (num: number) => num.toLocaleString(),
  formatCurrency: (num: number) => `$${num.toFixed(2)}`,
  formatRelativeTime: (date: string) => '2 hours ago',
  formatPercentage: (num: number) => `${(num * 100).toFixed(1)}%`,
}));

// Mock child components
jest.mock('../GroupStatsFilters', () => {
  return function MockGroupStatsFilters({ onFilterChange }: any) {
    return (
      <div data-testid="group-stats-filters">
        <button onClick={() => onFilterChange({ sortBy: 'memberCount' })}>Change Filter</button>
      </div>
    );
  };
});

const mockNavigate = jest.fn();
(require('react-router-dom').useNavigate as jest.Mock).mockReturnValue(mockNavigate);

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>,
  );
};

describe('GroupLeaderboard', () => {
  const mockGroupLeaderboardData = {
    groups: [
      {
        groupId: 'group1',
        groupName: 'Test Group 1',
        memberCount: 5,
        activeMemberCount: 4,
        totalTokens: 10000,
        promptTokens: 6000,
        completionTokens: 4000,
        averagePerMember: 2000,
        averagePerActiveMember: 2500,
        totalCost: 0.5,
        groupBalance: 15000,
        averageBalance: 3000,
        membersWithLowBalance: 1,
        timeWindowsActive: 2,
        lastActivity: '2024-01-01T10:00:00Z',
        conversationCount: 25,
        rank: 1,
      },
      {
        groupId: 'group2',
        groupName: 'Test Group 2',
        memberCount: 3,
        activeMemberCount: 3,
        totalTokens: 8000,
        promptTokens: 4800,
        completionTokens: 3200,
        averagePerMember: 2667,
        averagePerActiveMember: 2667,
        totalCost: 0.4,
        groupBalance: 12000,
        averageBalance: 4000,
        membersWithLowBalance: 0,
        timeWindowsActive: 1,
        lastActivity: '2024-01-01T09:00:00Z',
        conversationCount: 20,
        rank: 2,
      },
    ],
    pagination: {
      currentPage: 1,
      totalPages: 1,
      totalGroups: 2,
      groupsPerPage: 20,
    },
    summary: {
      totalGroups: 2,
      totalMembers: 8,
      totalTokensUsed: 18000,
      averageGroupSize: 4,
      mostActiveGroup: 'Test Group 1',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (hooks.useGroupLeaderboard as jest.Mock).mockReturnValue({
      data: mockGroupLeaderboardData,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('should render loading state', () => {
    (hooks.useGroupLeaderboard as jest.Mock).mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });

    renderWithProviders(<GroupLeaderboard />);

    expect(screen.getByText('Loading group statistics...')).toBeInTheDocument();
  });

  it('should render error state with retry button', () => {
    const mockRefetch = jest.fn();
    (hooks.useGroupLeaderboard as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('API Error'),
      refetch: mockRefetch,
    });

    renderWithProviders(<GroupLeaderboard />);

    expect(screen.getByText('Error loading group leaderboard')).toBeInTheDocument();

    const retryButton = screen.getByText('Try Again');
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('should render group leaderboard with summary cards', () => {
    renderWithProviders(<GroupLeaderboard />);

    // Check page header
    expect(screen.getByText('Group Statistics')).toBeInTheDocument();
    expect(screen.getByText('Aggregated usage analytics by group')).toBeInTheDocument();

    // Check summary cards
    expect(screen.getByText('Total Groups')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Total Members')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
    expect(screen.getByText('18,000')).toBeInTheDocument();
    expect(screen.getByText('Most Active')).toBeInTheDocument();
    expect(screen.getByText('Test Group 1')).toBeInTheDocument();
  });

  it('should render groups table with correct data', () => {
    renderWithProviders(<GroupLeaderboard />);

    // Check table headers
    expect(screen.getByText('Rank')).toBeInTheDocument();
    expect(screen.getByText('Group')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
    expect(screen.getByText('Balance Pool')).toBeInTheDocument();

    // Check group data
    expect(screen.getByText('Test Group 1')).toBeInTheDocument();
    expect(screen.getByText('Test Group 2')).toBeInTheDocument();
    expect(screen.getByText('4 active')).toBeInTheDocument();
    expect(screen.getByText('3 active')).toBeInTheDocument();
    expect(screen.getByText('10,000')).toBeInTheDocument();
    expect(screen.getByText('8,000')).toBeInTheDocument();
  });

  it('should display rank icons correctly', () => {
    renderWithProviders(<GroupLeaderboard />);

    // Crown icon for rank 1 should be present (Test Group 1)
    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1]; // Skip header row
    expect(firstDataRow).toBeInTheDocument();
  });

  it('should display balance status with warnings', () => {
    renderWithProviders(<GroupLeaderboard />);

    // Check low balance warning
    expect(screen.getByText('1 low balance')).toBeInTheDocument();
  });

  it('should display time window indicators', () => {
    renderWithProviders(<GroupLeaderboard />);

    // Check time window indicators
    expect(screen.getByText('2')).toBeInTheDocument(); // Group 1 has 2 active time windows
    expect(screen.getByText('1')).toBeInTheDocument(); // Group 2 has 1 active time window
  });

  it('should handle sorting', async () => {
    const mockUseGroupLeaderboard = hooks.useGroupLeaderboard as jest.Mock;
    const mockRefetch = jest.fn();
    mockUseGroupLeaderboard.mockReturnValue({
      data: mockGroupLeaderboardData,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<GroupLeaderboard />);

    // Click on Members column header to sort
    const membersHeader = screen.getByText('Members').closest('th');
    fireEvent.click(membersHeader!);

    // Check that the component re-renders with new params
    await waitFor(() => {
      expect(mockUseGroupLeaderboard).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sortBy: 'memberCount',
          sortOrder: 'desc',
          page: 1,
        }),
      );
    });
  });

  it('should handle filtering', () => {
    renderWithProviders(<GroupLeaderboard />);

    // Find and click the filter change button in the mocked component
    const filterButton = screen.getByText('Change Filter');
    fireEvent.click(filterButton);

    // Check that the component updates with new filter
    expect(hooks.useGroupLeaderboard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sortBy: 'memberCount',
      }),
    );
  });

  it('should handle pagination', async () => {
    // Mock data with multiple pages
    const mockDataWithPagination = {
      ...mockGroupLeaderboardData,
      pagination: {
        currentPage: 1,
        totalPages: 3,
        totalGroups: 60,
        groupsPerPage: 20,
      },
    };

    (hooks.useGroupLeaderboard as jest.Mock).mockReturnValue({
      data: mockDataWithPagination,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithProviders(<GroupLeaderboard />);

    // Check pagination info
    expect(screen.getByText('Showing 1 to 2 of 60 groups')).toBeInTheDocument();

    // Click next page
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(hooks.useGroupLeaderboard).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
        }),
      );
    });
  });

  it('should handle group details navigation', () => {
    renderWithProviders(<GroupLeaderboard />);

    // Click on "View Details" button
    const viewDetailsButtons = screen.getAllByText('View Details');
    fireEvent.click(viewDetailsButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/d/statistics/groups/group1');
  });

  it('should handle refresh data', () => {
    const mockRefetch = jest.fn();
    (hooks.useGroupLeaderboard as jest.Mock).mockReturnValue({
      data: mockGroupLeaderboardData,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<GroupLeaderboard />);

    const refreshButton = screen.getByText('Refresh Data');
    fireEvent.click(refreshButton);

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('should display empty state when no groups found', () => {
    const emptyData = {
      ...mockGroupLeaderboardData,
      groups: [],
    };

    (hooks.useGroupLeaderboard as jest.Mock).mockReturnValue({
      data: emptyData,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithProviders(<GroupLeaderboard />);

    expect(screen.getByText('No groups found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters or date range.')).toBeInTheDocument();
  });

  it('should format numbers and currency correctly', () => {
    renderWithProviders(<GroupLeaderboard />);

    // Check formatted numbers (mocked to use toLocaleString)
    expect(screen.getByText('10,000')).toBeInTheDocument();
    expect(screen.getByText('$0.50')).toBeInTheDocument();
    expect(screen.getByText('15,000')).toBeInTheDocument();
  });

  it('should show token breakdown', () => {
    renderWithProviders(<GroupLeaderboard />);

    // Check prompt + completion token breakdown
    expect(screen.getByText('6,000 + 4,000')).toBeInTheDocument();
    expect(screen.getByText('4,800 + 3,200')).toBeInTheDocument();
  });

  it('should display average per member metrics', () => {
    renderWithProviders(<GroupLeaderboard />);

    expect(screen.getByText('2,000')).toBeInTheDocument(); // Average per member for group 1
    expect(screen.getByText('per active: 2,500')).toBeInTheDocument(); // Average per active member
  });

  it('should render filters component', () => {
    renderWithProviders(<GroupLeaderboard />);

    expect(screen.getByTestId('group-stats-filters')).toBeInTheDocument();
  });
});
