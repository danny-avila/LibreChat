import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AgentGrid from '../AgentGrid';
import type t from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the marketplace agent query hook
jest.mock('~/data-provider/Agents', () => ({
  useMarketplaceAgentsInfiniteQuery: jest.fn(),
}));

jest.mock('~/hooks/Agents', () => ({
  useAgentCategories: jest.fn(() => ({
    categories: [],
    isLoading: false,
    error: null,
  })),
}));

// Mock SmartLoader
jest.mock('../SmartLoader', () => ({
  useHasData: jest.fn(() => true),
}));

// Mock useLocalize hook
jest.mock('~/hooks/useLocalize', () => () => (key: string, options?: any) => {
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

  let translation = mockTranslations[key] || key;

  if (options) {
    Object.keys(options).forEach((optionKey) => {
      translation = translation.replace(new RegExp(`{{${optionKey}}}`, 'g'), options[optionKey]);
    });
  }

  return translation;
});

// Mock ErrorDisplay component
jest.mock('../ErrorDisplay', () => ({
  __esModule: true,
  default: ({ error, onRetry }: { error: any; onRetry: () => void }) => (
    <div>
      <div>
        {`Error: `}
        {typeof error === 'string' ? error : error?.message || 'Unknown error'}
      </div>
      <button onClick={onRetry}>{`Retry`}</button>
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

// Import the actual modules to get the mocked functions
import { useMarketplaceAgentsInfiniteQuery } from '~/data-provider/Agents';

const mockUseMarketplaceAgentsInfiniteQuery = jest.mocked(useMarketplaceAgentsInfiniteQuery);

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
      model_parameters: {
        temperature: null,
        maxContextTokens: null,
        max_context_tokens: null,
        max_output_tokens: null,
        top_p: null,
        frequency_penalty: null,
        presence_penalty: null,
      },
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
      model_parameters: {
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0,
        maxContextTokens: null,
        max_context_tokens: null,
        max_output_tokens: null,
        presence_penalty: null,
      },
    },
  ];
  const defaultMockQueryResult = {
    data: {
      pages: [
        {
          data: mockAgents,
        },
      ],
    },
    isLoading: false,
    error: null,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: true,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMarketplaceAgentsInfiniteQuery.mockReturnValue(defaultMockQueryResult);
  });

  describe('Query Integration', () => {
    it('should call useGetMarketplaceAgentsQuery with correct parameters for category search', () => {
      render(
        <AgentGrid category="finance" searchQuery="test query" onSelectAgent={mockOnSelectAgent} />,
      );

      expect(mockUseMarketplaceAgentsInfiniteQuery).toHaveBeenCalledWith({
        requiredPermission: 1,
        category: 'finance',
        search: 'test query',
        limit: 6,
      });
    });

    it('should call useGetMarketplaceAgentsQuery with promoted=1 for promoted category', () => {
      render(<AgentGrid category="promoted" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(mockUseMarketplaceAgentsInfiniteQuery).toHaveBeenCalledWith({
        requiredPermission: 1,
        promoted: 1,
        limit: 6,
      });
    });

    it('should call useGetMarketplaceAgentsQuery without category filter for "all" category', () => {
      render(<AgentGrid category="all" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(mockUseMarketplaceAgentsInfiniteQuery).toHaveBeenCalledWith({
        requiredPermission: 1,
        limit: 6,
      });
    });

    it('should not include category in search when category is "all" or "promoted"', () => {
      render(<AgentGrid category="all" searchQuery="test" onSelectAgent={mockOnSelectAgent} />);

      expect(mockUseMarketplaceAgentsInfiniteQuery).toHaveBeenCalledWith({
        requiredPermission: 1,
        search: 'test',
        limit: 6,
      });
    });
  });

  // Create wrapper with QueryClient
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  describe('Agent Display', () => {
    it('should render agent cards when data is available', () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />
        </Wrapper>,
      );

      expect(screen.getByTestId('agent-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('agent-card-2')).toBeInTheDocument();
      expect(screen.getByText('Test Agent 1')).toBeInTheDocument();
      expect(screen.getByText('Test Agent 2')).toBeInTheDocument();
    });

    it('should call onSelectAgent when agent card is clicked', () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('agent-card-1'));
      expect(mockOnSelectAgent).toHaveBeenCalledWith(mockAgents[0]);
    });
  });

  describe('Loading States', () => {
    it('should show loading state when isLoading is true', () => {
      mockUseMarketplaceAgentsInfiniteQuery.mockReturnValue({
        ...defaultMockQueryResult,
        isLoading: true,
        data: undefined,
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />
        </Wrapper>,
      );

      // Should show skeleton loading state
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('should show empty state when no agents are available', () => {
      mockUseMarketplaceAgentsInfiniteQuery.mockReturnValue({
        ...defaultMockQueryResult,
        data: {
          pages: [
            {
              data: [],
            },
          ],
        },
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />
        </Wrapper>,
      );

      expect(screen.getByText('No agents available')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should show error display when query has error', () => {
      const mockError = new Error('Failed to fetch agents');
      mockUseMarketplaceAgentsInfiniteQuery.mockReturnValue({
        ...defaultMockQueryResult,
        error: mockError,
        isError: true,
        data: undefined,
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />
        </Wrapper>,
      );

      expect(screen.getByText('Error: Failed to fetch agents')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });

  describe('Search Results', () => {
    it('should show search results title when searching', () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid
            category="finance"
            searchQuery="automation"
            onSelectAgent={mockOnSelectAgent}
          />
        </Wrapper>,
      );

      expect(screen.getByText('Results for "automation"')).toBeInTheDocument();
    });

    it('should show empty search results message', () => {
      mockUseMarketplaceAgentsInfiniteQuery.mockReturnValue({
        ...defaultMockQueryResult,
        data: {
          pages: [
            {
              data: [],
            },
          ],
        },
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid
            category="finance"
            searchQuery="nonexistent"
            onSelectAgent={mockOnSelectAgent}
          />
        </Wrapper>,
      );

      expect(screen.getByText('No results found')).toBeInTheDocument();
      expect(screen.getByText('No agents found. Try another search term.')).toBeInTheDocument();
    });
  });

  describe('Load More Functionality', () => {
    it('should show "See more" button when hasNextPage is true', () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />
        </Wrapper>,
      );

      expect(
        screen.getByRole('button', { name: 'Load more agents from Finance' }),
      ).toBeInTheDocument();
    });

    it('should not show "See more" button when hasNextPage is false', () => {
      mockUseMarketplaceAgentsInfiniteQuery.mockReturnValue({
        ...defaultMockQueryResult,
        hasNextPage: false,
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />
        </Wrapper>,
      );

      expect(screen.queryByRole('button', { name: /Load more agents/ })).not.toBeInTheDocument();
    });
  });
});
