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
  const { atom } = jest.requireActual('recoil');
  return {
    __esModule: true,
    default: {
      search: atom({ key: 'test-conversations-search', default: { query: '' } }),
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
  useElementSize: () => ({ ref: jest.fn(), width: 300, height: 600 }),
  TranslationKeys: {},
}));

jest.mock('@librechat/client', () => ({
  Spinner: () => <div data-testid="spinner" />,
  useMediaQuery: () => false,
}));

jest.mock('~/data-provider', () => ({
  useActiveJobs: () => ({ data: undefined }),
}));

jest.mock('~/utils', () => ({
  groupConversationsByDate: () => [],
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

describe('Conversations: pinned chats live in PinnedSection', () => {
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

  it('does not render a pinned header inside the chats list', () => {
    const { queryByText } = renderConversations([pinnedConvo]);
    expect(queryByText('com_ui_pinned')).not.toBeInTheDocument();
  });

  it('does not render a duplicate new chat button in the chats header', () => {
    const { queryByRole } = renderConversations([]);
    expect(queryByRole('button', { name: 'com_ui_new_chat' })).not.toBeInTheDocument();
  });
});

describe('Conversations: all-pin pages still paginate', () => {
  const containerRef = createRef<List>();

  beforeEach(() => {
    mockCapturedCache = null;
    mockFavoritesState.favorites = [];
    mockFavoritesState.isLoading = false;
    mockShowMarketplace = false;
  });

  const renderList = ({
    conversations,
    loadMoreConversations,
    isChatsExpanded = true,
    isLoading = false,
  }: {
    conversations: TConversation[];
    loadMoreConversations: () => void;
    isChatsExpanded?: boolean;
    isLoading?: boolean;
  }) =>
    render(
      <RecoilRoot>
        <Conversations
          conversations={conversations}
          moveToTop={jest.fn()}
          toggleNav={jest.fn()}
          containerRef={containerRef}
          loadMoreConversations={loadMoreConversations}
          isLoading={isLoading}
          isSearchLoading={false}
          isChatsExpanded={isChatsExpanded}
          setIsChatsExpanded={jest.fn()}
          showFavorites={false}
        />
      </RecoilRoot>,
    );

  it('requests another page when grouping leaves the chats list empty', () => {
    const loadMoreConversations = jest.fn();
    renderList({ conversations: [pinnedConvo], loadMoreConversations });
    expect(loadMoreConversations).toHaveBeenCalled();
  });

  it('does not request another page while chats are collapsed', () => {
    const loadMoreConversations = jest.fn();
    renderList({
      conversations: [pinnedConvo],
      loadMoreConversations,
      isChatsExpanded: false,
    });
    expect(loadMoreConversations).not.toHaveBeenCalled();
  });

  it('does not request another page while a fetch is already in flight', () => {
    const loadMoreConversations = jest.fn();
    renderList({
      conversations: [pinnedConvo],
      loadMoreConversations,
      isLoading: true,
    });
    expect(loadMoreConversations).not.toHaveBeenCalled();
  });

  it('does not retry when an empty-page fetch fails without new data', () => {
    const loadMoreConversations = jest.fn();
    const conversations = [pinnedConvo];
    const { rerender } = renderList({ conversations, loadMoreConversations });
    expect(loadMoreConversations).toHaveBeenCalledTimes(1);

    rerender(
      <RecoilRoot>
        <Conversations
          conversations={conversations}
          moveToTop={jest.fn()}
          toggleNav={jest.fn()}
          containerRef={containerRef}
          loadMoreConversations={loadMoreConversations}
          isLoading={true}
          isSearchLoading={false}
          isChatsExpanded={true}
          setIsChatsExpanded={jest.fn()}
          showFavorites={false}
        />
      </RecoilRoot>,
    );
    rerender(
      <RecoilRoot>
        <Conversations
          conversations={conversations}
          moveToTop={jest.fn()}
          toggleNav={jest.fn()}
          containerRef={containerRef}
          loadMoreConversations={loadMoreConversations}
          isLoading={false}
          isSearchLoading={false}
          isChatsExpanded={true}
          setIsChatsExpanded={jest.fn()}
          showFavorites={false}
        />
      </RecoilRoot>,
    );

    expect(loadMoreConversations).toHaveBeenCalledTimes(1);
  });
});
