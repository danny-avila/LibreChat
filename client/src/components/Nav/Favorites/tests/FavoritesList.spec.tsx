import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { BrowserRouter } from 'react-router-dom';
import { dataService } from 'librechat-data-provider';
import type t from 'librechat-data-provider';

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
      conversationByIndex: (index: number) =>
        atom({
          key: `mock-conversation-atom-${index}`,
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

      const { container } = renderWithProviders(<FavoritesList />);
      // Skeletons should be present during loading - container should have children
      expect(container.firstChild).not.toBeNull();
      // When loading, the component renders skeleton placeholders (check for content, not specific CSS)
      expect(container.innerHTML).toContain('div');
    });
  });

  describe('missing agent handling', () => {
    it('should exclude missing agents (404) from rendered favorites and render valid agents', async () => {
      const validAgent: t.Agent = {
        id: 'valid-agent',
        name: 'Valid Agent',
        author: 'test-author',
      } as t.Agent;

      // Set up favorites with both valid and missing agent
      mockFavorites.push({ agentId: 'valid-agent' }, { agentId: 'deleted-agent' });

      // Mock getAgentById: valid-agent returns successfully, deleted-agent returns 404
      (dataService.getAgentById as jest.Mock).mockImplementation(
        ({ agent_id }: { agent_id: string }) => {
          if (agent_id === 'valid-agent') {
            return Promise.resolve(validAgent);
          }
          if (agent_id === 'deleted-agent') {
            return Promise.reject({ response: { status: 404 } });
          }
          return Promise.reject(new Error('Unknown agent'));
        },
      );

      const { findAllByTestId } = renderWithProviders(<FavoritesList />);

      // Wait for queries to resolve
      const favoriteItems = await findAllByTestId('favorite-item');

      // Only the valid agent should be rendered
      expect(favoriteItems).toHaveLength(1);
      expect(favoriteItems[0]).toHaveTextContent('Valid Agent');

      // The deleted agent should still be requested, but not rendered
      expect(dataService.getAgentById as jest.Mock).toHaveBeenCalledWith({
        agent_id: 'deleted-agent',
      });
    });

    it('should not show infinite loading skeleton when agents return 404', async () => {
      // Set up favorites with only a deleted agent
      mockFavorites.push({ agentId: 'deleted-agent' });

      // Mock getAgentById to return 404
      (dataService.getAgentById as jest.Mock).mockRejectedValue({ response: { status: 404 } });

      const { queryAllByTestId } = renderWithProviders(<FavoritesList />);

      // Wait for the loading state to resolve after 404 handling by ensuring the agent request was made
      await waitFor(() => {
        expect(dataService.getAgentById as jest.Mock).toHaveBeenCalledWith({
          agent_id: 'deleted-agent',
        });
      });

      // No favorite items should be rendered (deleted agent is filtered out)
      expect(queryAllByTestId('favorite-item')).toHaveLength(0);
    });
  });
});
