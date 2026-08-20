import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type { TConversation } from 'librechat-data-provider';
import PinnedSection from '../PinnedSection';

const mockSetExpanded = jest.fn();
let mockIsExpanded = true;
let mockPinnedOrder: string[] | undefined;
const mockReorderFavorites = jest.fn();
const mockUpdatePinnedOrder = jest.fn();

const mockFavoritesData = {
  favorites: [] as Array<Record<string, string>>,
  isLoading: false,
  isAgentsLoading: false,
  agentsMap: {} as Record<string, unknown>,
  specsMap: {} as Record<string, unknown>,
  endpointsConfig: {},
  reorderFavorites: mockReorderFavorites,
  onSelectEndpoint: jest.fn(),
  onSelectSpec: jest.fn(),
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useLocalStorage: () => [mockIsExpanded, mockSetExpanded],
}));

jest.mock('~/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
  getSpecAgentAvatarURL: () => null,
}));

jest.mock('~/data-provider', () => ({
  useActiveJobs: () => ({ data: undefined }),
  useGetPinnedOrderQuery: () => ({ data: mockPinnedOrder }),
  useUpdatePinnedOrderMutation: () => ({ mutate: mockUpdatePinnedOrder }),
  usePinConversationMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@librechat/client', () => ({
  Skeleton: () => <div data-testid="favorite-skeleton" />,
  useMediaQuery: () => true,
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('~/components/Nav/Favorites/useFavoritesData', () => ({
  __esModule: true,
  default: () => mockFavoritesData,
}));

jest.mock('../Convo', () => ({
  __esModule: true,
  default: ({ conversation }: { conversation: { title: string } }) => (
    <div data-testid="pinned-convo">{conversation.title}</div>
  ),
}));

jest.mock('~/components/Nav/Favorites/FavoriteItem', () => ({
  __esModule: true,
  default: ({
    item,
    type,
  }: {
    item: { model?: string; id?: string; label?: string };
    type: string;
  }) => {
    const label = item.id ?? item.label ?? item.model ?? '';
    return (
      <div data-testid="favorite-item" data-type={type}>
        {label}
      </div>
    );
  },
}));

const pinnedConvo = (id: string, title: string) =>
  ({ conversationId: id, title, pinned: true }) as unknown as TConversation;

const renderSection = (conversations: TConversation[]) =>
  render(
    <DndProvider backend={HTML5Backend}>
      <PinnedSection conversations={conversations} toggleNav={jest.fn()} />
    </DndProvider>,
  );

const itemLabels = () =>
  Array.from(
    screen
      .getAllByTestId(/pinned-convo|favorite-item|favorite-skeleton/)
      .map((el) => el.textContent?.trim()),
  );

describe('PinnedSection unified list', () => {
  beforeEach(() => {
    mockIsExpanded = true;
    mockPinnedOrder = undefined;
    mockSetExpanded.mockReset();
    mockReorderFavorites.mockReset();
    mockUpdatePinnedOrder.mockReset();
    mockFavoritesData.favorites = [];
    mockFavoritesData.isLoading = false;
    mockFavoritesData.isAgentsLoading = false;
    mockFavoritesData.agentsMap = {};
    mockFavoritesData.specsMap = {};
  });

  it('renders nothing when there are no favorites or pinned conversations', () => {
    const { container } = renderSection([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders favorites followed by pinned conversations in natural order', () => {
    mockFavoritesData.favorites = [{ model: 'gpt-4o', endpoint: 'openAI' }];
    renderSection([pinnedConvo('c1', 'Pinned Chat'), pinnedConvo('c2', 'Another Pin')]);
    expect(itemLabels()).toEqual(['gpt-4o', 'Pinned Chat', 'Another Pin']);
  });

  it('interleaves favorites and conversations by the stored order', () => {
    mockFavoritesData.favorites = [{ model: 'gpt-4o', endpoint: 'openAI' }, { agentId: 'agent-1' }];
    mockFavoritesData.agentsMap = { 'agent-1': { id: 'agent-1' } };
    mockPinnedOrder = ['convo:c1', 'agent:agent-1', 'model:openAI::gpt-4o'];
    renderSection([pinnedConvo('c1', 'Pinned Chat')]);
    expect(itemLabels()).toEqual(['Pinned Chat', 'agent-1', 'gpt-4o']);
  });

  it('appends items missing from the stored order and ignores stale keys', () => {
    mockFavoritesData.favorites = [{ spec: 'fast' }];
    mockFavoritesData.specsMap = { fast: { name: 'fast', label: 'Fast' } };
    mockPinnedOrder = ['convo:gone', 'model:openAI::removed'];
    renderSection([pinnedConvo('c1', 'Pinned Chat')]);
    expect(itemLabels()).toEqual(['Fast', 'Pinned Chat']);
  });

  it('shows a skeleton row while favorites are still loading', () => {
    mockFavoritesData.isLoading = true;
    renderSection([pinnedConvo('c1', 'Pinned Chat')]);
    expect(screen.getAllByTestId('favorite-skeleton').length).toBeGreaterThan(0);
    expect(screen.getByText('Pinned Chat')).toBeInTheDocument();
  });

  it('hides an unresolved agent favorite once agents are loaded', () => {
    mockFavoritesData.favorites = [{ agentId: 'agent-gone' }];
    mockFavoritesData.isAgentsLoading = false;
    renderSection([]);
    expect(screen.queryAllByTestId('favorite-item')).toHaveLength(0);
  });

  it('renders the section for favorites alone', () => {
    mockFavoritesData.favorites = [{ model: 'gpt-4o', endpoint: 'openAI' }];
    const { container } = renderSection([]);
    expect(screen.getByTestId('favorite-item')).toBeInTheDocument();
    expect(container).not.toBeEmptyDOMElement();
  });
});
