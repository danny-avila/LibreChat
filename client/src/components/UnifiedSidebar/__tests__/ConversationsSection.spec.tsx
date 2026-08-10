import React from 'react';
import { DndProvider } from 'react-dnd';
import { BrowserRouter } from 'react-router-dom';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { render, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { atom, RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import type { SetterOrUpdater } from 'recoil';

/**
 * Real recoil atom used to force ConversationsSection to re-render on demand,
 * standing in for the conversation-list / title-generation cache churn that
 * happens while a message is streaming. The mocked `useTitleGeneration`
 * subscribes to it, so bumping it re-renders ConversationsSection (and only
 * ConversationsSection) exactly like a streaming update would.
 */
const streamTickAtom = atom<number>({ key: 'conversations-section-stream-tick', default: 0 });

/** Generous because it covers a first-require module transform, not a race. */
const LAZY_CHUNK_TIMEOUT = 15_000;
const TEST_TIMEOUT = 30_000;

const mockUseFavorites = jest.fn(() => ({
  favorites: [] as unknown[],
  reorderFavorites: jest.fn(),
  isLoading: false,
}));
const mockUseGetConversationTags = jest.fn(() => ({ data: [] as unknown[] }));
const mockUseTitleGeneration = jest.fn(() => {
  useRecoilValue(streamTickAtom);
});

jest.mock('~/store', () => {
  const { atom: recoilAtom } = jest.requireActual('recoil');
  return {
    __esModule: true,
    default: {
      sidebarExpanded: recoilAtom({ key: 'mock-cs-sidebarExpanded', default: false }),
      search: recoilAtom({
        key: 'mock-cs-search',
        default: { query: '', debouncedQuery: '', enabled: false, isTyping: false },
      }),
    },
  };
});

jest.mock('~/hooks', () => ({
  __esModule: true,
  useLocalize: () => (key: string) => key,
  useHasAccess: () => true,
  useAuthContext: () => ({ isAuthenticated: true }),
  useLocalStorage: () => [true, jest.fn()],
  useNavScrolling: () => ({ moveToTop: jest.fn() }),
  useFavorites: () => mockUseFavorites(),
  useShowMarketplace: () => false,
  useNewConvo: () => ({ newConversation: jest.fn() }),
  useGetConversation: () => () => null,
}));

jest.mock('~/data-provider', () => ({
  __esModule: true,
  useConversationsInfiniteQuery: () => ({
    data: { pages: [{ conversations: [], nextCursor: null }] },
    fetchNextPage: jest.fn(),
    isFetchingNextPage: false,
    isLoading: false,
    isFetching: false,
  }),
  useTitleGeneration: () => mockUseTitleGeneration(),
  useGetEndpointsQuery: () => ({ data: {}, isLoading: false }),
  useGetStartupConfig: () => ({ data: { modelSpecs: { list: [] } } }),
  useGetConversationTags: () => mockUseGetConversationTags(),
}));

jest.mock('~/Providers', () => ({
  __esModule: true,
  useAssistantsMapContext: () => ({}),
  useAgentsMapContext: () => ({}),
}));

jest.mock('~/hooks/Input/useSelectMention', () => ({
  __esModule: true,
  default: () => ({ onSelectEndpoint: jest.fn(), onSelectSpec: jest.fn() }),
}));

jest.mock('~/components/Conversations', () => ({
  __esModule: true,
  Conversations: () => <div data-testid="conversations-stub" />,
}));

jest.mock('~/components/Conversations/ProjectsSection', () => ({
  __esModule: true,
  default: () => <div data-testid="projects-stub" />,
}));

jest.mock('~/components/Nav/SearchBar', () => ({
  __esModule: true,
  default: () => <div data-testid="searchbar-stub" />,
}));

jest.mock('~/components/Nav/Favorites/FavoriteItem', () => ({
  __esModule: true,
  default: () => <div data-testid="favorite-item-stub" />,
}));

import ConversationsSection from '../ConversationsSection';

let setStreamTick: SetterOrUpdater<number>;

function TickController() {
  setStreamTick = useSetRecoilState(streamTickAtom);
  return null;
}

const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderCount = () =>
  mockUseFavorites.mock.calls.length +
  mockUseGetConversationTags.mock.calls.length +
  mockUseTitleGeneration.mock.calls.length;

/**
 * Yield a full event-loop turn inside act. The lazy BookmarkNav's Suspense commit
 * lands during waitFor's polling, outside act, so its follow-up work sits in the real
 * scheduler as a macrotask that a microtask-only `await act(async () => {})` misses.
 */
const flushEventLoopTurn = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** Flush event-loop turns until two consecutive turns add no renders (bounded). */
const settleRenders = async () => {
  let stableTurns = 0;
  for (let turn = 0; turn < 20 && stableTurns < 2; turn++) {
    const before = renderCount();
    await flushEventLoopTurn();
    stableTurns = renderCount() === before ? stableTurns + 1 : 0;
  }
};

const renderSection = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RecoilRoot>
        <BrowserRouter>
          <DndProvider backend={HTML5Backend}>
            <TickController />
            <ConversationsSection />
          </DndProvider>
        </BrowserRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );

describe('ConversationsSection streaming re-renders', () => {
  beforeEach(() => {
    mockUseFavorites.mockImplementation(() => ({
      favorites: [],
      reorderFavorites: jest.fn(),
      isLoading: false,
    }));
    mockUseGetConversationTags.mockImplementation(() => ({ data: [] }));
    mockUseTitleGeneration.mockImplementation(() => {
      useRecoilValue(streamTickAtom);
    });
  });

  it(
    'does not re-render FavoritesList or BookmarkNav when the section re-renders mid-stream',
    async () => {
      renderSection();

      // BookmarkNav is lazy-loaded; wait until it has actually rendered (its own
      // data hook firing is the deterministic signal that the chunk resolved).
      // Resolving that import means transforming BookmarkNav's whole module graph
      // on first require, which outruns the default one-second budget whenever the
      // transform cache is cold or the machine is busy.
      await waitFor(() => expect(mockUseGetConversationTags).toHaveBeenCalled(), {
        timeout: LAZY_CHUNK_TIMEOUT,
      });

      // waitFor resolves once the hook first fires, but on loaded Windows shards the
      // Suspense resolution can leave a trailing pass pending in the real scheduler,
      // which the first stream tick's act would flush into the children's counts.
      await settleRenders();

      expect(mockUseFavorites.mock.calls.length).toBeGreaterThan(0);
      expect(mockUseGetConversationTags.mock.calls.length).toBeGreaterThan(0);

      const favBaseline = mockUseFavorites.mock.calls.length;
      const tagBaseline = mockUseGetConversationTags.mock.calls.length;
      const titleBaseline = mockUseTitleGeneration.mock.calls.length;

      // Simulate a stream: repeatedly re-render ConversationsSection.
      for (let i = 0; i < 5; i++) {
        act(() => {
          setStreamTick((prev) => prev + 1);
        });
      }

      // Sanity check: the section genuinely re-rendered each tick.
      expect(mockUseTitleGeneration.mock.calls.length).toBeGreaterThan(titleBaseline);

      // The memoized children, fed referentially stable props, did not re-render.
      expect(mockUseFavorites.mock.calls.length).toBe(favBaseline);
      expect(mockUseGetConversationTags.mock.calls.length).toBe(tagBaseline);
    },
    TEST_TIMEOUT,
  );
});
