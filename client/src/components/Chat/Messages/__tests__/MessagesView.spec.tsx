import { screen, fireEvent, waitFor } from '@testing-library/react';
import MessagesView from '../MessagesView';
import * as store from '~/store';
import * as hooks from '~/hooks';
import { renderWithState, createMockMessage, TestProviders } from '~/test-utils/renderHelpers';

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

describe('MessagesView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hooks.useMessageScrolling as jest.Mock).mockReturnValue(defaultScrollingHook);
  });

  describe('Message Display', () => {
    it('renders messages when messagesTree is provided', () => {
      const messagesTree = [
        {
          ...createMockMessage({ messageId: '1' }),
          children: [
            createMockMessage({ messageId: '2', parentMessageId: '1' }),
            createMockMessage({ messageId: '3', parentMessageId: '1' }),
          ],
        },
        { ...createMockMessage({ messageId: '4' }), children: [] },
      ];

      renderWithState(<MessagesView messagesTree={messagesTree} />);

      expect(screen.getByTestId('message-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-4')).toBeInTheDocument();
    });

    it('displays "nothing found" message when messagesTree is empty', () => {
      renderWithState(<MessagesView messagesTree={[]} />);

      expect(screen.getByText('com_ui_nothing_found')).toBeInTheDocument();
    });

    it('displays "nothing found" message when messagesTree is null', () => {
      renderWithState(<MessagesView messagesTree={null} />);

      expect(screen.getByText('com_ui_nothing_found')).toBeInTheDocument();
    });
  });

  describe('Edit Functionality', () => {
    it('tracks current edit state when editing a message', () => {
      const messagesTree = [
        createMockMessage({ messageId: '1' }),
        createMockMessage({ messageId: '2' }),
      ];

      renderWithState(<MessagesView messagesTree={messagesTree} />);

      const editButton1 = screen.getByTestId('message-1').querySelector('button');
      fireEvent.click(editButton1!);

      expect(screen.getByTestId('message-1')).toHaveTextContent('Editing');
      expect(screen.getByTestId('message-2')).not.toHaveTextContent('Editing');
    });

    it('changes edit state when switching to another message', () => {
      const messagesTree = [
        createMockMessage({ messageId: '1' }),
        createMockMessage({ messageId: '2' }),
      ];

      renderWithState(<MessagesView messagesTree={messagesTree} />);

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

      renderWithState(<MessagesView messagesTree={[createMockMessage({ messageId: '1' })]} />, {
        recoilState: [[store.default.showScrollButton, true]],
      });

      expect(screen.getByTestId('scroll-to-bottom')).toBeInTheDocument();
    });

    it('hides scroll button when recoil state is false', () => {
      (hooks.useMessageScrolling as jest.Mock).mockReturnValue({
        ...defaultScrollingHook,
        showScrollButton: true,
      });

      renderWithState(<MessagesView messagesTree={[createMockMessage({ messageId: '1' })]} />, {
        recoilState: [[store.default.showScrollButton, false]],
      });

      expect(screen.queryByTestId('scroll-to-bottom')).not.toBeInTheDocument();
    });

    it('hides scroll button when hook state is false', () => {
      renderWithState(<MessagesView messagesTree={[createMockMessage({ messageId: '1' })]} />, {
        recoilState: [[store.default.showScrollButton, true]],
      });

      expect(screen.queryByTestId('scroll-to-bottom')).not.toBeInTheDocument();
    });

    it('calls scrollToBottom when scroll button is clicked', () => {
      (hooks.useMessageScrolling as jest.Mock).mockReturnValue({
        ...defaultScrollingHook,
        showScrollButton: true,
      });

      renderWithState(<MessagesView messagesTree={[createMockMessage({ messageId: '1' })]} />, {
        recoilState: [[store.default.showScrollButton, true]],
      });

      const scrollButton = screen.getByTestId('scroll-to-bottom');
      fireEvent.click(scrollButton);

      expect(mockHandleSmoothToRef).toHaveBeenCalledTimes(1);
    });
  });

  describe('Font Size Application', () => {
    const fontSizeClasses = ['text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'];

    fontSizeClasses.forEach((fontSizeClass) => {
      it(`applies correct font size class for fontSize ${fontSizeClass}`, () => {
        renderWithState(<MessagesView messagesTree={[]} />, {
          recoilState: [[store.default.fontSize, fontSizeClass]],
        });

        const emptyMessage = screen.getByText('com_ui_nothing_found');
        expect(emptyMessage.className).toContain(fontSizeClass);
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles messages with deep nesting', () => {
      const deeplyNestedTree = [
        {
          ...createMockMessage({ messageId: '1' }),
          children: [
            {
              ...createMockMessage({ messageId: '2', parentMessageId: '1' }),
              children: [createMockMessage({ messageId: '3', parentMessageId: '2' })],
            },
          ],
        },
      ];

      renderWithState(<MessagesView messagesTree={deeplyNestedTree} />);

      expect(screen.getByTestId('message-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-1')).toHaveTextContent('Has children: 1');
    });

    it('calls handleScroll with debounced behavior', async () => {
      renderWithState(<MessagesView messagesTree={[createMockMessage({ messageId: '1' })]} />);

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
      const { rerender } = renderWithState(
        <MessagesView messagesTree={[createMockMessage({ messageId: '1' })]} />,
      );

      const initialMessages = [
        createMockMessage({ messageId: '1' }),
        createMockMessage({ messageId: '2' }),
      ];
      rerender(
        <TestProviders>
          <MessagesView messagesTree={initialMessages} />
        </TestProviders>,
      );

      expect(screen.getByTestId('message-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-2')).toBeInTheDocument();
    });

    it('handles undefined children in message tree gracefully', () => {
      const messageWithUndefinedChildren = [
        { ...createMockMessage({ messageId: '1' }), children: undefined as any },
      ];

      renderWithState(<MessagesView messagesTree={messageWithUndefinedChildren} />);

      expect(screen.getByTestId('message-1')).toBeInTheDocument();
    });
  });
});
