import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { jest } from '@jest/globals';
import VirtualizedAgentGrid from '../VirtualizedAgentGrid';
import type * as t from 'librechat-data-provider';

// Mock react-virtualized for performance testing
const mockRowRenderer = jest.fn();

jest.mock('react-virtualized', () => {
  const mockRowRendererRef = { current: jest.fn() };

  return {
    AutoSizer: ({
      children,
      disableHeight,
    }: {
      children: (props: { width: number; height?: number }) => React.ReactNode;
      disableHeight?: boolean;
    }) => {
      if (disableHeight) {
        return children({ width: 1200 });
      }
      return children({ width: 1200, height: 800 });
    },
    List: ({
      rowRenderer,
      rowCount,
      autoHeight,
      height,
      width,
      rowHeight,
      overscanRowCount,
      scrollTop,
      isScrolling,
      onScroll,
      style,
      'aria-rowcount': ariaRowCount,
      'data-testid': dataTestId,
      'data-total-rows': dataTotalRows,
    }: {
      rowRenderer: any;
      rowCount: number;
      [key: string]: any;
    }) => {
      // Store the row renderer for testing
      if (typeof rowRenderer === 'function') {
        mockRowRendererRef.current = rowRenderer;
        mockRowRenderer.mockImplementation(rowRenderer);
      }
      // Only render visible rows to simulate virtualization
      const visibleRows = Math.min(10, rowCount); // Simulate 10 visible rows
      return (
        <div
          data-testid={dataTestId || 'virtual-list'}
          data-total-rows={dataTotalRows || rowCount}
          aria-rowcount={ariaRowCount}
          style={style}
        >
          {Array.from({ length: visibleRows }, (_, index) =>
            rowRenderer({
              index,
              key: `row-${index}`,
              style: { height: 184 },
              parent: { props: { width: width || 1200 } },
            }),
          )}
        </div>
      );
    },
    WindowScroller: ({
      children,
      scrollElement,
    }: {
      children: (props: any) => React.ReactNode;
      scrollElement?: HTMLElement | null;
    }) => {
      return children({
        height: 800,
        isScrolling: false,
        registerChild: (ref: any) => {},
        onChildScroll: () => {},
        scrollTop: 0,
      });
    },
  };
});

// Generate large dataset for performance testing
const generateLargeDataset = (count: number) => {
  const agents: Partial<t.Agent>[] = [];
  for (let i = 1; i <= count; i++) {
    agents.push({
      id: `agent-${i}`,
      name: `Performance Test Agent ${i}`,
      description: `This is agent ${i} for performance testing virtual scrolling with large datasets`,
      category: i % 2 === 0 ? 'productivity' : 'development',
    });
  }
  return agents;
};

// Mock the data provider with large dataset
const createMockInfiniteQuery = (agentCount: number) => ({
  data: {
    pages: [{ data: generateLargeDataset(agentCount) }],
  },
  isLoading: false,
  error: null,
  isFetching: false,
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  refetch: jest.fn(),
  isFetchingNextPage: false,
});

// Mock must be hoisted before imports
jest.mock('~/data-provider/Agents', () => ({
  useMarketplaceAgentsInfiniteQuery: jest.fn(),
}));
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
  return function MockAgentCard({ agent }: { agent: any }) {
    return (
      <div data-testid={`agent-card-${agent.id}`} style={{ height: '160px' }}>
        <h3>{agent.name}</h3>
        <p>{agent.description}</p>
      </div>
    );
  };
});

