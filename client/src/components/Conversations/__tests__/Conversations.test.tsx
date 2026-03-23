import React, { createRef } from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecoilRoot } from 'recoil';
import type { CellMeasurerCache, List } from 'react-virtualized';

let mockCapturedCache: CellMeasurerCache | null = null;

jest.mock('react-virtualized', () => {
  const actual = jest.requireActual('react-virtualized');
  return {
    ...actual,
    AutoSizer: ({
      children,
    }: {
      children: (size: { width: number; height: number }) => React.ReactNode;
    }) => children({ width: 300, height: 600 }),
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

import Conversations from '../Conversations';

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
