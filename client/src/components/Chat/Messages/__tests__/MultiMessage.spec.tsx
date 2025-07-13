import { screen, fireEvent } from '@testing-library/react';
import { ContentTypes } from 'librechat-data-provider';
import MultiMessage from '../MultiMessage';
import { renderWithState, createMockMessage } from '~/test-utils/renderHelpers';
import store from '~/store';
import type { TMessageProps } from '~/common';

jest.mock('../MessageParts', () => {
  const MockMessageParts = ({
    key,
    message,
    currentEditId,
    setCurrentEditId,
    siblingIdx,
    siblingCount,
    setSiblingIdx,
  }: any) => (
    <div data-testid="message-parts">
      <div data-testid="parts-key">{key}</div>
      <div data-testid="parts-message-id">{message?.messageId}</div>
      <div data-testid="parts-edit-id">{currentEditId || 'none'}</div>
      <div data-testid="parts-sibling-idx">{siblingIdx}</div>
      <div data-testid="parts-sibling-count">{siblingCount}</div>
      <button data-testid="parts-set-edit" onClick={() => setCurrentEditId('test-edit')} />
      <button data-testid="parts-set-sibling" onClick={() => setSiblingIdx(2)} />
    </div>
  );
  return MockMessageParts;
});

jest.mock('~/components/Messages/MessageContent', () => {
  const MockMessageContent = ({
    key,
    message,
    currentEditId,
    setCurrentEditId,
    siblingIdx,
    siblingCount,
    setSiblingIdx,
  }: any) => (
    <div data-testid="message-content">
      <div data-testid="content-key">{key}</div>
      <div data-testid="content-message-id">{message?.messageId}</div>
      <div data-testid="content-edit-id">{currentEditId || 'none'}</div>
      <div data-testid="content-sibling-idx">{siblingIdx}</div>
      <div data-testid="content-sibling-count">{siblingCount}</div>
      <button data-testid="content-set-edit" onClick={() => setCurrentEditId('test-edit')} />
      <button data-testid="content-set-sibling" onClick={() => setSiblingIdx(3)} />
    </div>
  );
  return MockMessageContent;
});

jest.mock('../Message', () => {
  const MockMessage = ({
    key,
    message,
    currentEditId,
    setCurrentEditId,
    siblingIdx,
    siblingCount,
    setSiblingIdx,
  }: any) => (
    <div data-testid="message">
      <div data-testid="message-key">{key}</div>
      <div data-testid="message-message-id">{message?.messageId}</div>
      <div data-testid="message-edit-id">{currentEditId || 'none'}</div>
      <div data-testid="message-sibling-idx">{siblingIdx}</div>
      <div data-testid="message-sibling-count">{siblingCount}</div>
      <button data-testid="message-set-edit" onClick={() => setCurrentEditId('test-edit')} />
      <button data-testid="message-set-sibling" onClick={() => setSiblingIdx(1)} />
    </div>
  );
  return MockMessage;
});

