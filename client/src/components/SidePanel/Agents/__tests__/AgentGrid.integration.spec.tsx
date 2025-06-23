import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AgentGrid from '../AgentGrid';
import { useGetMarketplaceAgentsQuery } from 'librechat-data-provider/react-query';
import type t from 'librechat-data-provider';

// Mock the marketplace agent query hook
jest.mock('~/hooks/Agents', () => ({
  useGetMarketplaceAgentsQuery: jest.fn(),
  useAgentCategories: jest.fn(() => ({
    categories: [],
    isLoading: false,
    error: null,
  })),
}));

// Mock useLocalize hook
jest.mock('~/hooks/useLocalize', () => () => (key: string) => {
  const mockTranslations: Record<string, string> = {
    com_agents_top_picks: 'Top Picks',
    com_agents_all: 'All Agents',
    com_agents_recommended: 'Our recommended agents',
    com_agents_results_for: 'Results for "{{query}}"',
    com_agents_see_more: 'See more',
    com_agents_error_loading: 'Error loading agents',
    com_agents_error_searching: 'Error searching agents',
    com_agents_no_results: 'No agents found. Try another search term.',
    com_agents_none_in_category: 'No agents found in this category',
    com_agents_search_empty_heading: 'No results found',
    com_agents_empty_state_heading: 'No agents available',
    com_agents_loading: 'Loading...',
    com_agents_grid_announcement: '{{count}} agents in {{category}}',
    com_agents_load_more_label: 'Load more agents from {{category}}',
  };
  return mockTranslations[key] || key.replace(/{{(\w+)}}/g, (match, key) => `[${key}]`);
});

// Mock SmartLoader components
jest.mock('../SmartLoader', () => ({
  SmartLoader: ({ children, isLoading }: { children: React.ReactNode; isLoading: boolean }) =>
    isLoading ? <div>Loading...</div> : <div>{children}</div>,
  useHasData: (data: any) => !!data?.agents?.length,
}));

