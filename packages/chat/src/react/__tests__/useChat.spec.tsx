/**
 * @jest-environment jsdom
 */
import { ContentTypes } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import type { TMessage, TPayload, ChatEvent } from 'librechat-data-provider';
import type { ChatState, ChatStream, ChatStatus, ChatConnection } from '../../core';
import { useChat } from '../useChat';
import { Chat } from '../../core';

const createStream = () => {
  const queued: ChatEvent[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  const stream: ChatStream & { push(event: ChatEvent): void } = {
    push(event) {
      queued.push(event);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (queued.length > 0) {
          yield queued.shift() as ChatEvent;
        }
        if (closed) {
          return;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    },
  };
  return stream;
};

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

const userMessage: TMessage = {
  messageId: 'user-1',
  conversationId: 'convo-1',
  parentMessageId: null,
  isCreatedByUser: true,
  text: 'Hi',
};

const response = (text: string): TMessage => ({
  messageId: 'response-1',
  conversationId: 'convo-1',
  parentMessageId: 'user-1',
  isCreatedByUser: false,
  text,
  content: [{ type: ContentTypes.TEXT, text }],
});

/** Writes the streamed text onto the response, as a host's event reducer does. */
const applyText = (
  event: ChatEvent,
  context: { messages: TMessage[]; write(m: TMessage[]): void },
) => {
  if (event.type === 'text') {
    context.write([userMessage, response(event.data.text ?? '')]);
  }
};

const setup = () => {
  const stream = createStream();
  const transport = {
    sendMessages: jest.fn(async () => ({ status: 'stream' as const, stream })),
    reconnectToStream: jest.fn(async () => null),
    abort: jest.fn(async () => ({ success: true })),
  };
  const chat = new Chat({
    id: 'convo-1',
    state: createState(),
    transport,
    applyEvent: applyText,
    prepareRequest: () => ({
      payload: { endpoint: 'agents' } as TPayload,
      messages: [userMessage, response('')],
    }),
  });
  return { chat, stream, transport };
};

const flush = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('useChat over a Chat', () => {
  it('renders the turn as UI messages with the status it is in', async () => {
    const { chat, stream } = setup();
    const { result } = renderHook(() => useChat({ chat }));
    expect(result.current.status).toBe('ready');
    expect(result.current.messages).toEqual([]);

    let sent: Promise<void> = Promise.resolve();
    act(() => {
      sent = result.current.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    });
    await flush();
    expect(result.current.status).toBe('submitted');
    expect(result.current.messages.map((message) => message.id)).toEqual(['user-1', 'response-1']);

    stream.push({ type: 'text', data: { message: true, text: 'Hel' } });
    await flush();
    expect(result.current.status).toBe('streaming');
    expect(result.current.messages[1].parts).toEqual([{ type: 'text', text: 'Hel' }]);

    stream.push({ type: 'final', data: { final: true } });
    await act(() => sent);
    expect(result.current.status).toBe('ready');
    expect(result.current.messages[1].parts).toEqual([{ type: 'text', text: 'Hel' }]);
  });

  it('throttles message updates but renders a status change at once', async () => {
    jest.useFakeTimers();
    try {
      const { chat, stream } = setup();
      let renders = 0;
      const { result } = renderHook(() => {
        renders += 1;
        return useChat({ chat, throttle: 1000 });
      });
      let sent: Promise<void> = Promise.resolve();
      await act(async () => {
        sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
        await jest.advanceTimersByTimeAsync(1000);
      });
      stream.push({ type: 'text', data: { message: true, text: 'H' } });
      await act(() => jest.advanceTimersByTimeAsync(0));
      const before = renders;

      stream.push({ type: 'text', data: { message: true, text: 'He' } });
      stream.push({ type: 'text', data: { message: true, text: 'Hel' } });
      await act(() => jest.advanceTimersByTimeAsync(0));
      expect(renders).toBe(before);
      expect(result.current.messages[1].parts).toEqual([{ type: 'text', text: 'H' }]);

      await act(() => jest.advanceTimersByTimeAsync(1000));
      expect(result.current.messages[1].parts).toEqual([{ type: 'text', text: 'Hel' }]);

      stream.push({ type: 'error', data: 'Rate limited' });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
        await sent;
      });
      expect(result.current.status).toBe('error');
      expect(result.current.error?.message).toBe('Rate limited');
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears an error back to ready', async () => {
    const { chat, stream } = setup();
    const { result } = renderHook(() => useChat({ chat }));

    let sent: Promise<void> = Promise.resolve();
    act(() => {
      sent = result.current.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    });
    stream.push({ type: 'error', data: 'Rate limited' });
    await act(() => sent);
    expect(result.current.status).toBe('error');

    act(() => result.current.clearError());
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeUndefined();
  });

  it('resumes a shared chat once for every consumer that asks', async () => {
    const { chat, transport } = setup();

    renderHook(() => [useChat({ chat, resume: true }), useChat({ chat, resume: true })]);
    await flush();

    expect(transport.reconnectToStream).toHaveBeenCalledTimes(1);
    expect(transport.reconnectToStream).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'convo-1', resume: true }),
    );
  });

  it('writes views back onto the stored messages', async () => {
    const { chat } = setup();
    chat.setMessages([userMessage, response('Hello')]);
    const { result } = renderHook(() => useChat({ chat }));

    act(() => {
      result.current.setMessages((views) => [
        ...views,
        { id: 'note-1', role: 'assistant', parts: [{ type: 'text', text: 'Note' }] },
      ]);
    });

    expect(chat.messages[0]).toEqual(userMessage);
    expect(chat.messages[2]).toMatchObject({
      messageId: 'note-1',
      conversationId: 'convo-1',
      parentMessageId: 'response-1',
    });
    expect(result.current.messages).toHaveLength(3);
  });

  it('applies the host tool rules to tool parts', () => {
    const { chat } = setup();
    chat.setMessages([
      userMessage,
      {
        ...response(''),
        content: [
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: { id: 'call-1', name: 'lookup', args: '{}', output: 'nope', progress: 1 },
          },
        ],
      } as TMessage,
    ]);
    const resolveToolFailure = jest.fn(() => 'Lookup failed');

    const { result } = renderHook(() => useChat({ chat, view: { resolveToolFailure } }));

    expect(result.current.messages[1].parts[0]).toMatchObject({
      state: 'output-error',
      errorText: 'Lookup failed',
    });
    expect(resolveToolFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'call-1' }),
      chat.messages[1],
      undefined,
    );
  });
});
