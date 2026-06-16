import React, { createRef } from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecoilRoot } from 'recoil';
import type { CellMeasurerCache, List } from 'react-virtualized';
import type { TConversation } from 'librechat-data-provider';
import Conversations from '../Conversations';
import store from '~/store';

let mockCapturedCache: CellMeasurerCache | null = null;

jest.mock('react-virtualized', () => {
  const actual = jest.requireActual('react-virtualized');
  return {
    ...actual,
    CellMeasurer: ({
      children,
    }: {
      children: (opts: { registerChild: () => void }) => React.ReactNode;
    }) => children({ registerChild: () => {} }),
    List: ({
      rowRenderer,
      rowCount,
      deferredMeasurementCache,
    }: {
      rowRenderer: (opts: {
        index: number;
        key: string;
        style: object;
        parent: object;
      }) => React.ReactNode;
      rowCount: number;
      deferredMeasurementCache: CellMeasurerCache;
      [key: string]: unknown;
    }) => {
      mockCapturedCache = deferredMeasurementCache;
      return (
        <div data-testid="virtual-list" data-row-count={rowCount}>
          {Array.from({ length: Math.min(rowCount, 10) }, (_, i) =>
            rowRenderer({ index: i, key: `row-${i}`, style: {}, parent: {} }),
          )}
        </div>
      );
    },
  };
});

jest.mock('~/store', () => {
  const { atom, atomFamily } = jest.requireActual('recoil');
  return {
    __esModule: true,
    default: {
      search: atom({ key: 'test-conversations-search', default: { query: '' } }),
      conversationByIndex: atomFamily({
        key: 'test-conversations-convo-by-index',
        default: null,
      }),
    },
  };
});

type FavoriteEntry = { agentId?: string; model?: string; endpoint?: string };

const mockFavoritesState: { favorites: FavoriteEntry[]; isLoading: boolean } = {
  favorites: [],
  isLoading: false,
};

let mockShowMarketplace = true;

jest.mock('~/hooks', () => ({
  useFavorites: () => mockFavoritesState,
  useLocalize: () => (key: string) => key,
  useShowMarketplace: () => mockShowMarketplace,
  useNewConvo: () => ({ newConversation: jest.fn() }),
  useElementSize: () => ({ ref: jest.fn(), width: 300, height: 600 }),
  TranslationKeys: {},
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@librechat/client', () => ({
  Spinner: () => <div data-testid="spinner" />,
  useMediaQuery: () => false,
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
  NewChatIcon: () => <svg data-testid="new-chat-icon" />,
}));

jest.mock('~/data-provider', () => ({
  useActiveJobs: () => ({ data: undefined }),
}));

jest.mock('~/utils', () => ({
  groupConversationsByDate: () => [],
  clearMessagesCache: jest.fn(),
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

jest.mock('~/components/Nav/Favorites/FavoritesList', () => ({
  __esModule: true,
  default: () => <div data-testid="favorites-list" />,
}));

jest.mock('../Convo', () => ({
  __esModule: true,
  default: () => <div data-testid="convo" />,
}));

describe('Conversations – favorites CellMeasurerCache key invalidation', () => {
  const containerRef = createRef<List>();

  beforeEach(() => {
    mockCapturedCache = null;
    mockFavoritesState.favorites = [];
    mockFavoritesState.isLoading = false;
    mockShowMarketplace = true;
  });

  const Wrapper = () => (
    <RecoilRoot>
      <Conversations
        conversations={[]}
        moveToTop={jest.fn()}
        toggleNav={jest.fn()}
        containerRef={containerRef}
        loadMoreConversations={jest.fn()}
        isLoading={false}
        isSearchLoading={false}
        isChatsExpanded={true}
        setIsChatsExpanded={jest.fn()}
      />
    </RecoilRoot>
  );

  it('should invalidate the cached favorites height when favorites count changes', () => {
    const { rerender } = render(<Wrapper />);
    const cache = mockCapturedCache!;
    expect(cache).toBeDefined();

    cache.set(0, 0, 300, 48);
    expect(cache.has(0, 0)).toBe(true);
    expect(cache.getHeight(0, 0)).toBe(48);

    mockFavoritesState.favorites = [{ model: 'gpt-4', endpoint: 'openAI' }];
    rerender(<Wrapper />);

    expect(cache.has(0, 0)).toBe(false);
  });

  it('should invalidate the cached favorites height when loading state transitions', () => {
    mockFavoritesState.isLoading = true;
    const { rerender } = render(<Wrapper />);
    const cache = mockCapturedCache!;

    cache.set(0, 0, 300, 80);
    expect(cache.has(0, 0)).toBe(true);

    mockFavoritesState.isLoading = false;
    rerender(<Wrapper />);

    expect(cache.has(0, 0)).toBe(false);
  });

  it('should invalidate the cached favorites height when marketplace visibility changes', () => {
    mockFavoritesState.favorites = [{ model: 'gpt-4', endpoint: 'openAI' }];
    const { rerender } = render(<Wrapper />);
    const cache = mockCapturedCache!;

    cache.set(0, 0, 300, 48);
    expect(cache.has(0, 0)).toBe(true);

    mockShowMarketplace = false;
    rerender(<Wrapper />);

    expect(cache.has(0, 0)).toBe(false);
  });

  it('should retain the cached favorites height when content state is unchanged', () => {
    mockFavoritesState.favorites = [{ model: 'gpt-4', endpoint: 'openAI' }];
    const { rerender } = render(<Wrapper />);
    const cache = mockCapturedCache!;

    cache.set(0, 0, 300, 88);
    expect(cache.has(0, 0)).toBe(true);
    expect(cache.getHeight(0, 0)).toBe(88);

    rerender(<Wrapper />);

    expect(cache.has(0, 0)).toBe(true);
    expect(cache.getHeight(0, 0)).toBe(88);
  });
});

const pinnedConvo = {
  conversationId: 'pinned-1',
  title: 'Pinned Chat',
  pinned: true,
  endpoint: 'openAI',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as TConversation;

describe('Conversations – pinned header', () => {
  const containerRef = createRef<List>();

  beforeEach(() => {
    mockCapturedCache = null;
    mockFavoritesState.favorites = [];
    mockFavoritesState.isLoading = false;
    mockShowMarketplace = false;
  });

  const renderConversations = (conversations: TConversation[], searchQuery = '') =>
    render(
      <RecoilRoot
        initializeState={({ set }) => {
          set(store.search, {
            query: searchQuery,
            enabled: true,
            debouncedQuery: searchQuery,
            isSearching: true,
            isTyping: false,
          });
        }}
      >
        <Conversations
          conversations={conversations}
          moveToTop={jest.fn()}
          toggleNav={jest.fn()}
          containerRef={containerRef}
          loadMoreConversations={jest.fn()}
          isLoading={false}
          isSearchLoading={false}
          isChatsExpanded={true}
          setIsChatsExpanded={jest.fn()}
        />
      </RecoilRoot>,
    );

  it('shows the pinned header when there are pinned conversations', () => {
    const { getByText } = renderConversations([pinnedConvo]);
    expect(getByText('com_ui_pinned')).toBeInTheDocument();
  });

  it('does not show the pinned header when there are no pinned conversations', () => {
    const { queryByText } = renderConversations([]);
    expect(queryByText('com_ui_pinned')).not.toBeInTheDocument();
  });

  it('does not show the pinned header during search', () => {
    const { queryByText } = renderConversations([pinnedConvo], 'some query');
    expect(queryByText('com_ui_pinned')).not.toBeInTheDocument();
  });
});
