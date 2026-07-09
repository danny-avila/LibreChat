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

  it('does not re-render FavoritesList or BookmarkNav when the section re-renders mid-stream', async () => {
    renderSection();

    // BookmarkNav is lazy-loaded; wait until it has actually rendered (its own
    // data hook firing is the deterministic signal that the chunk resolved).
    await waitFor(() => expect(mockUseGetConversationTags).toHaveBeenCalled());

    // waitFor resolves as soon as the hook has fired once, but the Suspense
    // resolution commit can still have a trailing render pass pending on slow
    // runners (Windows CI shards). Flush it before capturing baselines so the
    // first stream tick doesn't carry it and inflate the children's counts.
    await act(async () => {});

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
  });
});
