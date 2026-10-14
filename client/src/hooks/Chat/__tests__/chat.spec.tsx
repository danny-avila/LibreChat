import { Chat } from '@librechat/chat';
import { ContentTypes } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import type { ChatState, ChatStatus, ChatConnection } from '@librechat/chat';
import type { TMessage, TPayload } from 'librechat-data-provider';
import { useChat } from '../facade';

const userMessage: TMessage = {
  messageId: 'user-1',
  conversationId: 'convo-1',
  parentMessageId: null,
  isCreatedByUser: true,
  text: 'Remember this',
};

const memoryFailure: TMessage = {
  messageId: 'response-1',
  conversationId: 'convo-1',
  parentMessageId: 'user-1',
  isCreatedByUser: false,
  text: '',
  content: [
    {
      type: ContentTypes.TOOL_CALL,
      tool_call: {
        id: 'mem-1',
        type: 'tool_call',
        name: 'set_memory',
        args: '{"key":"bad key","value":"x"}',
        output: 'Invalid key: bad key',
        progress: 1,
      },
    },
  ],
} as TMessage;

const createState = (): ChatState => {
  let messages: TMessage[] = [];
  return {
    status: 'ready' as ChatStatus,
    error: undefined,
    connection: 'idle' as ChatConnection,
    get messages() {
      return messages;
    },
    replaceMessages(next) {
      messages = next;
    },
  };
};

const createChat = () =>
  new Chat({
    id: 'convo-1',
    state: createState(),
    transport: {
      sendMessages: jest.fn(),
      reconnectToStream: jest.fn(async () => null),
      abort: jest.fn(async () => ({ success: true })),
    },
    prepareRequest: () => ({ payload: { endpoint: 'agents' } as TPayload, messages: [] }),
  });

describe('useChat with a core Chat', () => {
  it('reads the chat, not the chat context, and maps tool parts with the client rules', () => {
    const chat = createChat();
    chat.setMessages([userMessage, memoryFailure]);

    const { result } = renderHook(() => useChat({ chat }));

    expect(result.current.id).toBe('convo-1');
    expect(result.current.status).toBe('ready');
    expect(result.current.messages[1].parts[0]).toMatchObject({
      type: 'tool-set_memory',
      state: 'output-error',
      errorText: 'Invalid key: bad key',
    });
    expect(typeof result.current.addToolApprovalResponse).toBe('function');
    expect(typeof result.current.addToolOutput).toBe('function');
  });

  it('follows writes to the chat', () => {
    const chat = createChat();
    const { result } = renderHook(() => useChat({ chat }));
    expect(result.current.messages).toEqual([]);

    act(() => chat.setMessages([userMessage]));

    expect(result.current.messages.map((message) => message.id)).toEqual(['user-1']);
  });

  it('refuses to drop the chat it mounted with', () => {
    const chat = createChat();
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = renderHook(({ withChat }) => (withChat ? useChat({ chat }) : useChat()), {
      initialProps: { withChat: true },
    });

    expect(() => rerender({ withChat: false })).toThrow('useChat lost its `chat` after mount');
    error.mockRestore();
  });
});
