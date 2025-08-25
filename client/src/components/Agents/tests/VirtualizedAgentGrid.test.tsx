import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { jest } from '@jest/globals';
import VirtualizedAgentGrid from '../VirtualizedAgentGrid';
import type t from 'librechat-data-provider';

// Mock react-virtualized
jest.mock('react-virtualized', () => ({
  AutoSizer: ({
    children,
    disableHeight,
  }: {
    children: (props: { width: number; height?: number }) => React.ReactNode;
    disableHeight?: boolean;
  }) => {
    if (disableHeight) {
      return children({ width: 800 });
    }
    return children({ width: 800, height: 600 });
  },
  List: ({
    rowRenderer,
    rowCount,
    width,
    style,
    'aria-rowcount': ariaRowCount,
    'data-testid': dataTestId,
    'data-total-rows': dataTotalRows,
  }: {
    rowRenderer: any;
    rowCount: number;
    autoHeight?: boolean;
    height?: number;
    width?: number;
    rowHeight?: number;
    overscanRowCount?: number;
    scrollTop?: number;
    isScrolling?: boolean;
    onScroll?: any;
    style?: any;
    'aria-rowcount'?: number;
    'data-testid'?: string;
    'data-total-rows'?: number;
  }) => (
    <div
      data-testid={dataTestId || 'virtual-list'}
      aria-rowcount={ariaRowCount}
      data-total-rows={dataTotalRows}
      style={style}
    >
      {Array.from({ length: Math.min(rowCount, 5) }, (_, index) =>
        rowRenderer({
          index,
          key: `row-${index}`,
          style: {},
          parent: { props: { width: width || 800 } },
        }),
      )}
    </div>
  ),
  WindowScroller: ({
    children,
  }: {
    children: (props: any) => React.ReactNode;
    scrollElement?: HTMLElement | null;
  }) => {
    return children({
      height: 600,
      isScrolling: false,
      registerChild: (_ref: any) => {},
      onChildScroll: () => {},
      scrollTop: 0,
    });
  },
}));

// Mock the data provider
const mockInfiniteQuery = {
  data: {
    pages: [
      {
        data: [
          {
            id: '1',
            name: 'Test Agent 1',
            description: 'A test agent for virtual scrolling',
            category: 'productivity',
          },
          {
            id: '2',
            name: 'Test Agent 2',
            description: 'Another test agent',
            category: 'development',
          },
        ],
      },
    ],
  },
  isLoading: false,
  error: null,
  isFetching: false,
  fetchNextPage: jest.fn(),
  hasNextPage: true,
  refetch: jest.fn(),
  isFetchingNextPage: false,
};

jest.mock('~/data-provider/Agents', () => ({
  useMarketplaceAgentsInfiniteQuery: jest.fn(() => mockInfiniteQuery),
}));

// Mock other hooks
jest.mock('~/hooks', () => ({
  useAgentCategories: () => ({
    categories: [
      { value: 'productivity', label: 'Productivity' },
      { value: 'development', label: 'Development' },
    ],
  }),
  useLocalize: () => (key: string, params?: any) => {
    if (key === 'com_agents_grid_announcement') {
      return `Found ${params?.count || 0} agents in ${params?.category || 'category'}`;
    }
    return key;
  },
}));

jest.mock('../SmartLoader', () => ({
  useHasData: () => true,
}));

jest.mock('../AgentCard', () => {
  return function MockAgentCard({ agent, onClick }: { agent: t.Agent; onClick: () => void }) {
    return (
      <div data-testid={`agent-card-${agent.id}`} onClick={onClick}>
        <h3>{agent.name}</h3>
        <p>{agent.description}</p>
      </div>
    );
  };
});

describe('VirtualizedAgentGrid', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      category: 'all',
      searchQuery: '',
      onSelectAgent: jest.fn(),
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <VirtualizedAgentGrid {...defaultProps} {...props} />
      </QueryClientProvider>,
    );
  };

  it('renders virtual list container', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('virtual-list')).toBeInTheDocument();
    });
  });

  it('displays agent cards in virtual rows', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('agent-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('agent-card-2')).toBeInTheDocument();
    });

    expect(screen.getByText('Test Agent 1')).toBeInTheDocument();
    expect(screen.getByText('Test Agent 2')).toBeInTheDocument();
  });

  it('calls onSelectAgent when agent card is clicked', async () => {
    const onSelectAgent = jest.fn();
    renderComponent({ onSelectAgent });

    await waitFor(() => {
      expect(screen.getByTestId('agent-card-1')).toBeInTheDocument();
    });

    screen.getByTestId('agent-card-1').click();

    expect(onSelectAgent).toHaveBeenCalledWith({
      id: '1',
      name: 'Test Agent 1',
      description: 'A test agent for virtual scrolling',
      category: 'productivity',
    });
  });

  it('shows loading spinner when loading', async () => {
    const mockQuery = jest.fn(() => ({
      ...mockInfiniteQuery,
      isLoading: true,
      data: undefined,
    }));

    const useMarketplaceAgentsInfiniteQuery =
      jest.requireMock('~/data-provider/Agents').useMarketplaceAgentsInfiniteQuery;
    useMarketplaceAgentsInfiniteQuery.mockImplementation(mockQuery);

    renderComponent();

    // Should show loading spinner
    const spinner = document.querySelector('.spinner');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('h-8 w-8 text-primary');
  });

  it('has proper accessibility attributes', async () => {
    // Reset the mock to ensure we have data
    const useMarketplaceAgentsInfiniteQuery =
      jest.requireMock('~/data-provider/Agents').useMarketplaceAgentsInfiniteQuery;
    useMarketplaceAgentsInfiniteQuery.mockImplementation(() => mockInfiniteQuery);

    renderComponent({ category: 'productivity' });

    await waitFor(() => {
      expect(screen.getByTestId('virtual-list')).toBeInTheDocument();
    });

    const gridContainer = screen.getByRole('grid');
    expect(gridContainer).toHaveAttribute('aria-label');
    expect(gridContainer.getAttribute('aria-label')).toContain('2');
    expect(gridContainer.getAttribute('aria-label')).toContain('Productivity');

    const tabpanel = screen.getByRole('tabpanel');
    expect(tabpanel).toHaveAttribute('id', 'category-panel-productivity');
    expect(tabpanel).toHaveAttribute('aria-labelledby', 'category-tab-productivity');
  });
});