describe('Virtual Scrolling Performance', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockRowRenderer.mockClear();
  });

  const renderComponent = (agentCount: number) => {
    const mockQuery = createMockInfiniteQuery(agentCount);
    const useMarketplaceAgentsInfiniteQuery =
      jest.requireMock('~/data-provider/Agents').useMarketplaceAgentsInfiniteQuery;
    useMarketplaceAgentsInfiniteQuery.mockReturnValue(mockQuery);

    // Clear previous mock calls
    mockRowRenderer.mockClear();

    return render(
      <QueryClientProvider client={queryClient}>
        <VirtualizedAgentGrid category="all" searchQuery="" onSelectAgent={jest.fn()} />
      </QueryClientProvider>,
    );
  };

  it('efficiently handles 1000 agents without rendering all DOM nodes', () => {
    const startTime = performance.now();
    renderComponent(1000);
    const endTime = performance.now();

    const virtualList = screen.getByTestId('virtual-list');
    expect(virtualList).toBeInTheDocument();
    expect(virtualList).toHaveAttribute('data-total-rows', '500'); // 1000 agents / 2 per row

    // Should only render visible cards, not all 1000
    const renderedCards = screen.getAllByTestId(/agent-card-/);
    expect(renderedCards.length).toBeLessThan(50); // Much less than 1000
    expect(renderedCards.length).toBeGreaterThan(0);

    // Performance check: rendering should be fast
    const renderTime = endTime - startTime;
    expect(renderTime).toBeLessThan(650);

    console.log(`Rendered 1000 agents in ${renderTime.toFixed(2)}ms`);
    console.log(`Only ${renderedCards.length} DOM nodes created for 1000 agents`);
  });

  it('efficiently handles 5000 agents (stress test)', () => {
    const startTime = performance.now();
    renderComponent(5000);
    const endTime = performance.now();

    const virtualList = screen.getByTestId('virtual-list');
    expect(virtualList).toBeInTheDocument();
    expect(virtualList).toHaveAttribute('data-total-rows', '2500'); // 5000 agents / 2 per row

    // Should still only render visible cards
    const renderedCards = screen.getAllByTestId(/agent-card-/);
    expect(renderedCards.length).toBeLessThan(50);
    expect(renderedCards.length).toBeGreaterThan(0);

    // Performance should still be reasonable
    const renderTime = endTime - startTime;
    expect(renderTime).toBeLessThan(200); // Should render in less than 200ms

    console.log(`Rendered 5000 agents in ${renderTime.toFixed(2)}ms`);
    console.log(`Only ${renderedCards.length} DOM nodes created for 5000 agents`);
  });

  it('calculates correct number of virtual rows for different screen sizes', () => {
    // Test desktop layout (2 cards per row)
    renderComponent(100);

    const virtualList = screen.getByTestId('virtual-list');
    expect(virtualList).toHaveAttribute('data-total-rows', '50'); // 100 agents / 2 per row
  });

  it('row renderer is called efficiently', () => {
    // Reset the mock before testing
    mockRowRenderer.mockClear();

    renderComponent(1000);

    // Check that virtual list was rendered
    const virtualList = screen.getByTestId('virtual-list');
    expect(virtualList).toBeInTheDocument();

    // With virtualization, we should only render visible rows
    // Our mock renders 10 visible rows max
    const renderedCards = screen.getAllByTestId(/agent-card-/);
    expect(renderedCards.length).toBeLessThanOrEqual(20); // At most 10 rows * 2 cards per row
    expect(renderedCards.length).toBeGreaterThan(0);
  });

  it('memory usage remains stable with large datasets', () => {
    // Test that memory doesn't grow linearly with data size
    const measureMemory = () => {
      const cards = screen.queryAllByTestId(/agent-card-/);
      return cards.length;
    };

    renderComponent(100);
    const memory100 = measureMemory();

    renderComponent(1000);
    const memory1000 = measureMemory();

    renderComponent(5000);
    const memory5000 = measureMemory();

    // Memory usage should not scale linearly with data size
    // All should render roughly the same number of DOM nodes
    expect(Math.abs(memory100 - memory1000)).toBeLessThan(30);
    expect(Math.abs(memory1000 - memory5000)).toBeLessThan(30);

    console.log(
      `Memory usage: 100 agents=${memory100}, 1000 agents=${memory1000}, 5000 agents=${memory5000}`,
    );
  });
});
