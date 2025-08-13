import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { QueryObserverResult } from '@tanstack/react-query';
import ChatView from '../ChatView';
import { FileMapContext } from '~/Providers';
import { useFileMap } from '~/hooks/Files';
import store from '~/store';
import { renderWithState, createMockMessage } from '~/test-utils/renderHelpers';

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

const renderChatView = (props = {}, { initialEntries = ['/'] } = {}) => {
  const ChatViewWithRouter = (
    <FileMapContext.Provider value={{} as FileMapContextType}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/" element={<ChatView {...props} />} />
          <Route path="/c/:conversationId" element={<ChatView {...props} />} />
        </Routes>
      </MemoryRouter>
    </FileMapContext.Provider>
  );

  return renderWithState(ChatViewWithRouter);
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
      const { container } = renderChatView();

      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
      expect(screen.getByTestId('chat-form')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-starters')).toBeInTheDocument();
      expect(screen.getByTestId('chat-footer')).toBeInTheDocument();
      expect(container.querySelector('.items-center.justify-end')).toBeInTheDocument();
    });

    it('renders landing page for new conversation', () => {
      renderChatView({}, { initialEntries: [`/c/${Constants.NEW_CONVO}`] });

      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    });

    it('renders loading spinner when loading messages', () => {
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: undefined,
        isLoading: true,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      const { container } = renderChatView({}, { initialEntries: ['/c/test-convo-id'] });

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
        createMockMessage({
          messageId: '1',
          text: 'Hello',
          parentMessageId: null,
          conversationId: 'test-convo-id',
          isCreatedByUser: true,
        }),
        createMockMessage({
          messageId: '2',
          text: 'Hi there',
          parentMessageId: '1',
          conversationId: 'test-convo-id',
          isCreatedByUser: false,
        }),
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
        isLoading: false,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      renderChatView({}, { initialEntries: ['/c/test-convo-id'] });

      await waitFor(() => {
        expect(screen.getByTestId('messages-view')).toBeInTheDocument();
        const messagesView = screen.getByTestId('messages-view');
        expect(messagesView).toHaveAttribute('data-has-messages', 'true');
      });

      expect(screen.getByTestId('chat-header')).toBeInTheDocument();
      expect(screen.getByTestId('chat-form')).toBeInTheDocument();
      expect(screen.getByTestId('chat-footer')).toBeInTheDocument();
    });
  });

  describe('component props and behavior', () => {
    it('passes correct index to ChatForm', () => {
      renderChatView({ index: 2 });

      const chatForm = screen.getByTestId('chat-form');
      expect(chatForm).toHaveAttribute('data-index', '2');
    });

    it('respects centerFormOnLanding setting', () => {
      const { unmount } = renderChatView();

      const landingPage = screen.getByTestId('landing-page');
      expect(landingPage).toHaveAttribute('data-centered', 'true');

      unmount();

      const ChatViewWithRouter = (
        <FileMapContext.Provider value={{} as FileMapContextType}>
          <MemoryRouter>
            <ChatView />
          </MemoryRouter>
        </FileMapContext.Provider>
      );

      renderWithState(ChatViewWithRouter, {
        recoilState: [[store.centerFormOnLanding, false]],
      });

      const updatedLandingPage = screen.getByTestId('landing-page');
      expect(updatedLandingPage).toHaveAttribute('data-centered', 'false');
    });

    it('shows header only when not loading', () => {
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: undefined,
        isLoading: true,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      const { rerender } = renderChatView({}, { initialEntries: ['/c/test-convo-id'] });

      expect(screen.queryByTestId('chat-header')).not.toBeInTheDocument();

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: [],
        isLoading: false,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      rerender(
        <FileMapContext.Provider value={{} as FileMapContextType}>
          <MemoryRouter initialEntries={['/c/test-convo-id']}>
            <Routes>
              <Route path="/c/:conversationId" element={<ChatView />} />
            </Routes>
          </MemoryRouter>
        </FileMapContext.Provider>,
      );

      expect(screen.getByTestId('chat-header')).toBeInTheDocument();
    });

    it('provides correct contexts to children', () => {
      renderChatView();

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

      const { container } = renderChatView({}, { initialEntries: ['/c/test-convo-id'] });

      const spinner = container.querySelector('svg');
      expect(spinner).toBeInTheDocument();
    });

    it('handles null fileMap context', () => {
      const ChatViewWithNullContext = (
        <FileMapContext.Provider value={null as unknown as FileMapContextType}>
          <MemoryRouter>
            <ChatView />
          </MemoryRouter>
        </FileMapContext.Provider>
      );

      const { container } = renderWithState(ChatViewWithNullContext);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('correctly applies CSS classes based on page type', () => {
      const { container, rerender } = renderChatView();

      let flexDiv = container.querySelector('.flex-1.items-center.justify-end');
      expect(flexDiv).toBeInTheDocument();
      expect(container.querySelector('.max-w-3xl')).toBeInTheDocument();

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: [
          createMockMessage({
            messageId: '1',
            text: 'Test',
            conversationId: 'test-convo-id',
            isCreatedByUser: true,
            parentMessageId: null,
          }),
        ],
        isLoading: false,
      } as unknown as QueryObserverResult<TMessage[], unknown>);

      rerender(
        <FileMapContext.Provider value={{} as FileMapContextType}>
          <MemoryRouter>
            <ChatView />
          </MemoryRouter>
        </FileMapContext.Provider>,
      );

      flexDiv = container.querySelector('.h-full.overflow-y-auto');
      expect(flexDiv).toBeInTheDocument();
      expect(container.querySelector('.max-w-3xl')).not.toBeInTheDocument();
    });

    it('renders correctly when messages tree is built', async () => {
      const mockMessages: TMessage[] = [
        createMockMessage({
          messageId: '1',
          text: 'Parent',
          parentMessageId: null,
          conversationId: 'test-convo-id',
          isCreatedByUser: true,
        }),
        createMockMessage({
          messageId: '2',
          text: 'Child',
          parentMessageId: '1',
          conversationId: 'test-convo-id',
          isCreatedByUser: false,
        }),
        createMockMessage({
          messageId: '3',
          text: 'Grandchild',
          parentMessageId: '2',
          conversationId: 'test-convo-id',
          isCreatedByUser: true,
        }),
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

      renderChatView({}, { initialEntries: ['/c/test-convo-id'] });

      await waitFor(() => {
        expect(screen.getByTestId('messages-view')).toBeInTheDocument();
      });
    });
  });
});
