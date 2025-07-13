import { screen, fireEvent } from '@testing-library/react';
import Message from '../Message';
import {
  renderWithState,
  createMockMessage,
  createMockConversation,
} from '~/test-utils/renderHelpers';
import store from '~/store';
import type { TMessageProps } from '~/common';

const mockUseMessageProcess = jest.fn();
jest.mock('~/hooks', () => ({
  useMessageProcess: (params: any) => mockUseMessageProcess(params),
}));

jest.mock('../ui/MessageRender', () => {
  const MockMessageRender = ({ message, isCard, isMultiMessage, isSubmittingFamily }: any) => (
    <div data-testid="message-render">
      <div data-testid="message-id">{message?.messageId || 'no-message'}</div>
      <div data-testid="is-card">{isCard?.toString()}</div>
      <div data-testid="is-multi">{isMultiMessage?.toString()}</div>
      <div data-testid="is-submitting">{isSubmittingFamily?.toString()}</div>
    </div>
  );
  return MockMessageRender;
});

jest.mock('../MultiMessage', () => {
  const MockMultiMessage = ({
    messageId,
    conversation,
    messagesTree,
    currentEditId,
    setCurrentEditId,
  }: any) => (
    <div data-testid="multi-message">
      <div data-testid="multi-message-id">{messageId}</div>
      <div data-testid="multi-conversation-id">{conversation?.conversationId}</div>
      <div data-testid="multi-tree-length">{messagesTree?.length || 0}</div>
      <div data-testid="multi-edit-id">{currentEditId || 'none'}</div>
      <button data-testid="multi-set-edit" onClick={() => setCurrentEditId('test-edit')} />
    </div>
  );
  return MockMultiMessage;
});

