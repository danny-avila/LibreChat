import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { BrowserRouter } from 'react-router-dom';
import { dataService } from 'librechat-data-provider';
import type { Agent } from 'librechat-data-provider';

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
  spec?: string;
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
  useGetConversation: () => () => null,
}));

jest.mock('~/Providers', () => ({
  useAssistantsMapContext: () => ({}),
  useAgentsMapContext: () => ({}),
}));

const mockOnSelectSpec = jest.fn();
jest.mock('~/hooks/Input/useSelectMention', () => () => ({
  onSelectEndpoint: jest.fn(),
  onSelectSpec: mockOnSelectSpec,
}));

const mockUseGetStartupConfig = jest.fn(() => ({
  data: { modelSpecs: { list: [] as unknown[] } },
}));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: {} }),
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

jest.mock('../FavoriteItem', () => ({
  __esModule: true,
  default: ({ item, type }: { item: any; type: string }) => {
    let label = item.model;
    if (type === 'agent') {
      label = item.name;
    } else if (type === 'spec') {
      label = item.label;
    }
    return (
      <div data-testid="favorite-item" data-type={type}>
        {label}
      </div>
    );
  },
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
    mockUseFavorites.mockImplementation(() => ({
      favorites: mockFavorites,
      reorderFavorites: jest.fn(),
      isLoading: false,
    }));
    mockUseGetStartupConfig.mockImplementation(() => ({
      data: { modelSpecs: { list: [] } },
    }));
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
      const validAgent: Agent = {
        id: 'valid-agent',
        name: 'Valid Agent',
        author: 'test-author',
      } as Agent;

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

    it('should treat 403 the same as 404 — agent not rendered', async () => {
      const validAgent: Agent = {
        id: 'valid-agent',
        name: 'Valid Agent',
        author: 'test-author',
      } as Agent;

      mockFavorites.push({ agentId: 'valid-agent' }, { agentId: 'revoked-agent' });

      (dataService.getAgentById as jest.Mock).mockImplementation(
        ({ agent_id }: { agent_id: string }) => {
          if (agent_id === 'valid-agent') {
            return Promise.resolve(validAgent);
          }
          if (agent_id === 'revoked-agent') {
            return Promise.reject({ response: { status: 403 } });
          }
          return Promise.reject(new Error('Unknown agent'));
        },
      );

      const { findAllByTestId } = renderWithProviders(<FavoritesList />);

      const favoriteItems = await findAllByTestId('favorite-item');
      expect(favoriteItems).toHaveLength(1);
      expect(favoriteItems[0]).toHaveTextContent('Valid Agent');
    });

    it('should call reorderFavorites to persist removal of stale agents', async () => {
      const mockReorderFavorites = jest.fn().mockResolvedValue(undefined);
      mockUseFavorites.mockReturnValue({
        favorites: [{ agentId: 'revoked-agent' }],
        reorderFavorites: mockReorderFavorites,
        isLoading: false,
      });

      (dataService.getAgentById as jest.Mock).mockRejectedValue({ response: { status: 403 } });

      renderWithProviders(<FavoritesList />);

      await waitFor(() => {
        expect(mockReorderFavorites).toHaveBeenCalledWith([], true);
      });
    });

    it('should only attempt cleanup once even when favorites revert to stale state', async () => {
      const mockReorderFavorites = jest.fn().mockResolvedValue(undefined);

      mockUseFavorites.mockReturnValue({
        favorites: [{ agentId: 'revoked-agent' }],
        reorderFavorites: mockReorderFavorites,
        isLoading: false,
      });

      (dataService.getAgentById as jest.Mock).mockRejectedValue({ response: { status: 403 } });

      const { rerender } = renderWithProviders(<FavoritesList />);

      await waitFor(() => {
        expect(mockReorderFavorites).toHaveBeenCalledWith([], true);
      });

      expect(mockReorderFavorites).toHaveBeenCalledTimes(1);

      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <RecoilRoot>
            <BrowserRouter>
              <DndProvider backend={HTML5Backend}>
                <FavoritesList />
              </DndProvider>
            </BrowserRouter>
          </RecoilRoot>
        </QueryClientProvider>,
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(mockReorderFavorites).toHaveBeenCalledTimes(1);
    });
  });

  describe('model spec rendering', () => {
    it('renders a spec favorite when startupConfig has a matching spec', async () => {
      mockUseGetStartupConfig.mockImplementation(() => ({
        data: {
          modelSpecs: {
            list: [
              {
                name: 'fast-spec',
                label: 'Fast Spec',
                preset: { endpoint: 'openai', model: 'gpt-5' },
              },
            ],
          },
        },
      }));
      mockFavorites.push({ spec: 'fast-spec' });

      const { findAllByTestId } = renderWithProviders(<FavoritesList />);
      const items = await findAllByTestId('favorite-item');

      expect(items).toHaveLength(1);
      expect(items[0]).toHaveAttribute('data-type', 'spec');
      expect(items[0]).toHaveTextContent('Fast Spec');
    });

    it('skips a spec favorite when the spec is no longer in startupConfig', () => {
      mockUseGetStartupConfig.mockImplementation(() => ({
        data: { modelSpecs: { list: [] } },
      }));
      mockFavorites.push({ spec: 'stale-spec' });

      const { queryAllByTestId } = renderWithProviders(<FavoritesList />);
      expect(queryAllByTestId('favorite-item')).toHaveLength(0);
    });

    it('calls reorderFavorites to auto-remove stale spec favorites', async () => {
      const mockReorderFavorites = jest.fn().mockResolvedValue(undefined);
      mockUseFavorites.mockReturnValue({
        favorites: [{ spec: 'stale-spec' }],
        reorderFavorites: mockReorderFavorites,
        isLoading: false,
      });
      mockUseGetStartupConfig.mockReturnValue({
        data: { modelSpecs: { list: [] } },
      });

      renderWithProviders(<FavoritesList />);

      await waitFor(() => {
        expect(mockReorderFavorites).toHaveBeenCalledWith([], true);
      });
    });

    it('does not clean up specs when startupConfig is still loading', async () => {
      const mockReorderFavorites = jest.fn().mockResolvedValue(undefined);
      mockUseFavorites.mockReturnValue({
        favorites: [{ spec: 'valid-spec' }],
        reorderFavorites: mockReorderFavorites,
        isLoading: false,
      });
      mockUseGetStartupConfig.mockReturnValue({ data: undefined });

      renderWithProviders(<FavoritesList />);

      await new Promise((r) => setTimeout(r, 50));
      expect(mockReorderFavorites).not.toHaveBeenCalled();
    });

    it('renders a mix of agents, models, and specs', async () => {
      const validAgent: Agent = {
        id: 'a1',
        name: 'Agent One',
        author: 'me',
      } as Agent;
      mockUseGetStartupConfig.mockImplementation(() => ({
        data: {
          modelSpecs: {
            list: [
              {
                name: 's1',
                label: 'Spec One',
                preset: { endpoint: 'openai', model: 'gpt-5' },
              },
            ],
          },
        },
      }));
      mockFavorites.push({ agentId: 'a1' }, { model: 'gpt-5', endpoint: 'openai' }, { spec: 's1' });
      (dataService.getAgentById as jest.Mock).mockResolvedValue(validAgent);

      const { findAllByTestId } = renderWithProviders(<FavoritesList />);
      const items = await findAllByTestId('favorite-item');

      expect(items).toHaveLength(3);
      const types = items.map((el) => el.getAttribute('data-type'));
      expect(types).toEqual(['agent', 'model', 'spec']);
    });
  });
});
