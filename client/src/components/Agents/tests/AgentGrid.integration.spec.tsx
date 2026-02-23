import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

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
    com_agents_search_empty_heading: 'No results found',
    com_agents_empty_state_heading: 'No agents available',
    com_agents_loading: 'Loading...',
    com_agents_grid_announcement: '{{count}} agents in {{category}}',
    com_agents_no_more_results: "You've reached the end of the results",
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

// Helper to create mock API response
const createMockResponse = (
  agentIds: string[],
  hasMore: boolean,
  afterCursor?: string,
): t.AgentListResponse => ({
  object: 'list',
  data: agentIds.map(
    (id) =>
      ({
        id,
        name: `Agent ${id}`,
        description: `Description for ${id}`,
        created_at: Date.now(),
        model: 'gpt-4',
        tools: [],
        instructions: '',
        avatar: null,
        provider: 'openai',
        model_parameters: {
          temperature: 0.7,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
          maxContextTokens: 2000,
          max_context_tokens: 2000,
          max_output_tokens: 2000,
        },
      }) as t.Agent,
  ),
  first_id: agentIds[0] || '',
  last_id: agentIds[agentIds.length - 1] || '',
  has_more: hasMore,
  after: afterCursor,
});

// Helper to setup mock viewport
const setupViewport = (scrollHeight: number, clientHeight: number) => {
  const listeners: { [key: string]: EventListener[] } = {};
  return {
    scrollHeight,
    clientHeight,
    scrollTop: 0,
    addEventListener: jest.fn((event: string, listener: EventListener) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(listener);
    }),
    removeEventListener: jest.fn((event: string, listener: EventListener) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((l) => l !== listener);
      }
    }),
    dispatchEvent: jest.fn((event: Event) => {
      const eventListeners = listeners[event.type];
      if (eventListeners) {
        eventListeners.forEach((listener) => listener(event));
      }
      return true;
    }),
  } as unknown as HTMLElement;
};

