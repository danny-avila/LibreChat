import { render, screen, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { QueryObserverResult } from '@tanstack/react-query';
import ChatView from '../ChatView';
import { FileMapContext } from '~/Providers';
import { useFileMap } from '~/hooks/Files';
import store from '~/store';

type FileMapContextType = ReturnType<typeof useFileMap>;

const mockUseGetMessagesByConvoId = jest.fn<
  QueryObserverResult<TMessage[], unknown>,
  [conversationId: string, options?: unknown]
>();
jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: (conversationId: string, options?: unknown) =>
    mockUseGetMessagesByConvoId(conversationId, options),
}));

jest.mock('../Messages/MessagesView', () => ({
  __esModule: true,
  default: ({ messagesTree }: { messagesTree: TMessage[] | null }) => (
    <div data-testid="messages-view" data-has-messages={messagesTree ? 'true' : 'false'} />
  ),
}));

jest.mock('../Landing', () => ({
  __esModule: true,
  default: ({ centerFormOnLanding }: { centerFormOnLanding: boolean }) => (
    <div data-testid="landing-page" data-centered={centerFormOnLanding.toString()} />
  ),
}));

jest.mock('../Header', () => ({
  __esModule: true,
  default: () => <div data-testid="chat-header" />,
}));

jest.mock('../Footer', () => ({
  __esModule: true,
  default: () => <div data-testid="chat-footer" />,
}));

jest.mock('../Input/ChatForm', () => ({
  __esModule: true,
  default: ({ index }: { index: number }) => <div data-testid="chat-form" data-index={index} />,
}));

jest.mock('../Input/ConversationStarters', () => ({
  __esModule: true,
  default: () => <div data-testid="conversation-starters" />,
}));

jest.mock('../Presentation', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="presentation">{children}</div>
  ),
}));

jest.mock('~/hooks', () => ({
  useChatHelpers: jest.fn(() => ({ chatHelpers: 'mock' })),
  useAddedResponse: jest.fn(() => ({ addedHelpers: 'mock' })),
  useSSE: jest.fn(),
}));