describe('Message Component', () => {
  const defaultProps: TMessageProps = {
    message: createMockMessage({
      messageId: 'msg-1',
      text: 'Test message',
      children: [],
    }),
    currentEditId: null,
    setCurrentEditId: jest.fn(),
    siblingIdx: 0,
    siblingCount: 1,
  };

  const defaultMockProcessReturn = {
    showSibling: false,
    conversation: createMockConversation(),
    handleScroll: jest.fn(),
    siblingMessage: null,
    latestMultiMessage: null,
    isSubmittingFamily: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMessageProcess.mockReturnValue(defaultMockProcessReturn);
  });

  describe('Basic Rendering', () => {
    it('renders message container with MessageRender', () => {
      renderWithState(<Message {...defaultProps} />);

      expect(screen.getByTestId('message-render')).toBeInTheDocument();
      expect(screen.getByTestId('message-id')).toHaveTextContent('msg-1');
    });

    it('returns null when message is null', () => {
      const { container } = renderWithState(<Message {...defaultProps} message={null as any} />);
      expect(container.firstChild).toBeNull();
    });

    it('returns null when message is not an object', () => {
      const { container } = renderWithState(
        <Message {...defaultProps} message={'invalid' as any} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders MultiMessage component with correct props', () => {
      renderWithState(<Message {...defaultProps} />);

      expect(screen.getByTestId('multi-message')).toBeInTheDocument();
      expect(screen.getByTestId('multi-message-id')).toHaveTextContent('msg-1');
      expect(screen.getByTestId('multi-tree-length')).toHaveTextContent('0');
    });
  });

  describe('Sibling Messages', () => {
    it('renders sibling layout when showSibling is true', () => {
      mockUseMessageProcess.mockReturnValue({
        ...defaultMockProcessReturn,
        showSibling: true,
        siblingMessage: createMockMessage({ messageId: 'sibling-1' }),
      });

      renderWithState(<Message {...defaultProps} />);

      const messageRenders = screen.getAllByTestId('message-render');
      expect(messageRenders).toHaveLength(2);
      expect(messageRenders[0].querySelector('[data-testid="is-card"]')).toHaveTextContent('true');
      expect(messageRenders[1].querySelector('[data-testid="is-multi"]')).toHaveTextContent('true');
    });

    it('uses latestMultiMessage when siblingMessage is null', () => {
      mockUseMessageProcess.mockReturnValue({
        ...defaultMockProcessReturn,
        showSibling: true,
        latestMultiMessage: createMockMessage({ messageId: 'latest-multi' }),
      });

      renderWithState(<Message {...defaultProps} />);

      const messageRenders = screen.getAllByTestId('message-render');
      expect(messageRenders).toHaveLength(2);
      expect(messageRenders[1].querySelector('[data-testid="message-id"]')).toHaveTextContent(
        'latest-multi',
      );
    });

    it('renders single message layout when showSibling is false', () => {
      renderWithState(<Message {...defaultProps} />);

      const messageRenders = screen.getAllByTestId('message-render');
      expect(messageRenders).toHaveLength(1);
      // When showSibling is false, isCard prop is not passed to MessageRender
      expect(messageRenders[0].querySelector('[data-testid="is-card"]')).toHaveTextContent('');
    });
  });

  describe('Chat Space Layout', () => {
    it('applies maximized chat space classes when enabled', () => {
      mockUseMessageProcess.mockReturnValue({
        ...defaultMockProcessReturn,
        showSibling: true,
      });

      renderWithState(<Message {...defaultProps} />, {
        recoilState: [[store.maximizeChatSpace, true]],
      });

      const messageRenders = screen.getAllByTestId('message-render');
      const container = messageRenders[0].parentElement;
      expect(container).toHaveClass('w-full', 'max-w-full');
      expect(container).not.toHaveClass('md:max-w-5xl', 'xl:max-w-6xl');
    });

    it('applies normal chat space classes when disabled', () => {
      mockUseMessageProcess.mockReturnValue({
        ...defaultMockProcessReturn,
        showSibling: true,
      });

      renderWithState(<Message {...defaultProps} />, {
        recoilState: [[store.maximizeChatSpace, false]],
      });

      const messageRenders = screen.getAllByTestId('message-render');
      const container = messageRenders[0].parentElement;
      expect(container).toHaveClass('md:max-w-5xl', 'xl:max-w-6xl');
      expect(container).not.toHaveClass('max-w-full');
    });
  });

  describe('Scroll Handling', () => {
    it('calls handleScroll on wheel event', () => {
      const mockHandleScroll = jest.fn();
      mockUseMessageProcess.mockReturnValue({
        ...defaultMockProcessReturn,
        handleScroll: mockHandleScroll,
      });

      renderWithState(<Message {...defaultProps} />);

      const container = screen.getByTestId('message-render').parentElement?.parentElement;
      fireEvent.wheel(container!);

      expect(mockHandleScroll).toHaveBeenCalled();
    });

    it('calls handleScroll on touch move', () => {
      const mockHandleScroll = jest.fn();
      mockUseMessageProcess.mockReturnValue({
        ...defaultMockProcessReturn,
        handleScroll: mockHandleScroll,
      });

      renderWithState(<Message {...defaultProps} />);

      const container = screen.getByTestId('message-render').parentElement?.parentElement;
      fireEvent.touchMove(container!);

      expect(mockHandleScroll).toHaveBeenCalled();
    });
  });

  describe('Submitting State', () => {
    it('passes isSubmittingFamily to all MessageRender components', () => {
      mockUseMessageProcess.mockReturnValue({
        ...defaultMockProcessReturn,
        showSibling: true,
        isSubmittingFamily: true,
        siblingMessage: createMockMessage({ messageId: 'sibling-1' }),
      });

      renderWithState(<Message {...defaultProps} />);

      const messageRenders = screen.getAllByTestId('message-render');
      messageRenders.forEach((render) => {
        expect(render.querySelector('[data-testid="is-submitting"]')).toHaveTextContent('true');
      });
    });
  });

  describe('Edit Functionality', () => {
    it('passes currentEditId to MultiMessage', () => {
      const propsWithEdit = {
        ...defaultProps,
        currentEditId: 'edit-123',
      };

      renderWithState(<Message {...propsWithEdit} />);

      expect(screen.getByTestId('multi-edit-id')).toHaveTextContent('edit-123');
    });

    it('calls setCurrentEditId when MultiMessage triggers edit', () => {
      const mockSetCurrentEditId = jest.fn();
      const propsWithEditHandler = {
        ...defaultProps,
        setCurrentEditId: mockSetCurrentEditId,
      };

      renderWithState(<Message {...propsWithEditHandler} />);

      fireEvent.click(screen.getByTestId('multi-set-edit'));
      expect(mockSetCurrentEditId).toHaveBeenCalledWith('test-edit');
    });
  });

  describe('Message Process Hook', () => {
    it('calls useMessageProcess with message prop', () => {
      renderWithState(<Message {...defaultProps} />);

      expect(mockUseMessageProcess).toHaveBeenCalledWith({
        message: defaultProps.message,
      });
    });

    it('uses conversation from useMessageProcess', () => {
      const mockConversation = createMockConversation({ conversationId: 'custom-conversation' });
      mockUseMessageProcess.mockReturnValue({
        ...defaultMockProcessReturn,
        conversation: mockConversation,
      });

      renderWithState(<Message {...defaultProps} />);

      expect(screen.getByTestId('multi-conversation-id')).toHaveTextContent('custom-conversation');
    });
  });

  describe('Edge Cases', () => {
    it('handles message without children', () => {
      const messageWithoutChildren = {
        ...defaultProps,
        message: createMockMessage({
          messageId: 'msg-no-children',
          children: undefined,
        }),
      };

      renderWithState(<Message {...messageWithoutChildren} />);

      expect(screen.getByTestId('multi-tree-length')).toHaveTextContent('0');
    });

    it('handles message without messageId', () => {
      const messageWithoutId = {
        ...defaultProps,
        message: createMockMessage({
          messageId: undefined as any,
        }),
      };

      renderWithState(<Message {...messageWithoutId} />);

      expect(screen.getByTestId('multi-message-id')).toHaveTextContent('');
    });

    it('handles empty children array', () => {
      const messageEmptyChildren = {
        ...defaultProps,
        message: createMockMessage({
          children: [],
        }),
      };

      renderWithState(<Message {...messageEmptyChildren} />);

      expect(screen.getByTestId('multi-tree-length')).toHaveTextContent('0');
    });

    it('renders when both siblingMessage and latestMultiMessage are null', () => {
      mockUseMessageProcess.mockReturnValue({
        ...defaultMockProcessReturn,
        showSibling: true,
        siblingMessage: null,
        latestMultiMessage: null,
      });

      renderWithState(<Message {...defaultProps} />);

      const messageRenders = screen.getAllByTestId('message-render');
      expect(messageRenders[1].querySelector('[data-testid="message-id"]')).toHaveTextContent(
        'no-message',
      );
    });

    it('handles all props being passed to MessageRender', () => {
      const extendedProps = {
        ...defaultProps,
        extraProp: 'test-value',
        anotherProp: 123,
      };

      renderWithState(<Message {...extendedProps} />);

      expect(screen.getByTestId('message-render')).toBeInTheDocument();
    });
  });
});