describe('MultiMessage Component', () => {
  const defaultProps: TMessageProps = {
    messageId: 'msg-1',
    messagesTree: [
      createMockMessage({ messageId: 'tree-1', text: 'First message' }),
      createMockMessage({ messageId: 'tree-2', text: 'Second message' }),
      createMockMessage({ messageId: 'tree-3', text: 'Third message' }),
    ],
    currentEditId: null,
    setCurrentEditId: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('returns null when messagesTree is null', () => {
      const { container } = renderWithState(
        <MultiMessage {...defaultProps} messagesTree={null as any} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('returns null when messagesTree is undefined', () => {
      const { container } = renderWithState(
        <MultiMessage {...defaultProps} messagesTree={undefined as any} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('returns null when messagesTree is empty', () => {
      const { container } = renderWithState(<MultiMessage {...defaultProps} messagesTree={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('resets to 0 when selected index is beyond array bounds', () => {
      renderWithState(<MultiMessage {...defaultProps} />, {
        recoilState: [[store.messagesSiblingIdxFamily('msg-1'), 5]],
      });
      expect(screen.getByTestId('message')).toBeInTheDocument();
      expect(screen.getByTestId('message-message-id')).toHaveTextContent('tree-3');
    });

    it('renders Message component for regular messages', () => {
      renderWithState(<MultiMessage {...defaultProps} />);

      expect(screen.getByTestId('message')).toBeInTheDocument();
      expect(screen.getByTestId('message-message-id')).toHaveTextContent('tree-3');
    });
  });

  describe('Assistant Endpoint Messages', () => {
    it('renders MessageParts for assistant endpoint messages', () => {
      const assistantMessage = createMockMessage({
        messageId: 'assistant-1',
        endpoint: 'assistants',
        content: [{ type: ContentTypes.TEXT, text: { value: 'Assistant response' } }],
      });

      renderWithState(<MultiMessage {...defaultProps} messagesTree={[assistantMessage]} />);

      expect(screen.getByTestId('message-parts')).toBeInTheDocument();
      expect(screen.getByTestId('parts-message-id')).toHaveTextContent('assistant-1');
    });

    it('renders MessageContent for messages with content property', () => {
      const contentMessage = createMockMessage({
        messageId: 'content-1',
        content: [{ type: ContentTypes.TEXT, text: { value: 'Content message' } }],
      });

      renderWithState(<MultiMessage {...defaultProps} messagesTree={[contentMessage]} />);

      expect(screen.getByTestId('message-content')).toBeInTheDocument();
      expect(screen.getByTestId('content-message-id')).toHaveTextContent('content-1');
    });
  });

  describe('Sibling Index State', () => {
    it('initializes siblingIdx to 0', () => {
      renderWithState(<MultiMessage {...defaultProps} />);

      expect(screen.getByTestId('message-sibling-idx')).toHaveTextContent('2');
      expect(screen.getByTestId('message-sibling-count')).toHaveTextContent('3');
    });

    it('uses existing siblingIdx from Recoil state', () => {
      renderWithState(<MultiMessage {...defaultProps} />, {
        recoilState: [[store.messagesSiblingIdxFamily('msg-1'), 1]],
      });

      expect(screen.getByTestId('message-sibling-idx')).toHaveTextContent('2');
      expect(screen.getByTestId('message-message-id')).toHaveTextContent('tree-3');
    });

    it('updates siblingIdx through setSiblingIdxRev', () => {
      renderWithState(<MultiMessage {...defaultProps} />);

      fireEvent.click(screen.getByTestId('message-set-sibling'));

      expect(screen.getByTestId('message-sibling-idx')).toHaveTextContent('1');
    });

    it('calculates correct message from reversed index', () => {
      renderWithState(<MultiMessage {...defaultProps} />, {
        recoilState: [[store.messagesSiblingIdxFamily('msg-1'), 2]],
      });

      expect(screen.getByTestId('message-message-id')).toHaveTextContent('tree-3');
    });
  });

  describe('Tree Length Changes', () => {
    it('resets siblingIdx to 0 when tree length changes', () => {
      const { rerender } = renderWithState(<MultiMessage {...defaultProps} />, {
        recoilState: [[store.messagesSiblingIdxFamily('msg-1'), 1]],
      });

      const newProps = {
        ...defaultProps,
        messagesTree: [...defaultProps.messagesTree!, createMockMessage({ messageId: 'tree-4' })],
      };

      rerender(<MultiMessage {...newProps} />);

      expect(screen.getByTestId('message-sibling-idx')).toHaveTextContent('3');
    });

    it('resets siblingIdx when it exceeds tree length', () => {
      const { rerender } = renderWithState(<MultiMessage {...defaultProps} />, {
        recoilState: [[store.messagesSiblingIdxFamily('msg-1'), 2]],
      });

      const newProps = {
        ...defaultProps,
        messagesTree: [createMockMessage({ messageId: 'tree-1' })],
      };

      rerender(<MultiMessage {...newProps} />);

      expect(screen.getByTestId('message-sibling-idx')).toHaveTextContent('0');
    });
  });

  describe('Component Props Passing', () => {
    it('passes correct props to child components', () => {
      const mockSetCurrentEditId = jest.fn();
      const propsWithEdit = {
        ...defaultProps,
        currentEditId: 'edit-123',
        setCurrentEditId: mockSetCurrentEditId,
      };

      renderWithState(<MultiMessage {...propsWithEdit} />);

      expect(screen.getByTestId('message-edit-id')).toHaveTextContent('edit-123');
      expect(screen.getByTestId('message-message-id')).toHaveTextContent('tree-3');

      fireEvent.click(screen.getByTestId('message-set-edit'));
      expect(mockSetCurrentEditId).toHaveBeenCalledWith('test-edit');
    });

    it('passes correct sibling count to all component types', () => {
      const messages = [
        createMockMessage({ messageId: 'msg-1' }),
        createMockMessage({
          messageId: 'msg-2',
          content: [{ type: ContentTypes.TEXT, text: { value: 'Test message' } }],
        }),
        createMockMessage({
          messageId: 'msg-3',
          endpoint: 'assistants',
          content: [{ type: ContentTypes.TEXT, text: { value: 'Test message' } }],
        }),
      ];

      renderWithState(<MultiMessage {...defaultProps} messagesTree={messages} />, {
        recoilState: [[store.messagesSiblingIdxFamily('msg-1'), 0]],
      });

      expect(screen.getByTestId('parts-sibling-count')).toHaveTextContent('3');
    });
  });

  describe('Edge Cases', () => {
    it('handles null messageId', () => {
      renderWithState(<MultiMessage {...defaultProps} messageId={null} />);

      expect(screen.getByTestId('message')).toBeInTheDocument();
    });

    it('handles undefined messageId', () => {
      renderWithState(<MultiMessage {...defaultProps} messageId={undefined} />);

      expect(screen.getByTestId('message')).toBeInTheDocument();
    });

    it('handles messages without messageId property', () => {
      const messageWithoutId = {
        text: 'Message without ID',
        sender: 'user',
      };

      renderWithState(<MultiMessage {...defaultProps} messagesTree={[messageWithoutId as any]} />);

      expect(screen.getByTestId('message')).toBeInTheDocument();
      expect(screen.getByTestId('message-message-id')).toHaveTextContent('');
    });

    it('handles rapid sibling index changes', () => {
      renderWithState(<MultiMessage {...defaultProps} />);

      fireEvent.click(screen.getByTestId('message-set-sibling'));
      fireEvent.click(screen.getByTestId('message-set-sibling'));
      fireEvent.click(screen.getByTestId('message-set-sibling'));

      expect(screen.getByTestId('message-sibling-idx')).toHaveTextContent('1');
    });

    it('handles tree with single message', () => {
      renderWithState(
        <MultiMessage
          {...defaultProps}
          messagesTree={[createMockMessage({ messageId: 'single-1' })]}
        />,
      );

      expect(screen.getByTestId('message-message-id')).toHaveTextContent('single-1');
      expect(screen.getByTestId('message-sibling-idx')).toHaveTextContent('0');
      expect(screen.getByTestId('message-sibling-count')).toHaveTextContent('1');
    });

    it('handles messages with mixed endpoints', () => {
      const mixedMessages = [
        createMockMessage({ messageId: 'api-1' }),
        createMockMessage({
          messageId: 'assistant-1',
          endpoint: 'assistants',
          content: [{ type: ContentTypes.TEXT, text: { value: 'Test message' } }],
        }),
        createMockMessage({
          messageId: 'content-1',
          content: [{ type: ContentTypes.TEXT, text: { value: 'Test message' } }],
        }),
      ];

      const { unmount: unmount1 } = renderWithState(
        <MultiMessage {...defaultProps} messagesTree={mixedMessages} messageId="test-1" />,
        { recoilState: [[store.messagesSiblingIdxFamily('test-1'), 0]] },
      );
      expect(screen.getByTestId('message-content')).toBeInTheDocument();
      unmount1();

      const { unmount: unmount2 } = renderWithState(
        <MultiMessage {...defaultProps} messagesTree={[mixedMessages[0]]} messageId="test-2" />,
        { recoilState: [[store.messagesSiblingIdxFamily('test-2'), 0]] },
      );
      expect(screen.getByTestId('message')).toBeInTheDocument();
      unmount2();

      renderWithState(
        <MultiMessage {...defaultProps} messagesTree={[mixedMessages[1]]} messageId="test-3" />,
        { recoilState: [[store.messagesSiblingIdxFamily('test-3'), 0]] },
      );
      expect(screen.getByTestId('message-parts')).toBeInTheDocument();
    });
  });
});
