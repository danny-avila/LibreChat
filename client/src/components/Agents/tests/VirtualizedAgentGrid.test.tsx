import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { jest } from '@jest/globals';
import type t from 'librechat-data-provider';
import VirtualizedAgentGrid from '../VirtualizedAgentGrid';

type RowRendererProps = {
  index: number;
  key: string;
  style: React.CSSProperties;
  parent: { props: { width: number } };
};

type VirtualListMockProps = {
  rowRenderer: (props: RowRendererProps) => React.ReactNode;
  rowCount: number;
  width?: number;
  style?: React.CSSProperties;
  'aria-rowcount'?: number;
  'data-testid'?: string;
  'data-total-rows'?: number;
};

type WindowScrollerChildProps = {
  height: number;
  isScrolling: boolean;
  registerChild: (ref: HTMLElement | null) => void;
  onChildScroll: () => void;
  scrollTop: number;
};

type MarketplaceAgentsMock = {
  useMarketplaceAgentsInfiniteQuery: jest.Mock;
};

type LocalizeParams = {
  count?: number;
  category?: string;
};

// Mock react-virtualized
jest.mock('react-virtualized', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');

  return {
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
    List: ReactActual.forwardRef(
      (
        {
          rowRenderer,
          rowCount,
          width,
          style,
          'aria-rowcount': ariaRowCount,
          'data-testid': dataTestId,
          'data-total-rows': dataTotalRows,
        }: VirtualListMockProps,
        ref: React.ForwardedRef<{ forceUpdateGrid: () => void }>,
      ) => {
        ReactActual.useImperativeHandle(ref, () => ({
          forceUpdateGrid: () => {},
        }));

        return (
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
        );
      },
    ),
    WindowScroller: ({
      children,
    }: {
      children: (props: WindowScrollerChildProps) => React.ReactNode;
      scrollElement?: HTMLElement | null;
    }) => {
      return children({
        height: 600,
        isScrolling: false,
        registerChild: (_ref: HTMLElement | null) => {},
        onChildScroll: () => {},
        scrollTop: 0,
      });
    },
  };
});

// Mock the data provider
const createMockInfiniteQuery = (overrides = {}) => ({
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
  ...overrides,
});

jest.mock('~/data-provider/Agents', () => ({
  useMarketplaceAgentsInfiniteQuery: jest.fn(),
}));

// Mock other hooks
jest.mock('~/hooks', () => ({
  useAgentCategories: () => ({
    categories: [
      { value: 'productivity', label: 'Productivity' },
      { value: 'development', label: 'Development' },
    ],
  }),
  useLocalize: () => (key: string, params?: LocalizeParams) => {
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

    const useMarketplaceAgentsInfiniteQuery = (
      jest.requireMock('~/data-provider/Agents') as MarketplaceAgentsMock
    ).useMarketplaceAgentsInfiniteQuery;
    useMarketplaceAgentsInfiniteQuery.mockImplementation(() => createMockInfiniteQuery());
  });

  const renderComponent = (
    props: Partial<React.ComponentProps<typeof VirtualizedAgentGrid>> = {},
  ) => {
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

  it('renders virtual list container', () => {
    renderComponent();

    expect(screen.getByTestId('virtual-list')).toBeInTheDocument();
  });

  it('displays agent cards in virtual rows', () => {
    renderComponent();

    expect(screen.getByTestId('agent-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('agent-card-2')).toBeInTheDocument();

    expect(screen.getByText('Test Agent 1')).toBeInTheDocument();
    expect(screen.getByText('Test Agent 2')).toBeInTheDocument();
  });

  it('calls onSelectAgent when agent card is clicked', () => {
    const onSelectAgent = jest.fn();
    renderComponent({ onSelectAgent });

    expect(screen.getByTestId('agent-card-1')).toBeInTheDocument();

    screen.getByTestId('agent-card-1').click();

    expect(onSelectAgent).toHaveBeenCalledWith({
      id: '1',
      name: 'Test Agent 1',
      description: 'A test agent for virtual scrolling',
      category: 'productivity',
    });
  });

  it('shows loading spinner when loading', () => {
    const mockQuery = jest.fn(() => ({
      ...createMockInfiniteQuery(),
      isLoading: true,
      data: undefined,
    }));

    const useMarketplaceAgentsInfiniteQuery = (
      jest.requireMock('~/data-provider/Agents') as MarketplaceAgentsMock
    ).useMarketplaceAgentsInfiniteQuery;
    useMarketplaceAgentsInfiniteQuery.mockImplementation(mockQuery);

    renderComponent();

    // Should show loading spinner
    const spinner = document.querySelector('.spinner');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('h-8 w-8 text-primary');
  });

  it('has proper accessibility attributes', () => {
    renderComponent({ category: 'productivity' });

    expect(screen.getByTestId('virtual-list')).toBeInTheDocument();

    const gridContainer = screen.getByRole('grid');
    expect(gridContainer).toHaveAttribute('aria-label');
    expect(gridContainer.getAttribute('aria-label')).toContain('2');
    expect(gridContainer.getAttribute('aria-label')).toContain('Productivity');

    const tabpanel = screen.getByRole('tabpanel');
    expect(tabpanel).toHaveAttribute('id', 'category-panel-productivity');
    expect(tabpanel).toHaveAttribute('aria-labelledby', 'category-tab-productivity');
  });
});