// Mock ErrorDisplay component
jest.mock('../ErrorDisplay', () => ({
  __esModule: true,
  default: ({ error, onRetry }: { error: string; onRetry: () => void }) => (
    <div>
      <div>Error: {error}</div>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

// Mock AgentCard component
jest.mock('../AgentCard', () => ({
  __esModule: true,
  default: ({ agent, onClick }: { agent: t.Agent; onClick: () => void }) => (
    <div data-testid={`agent-card-${agent.id}`} onClick={onClick}>
      <h3>{agent.name}</h3>
      <p>{agent.description}</p>
    </div>
  ),
}));

const mockUseGetMarketplaceAgentsQuery = useGetMarketplaceAgentsQuery as jest.MockedFunction<
  typeof useGetMarketplaceAgentsQuery
>;

describe('AgentGrid Integration with useGetMarketplaceAgentsQuery', () => {
  const mockOnSelectAgent = jest.fn();

  const mockAgents: t.Agent[] = [
    {
      id: '1',
      name: 'Test Agent 1',
      description: 'First test agent',
      avatar: { filepath: '/avatar1.png', source: 'local' },
      category: 'finance',
      authorName: 'Author 1',
      created_at: 1672531200000,
      instructions: null,
      provider: 'custom',
      model: 'gpt-4',
      model_parameters: {},
    },
    {
      id: '2',
      name: 'Test Agent 2',
      description: 'Second test agent',
      avatar: { filepath: '/avatar2.png', source: 'local' },
      category: 'finance',
      authorName: 'Author 2',
      created_at: 1672531200000,
      instructions: null,
      provider: 'custom',
      model: 'gpt-4',
      model_parameters: {},
    },
  ];

  const defaultMockQueryResult = {
    data: {
      data: mockAgents,
      pagination: {
        current: 1,
        hasMore: true,
        total: 10,
      },
    },
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: jest.fn(),
    isSuccess: true,
    isError: false,
    status: 'success' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetMarketplaceAgentsQuery.mockReturnValue(defaultMockQueryResult);
  });

  describe('Query Integration', () => {
    it('should call useGetMarketplaceAgentsQuery with correct parameters for category search', () => {
      render(
        <AgentGrid category="finance" searchQuery="test query" onSelectAgent={mockOnSelectAgent} />,
      );

      expect(mockUseGetMarketplaceAgentsQuery).toHaveBeenCalledWith({
        requiredPermission: 1,
        category: 'finance',
        search: 'test query',
        limit: 6,
      });
    });

    it('should call useGetMarketplaceAgentsQuery with promoted=1 for promoted category', () => {
      render(<AgentGrid category="promoted" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(mockUseGetMarketplaceAgentsQuery).toHaveBeenCalledWith({
        requiredPermission: 1,
        promoted: 1,
        limit: 6,
      });
    });

    it('should call useGetMarketplaceAgentsQuery without category filter for "all" category', () => {
      render(<AgentGrid category="all" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(mockUseGetMarketplaceAgentsQuery).toHaveBeenCalledWith({
        requiredPermission: 1,
        limit: 6,
      });
    });

    it('should not include category in search when category is "all" or "promoted"', () => {
      render(<AgentGrid category="all" searchQuery="test" onSelectAgent={mockOnSelectAgent} />);

      expect(mockUseGetMarketplaceAgentsQuery).toHaveBeenCalledWith({
        requiredPermission: 1,
        search: 'test',
        limit: 6,
      });
    });
  });

  describe('Agent Display', () => {
    it('should render agent cards when data is available', () => {
      render(<AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.getByTestId('agent-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('agent-card-2')).toBeInTheDocument();
      expect(screen.getByText('Test Agent 1')).toBeInTheDocument();
      expect(screen.getByText('Test Agent 2')).toBeInTheDocument();
    });

    it('should call onSelectAgent when agent card is clicked', () => {
      render(<AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      fireEvent.click(screen.getByTestId('agent-card-1'));
      expect(mockOnSelectAgent).toHaveBeenCalledWith(mockAgents[0]);
    });
  });

  describe('Loading States', () => {
    it('should show loading state when isLoading is true', () => {
      mockUseGetMarketplaceAgentsQuery.mockReturnValue({
        ...defaultMockQueryResult,
        isLoading: true,
        data: undefined,
      });

      render(<AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should show empty state when no agents are available', () => {
      mockUseGetMarketplaceAgentsQuery.mockReturnValue({
        ...defaultMockQueryResult,
        data: { data: [], pagination: { current: 1, hasMore: false, total: 0 } },
      });

      render(<AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.getByText('No agents available')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should show error display when query has error', () => {
      const mockError = new Error('Failed to fetch agents');
      mockUseGetMarketplaceAgentsQuery.mockReturnValue({
        ...defaultMockQueryResult,
        error: mockError,
        isError: true,
        data: undefined,
      });

      render(<AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.getByText('Error: Failed to fetch agents')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });

  describe('Search Results', () => {
    it('should show search results title when searching', () => {
      render(
        <AgentGrid category="finance" searchQuery="automation" onSelectAgent={mockOnSelectAgent} />,
      );

      expect(screen.getByText('Results for "automation"')).toBeInTheDocument();
    });

    it('should show empty search results message', () => {
      mockUseGetMarketplaceAgentsQuery.mockReturnValue({
        ...defaultMockQueryResult,
        data: { data: [], pagination: { current: 1, hasMore: false, total: 0 } },
      });

      render(
        <AgentGrid
          category="finance"
          searchQuery="nonexistent"
          onSelectAgent={mockOnSelectAgent}
        />,
      );

      expect(screen.getByText('No results found')).toBeInTheDocument();
      expect(screen.getByText('No agents found. Try another search term.')).toBeInTheDocument();
    });
  });

  describe('Load More Functionality', () => {
    it('should show "See more" button when hasMore is true', () => {
      render(<AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.getByRole('button', { name: 'See more' })).toBeInTheDocument();
    });

    it('should not show "See more" button when hasMore is false', () => {
      mockUseGetMarketplaceAgentsQuery.mockReturnValue({
        ...defaultMockQueryResult,
        data: {
          ...defaultMockQueryResult.data,
          pagination: { current: 1, hasMore: false, total: 2 },
        },
      });

      render(<AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.queryByRole('button', { name: 'See more' })).not.toBeInTheDocument();
    });
  });
});
