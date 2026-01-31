import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { BrowserRouter } from 'react-router-dom';
import { dataService } from 'librechat-data-provider';
import type t from 'librechat-data-provider';
import type { AgentQueryResult } from '~/common';

// Mock store before importing FavoritesList
jest.mock('~/store', () => {
  const { atom } = jest.requireActual('recoil');
  return {
    __esModule: true,
    default: {
      search: atom({
        key: 'mock-search-atom',
        default: { query: '' },
      }),
      conversationByIndex: () =>
        atom({
          key: 'mock-conversation-atom',
          default: null,
        }),
    },
  };
});
import FavoritesList from '../FavoritesList';

type FavoriteItem = {
  agentId?: string;
  model?: string;
  endpoint?: string;
};

// Mock dataService
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  dataService: {
    getAgentById: jest.fn(),
  },
}));

// Mock hooks
const mockFavorites: FavoriteItem[] = [];
const mockUseFavorites = jest.fn(() => ({
  favorites: mockFavorites,
  reorderFavorites: jest.fn(),
  isLoading: false,
}));

jest.mock('~/hooks', () => ({
  useFavorites: () => mockUseFavorites(),
  useLocalize: () => (key: string) => key,
  useShowMarketplace: () => false,
  useNewConvo: () => ({ newConversation: jest.fn() }),
}));

jest.mock('~/Providers', () => ({
  useAssistantsMapContext: () => ({}),
  useAgentsMapContext: () => ({}),
}));

jest.mock('~/hooks/Input/useSelectMention', () => () => ({
  onSelectEndpoint: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: {} }),
}));

jest.mock('../FavoriteItem', () => ({
  __esModule: true,
  default: ({ item, type }: { item: any; type: string }) => (
    <div data-testid="favorite-item" data-type={type}>
      {type === 'agent' ? item.name : item.model}
    </div>
  ),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <BrowserRouter>
          <DndProvider backend={HTML5Backend}>{ui}</DndProvider>
        </BrowserRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );
};

describe('FavoritesList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFavorites.length = 0;
  });

  describe('rendering', () => {
    it('should render nothing when favorites is empty and marketplace is hidden', () => {
      const { container } = renderWithProviders(<FavoritesList />);
      expect(container.firstChild).toBeNull();
    });

    it('should render skeleton while loading', () => {
      mockUseFavorites.mockReturnValueOnce({
        favorites: [],
        reorderFavorites: jest.fn(),
        isLoading: true,
      });

      renderWithProviders(<FavoritesList />);
      // Skeletons should be present during loading
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });
});

describe('AgentQueryResult type behavior', () => {
  it('should handle found agent result correctly', async () => {
    const mockAgent: t.Agent = {
      id: 'agent-123',
      name: 'Test Agent',
      author: 'test-author',
    } as t.Agent;

    (dataService.getAgentById as jest.Mock).mockResolvedValueOnce(mockAgent);

    const result = await dataService.getAgentById({ agent_id: 'agent-123' });

    // Simulate the query function logic
    const queryResult: AgentQueryResult = { found: true, agent: result };

    expect(queryResult.found).toBe(true);
    expect(queryResult.agent).toEqual(mockAgent);
  });

  it('should handle not found agent result correctly', async () => {
    const error = { response: { status: 404 } };
    (dataService.getAgentById as jest.Mock).mockRejectedValueOnce(error);

    // Simulate the query function logic from FavoritesList
    let queryResult: AgentQueryResult | undefined;
    try {
      await dataService.getAgentById({ agent_id: 'deleted-agent' });
    } catch (err) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { status?: number } };
        if (axiosError.response?.status === 404) {
          queryResult = { found: false };
        }
      }
    }

    expect(queryResult).toEqual({ found: false });
  });

  it('should rethrow non-404 errors', async () => {
    const error = { response: { status: 500 }, message: 'Server error' };
    (dataService.getAgentById as jest.Mock).mockRejectedValueOnce(error);

    // Simulate the query function logic from FavoritesList
    let caughtError;
    try {
      await dataService.getAgentById({ agent_id: 'agent-123' });
    } catch (err) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { status?: number } };
        if (axiosError.response?.status === 404) {
          // Would return { found: false }, but this is a 500
        } else {
          caughtError = err;
        }
      }
    }

    expect(caughtError).toEqual(error);
  });
});

describe('combinedAgentsMap logic', () => {
  it('should only include agents where found is true', () => {
    const mockAgentsMap: Record<string, t.Agent> = {
      'existing-agent': { id: 'existing-agent', name: 'Existing' } as t.Agent,
    };

    const mockQueryResults: { data: AgentQueryResult | undefined }[] = [
      { data: { found: true, agent: { id: 'new-agent', name: 'New' } as t.Agent } },
      { data: { found: false } },
      { data: undefined }, // Still loading
    ];

    // Simulate combinedAgentsMap logic
    const combined: Record<string, t.Agent> = {};
    for (const [key, value] of Object.entries(mockAgentsMap)) {
      if (value) {
        combined[key] = value;
      }
    }
    mockQueryResults.forEach((query) => {
      if (query.data?.found && query.data.agent) {
        combined[query.data.agent.id] = query.data.agent;
      }
    });

    expect(Object.keys(combined)).toHaveLength(2);
    expect(combined['existing-agent']).toBeDefined();
    expect(combined['new-agent']).toBeDefined();
    expect(combined['not-found']).toBeUndefined();
  });

  it('should handle empty query results', () => {
    const mockAgentsMap: Record<string, t.Agent> = {};
    const mockQueryResults: { data: AgentQueryResult | undefined }[] = [];

    const combined: Record<string, t.Agent> = {};
    for (const [key, value] of Object.entries(mockAgentsMap)) {
      if (value) {
        combined[key] = value;
      }
    }
    mockQueryResults.forEach((query) => {
      if (query.data?.found && query.data.agent) {
        combined[query.data.agent.id] = query.data.agent;
      }
    });

    expect(Object.keys(combined)).toHaveLength(0);
  });
});
