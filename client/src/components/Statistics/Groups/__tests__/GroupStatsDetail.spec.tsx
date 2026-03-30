import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import GroupStatsDetail from '../GroupStatsDetail';
import * as hooks from '../../hooks';

// Mock the hooks
jest.mock('../../hooks');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
  useParams: jest.fn(),
}));

// Mock utility functions
jest.mock('~/utils', () => ({
  formatNumber: (num: number) => num.toLocaleString(),
  formatCurrency: (num: number) => `$${num.toFixed(2)}`,
  formatRelativeTime: (date: string) => '2 hours ago',
  formatPercentage: (num: number) => `${(num * 100).toFixed(1)}%`,
}));

// Mock UI components
jest.mock('@librechat/client', () => ({
  Button: ({ children, onClick, variant, size, className, disabled }: any) => (
    <button onClick={onClick} className={`${variant} ${size} ${className}`} disabled={disabled}>
      {children}
    </button>
  ),
  Spinner: ({ className }: any) => <div className={`spinner ${className}`}>Loading...</div>,
}));

const mockNavigate = jest.fn();
const mockUseParams = require('react-router-dom').useParams as jest.Mock;
(require('react-router-dom').useNavigate as jest.Mock).mockReturnValue(mockNavigate);

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithProviders = (
  component: React.ReactElement,
  route = '/d/statistics/groups/group1',
) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{component}</MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('GroupStatsDetail', () => {
  const mockGroupStats = {
    groupId: 'group1',
    groupName: 'Test Group',
    description: 'Test group description',
    memberCount: 5,
    isActive: true,
    timeWindows: [
      {
        name: 'Business Hours',
        windowType: 'daily',
        isActive: true,
      },
      {
        name: 'Weekend',
        windowType: 'weekly',
        isActive: false,
      },
    ],
    totalUsage: {
      promptTokens: 6000,
      completionTokens: 4000,
      totalTokens: 10000,
      totalCost: 0.5,
      conversationCount: 25,
      activeMemberCount: 4,
    },
    memberUsage: {
      averagePerMember: 2000,
      highestUser: {
        email: 'top@test.com',
        tokens: 3000,
      },
      lowestUser: {
        email: 'low@test.com',
        tokens: 500,
      },
      topMembers: [
        {
          userId: 'user1',
          email: 'user1@test.com',
          username: 'user1',
          tokens: 3000,
          cost: 0.15,
          balance: 5000,
          lastActivity: '2024-01-01T10:00:00Z',
          percentageOfGroup: 30,
        },
        {
          userId: 'user2',
          email: 'user2@test.com',
          tokens: 2500,
          cost: 0.125,
          balance: 800,
          lastActivity: '2024-01-01T09:00:00Z',
          percentageOfGroup: 25,
        },
      ],
    },
    groupBalance: {
      totalBalance: 15000,
      averageBalance: 3000,
      membersWithLowBalance: 1,
    },
    periodComparison: {
      thisMonth: { tokens: 6000, cost: 0.3 },
      lastMonth: { tokens: 4000, cost: 0.2 },
      growth: '+50.0%',
    },
    topModels: [
      {
        model: 'gpt-4',
        usage: 8000,
        cost: 0.4,
        percentage: 80,
      },
      {
        model: 'gpt-3.5-turbo',
        usage: 2000,
        cost: 0.1,
        percentage: 20,
      },
    ],
    timeWindowCompliance: 0.87,
  };

  const mockMembersData = {
    groupId: 'group1',
    groupName: 'Test Group',
    members: [
      {
        userId: 'user1',
        email: 'user1@test.com',
        username: 'user1',
        tokens: 3000,
        promptTokens: 1800,
        completionTokens: 1200,
        cost: 0.15,
        balance: 5000,
        lastActivity: '2024-01-01T10:00:00Z',
        conversationCount: 10,
        percentageOfGroup: 30,
        rank: 1,
      },
      {
        userId: 'user2',
        email: 'user2@test.com',
        tokens: 2500,
        promptTokens: 1500,
        completionTokens: 1000,
        cost: 0.125,
        balance: 800,
        lastActivity: '2024-01-01T09:00:00Z',
        conversationCount: 8,
        percentageOfGroup: 25,
        rank: 2,
      },
    ],
    groupTotals: {
      totalTokens: 10000,
      totalMembers: 5,
      averagePerMember: 2000,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ groupId: 'group1' });

    (hooks.useGroupStatistics as jest.Mock).mockReturnValue({
      data: mockGroupStats,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    (hooks.useGroupMemberStatistics as jest.Mock).mockReturnValue({
      data: mockMembersData,
      isLoading: false,
      error: null,
    });
  });

  it('should render loading state', () => {
    (hooks.useGroupStatistics as jest.Mock).mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });

    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Loading group statistics...')).toBeInTheDocument();
  });

  it('should render error state with retry button', () => {
    const mockRefetch = jest.fn();
    (hooks.useGroupStatistics as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('API Error'),
      refetch: mockRefetch,
    });

    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Error loading group statistics')).toBeInTheDocument();

    const retryButton = screen.getByText('Try Again');
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('should render group header with navigation', () => {
    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Back to Groups')).toBeInTheDocument();
    expect(screen.getByText('Test Group')).toBeInTheDocument();
    expect(screen.getByText(/5 members.*Active/)).toBeInTheDocument();
    expect(screen.getByText(/2 time windows/)).toBeInTheDocument();

    // Test back navigation
    const backButton = screen.getByText('Back to Groups');
    fireEvent.click(backButton);
    expect(mockNavigate).toHaveBeenCalledWith('/d/statistics/groups');
  });

  it('should render quick stats cards', () => {
    renderWithProviders(<GroupStatsDetail />);

    // Check stats cards
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
    expect(screen.getByText('10,000')).toBeInTheDocument();
    expect(screen.getByText('Total Cost')).toBeInTheDocument();
    expect(screen.getByText('$0.50')).toBeInTheDocument();
    expect(screen.getByText('Active Members')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('should render period comparison', () => {
    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Period Comparison')).toBeInTheDocument();
    expect(screen.getByText('This Month')).toBeInTheDocument();
    expect(screen.getByText('6,000 tokens')).toBeInTheDocument();
    expect(screen.getByText('$0.30')).toBeInTheDocument();
    expect(screen.getByText('Last Month')).toBeInTheDocument();
    expect(screen.getByText('4,000 tokens')).toBeInTheDocument();
    expect(screen.getByText('$0.20')).toBeInTheDocument();
    expect(screen.getByText('+50.0%')).toBeInTheDocument();
  });

  it('should render group balance overview', () => {
    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Group Balance')).toBeInTheDocument();
    expect(screen.getByText('Total Balance')).toBeInTheDocument();
    expect(screen.getByText('15,000')).toBeInTheDocument();
    expect(screen.getByText('Average per Member')).toBeInTheDocument();
    expect(screen.getByText('3,000')).toBeInTheDocument();
    expect(screen.getByText('Low Balance Members')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('should render top models section', () => {
    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Top Models Used')).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('8,000 tokens')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('$0.40')).toBeInTheDocument();
    expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument();
    expect(screen.getByText('2,000 tokens')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('$0.10')).toBeInTheDocument();
  });

  it('should render time windows section', () => {
    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Time Windows')).toBeInTheDocument();
    expect(screen.getByText('Business Hours')).toBeInTheDocument();
    expect(screen.getByText('daily')).toBeInTheDocument();
    expect(screen.getByText('Weekend')).toBeInTheDocument();
    expect(screen.getByText('weekly')).toBeInTheDocument();
    expect(screen.getByText('Time Window Compliance')).toBeInTheDocument();
    expect(screen.getByText('87.0%')).toBeInTheDocument();
  });

  it('should render member statistics table', () => {
    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Member Statistics')).toBeInTheDocument();

    // Check table content
    expect(screen.getByText('user1@test.com')).toBeInTheDocument();
    expect(screen.getByText('user2@test.com')).toBeInTheDocument();
    expect(screen.getByText('3,000')).toBeInTheDocument();
    expect(screen.getByText('1,800 + 1,200')).toBeInTheDocument();
    expect(screen.getByText('$0.15')).toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('should show low balance warning for members', () => {
    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Low balance')).toBeInTheDocument();
  });

  it('should toggle member statistics visibility', () => {
    renderWithProviders(<GroupStatsDetail />);

    const toggleButton = screen.getByText('Hide Members');
    fireEvent.click(toggleButton);

    // Members table should be hidden
    expect(screen.queryByText('user1@test.com')).not.toBeInTheDocument();
    expect(screen.getByText('Show Members')).toBeInTheDocument();

    // Show again
    fireEvent.click(screen.getByText('Show Members'));
    expect(screen.getByText('user1@test.com')).toBeInTheDocument();
  });

  it('should handle refresh data', () => {
    const mockRefetch = jest.fn();
    (hooks.useGroupStatistics as jest.Mock).mockReturnValue({
      data: mockGroupStats,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<GroupStatsDetail />);

    const refreshButton = screen.getByText('Refresh Data');
    fireEvent.click(refreshButton);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('should handle missing group ID', () => {
    mockUseParams.mockReturnValue({ groupId: undefined });

    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Group ID not found')).toBeInTheDocument();
  });

  it('should handle group not found', () => {
    (hooks.useGroupStatistics as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Group not found')).toBeInTheDocument();
  });

  it('should show loading state for members', () => {
    (hooks.useGroupMemberStatistics as jest.Mock).mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('Loading members...')).toBeInTheDocument();
  });

  it('should show empty state for members', () => {
    (hooks.useGroupMemberStatistics as jest.Mock).mockReturnValue({
      data: { ...mockMembersData, members: [] },
      isLoading: false,
      error: null,
    });

    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('No member activity found')).toBeInTheDocument();
  });

  it('should handle inactive group', () => {
    const inactiveGroupStats = {
      ...mockGroupStats,
      isActive: false,
    };

    (hooks.useGroupStatistics as jest.Mock).mockReturnValue({
      data: inactiveGroupStats,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText(/Inactive/)).toBeInTheDocument();
  });

  it('should handle negative growth', () => {
    const negativeGrowthStats = {
      ...mockGroupStats,
      periodComparison: {
        ...mockGroupStats.periodComparison,
        growth: '-25.0%',
      },
    };

    (hooks.useGroupStatistics as jest.Mock).mockReturnValue({
      data: negativeGrowthStats,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('-25.0%')).toBeInTheDocument();
  });

  it('should handle group without time windows', () => {
    const noTimeWindowsStats = {
      ...mockGroupStats,
      timeWindows: [],
      timeWindowCompliance: undefined,
    };

    (hooks.useGroupStatistics as jest.Mock).mockReturnValue({
      data: noTimeWindowsStats,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithProviders(<GroupStatsDetail />);

    expect(screen.queryByText('Time Windows')).not.toBeInTheDocument();
  });

  it('should handle group without top models', () => {
    const noModelsStats = {
      ...mockGroupStats,
      topModels: [],
    };

    (hooks.useGroupStatistics as jest.Mock).mockReturnValue({
      data: noModelsStats,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithProviders(<GroupStatsDetail />);

    expect(screen.queryByText('Top Models Used')).not.toBeInTheDocument();
  });

  it('should display member rank in table', () => {
    renderWithProviders(<GroupStatsDetail />);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('should format relative time correctly', () => {
    renderWithProviders(<GroupStatsDetail />);

    // Should show formatted relative time for last activity
    expect(screen.getAllByText('2 hours ago')).toHaveLength(2); // Two members
  });
});
