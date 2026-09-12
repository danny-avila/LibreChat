import React, { createRef } from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecoilRoot } from 'recoil';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CellMeasurerCache, List } from 'react-virtualized';
import type { TConversation } from 'librechat-data-provider';
import Conversations from '../Conversations';
import store from '~/store';

/* The section resolves a conversation's project from the query cache, so the
 * tree needs a client even though the data hooks themselves are mocked. */
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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
      _deferredMeasurementCache,
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

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useElementSize: () => ({ ref: jest.fn(), width: 300, height: 600 }),
  TranslationKeys: {},
}));

jest.mock('@librechat/client', () => ({
  /* The section headers compose through the shared variant recipe. */
  buttonVariants: () => '',
  Spinner: () => <div data-testid="spinner" />,
  useMediaQuery: () => false,
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('~/data-provider', () => ({
  useActiveJobs: () => ({ data: undefined }),
  useAssignConversationToProjectMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('~/utils', () => ({
  groupConversationsByDate: () => [],
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

jest.mock('../Convo', () => ({
  __esModule: true,
  default: () => <div data-testid="convo" />,
}));

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

  const renderConversations = (conversations: TConversation[], searchQuery = '') =>
    render(
      <QueryClientProvider client={queryClient}>
        <DndProvider backend={HTML5Backend}>
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
          </RecoilRoot>
        </DndProvider>
      </QueryClientProvider>,
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
      <QueryClientProvider client={queryClient}>
        <DndProvider backend={HTML5Backend}>
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
            />
          </RecoilRoot>
        </DndProvider>
      </QueryClientProvider>,
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
      <QueryClientProvider client={queryClient}>
        <DndProvider backend={HTML5Backend}>
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
            />
          </RecoilRoot>
        </DndProvider>
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <DndProvider backend={HTML5Backend}>
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
            />
          </RecoilRoot>
        </DndProvider>
      </QueryClientProvider>,
    );

    expect(loadMoreConversations).toHaveBeenCalledTimes(1);
  });
});
