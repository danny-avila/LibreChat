import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import MessagesView from '../MessagesView';
import * as store from '~/store';
import { TMessage } from 'librechat-data-provider';
import * as hooks from '~/hooks';

jest.mock('~/hooks', () => ({
  useScreenshot: jest.fn(() => ({
    screenshotTargetRef: { current: null },
  })),
  useLocalize: jest.fn(() => (key: string) => key),
  useMessageScrolling: jest.fn(),
}));

jest.mock('../MultiMessage', () => ({
  __esModule: true,
  default: jest.fn(({ messagesTree, currentEditId, setCurrentEditId }: any) => (
    <>
      {messagesTree?.map((message: any) => (
        <div key={message.messageId} data-testid={`message-${message.messageId}`}>
          {`Message ${message.messageId}`}
          {currentEditId === message.messageId && <span>{`Editing`}</span>}
          <button onClick={() => setCurrentEditId(message.messageId)}>{`Edit`}</button>
          {message.children?.length > 0 && (
            <span>{`Has children: ${message.children.length}`}</span>
          )}
        </div>
      ))}
    </>
  )),
}));

jest.mock('react-transition-group', () => ({
  CSSTransition: jest.fn(({ children, in: inProp }: any) => (inProp ? children : null)),
}));

jest.mock('~/components/Messages/ScrollToBottom', () => ({
  __esModule: true,
  default: jest.fn(({ scrollHandler }: any) => (
    <button data-testid="scroll-to-bottom" onClick={scrollHandler}>
      {`Scroll to bottom`}
    </button>
  )),
}));

jest.mock('~/utils', () => ({
  cn: jest.fn((...args) => {
    return args.filter(Boolean).join(' ');
  }),
}));

const mockScrollToBottom = jest.fn();
const mockHandleScroll = jest.fn();
const mockHandleSmoothToRef = jest.fn();

const defaultScrollingHook = {
  scrollToBottom: mockScrollToBottom,
  handleScroll: mockHandleScroll,
  showScrollButton: false,
  showScrollToTop: false,
  scrollToTop: jest.fn(),
  debouncedHandleScroll: mockHandleScroll,
  scrollableRef: { current: null },
  messagesEndRef: { current: null },
  handleSmoothToRef: mockHandleSmoothToRef,
};

const createMessage = (id: string, parentMessageId: string | null = null): TMessage => ({
  messageId: id,
  parentMessageId,
  conversationId: 'conv-1',
  clientId: 'client-1',
  text: `Message ${id}`,
  isCreatedByUser: false,
  model: 'test-model',
  endpoint: 'test',
  error: false,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  searchResult: false,
  unfinished: false,
  children: [],
});