const createWrapper = ({ initialEntries = ['/'] }: { initialEntries?: string[] } = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <RecoilRoot>
          <FileMapContext.Provider value={{} as FileMapContextType}>
            <Routes>
              <Route path="/" element={children} />
              <Route path="/c/:conversationId" element={children} />
            </Routes>
          </FileMapContext.Provider>
        </RecoilRoot>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('ChatView Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetMessagesByConvoId.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: true,
      status: 'success',
      dataUpdatedAt: Date.now(),
      errorUpdatedAt: 0,
      failureCount: 0,
      errorUpdateCount: 0,
      isFetched: true,
      isFetchedAfterMount: true,
      isFetching: false,
      isPending: false,
      isRefetching: false,
      isStale: false,
      refetch: jest.fn(),
      remove: jest.fn(),
      fetchStatus: 'idle',
      failureReason: null,
      isPaused: false,
      isPlaceholderData: false,
      isInitialLoading: false,
      isPreviousData: false,
    } as unknown as QueryObserverResult<TMessage[], unknown>);
  });

  describe('rendering states', () => {
    it('renders landing page when no conversationId', () => {
      const { container } = render(<ChatView />, { wrapper: createWrapper() });

      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
      expect(screen.getByTestId('chat-form')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-starters')).toBeInTheDocument();
      expect(screen.getByTestId('chat-footer')).toBeInTheDocument();
      expect(container.querySelector('.items-center.justify-end')).toBeInTheDocument();
    });

    it('renders landing page for new conversation', () => {
      render(<ChatView />, {
        wrapper: createWrapper({ initialEntries: [`/c/${Constants.NEW_CONVO}`] }),
      });

      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    });

    it('renders loading spinner when loading messages', () => {
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: undefined,
        isLoading: true,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      const { container } = render(<ChatView />, {
        wrapper: createWrapper({ initialEntries: ['/c/test-convo-id'] }),
      });

      expect(screen.getByTestId('presentation')).toBeInTheDocument();
      const spinner = container.querySelector('svg');
      expect(spinner).toBeInTheDocument();
      expect(spinner?.parentElement?.parentElement).toHaveClass(
        'relative',
        'flex-1',
        'overflow-hidden',
        'overflow-y-auto',
      );
    });

    it('renders messages view when messages exist', async () => {
      const mockMessages: TMessage[] = [
        {
          messageId: '1',
          text: 'Hello',
          parentMessageId: null,
          conversationId: 'test-convo-id',
          isCreatedByUser: true,
        },
        {
          messageId: '2',
          text: 'Hi there',
          parentMessageId: '1',
          conversationId: 'test-convo-id',
          isCreatedByUser: false,
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
        isLoading: false,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      render(<ChatView />, {
        wrapper: createWrapper({ initialEntries: ['/c/test-convo-id'] }),
      });

      await waitFor(() => {
        expect(screen.getByTestId('messages-view')).toBeInTheDocument();
        const messagesView = screen.getByTestId('messages-view');
        expect(messagesView).toHaveAttribute('data-has-messages', 'true');
      });

      expect(screen.getByTestId('chat-header')).toBeInTheDocument();
      expect(screen.getByTestId('chat-form')).toBeInTheDocument();
      expect(screen.getByTestId('chat-footer')).toBeInTheDocument();
    });

    it('renders loading state when navigating to conversation', () => {
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: undefined,
        isLoading: false,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      const { container } = render(<ChatView />, {
        wrapper: createWrapper({ initialEntries: ['/c/test-convo-id'] }),
      });

      const spinner = container.querySelector('svg');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('component props and behavior', () => {
    it('passes correct index to ChatForm', () => {
      render(<ChatView index={2} />, { wrapper: createWrapper() });

      const chatForm = screen.getByTestId('chat-form');
      expect(chatForm).toHaveAttribute('data-index', '2');
    });

    it('respects centerFormOnLanding setting', () => {
      const { unmount } = render(<ChatView />, {
        wrapper: createWrapper(),
      });

      const landingPage = screen.getByTestId('landing-page');
      expect(landingPage).toHaveAttribute('data-centered', 'true');

      unmount();

      render(<ChatView />, {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
              <RecoilRoot
                initializeState={({ set }) => {
                  set(store.centerFormOnLanding, false);
                }}
              >
                <FileMapContext.Provider value={{} as FileMapContextType}>
                  {children}
                </FileMapContext.Provider>
              </RecoilRoot>
            </MemoryRouter>
          </QueryClientProvider>
        ),
      });

      const updatedLandingPage = screen.getByTestId('landing-page');
      expect(updatedLandingPage).toHaveAttribute('data-centered', 'false');
    });

    it('shows header only when not loading', () => {
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: undefined,
        isLoading: true,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      const { rerender } = render(<ChatView />, {
        wrapper: createWrapper({ initialEntries: ['/c/test-convo-id'] }),
      });

      expect(screen.queryByTestId('chat-header')).not.toBeInTheDocument();

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: [],
        isLoading: false,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      rerender(<ChatView />);

      expect(screen.getByTestId('chat-header')).toBeInTheDocument();
    });

    it('provides correct contexts to children', () => {
      render(<ChatView />, { wrapper: createWrapper() });

      expect(screen.getByTestId('presentation')).toBeInTheDocument();
      expect(screen.getByTestId('chat-form')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles empty messages array', async () => {
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: [],
        isLoading: false,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      const { container } = render(<ChatView />, {
        wrapper: createWrapper({ initialEntries: ['/c/test-convo-id'] }),
      });

      const spinner = container.querySelector('svg');
      expect(spinner).toBeInTheDocument();
    });

    it('handles null fileMap context', () => {
      const { container } = render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <RecoilRoot>
              <FileMapContext.Provider value={null as unknown as FileMapContextType}>
                <ChatView />
              </FileMapContext.Provider>
            </RecoilRoot>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('handles query error gracefully', () => {
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Failed to fetch'),
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      const { container } = render(<ChatView />, {
        wrapper: createWrapper({ initialEntries: ['/c/test-convo-id'] }),
      });

      const spinner = container.querySelector('svg');
      expect(spinner).toBeInTheDocument();
    });

    it('correctly applies CSS classes based on page type', () => {
      const { container, rerender } = render(<ChatView />, {
        wrapper: createWrapper(),
      });

      let flexDiv = container.querySelector('.flex-1.items-center.justify-end');
      expect(flexDiv).toBeInTheDocument();
      expect(container.querySelector('.max-w-3xl')).toBeInTheDocument();

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: [
          {
            messageId: '1',
            text: 'Test',
            conversationId: 'test-convo-id',
            isCreatedByUser: true,
            parentMessageId: null,
          } as TMessage,
        ],
        isLoading: false,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      rerender(<ChatView />);

      flexDiv = container.querySelector('.h-full.overflow-y-auto');
      expect(flexDiv).toBeInTheDocument();
      expect(container.querySelector('.max-w-3xl')).not.toBeInTheDocument();
    });

    it('handles multiple index values correctly', () => {
      const indices = [0, 1, 5, 10];

      indices.forEach((index) => {
        const { unmount } = render(<ChatView index={index} />, {
          wrapper: createWrapper(),
        });

        const chatForm = screen.getByTestId('chat-form');
        expect(chatForm).toHaveAttribute('data-index', index.toString());
        unmount();
      });
    });

    it('renders correctly when messages tree is built', async () => {
      const mockMessages: TMessage[] = [
        {
          messageId: '1',
          text: 'Parent',
          parentMessageId: null,
          conversationId: 'test-convo-id',
          isCreatedByUser: true,
        },
        {
          messageId: '2',
          text: 'Child',
          parentMessageId: '1',
          conversationId: 'test-convo-id',
          isCreatedByUser: false,
        },
        {
          messageId: '3',
          text: 'Grandchild',
          parentMessageId: '2',
          conversationId: 'test-convo-id',
          isCreatedByUser: true,
        },
      ];

      mockUseGetMessagesByConvoId.mockImplementation(
        () =>
          ({
            data: mockMessages,
            isLoading: false,
            select: (callback: (data: TMessage[]) => unknown) => ({
              data: callback(mockMessages),
              isLoading: false,
            }),
          }) as unknown as QueryObserverResult<TMessage[], unknown>,
      );

      render(<ChatView />, {
        wrapper: createWrapper({ initialEntries: ['/c/test-convo-id'] }),
      });

      await waitFor(() => {
        expect(screen.getByTestId('messages-view')).toBeInTheDocument();
      });
    });
  });
});