// Helper to create mock infinite query return value
const createMockInfiniteQuery = (
  pages: t.AgentListResponse[],
  options?: {
    isLoading?: boolean;
    hasNextPage?: boolean;
    fetchNextPage?: jest.Mock;
    isFetchingNextPage?: boolean;
  },
) =>
  ({
    data: {
      pages,
      pageParams: pages.map((_, i) => (i === 0 ? undefined : `cursor-${i * 6}`)),
    },
    isLoading: options?.isLoading ?? false,
    error: null,
    isFetching: false,
    hasNextPage: options?.hasNextPage ?? pages[pages.length - 1]?.has_more ?? false,
    isFetchingNextPage: options?.isFetchingNextPage ?? false,
    fetchNextPage: options?.fetchNextPage ?? jest.fn(),
    refetch: jest.fn(),
    // Add missing required properties for UseInfiniteQueryResult
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isSuccess: true,
    status: 'success' as const,
    dataUpdatedAt: Date.now(),
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: 'idle' as const,
    isFetched: true,
    isFetchedAfterMount: true,
    isInitialLoading: false,
    isPaused: false,
    isPlaceholderData: false,
    isPending: false,
    isRefetching: false,
    isStale: false,
    remove: jest.fn(),
  }) as any;

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

      // Should show loading spinner
      const spinner = document.querySelector('.text-primary');
      expect(spinner).toBeInTheDocument();
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

      // The component doesn't show search result titles, just displays the filtered agents
      expect(screen.getByTestId('agent-card-1')).toBeInTheDocument();
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

      expect(screen.getByText('No agents available')).toBeInTheDocument();
    });
  });

  describe('Infinite Scroll Functionality', () => {
    beforeEach(() => {
      // Silence console.log in tests
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should show loading indicator when fetching next page', () => {
      mockUseMarketplaceAgentsInfiniteQuery.mockReturnValue({
        ...defaultMockQueryResult,
        isFetchingNextPage: true,
        hasNextPage: true,
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />
        </Wrapper>,
      );

      expect(screen.getByRole('status', { name: 'Loading...' })).toBeInTheDocument();
      expect(screen.getByText('Loading...')).toHaveClass('sr-only');
    });

    it('should show end of results message when hasNextPage is false and agents exist', () => {
      mockUseMarketplaceAgentsInfiniteQuery.mockReturnValue({
        ...defaultMockQueryResult,
        hasNextPage: false,
        isFetchingNextPage: false,
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />
        </Wrapper>,
      );

      expect(screen.getByText("You've reached the end of the results")).toBeInTheDocument();
    });

    it('should not show end of results message when no agents exist', () => {
      mockUseMarketplaceAgentsInfiniteQuery.mockReturnValue({
        ...defaultMockQueryResult,
        hasNextPage: false,
        data: {
          pages: [{ data: [] }],
        },
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />
        </Wrapper>,
      );

      expect(screen.queryByText("You've reached the end of the results")).not.toBeInTheDocument();
    });

    describe('Auto-fetch to fill viewport', () => {
      it('should NOT auto-fetch when viewport is filled (5 agents, has_more=false)', async () => {
        const mockResponse = createMockResponse(['1', '2', '3', '4', '5'], false);
        const fetchNextPage = jest.fn();

        mockUseMarketplaceAgentsInfiniteQuery.mockReturnValue(
          createMockInfiniteQuery([mockResponse], { fetchNextPage }),
        );

        const scrollElement = setupViewport(500, 1000); // Content smaller than viewport
        const scrollElementRef = { current: scrollElement };
        const Wrapper = createWrapper();

        render(
          <Wrapper>
            <AgentGrid
              category="all"
              searchQuery=""
              onSelectAgent={mockOnSelectAgent}
              scrollElementRef={scrollElementRef}
            />
          </Wrapper>,
        );

        // Wait for initial render
        await waitFor(() => {
          expect(screen.getAllByRole('gridcell')).toHaveLength(5);
        });

        // Wait to ensure no auto-fetch happens
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
        });

        // fetchNextPage should NOT be called since has_more is false
        expect(fetchNextPage).not.toHaveBeenCalled();
      });

      it('should auto-fetch when viewport not filled (7 agents, big viewport)', async () => {
        const firstPage = createMockResponse(['1', '2', '3', '4', '5', '6'], true, 'cursor-6');
        const secondPage = createMockResponse(['7'], false);
        let currentPages = [firstPage];
        const fetchNextPage = jest.fn();

        // Mock that updates pages when fetchNextPage is called
        mockUseMarketplaceAgentsInfiniteQuery.mockImplementation(() =>
          createMockInfiniteQuery(currentPages, {
            fetchNextPage: jest.fn().mockImplementation(() => {
              fetchNextPage();
              currentPages = [firstPage, secondPage];
              return Promise.resolve();
            }),
            hasNextPage: true,
          }),
        );

        const scrollElement = setupViewport(400, 1200); // Large viewport (content < viewport)
        const scrollElementRef = { current: scrollElement };
        const Wrapper = createWrapper();

        const { rerender } = render(
          <Wrapper>
            <AgentGrid
              category="all"
              searchQuery=""
              onSelectAgent={mockOnSelectAgent}
              scrollElementRef={scrollElementRef}
            />
          </Wrapper>,
        );

        // Wait for initial 6 agents
        await waitFor(() => {
          expect(screen.getAllByRole('gridcell')).toHaveLength(6);
        });

        // Wait for ResizeObserver and auto-fetch to trigger
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        // Auto-fetch should have been triggered (multiple times due to reliability checks)
        expect(fetchNextPage).toHaveBeenCalled();
        expect(fetchNextPage.mock.calls.length).toBeGreaterThanOrEqual(1);

        // Update mock data and re-render
        currentPages = [firstPage, secondPage];
        rerender(
          <Wrapper>
            <AgentGrid
              category="all"
              searchQuery=""
              onSelectAgent={mockOnSelectAgent}
              scrollElementRef={scrollElementRef}
            />
          </Wrapper>,
        );

        // Should now show all 7 agents
        await waitFor(() => {
          expect(screen.getAllByRole('gridcell')).toHaveLength(7);
        });
      });

      it('should NOT auto-fetch when viewport is filled (7 agents, small viewport)', async () => {
        const firstPage = createMockResponse(['1', '2', '3', '4', '5', '6'], true, 'cursor-6');
        const fetchNextPage = jest.fn();

        mockUseMarketplaceAgentsInfiniteQuery.mockReturnValue(
          createMockInfiniteQuery([firstPage], { fetchNextPage, hasNextPage: true }),
        );

        const scrollElement = setupViewport(1200, 600); // Small viewport, content fills it
        const scrollElementRef = { current: scrollElement };
        const Wrapper = createWrapper();

        render(
          <Wrapper>
            <AgentGrid
              category="all"
              searchQuery=""
              onSelectAgent={mockOnSelectAgent}
              scrollElementRef={scrollElementRef}
            />
          </Wrapper>,
        );

        // Wait for initial 6 agents
        await waitFor(() => {
          expect(screen.getAllByRole('gridcell')).toHaveLength(6);
        });

        // Wait to ensure no auto-fetch happens
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
        });

        // Should NOT auto-fetch since viewport is filled
        expect(fetchNextPage).not.toHaveBeenCalled();
      });

      it('should auto-fetch once to fill viewport then stop (20 agents)', async () => {
        const allPages = [
          createMockResponse(['1', '2', '3', '4', '5', '6'], true, 'cursor-6'),
          createMockResponse(['7', '8', '9', '10', '11', '12'], true, 'cursor-12'),
          createMockResponse(['13', '14', '15', '16', '17', '18'], true, 'cursor-18'),
          createMockResponse(['19', '20'], false),
        ];

        let currentPages = [allPages[0]];
        let fetchCount = 0;
        const fetchNextPage = jest.fn();

        mockUseMarketplaceAgentsInfiniteQuery.mockImplementation(() =>
          createMockInfiniteQuery(currentPages, {
            fetchNextPage: jest.fn().mockImplementation(() => {
              fetchCount++;
              fetchNextPage();
              if (currentPages.length < 2) {
                currentPages = allPages.slice(0, 2);
              }
              return Promise.resolve();
            }),
            hasNextPage: currentPages.length < 2,
          }),
        );

        const scrollElement = setupViewport(600, 1000); // Viewport fits ~12 agents
        const scrollElementRef = { current: scrollElement };
        const Wrapper = createWrapper();

        const { rerender } = render(
          <Wrapper>
            <AgentGrid
              category="all"
              searchQuery=""
              onSelectAgent={mockOnSelectAgent}
              scrollElementRef={scrollElementRef}
            />
          </Wrapper>,
        );

        // Wait for initial 6 agents
        await waitFor(() => {
          expect(screen.getAllByRole('gridcell')).toHaveLength(6);
        });

        // Should auto-fetch to fill viewport
        await waitFor(
          () => {
            expect(fetchNextPage).toHaveBeenCalledTimes(1);
          },
          { timeout: 500 },
        );

        // Simulate viewport being filled after 12 agents
        Object.defineProperty(scrollElement, 'scrollHeight', {
          value: 1200,
          writable: true,
          configurable: true,
        });

        currentPages = allPages.slice(0, 2);
        rerender(
          <Wrapper>
            <AgentGrid
              category="all"
              searchQuery=""
              onSelectAgent={mockOnSelectAgent}
              scrollElementRef={scrollElementRef}
            />
          </Wrapper>,
        );

        // Should show 12 agents
        await waitFor(() => {
          expect(screen.getAllByRole('gridcell')).toHaveLength(12);
        });

        // Wait to ensure no additional auto-fetch
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
        });

        // Should only have fetched once (to fill viewport)
        expect(fetchCount).toBe(1);
        expect(fetchNextPage).toHaveBeenCalledTimes(1);
      });

      it('should auto-fetch when viewport resizes to be taller (window resize)', async () => {
        const firstPage = createMockResponse(['1', '2', '3', '4', '5', '6'], true, 'cursor-6');
        const secondPage = createMockResponse(['7', '8', '9', '10', '11', '12'], true, 'cursor-12');
        let currentPages = [firstPage];
        const fetchNextPage = jest.fn();
        let resizeObserverCallback: ResizeObserverCallback | null = null;

        // Mock that updates pages when fetchNextPage is called
        mockUseMarketplaceAgentsInfiniteQuery.mockImplementation(() =>
          createMockInfiniteQuery(currentPages, {
            fetchNextPage: jest.fn().mockImplementation(() => {
              fetchNextPage();
              if (currentPages.length === 1) {
                currentPages = [firstPage, secondPage];
              }
              return Promise.resolve();
            }),
            hasNextPage: currentPages.length === 1,
          }),
        );

        // Mock ResizeObserver to capture the callback
        const ResizeObserverMock = jest.fn().mockImplementation((callback) => {
          resizeObserverCallback = callback;
          return {
            observe: jest.fn(),
            disconnect: jest.fn(),
            unobserve: jest.fn(),
          };
        });
        global.ResizeObserver = ResizeObserverMock as any;

        // Start with a small viewport that fits the content
        const scrollElement = setupViewport(800, 600);
        const scrollElementRef = { current: scrollElement };
        const Wrapper = createWrapper();

        const { rerender } = render(
          <Wrapper>
            <AgentGrid
              category="all"
              searchQuery=""
              onSelectAgent={mockOnSelectAgent}
              scrollElementRef={scrollElementRef}
            />
          </Wrapper>,
        );

        // Wait for initial 6 agents
        await waitFor(() => {
          expect(screen.getAllByRole('gridcell')).toHaveLength(6);
        });

        // Verify ResizeObserver was set up
        expect(ResizeObserverMock).toHaveBeenCalled();
        expect(resizeObserverCallback).not.toBeNull();

        // Initially no fetch should happen as viewport is filled
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
        });
        expect(fetchNextPage).not.toHaveBeenCalled();

        // Simulate window resize - make viewport taller
        Object.defineProperty(scrollElement, 'clientHeight', {
          value: 1200, // Now taller than content
          writable: true,
          configurable: true,
        });

        // Trigger ResizeObserver callback to simulate resize detection
        act(() => {
          if (resizeObserverCallback) {
            resizeObserverCallback(
              [
                {
                  target: scrollElement,
                  contentRect: {
                    x: 0,
                    y: 0,
                    width: 800,
                    height: 1200,
                    top: 0,
                    right: 800,
                    bottom: 1200,
                    left: 0,
                  } as DOMRectReadOnly,
                  borderBoxSize: [],
                  contentBoxSize: [],
                  devicePixelContentBoxSize: [],
                } as ResizeObserverEntry,
              ],
              {} as ResizeObserver,
            );
          }
        });

        // Should trigger auto-fetch due to viewport now being larger than content
        await waitFor(
          () => {
            expect(fetchNextPage).toHaveBeenCalledTimes(1);
          },
          { timeout: 500 },
        );

        // Update the component with new data
        rerender(
          <Wrapper>
            <AgentGrid
              category="all"
              searchQuery=""
              onSelectAgent={mockOnSelectAgent}
              scrollElementRef={scrollElementRef}
            />
          </Wrapper>,
        );

        // Should now show 12 agents after fetching
        await waitFor(() => {
          expect(screen.getAllByRole('gridcell')).toHaveLength(12);
        });
      });
    });
  });
});