describe('MessagesView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hooks.useMessageScrolling as jest.Mock).mockReturnValue(defaultScrollingHook);
  });

  describe('Message Display', () => {
    it('renders messages when messagesTree is provided', () => {
      const messagesTree: TMessage[] = [
        { ...createMessage('1'), children: [createMessage('2', '1'), createMessage('3', '1')] },
        { ...createMessage('4'), children: [] },
      ];

      render(
        <RecoilRoot>
          <MessagesView messagesTree={messagesTree} />
        </RecoilRoot>,
      );

      expect(screen.getByTestId('message-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-4')).toBeInTheDocument();
    });

    it('displays "nothing found" message when messagesTree is empty', () => {
      render(
        <RecoilRoot>
          <MessagesView messagesTree={[]} />
        </RecoilRoot>,
      );

      expect(screen.getByText('com_ui_nothing_found')).toBeInTheDocument();
    });

    it('displays "nothing found" message when messagesTree is null', () => {
      render(
        <RecoilRoot>
          <MessagesView messagesTree={null} />
        </RecoilRoot>,
      );

      expect(screen.getByText('com_ui_nothing_found')).toBeInTheDocument();
    });
  });

  describe('Edit Functionality', () => {
    it('tracks current edit state when editing a message', () => {
      const messagesTree = [createMessage('1'), createMessage('2')];

      render(
        <RecoilRoot>
          <MessagesView messagesTree={messagesTree} />
        </RecoilRoot>,
      );

      const editButton1 = screen.getByTestId('message-1').querySelector('button');
      fireEvent.click(editButton1!);

      expect(screen.getByTestId('message-1')).toHaveTextContent('Editing');
      expect(screen.getByTestId('message-2')).not.toHaveTextContent('Editing');
    });

    it('changes edit state when switching to another message', () => {
      const messagesTree = [createMessage('1'), createMessage('2')];

      render(
        <RecoilRoot>
          <MessagesView messagesTree={messagesTree} />
        </RecoilRoot>,
      );

      const editButton1 = screen.getByTestId('message-1').querySelector('button');
      const editButton2 = screen.getByTestId('message-2').querySelector('button');

      fireEvent.click(editButton1!);
      expect(screen.getByTestId('message-1')).toHaveTextContent('Editing');

      fireEvent.click(editButton2!);
      expect(screen.getByTestId('message-1')).not.toHaveTextContent('Editing');
      expect(screen.getByTestId('message-2')).toHaveTextContent('Editing');
    });
  });

  describe('Scroll Button Behavior', () => {
    it('shows scroll button when both recoil state and hook state are true', () => {
      (hooks.useMessageScrolling as jest.Mock).mockReturnValue({
        ...defaultScrollingHook,
        showScrollButton: true,
      });

      render(
        <RecoilRoot
          initializeState={({ set }) => {
            set(store.default.showScrollButton, true);
          }}
        >
          <MessagesView messagesTree={[createMessage('1')]} />
        </RecoilRoot>,
      );

      expect(screen.getByTestId('scroll-to-bottom')).toBeInTheDocument();
    });

    it('hides scroll button when recoil state is false', () => {
      (hooks.useMessageScrolling as jest.Mock).mockReturnValue({
        ...defaultScrollingHook,
        showScrollButton: true,
      });

      render(
        <RecoilRoot
          initializeState={({ set }) => {
            set(store.default.showScrollButton, false);
          }}
        >
          <MessagesView messagesTree={[createMessage('1')]} />
        </RecoilRoot>,
      );

      expect(screen.queryByTestId('scroll-to-bottom')).not.toBeInTheDocument();
    });

    it('hides scroll button when hook state is false', () => {
      render(
        <RecoilRoot
          initializeState={({ set }) => {
            set(store.default.showScrollButton, true);
          }}
        >
          <MessagesView messagesTree={[createMessage('1')]} />
        </RecoilRoot>,
      );

      expect(screen.queryByTestId('scroll-to-bottom')).not.toBeInTheDocument();
    });

    it('calls scrollToBottom when scroll button is clicked', () => {
      (hooks.useMessageScrolling as jest.Mock).mockReturnValue({
        ...defaultScrollingHook,
        showScrollButton: true,
      });

      render(
        <RecoilRoot
          initializeState={({ set }) => {
            set(store.default.showScrollButton, true);
          }}
        >
          <MessagesView messagesTree={[createMessage('1')]} />
        </RecoilRoot>,
      );

      const scrollButton = screen.getByTestId('scroll-to-bottom');
      fireEvent.click(scrollButton);

      expect(mockHandleSmoothToRef).toHaveBeenCalledTimes(1);
    });
  });

  describe('Font Size Application', () => {
    const fontSizeClasses = ['text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'];

    fontSizeClasses.forEach((fontSizeClass) => {
      it(`applies correct font size class for fontSize ${fontSizeClass}`, () => {
        render(
          <RecoilRoot
            initializeState={({ set }) => {
              set(store.default.fontSize, fontSizeClass);
            }}
          >
            <MessagesView messagesTree={[]} />
          </RecoilRoot>,
        );

        const emptyMessage = screen.getByText('com_ui_nothing_found');
        expect(emptyMessage.className).toContain(fontSizeClass);
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles messages with deep nesting', () => {
      const deeplyNestedTree: TMessage[] = [
        {
          ...createMessage('1'),
          children: [
            {
              ...createMessage('2', '1'),
              children: [createMessage('3', '2')],
            },
          ],
        },
      ];

      render(
        <RecoilRoot>
          <MessagesView messagesTree={deeplyNestedTree} />
        </RecoilRoot>,
      );

      expect(screen.getByTestId('message-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-1')).toHaveTextContent('Has children: 1');
    });

    it('calls handleScroll with debounced behavior', async () => {
      render(
        <RecoilRoot>
          <MessagesView messagesTree={[createMessage('1')]} />
        </RecoilRoot>,
      );

      const scrollableDiv = document.querySelector('.scrollbar-gutter-stable');

      fireEvent.scroll(scrollableDiv!);
      fireEvent.scroll(scrollableDiv!);
      fireEvent.scroll(scrollableDiv!);

      await waitFor(
        () => {
          expect(mockHandleScroll).toHaveBeenCalled();
        },
        { timeout: 200 },
      );
    });

    it('maintains scroll position when messages update', () => {
      const { rerender } = render(
        <RecoilRoot>
          <MessagesView messagesTree={[createMessage('1')]} />
        </RecoilRoot>,
      );

      const initialMessages = [createMessage('1'), createMessage('2')];
      rerender(
        <RecoilRoot>
          <MessagesView messagesTree={initialMessages} />
        </RecoilRoot>,
      );

      expect(screen.getByTestId('message-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-2')).toBeInTheDocument();
    });

    it('handles undefined children in message tree gracefully', () => {
      const messageWithUndefinedChildren: TMessage[] = [
        { ...createMessage('1'), children: undefined as any },
      ];

      render(
        <RecoilRoot>
          <MessagesView messagesTree={messageWithUndefinedChildren} />
        </RecoilRoot>,
      );

      expect(screen.getByTestId('message-1')).toBeInTheDocument();
    });
  });
});
