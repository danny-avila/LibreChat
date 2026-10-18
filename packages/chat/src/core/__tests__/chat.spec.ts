import { ContentTypes, StepEvents } from 'librechat-data-provider';
import type { Agents, TMessage, TPayload, ChatEvent } from 'librechat-data-provider';
import type {
  ChatStream,
  ChatStatus,
  ChatTransport,
  ChatConnection,
  ChatAbortResult,
} from '../types';
import type { ChatState, ChatInit } from '../chat';
import { Chat } from '../chat';

/** A stream the test feeds event by event; closing it ends the iteration. */
const createStream = (meta: { streamId?: string; generationCreatedAt?: number } = {}) => {
  const queued: ChatEvent[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  const stream: ChatStream & { push(event: ChatEvent): void; closed(): boolean } = {
    ...meta,
    push(event) {
      queued.push(event);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    closed: () => closed,
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

const createState = (initial: TMessage[] = []) => {
  let messages = initial;
  const state: ChatState & { statuses: ChatStatus[] } = {
    statuses: [],
    error: undefined,
    connection: 'idle' as ChatConnection,
    get status() {
      return this.statuses[this.statuses.length - 1] ?? 'ready';
    },
    set status(status: ChatStatus) {
      this.statuses.push(status);
    },
    get messages() {
      return messages;
    },
    replaceMessages(next) {
      messages = next;
    },
  };
  return state;
};

const userMessage: TMessage = {
  messageId: 'user-1',
  conversationId: 'convo-1',
  parentMessageId: null,
  isCreatedByUser: true,
  text: 'Hi',
};

const placeholder: TMessage = {
  messageId: 'response-1',
  conversationId: 'convo-1',
  parentMessageId: 'user-1',
  isCreatedByUser: false,
  text: '',
  content: [],
};

const payload = { endpoint: 'agents', text: 'Hi' } as TPayload;

const stepEvent: ChatEvent = {
  type: 'step',
  data: { event: StepEvents.ON_MESSAGE_DELTA, data: { id: 'step-1', delta: { content: [] } } },
};

const finalEvent = (overrides: Partial<Extract<ChatEvent, { type: 'final' }>['data']> = {}) =>
  ({
    type: 'final',
    data: {
      final: true,
      requestMessage: userMessage,
      responseMessage: { ...placeholder, text: 'Hello' },
      ...overrides,
    },
  }) as ChatEvent;

type Transport = jest.Mocked<Required<ChatTransport>>;

const setup = (
  overrides: Partial<ChatInit> = {},
  transportOverrides: Partial<ChatTransport> = {},
) => {
  const stream = createStream({ streamId: 'convo-1', generationCreatedAt: 100 });
  const transport = {
    sendMessages: jest.fn(async () => ({ status: 'stream' as const, stream })),
    reconnectToStream: jest.fn(async () => null),
    abort: jest.fn(async () => ({ success: true })),
    resume: jest.fn(async () => ({
      streamId: 'convo-1',
      conversationId: 'convo-1',
      status: 'resuming' as const,
    })),
    ...transportOverrides,
  } as unknown as Transport;
  const state = createState([]);
  const onFinish = jest.fn();
  const onError = jest.fn();
  const onEvent = jest.fn();
  const chat = new Chat({
    id: 'convo-1',
    state,
    transport,
    prepareRequest: jest.fn(() => ({ payload, messages: [userMessage, placeholder] })),
    onFinish,
    onError,
    onEvent,
    ...overrides,
  });
  return { chat, stream, transport, state, onFinish, onError, onEvent };
};

/** Lets every queued stream event and executor job run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('Chat', () => {
  it('walks submitted, streaming and ready, merging the final messages', async () => {
    const { chat, stream, transport, state, onFinish, onEvent } = setup();

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    expect(chat.status).toBe('submitted');
    expect(chat.connection).toBe('live');
    expect(chat.messages).toEqual([userMessage, placeholder]);
    expect(transport.sendMessages).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'submit-message', chatId: 'convo-1', payload }),
    );

    stream.push({ type: 'created', data: { message: userMessage, created: true } });
    await flush();
    expect(chat.status).toBe('streaming');

    stream.push(finalEvent());
    await sent;

    expect(state.statuses).toEqual(['submitted', 'streaming', 'ready']);
    expect(chat.connection).toBe('idle');
    expect(chat.messages[1].text).toBe('Hello');
    expect(stream.closed()).toBe(true);
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isAbort: false, isError: false, isDisconnect: false }),
    );
  });

  it('notifies subscribers of each change', async () => {
    const { chat, stream } = setup();
    const listener = jest.fn();
    const unsubscribe = chat.subscribe(listener);

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    stream.push(finalEvent());
    await sent;
    const calls = listener.mock.calls.length;
    unsubscribe();
    await chat.regenerate().catch(() => undefined);

    expect(calls).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it('applies events through the host reducer one at a time, in wire order', async () => {
    const seen: string[] = [];
    const { chat, stream } = setup({
      applyEvent: (event, context) => {
        seen.push(event.type);
        if (event.type === 'step') {
          context.write([...context.messages, { ...placeholder, messageId: 'extra' }]);
        }
      },
    });

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push(stepEvent);
    stream.push(stepEvent);
    stream.push(finalEvent());
    await sent;

    expect(seen).toEqual(['step', 'step', 'final']);
    expect(chat.messages.map((message) => message.messageId)).toEqual([
      'user-1',
      'response-1',
      'extra',
      'extra',
    ]);
  });

  it('reports an error event as an error until it is cleared', async () => {
    const { chat, stream, onError, onFinish } = setup();

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push({ type: 'error', data: { message: 'Rate limited' } });
    await sent;

    expect(chat.status).toBe('error');
    expect(chat.error?.message).toBe('Rate limited');
    expect(onError).toHaveBeenCalledWith(chat.error);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isError: true }));

    chat.clearError();
    expect(chat.status).toBe('ready');
    expect(chat.error).toBeUndefined();
  });

  it('reports a final event with an error terminal status as an error', async () => {
    const { chat, stream } = setup();

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    stream.push(finalEvent({ terminalStatus: 'error', error: { message: 'Context too long' } }));
    await sent;

    expect(chat.status).toBe('error');
    expect(chat.error?.message).toBe('Context too long');
  });

  it('marks a dropped connection and a stream that ends early as a disconnect', async () => {
    const dropped = setup();
    const sent = dropped.chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    dropped.stream.push({ type: 'error', status: 0 });
    await sent;
    expect(dropped.onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isError: true, isDisconnect: true }),
    );

    const ended = setup();
    const endedSend = ended.chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    ended.stream.close();
    await endedSend;
    expect(ended.chat.status).toBe('error');
    expect(ended.onFinish).toHaveBeenCalledWith(expect.objectContaining({ isDisconnect: true }));
  });

  it('clears a dropped connection error once a reconnect finishes the turn', async () => {
    const stream = createStream({ streamId: 'convo-1' });
    const { chat, state } = setup({}, { reconnectToStream: jest.fn(async () => stream) });
    state.error = new Error('dropped');
    state.status = 'error';

    const resumed = chat.resumeStream({ streamId: 'convo-1' });
    await flush();
    stream.push(finalEvent());
    await resumed;

    expect(chat.status).toBe('ready');
    expect(chat.error).toBeUndefined();
  });

  it('reports a failed start as an error and frees the chat for the next turn', async () => {
    const failure = new Error('start failed');
    const { chat, transport } = setup(
      {},
      { sendMessages: jest.fn(async () => Promise.reject(failure)) },
    );

    await chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });

    expect(chat.status).toBe('error');
    expect(chat.error).toBe(failure);
    transport.sendMessages.mockResolvedValueOnce({ status: 'settled', conversationId: 'convo-1' });
    await chat.sendMessage({ parts: [{ type: 'text', text: 'Again' }] });
    expect(chat.status).toBe('ready');
    expect(chat.error).toBeUndefined();
  });

  it('refuses a second turn while one is in flight', async () => {
    const { chat, stream } = setup();

    const first = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await expect(chat.sendMessage({ parts: [{ type: 'text', text: 'Again' }] })).rejects.toThrow(
      'already in flight',
    );
    stream.push(finalEvent());
    await first;

    expect(chat.status).toBe('ready');
  });

  it('cancels a start that has not attached yet', async () => {
    let signal: AbortSignal | undefined;
    const { chat, transport, onFinish } = setup(
      {},
      {
        sendMessages: jest.fn(
          (request) =>
            new Promise((_, reject) => {
              signal = request.abortSignal;
              request.abortSignal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
        ),
      },
    );

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    await chat.stop();
    await sent;

    expect(signal?.aborted).toBe(true);
    expect(transport.abort).not.toHaveBeenCalled();
    expect(chat.status).toBe('ready');
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isAbort: true }));
  });

  it.each(['stop', 'dispose'] as const)(
    'closes a stream that arrives after %s without applying it',
    async (cancel) => {
      let open: (() => void) | undefined;
      const { chat, stream, state, onError, transport } = setup(
        {},
        {
          sendMessages: jest.fn(
            () =>
              new Promise((resolve) => {
                open = () => resolve({ status: 'stream', stream });
              }),
          ),
        },
      );

      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      const cancelled = cancel === 'stop' ? chat.stop() : chat.dispose();
      stream.push(finalEvent());
      open?.();
      await sent;
      await cancelled;

      expect(stream.closed()).toBe(true);
      expect(state.messages[1].text).toBe('');
      expect(onError).not.toHaveBeenCalled();
      expect(transport.abort).toHaveBeenCalledTimes(cancel === 'stop' ? 1 : 0);
    },
  );

  it.each(['sendMessages', 'reconnectToStream'] as const)(
    'stops while %s ignores the abort signal, closing the stream it opens later',
    async (opener) => {
      let open: (() => void) | undefined;
      const stream = createStream({ streamId: 'convo-1' });
      const pending = jest.fn(
        () =>
          new Promise((resolve) => {
            open = () => resolve(opener === 'sendMessages' ? { status: 'stream', stream } : stream);
          }),
      );
      const { chat, onFinish, transport } = setup(
        { resumeSelection: () => ({ endpoint: 'agents' }) },
        { [opener]: pending },
      );

      const started =
        opener === 'sendMessages'
          ? chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] })
          : chat.resumeStream({ streamId: 'convo-1' });
      await flush();
      await chat.stop();
      await started;
      expect(chat.status).toBe('ready');
      open?.();
      await flush();

      expect(stream.closed()).toBe(true);
      expect(transport.abort).toHaveBeenCalledTimes(1);
      expect(transport.abort).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'agents', streamId: 'convo-1' }),
      );
      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isAbort: true }));
    },
  );

  it('does not start a turn stopped while its optimistic messages were written', async () => {
    const { chat, transport, onFinish } = setup();
    const unsubscribe = chat.subscribe(() => {
      if (chat.messages.length > 0) {
        void chat.stop();
      }
    });

    await chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    unsubscribe();

    expect(transport.sendMessages).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isAbort: true }));
  });

  it('does not write the optimistic messages of a turn stopped once its request was prepared', async () => {
    let prepared: (() => void) | undefined;
    const { chat, state, transport } = setup({
      prepareRequest: jest.fn(
        () =>
          new Promise((resolve) => {
            prepared = () => resolve({ payload, messages: [userMessage, placeholder] });
          }),
      ),
    });

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    prepared?.();
    await Promise.resolve();
    const stopped = chat.stop();
    await sent;
    await stopped;

    expect(state.messages).toEqual([]);
    expect(transport.sendMessages).not.toHaveBeenCalled();
  });

  it('does not prepare a turn stopped as soon as it was submitted', async () => {
    const prepareRequest = jest.fn(() => ({ payload, messages: [userMessage, placeholder] }));
    const { chat, onFinish } = setup({ prepareRequest });
    const unsubscribe = chat.subscribe(() => {
      if (chat.status === 'submitted') {
        void chat.stop();
      }
    });

    await chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    unsubscribe();

    expect(prepareRequest).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isAbort: true }));
  });

  it('merges a prepared turn into the list as it stands when the turn is written', async () => {
    const loaded: TMessage = { ...userMessage, messageId: 'loaded-1', text: 'Loaded' };
    let prepared: (() => void) | undefined;
    const { chat, state, stream } = setup({
      prepareRequest: jest.fn(
        () =>
          new Promise((resolve) => {
            prepared = () =>
              resolve({
                payload,
                messages: (current: TMessage[]) => [...current, userMessage, placeholder],
              });
          }),
      ),
    });

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    state.replaceMessages([loaded]);
    prepared?.();
    await flush();

    expect(state.messages.map((message) => message.messageId)).toEqual([
      'loaded-1',
      'user-1',
      'response-1',
    ]);
    stream.push(finalEvent());
    await sent;
  });

  it('finishes a turn stopped during its optimistic write with its own response', async () => {
    const otherBranch: TMessage = { ...placeholder, messageId: 'other-1', parentMessageId: 'x' };
    const { chat, onFinish } = setup({
      prepareRequest: jest.fn(() => ({
        payload,
        messages: [userMessage, placeholder, otherBranch],
        responseMessageId: 'response-1',
      })),
    });
    const unsubscribe = chat.subscribe(() => {
      if (chat.messages.length > 0) {
        void chat.stop();
      }
    });

    await chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    unsubscribe();

    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        isAbort: true,
        message: expect.objectContaining({ messageId: 'response-1' }),
      }),
    );
  });

  it('cancels a start whose request is still being prepared, without writing it', async () => {
    let prepare: (value: { payload: TPayload; messages: TMessage[] }) => void = () => {};
    const { chat, transport, state, onFinish } = setup({
      prepareRequest: () =>
        new Promise((resolve) => {
          prepare = resolve;
        }),
    });

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    await chat.stop();
    await sent;
    prepare({ payload, messages: [userMessage, placeholder] });
    await flush();

    expect(chat.status).toBe('ready');
    expect(state.messages).toEqual([]);
    expect(transport.sendMessages).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isAbort: true }));
  });

  it('stops an attached stream on the server and resolves once it ended', async () => {
    const { chat, stream, transport, onFinish } = setup();
    transport.abort.mockImplementation(async () => {
      stream.push(finalEvent({ terminalStatus: 'aborted' }));
      return { success: true };
    });

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push(stepEvent);
    await flush();
    await chat.stop();

    expect(transport.abort).toHaveBeenCalledWith({
      chatId: 'convo-1',
      endpoint: 'agents',
      streamId: 'convo-1',
      generationCreatedAt: 100,
    });
    expect(chat.status).toBe('ready');
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isAbort: true }));
    await sent;
  });

  it('reports a stopped stream that drops instead of ending as aborted', async () => {
    const { chat, stream, transport, onFinish, onError } = setup();
    transport.abort.mockImplementation(async () => {
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      return { success: true };
    });
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push(stepEvent);
    await flush();

    await chat.stop();
    await sent;

    expect(chat.status).toBe('ready');
    expect(onError).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isAbort: true }));
  });

  it('reports a failed stop of a start that arrived after it', async () => {
    let open: (() => void) | undefined;
    const stream = createStream({ streamId: 'convo-1' });
    const { chat, transport, onError } = setup(
      {},
      {
        sendMessages: jest.fn(
          () =>
            new Promise((resolve) => {
              open = () => resolve({ status: 'stream', stream });
            }),
        ),
      },
    );
    transport.abort.mockImplementation(async () => ({ success: false, error: 'busy' }));

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    await chat.stop();
    await sent;
    open?.();
    await flush();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'busy' }));
  });

  it.each([true, false])(
    'holds a stream that drops before the stop is answered until the answer (confirmed: %s)',
    async (confirmed) => {
      const { chat, stream, transport } = setup();
      let answer: (() => void) | undefined;
      transport.abort.mockImplementation(
        () =>
          new Promise((resolve) => {
            answer = () => resolve(confirmed ? { success: true } : { success: false });
          }),
      );
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push(stepEvent);
      await flush();

      const stopped = chat.stop();
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await flush();
      expect(chat.status).toBe('streaming');
      answer?.();

      if (confirmed) {
        await stopped;
        await sent;
        expect(chat.status).toBe('ready');
        expect(chat.error).toBeUndefined();
      } else {
        await expect(stopped).rejects.toThrow('refused');
        await sent;
        expect(chat.status).toBe('error');
      }
    },
  );

  it('holds a dropped turn, and refuses the next one, until its stop is answered', async () => {
    const { chat, stream, transport } = setup();
    let answer: (() => void) | undefined;
    transport.abort.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ success: true });
        }),
    );
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    const stopped = chat.stop();
    stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
    await flush();

    await expect(chat.sendMessage({ parts: [{ type: 'text', text: 'Again' }] })).rejects.toThrow(
      'in flight',
    );
    answer?.();
    await stopped;
    await sent;

    expect(chat.status).toBe('ready');
  });

  it('rejects a refused stop and keeps streaming', async () => {
    const failure = new Error('abort failed');
    const { chat, stream, transport } = setup();
    transport.abort.mockRejectedValueOnce(failure);

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push(stepEvent);
    await flush();

    await expect(chat.stop()).rejects.toBe(failure);
    expect(chat.status).toBe('streaming');
    stream.push(finalEvent());
    await sent;
    expect(chat.status).toBe('ready');
  });

  it('rejects a stop the server answered without stopping, and keeps streaming', async () => {
    const { chat, stream, transport } = setup();
    transport.abort.mockResolvedValueOnce({ success: false, error: 'Not the running generation' });

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push(stepEvent);
    await flush();

    await expect(chat.stop()).rejects.toThrow('Not the running generation');
    expect(chat.status).toBe('streaming');
    stream.push(finalEvent());
    await sent;
  });

  it('drops its stream on dispose without reporting an error', async () => {
    const { chat, stream, onError, onFinish } = setup();

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push(stepEvent);
    await flush();
    chat.dispose();
    await sent;

    expect(stream.closed()).toBe(true);
    expect(onError).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
    expect(chat.status).toBe('streaming');
  });

  it('settles a start the server already finished, and attaches to the generation replacing it', async () => {
    const settled = setup(
      {},
      {
        sendMessages: jest.fn(async () => ({
          status: 'settled' as const,
          conversationId: 'convo-1',
        })),
      },
    );
    await settled.chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    expect(settled.chat.status).toBe('ready');

    const stream = createStream();
    const replaced = setup(
      {},
      {
        sendMessages: jest.fn(async () => ({
          status: 'replaced' as const,
          generationProtocolVersion: 2,
          conversationId: 'convo-1',
          streamId: 'stream-2',
          generationCreatedAt: 200,
        })),
        reconnectToStream: jest.fn(async () => stream),
      },
    );
    const sent = replaced.chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push(finalEvent());
    await sent;
    expect(replaced.transport.reconnectToStream).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: 'stream-2', generationCreatedAt: 200, resume: true }),
    );
    expect(replaced.chat.status).toBe('ready');
  });

  it('resumes a pause of a replacing generation with the timestamp the start reported', async () => {
    const stream = createStream({ streamId: 'stream-2' });
    const { chat, transport } = setup(
      { resumeSelection: () => ({ endpoint: 'agents' }) },
      {
        sendMessages: jest.fn(async () => ({
          status: 'replaced' as const,
          generationProtocolVersion: 2,
          conversationId: 'convo-1',
          streamId: 'stream-2',
          generationCreatedAt: 200,
        })),
        reconnectToStream: jest.fn(async () => stream),
      },
    );
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push({
      type: 'pending_action',
      data: {
        actionId: 'action-3',
        streamId: 'stream-2',
        conversationId: 'convo-1',
        createdAt: 1,
        payload: { type: 'ask_user_question', question: { question: 'Which?' } },
      } as Agents.PendingAction,
    });
    await flush();

    await chat.addToolOutput({ toolCallId: 'action-3', output: 'Blue' });
    expect(transport.resume).toHaveBeenCalledWith(
      expect.objectContaining({ generationCreatedAt: 200, actionId: 'action-3' }),
    );
    stream.push(finalEvent());
    await sent;
  });

  it('stops a replacing generation on the server while it is still attaching', async () => {
    const { chat, transport } = setup(
      {},
      {
        sendMessages: jest.fn(async () => ({
          status: 'replaced' as const,
          generationProtocolVersion: 2,
          conversationId: 'convo-1',
          streamId: 'stream-2',
          generationCreatedAt: 200,
        })),
        reconnectToStream: jest.fn(() => new Promise<null>(() => undefined)),
      },
    );

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    await chat.stop();
    await sent;

    expect(transport.abort).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'agents',
        streamId: 'stream-2',
        generationCreatedAt: 200,
      }),
    );
    expect(chat.status).toBe('ready');
  });

  it('settles a replacement that finds nothing by the answer of a stop still in flight', async () => {
    let open: ((stream: ChatStream | null) => void) | undefined;
    let answer: ((result: ChatAbortResult) => void) | undefined;
    const { chat, onFinish } = setup(
      {},
      {
        sendMessages: jest.fn(async () => ({
          status: 'replaced' as const,
          generationProtocolVersion: 2,
          conversationId: 'convo-1',
          streamId: 'stream-2',
          generationCreatedAt: 200,
        })),
        reconnectToStream: jest.fn(
          () =>
            new Promise<ChatStream | null>((resolve) => {
              open = resolve;
            }),
        ),
        abort: jest.fn(
          () =>
            new Promise<ChatAbortResult>((resolve) => {
              answer = resolve;
            }),
        ),
      },
    );

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    const stopped = chat.stop();
    await flush();
    open?.(null);
    await flush();
    expect(onFinish).not.toHaveBeenCalled();

    answer?.({
      success: true,
      generationProtocolVersion: 2,
      aborted: 'convo-1',
      persistenceFailed: true,
    });
    await stopped;
    await sent;
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        isAbort: true,
        isSettled: true,
        reconcileReason: 'abort_persistence_failed',
      }),
    );
  });

  it('does not carry a finished generation timestamp into a fresh reattachment', async () => {
    const resumed = createStream({ streamId: 'convo-1' });
    const { chat, stream, transport } = setup(
      { resumeSelection: () => ({ endpoint: 'agents' }) },
      { reconnectToStream: jest.fn(async () => resumed) },
    );
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push(finalEvent());
    await sent;

    const attached = chat.resumeStream({ streamId: 'convo-1' });
    await flush();
    resumed.push(stepEvent);
    await flush();
    transport.abort.mockImplementation(async () => {
      resumed.push(finalEvent({ terminalStatus: 'aborted' }));
      return { success: true };
    });
    await chat.stop();
    await attached;

    expect(transport.abort).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: 'convo-1', generationCreatedAt: undefined }),
    );
  });

  it('lets a completion callback start the next turn', async () => {
    let next: Promise<void> | undefined;
    const { chat, stream, transport } = setup({
      onFinish: () => {
        next ??= chat.sendMessage({ parts: [{ type: 'text', text: 'Again' }] });
      },
    });

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push(finalEvent());
    await sent;
    await next;

    expect(transport.sendMessages).toHaveBeenCalledTimes(2);
  });

  it('keeps the next turn submitted when a subscriber starts it as the connection goes idle', async () => {
    let next: Promise<void> | undefined;
    const { chat, stream } = setup();
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    let started = false;
    const unsubscribe = chat.subscribe(() => {
      if (chat.connection === 'idle' && !started) {
        started = true;
        next = chat.sendMessage({ parts: [{ type: 'text', text: 'Again' }] });
      }
    });
    stream.push(finalEvent());
    await sent;

    expect(next).toBeDefined();
    expect(chat.status).toBe('submitted');
    unsubscribe();
  });

  it.each(['final', 'abort'] as const)(
    'finishes on %s with the response the turn produced, not the tail of another branch',
    async (end) => {
      const otherBranch: TMessage = { ...placeholder, messageId: 'other-1', parentMessageId: 'x' };
      const { chat, stream, onFinish } = setup({
        prepareRequest: jest.fn(() => ({
          payload,
          messages: [userMessage, placeholder, otherBranch],
          responseMessageId: 'response-1',
        })),
      });

      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push(end === 'final' ? finalEvent() : ({ type: 'abort', data: {} } as ChatEvent));
      await sent;

      expect(onFinish).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.objectContaining({ messageId: 'response-1' }) }),
      );
    },
  );

  it('stops an Assistants run by its abort key and merges the messages the stop returns', async () => {
    const stream = createStream();
    const { chat, transport, onFinish } = setup(
      {
        prepareRequest: jest.fn(() => ({
          payload: { endpoint: 'assistants', conversationId: 'convo-1', text: 'Hi' } as TPayload,
          messages: [userMessage, placeholder],
          responseMessageId: 'response-1',
        })),
      },
      { sendMessages: jest.fn(async () => ({ status: 'stream' as const, stream })) },
    );
    transport.abort.mockResolvedValue({
      final: true,
      conversation: {},
      runMessages: [userMessage, { ...placeholder, text: 'Partial' }],
    });

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    await chat.stop();
    await sent;

    expect(transport.abort).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'assistants', abortKey: 'convo-1:response-1' }),
    );
    expect(chat.messages[1].text).toBe('Partial');
    expect(chat.status).toBe('ready');
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isAbort: true }));
  });

  it('replaces the list with the run messages a stop returns, dropping rows the run deleted', async () => {
    const stream = createStream();
    const unfinished: TMessage = { ...placeholder, messageId: 'tool-1', text: '' };
    const { chat, transport } = setup(
      {
        prepareRequest: jest.fn(() => ({
          payload: { endpoint: 'assistants', conversationId: 'convo-1', text: 'Hi' } as TPayload,
          messages: [userMessage, placeholder, unfinished],
          responseMessageId: 'response-1',
        })),
      },
      { sendMessages: jest.fn(async () => ({ status: 'stream' as const, stream })) },
    );
    const runMessages = [userMessage, { ...placeholder, text: 'Partial' }];
    transport.abort.mockResolvedValue({ final: true, conversation: {}, runMessages });

    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    await chat.stop();
    await sent;

    expect(chat.messages).toEqual(runMessages);
  });

  it('stops a late Assistants start by its abort key', async () => {
    let open: (() => void) | undefined;
    const stream = createStream();
    const { chat, transport } = setup(
      {
        prepareRequest: jest.fn(() => ({
          payload: { endpoint: 'assistants', conversationId: 'convo-1', text: 'Hi' } as TPayload,
          messages: [userMessage, placeholder],
          responseMessageId: 'response-1',
        })),
      },
      {
        sendMessages: jest.fn(
          () =>
            new Promise((resolve) => {
              open = () => resolve({ status: 'stream', stream });
            }),
        ),
      },
    );
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    await chat.stop();
    await sent;
    open?.();
    await flush();

    expect(transport.abort).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'assistants', abortKey: 'convo-1:response-1' }),
    );
  });

  it('merges the messages a stop returns for an Assistants run whose stream dropped', async () => {
    const stream = createStream();
    const { chat, transport } = setup(
      {
        prepareRequest: jest.fn(() => ({
          payload: { endpoint: 'assistants', conversationId: 'convo-1', text: 'Hi' } as TPayload,
          messages: [userMessage, placeholder],
          responseMessageId: 'response-1',
        })),
      },
      { sendMessages: jest.fn(async () => ({ status: 'stream' as const, stream })) },
    );
    transport.abort.mockResolvedValue({
      final: true,
      conversation: {},
      runMessages: [userMessage, { ...placeholder, text: 'Partial' }],
    });
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
    await sent;

    await chat.stop();

    expect(transport.abort).toHaveBeenCalledWith(
      expect.objectContaining({ abortKey: 'convo-1:response-1' }),
    );
    expect(chat.messages[1].text).toBe('Partial');
    expect(chat.status).toBe('ready');
  });

  it('keeps a newer pause restored while a dropped Assistants run merged its stop', async () => {
    const stream = createStream();
    const { chat, transport } = setup(
      {
        prepareRequest: jest.fn(() => ({
          payload: { endpoint: 'assistants', conversationId: 'convo-1', text: 'Hi' } as TPayload,
          messages: [userMessage, placeholder],
          responseMessageId: 'response-1',
        })),
      },
      { sendMessages: jest.fn(async () => ({ status: 'stream' as const, stream })) },
    );
    transport.abort.mockResolvedValue({
      final: true,
      conversation: {},
      runMessages: [userMessage, { ...placeholder, text: 'Partial' }],
    });
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
    await sent;
    const newer = {
      actionId: 'action-newer',
      streamId: 'convo-1',
      conversationId: 'convo-1',
      createdAt: 2,
      payload: { type: 'ask_user_question', question: { question: 'Which?' }, tool_call_id: 'q' },
    } as Agents.PendingAction;
    let restored = false;
    const unsubscribe = chat.subscribe(() => {
      if (!restored && chat.messages[1]?.text === 'Partial') {
        restored = true;
        chat.restorePendingAction(newer, 900);
      }
    });

    await chat.stop();
    unsubscribe();

    expect(chat.messages[1].text).toBe('Partial');
    expect(chat.pendingAction?.actionId).toBe('action-newer');
  });

  it('keeps the reattachment target of a reconnect that failed on the network', async () => {
    const failure = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
    const { chat, transport } = setup(
      { resumeSelection: () => ({ endpoint: 'agents' }) },
      { reconnectToStream: jest.fn(async () => Promise.reject(failure)) },
    );
    await chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 300 });
    expect(chat.status).toBe('error');

    await chat.stop();

    expect(transport.abort).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'agents',
        streamId: 'convo-1',
        generationCreatedAt: 300,
      }),
    );
  });

  it('keeps a dropped generation stoppable when reattaching to it fails on the server', async () => {
    const { chat, stream, transport, onFinish } = setup({
      resumeSelection: () => ({ endpoint: 'agents' }),
    });
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
    await sent;
    transport.reconnectToStream.mockRejectedValueOnce(new Error('Service Unavailable'));

    await chat.resumeStream();
    expect(onFinish).toHaveBeenLastCalledWith(
      expect.objectContaining({ isError: true, isDisconnect: true }),
    );

    await expect(chat.stop()).resolves.toEqual({ status: 'stopped' });
    expect(transport.abort).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'agents',
        streamId: 'convo-1',
        generationCreatedAt: 100,
      }),
    );
  });

  it.each([
    ['404', { response: { status: 404, data: null, headers: {} } }],
    ['410', { response: { status: 410, data: null, headers: {} } }],
    ['NO_ACTIVE_RUN', { code: 'NO_ACTIVE_RUN' }],
  ])(
    'settles a reattachment the server answered %s as an error, not a disconnect',
    async (_label, gone) => {
      const { chat, stream, transport, onFinish } = setup({
        resumeSelection: () => ({ endpoint: 'agents' }),
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;
      transport.reconnectToStream.mockRejectedValueOnce(Object.assign(new Error('Gone'), gone));

      await chat.resumeStream();

      expect(onFinish).toHaveBeenLastCalledWith(
        expect.objectContaining({ isError: true, isDisconnect: false }),
      );
      await expect(chat.stop()).resolves.toEqual({ status: 'idle' });
      expect(transport.abort).not.toHaveBeenCalled();
    },
  );

  it('does not merge a delayed stop of a dropped run into a newer turn', async () => {
    const first = createStream();
    const second = createStream();
    let answer: (() => void) | undefined;
    const { chat, transport } = setup(
      {
        prepareRequest: jest.fn(() => ({
          payload: { endpoint: 'assistants', conversationId: 'convo-1', text: 'Hi' } as TPayload,
          messages: [userMessage, placeholder],
          responseMessageId: 'response-1',
        })),
      },
      {
        sendMessages: jest
          .fn()
          .mockResolvedValueOnce({ status: 'stream', stream: first })
          .mockResolvedValueOnce({ status: 'stream', stream: second }),
      },
    );
    transport.abort.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = () =>
            resolve({
              final: true,
              conversation: {},
              runMessages: [{ ...placeholder, text: 'Old' }],
            });
        }),
    );
    const firstTurn = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    first.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
    await firstTurn;
    const stopped = chat.stop();
    const secondTurn = chat.continue({ messageId: 'response-1' });
    await flush();
    answer?.();
    await stopped;

    expect(chat.messages[1].text).toBe('');
    second.push(finalEvent());
    await secondTurn;
  });

  it('stops an Assistants run by the ids its sync frame assigned', async () => {
    const stream = createStream();
    const { chat, transport } = setup(
      {
        id: 'new',
        prepareRequest: jest.fn(() => ({
          payload: { endpoint: 'assistants', text: 'Hi' } as TPayload,
          messages: [userMessage, placeholder],
          responseMessageId: 'response-1',
        })),
      },
      { sendMessages: jest.fn(async () => ({ status: 'stream' as const, stream })) },
    );
    transport.abort.mockResolvedValue({ final: true, conversation: {}, runMessages: [] });
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push({
      type: 'sync',
      data: { sync: true, conversationId: 'convo-9', responseMessage: { messageId: 'server-2' } },
    } as ChatEvent);
    await flush();

    await chat.stop();
    await sent;

    expect(transport.abort).toHaveBeenCalledWith(
      expect.objectContaining({ abortKey: 'convo-9:server-2' }),
    );
  });

  it('refuses a replacement the server did not report under protocol v2', async () => {
    const { chat, transport, onError } = setup(
      {},
      {
        sendMessages: jest.fn(async () => ({
          status: 'replaced' as const,
          conversationId: 'convo-1',
          streamId: 'stream-2',
          generationCreatedAt: 200,
        })),
      },
    );

    await chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });

    expect(transport.reconnectToStream).not.toHaveBeenCalled();
    expect(chat.status).toBe('error');
    expect(onError).toHaveBeenCalled();
  });

  it('reports reconnecting while a reattachment opens', async () => {
    let attach: ((stream: null) => void) | undefined;
    const { chat } = setup(
      {},
      {
        reconnectToStream: jest.fn(
          () =>
            new Promise<null>((resolve) => {
              attach = resolve;
            }),
        ),
      },
    );

    const resumed = chat.resumeStream({ streamId: 'convo-1' });
    expect(chat.connection).toBe('reconnecting');
    attach?.(null);
    await resumed;
    expect(chat.connection).toBe('idle');
  });

  it('settles a final frame that asks for reconciliation instead of completing it', async () => {
    const { chat, stream, onFinish } = setup();
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push({
      type: 'final',
      data: {
        final: true,
        reconcile: true,
        reconcileReason: 'abort_persistence_failed',
        terminalStatus: 'aborted',
      },
    } as ChatEvent);
    await sent;

    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        isAbort: true,
        isSettled: true,
        reconcileReason: 'abort_persistence_failed',
      }),
    );
  });

  it('reports a run the stop found already finished as settled when its final frame is lost', async () => {
    const { chat, stream, transport, onFinish } = setup();
    transport.abort.mockImplementation(async () => {
      stream.close();
      return { success: false, settled: true, terminalStatus: 'complete' };
    });
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();

    await chat.stop();
    await sent;

    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isAbort: false, isSettled: true }),
    );
    expect(chat.status).toBe('ready');
  });

  it('reports a reattachment the stop found already finished as settled', async () => {
    const { chat, transport, onFinish } = setup(
      { resumeSelection: () => ({ endpoint: 'agents' }) },
      { reconnectToStream: jest.fn(() => new Promise<null>(() => undefined)) },
    );
    transport.abort.mockResolvedValue({
      success: false,
      settled: true,
      terminalStatus: 'complete',
    });

    const resumed = chat.resumeStream({ streamId: 'convo-1' });
    await flush();
    await chat.stop();
    await resumed;

    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isAbort: false, isSettled: true }),
    );
  });

  it('settles a reattachment the stop cancelled as it opened by the stop answer', async () => {
    let open: ((stream: ChatStream) => void) | undefined;
    let answer: ((result: ChatAbortResult) => void) | undefined;
    const opened = createStream({ streamId: 'convo-1' });
    const { chat, onFinish } = setup(
      { resumeSelection: () => ({ endpoint: 'agents' }) },
      {
        reconnectToStream: jest.fn(
          () =>
            new Promise<ChatStream>((resolve) => {
              open = resolve;
            }),
        ),
        abort: jest.fn(
          () =>
            new Promise<ChatAbortResult>((resolve) => {
              answer = resolve;
            }),
        ),
      },
    );
    const resumed = chat.resumeStream({ streamId: 'convo-1' });
    await flush();
    const stopped = chat.stop();
    await flush();

    /** The answer lands one microtask before the stream opens, so the stop cancels the open. */
    answer?.({ success: false, settled: true, terminalStatus: 'complete' });
    await Promise.resolve();
    open?.(opened);
    await stopped;
    await resumed;

    expect(opened.closed()).toBe(true);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isAbort: false, isSettled: true }),
    );
  });

  it('accepts a stop the run had already settled', async () => {
    const { chat, stream, transport } = setup();
    transport.abort.mockImplementation(async () => {
      stream.push(finalEvent());
      return { success: false, settled: true, terminalStatus: 'complete' };
    });
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();

    await expect(chat.stop()).resolves.toEqual({ status: 'stopped' });
    await sent;
    expect(chat.status).toBe('ready');
  });

  it('reports a start that never got a response as a disconnect', async () => {
    const failure = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
    const { chat, onFinish } = setup(
      {},
      { sendMessages: jest.fn(async () => Promise.reject(failure)) },
    );

    await chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });

    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isError: true, isDisconnect: true }),
    );
  });

  it('leaves a replacing generation running when the start it replaced was stopped', async () => {
    let open: (() => void) | undefined;
    const { chat, transport } = setup(
      {},
      {
        sendMessages: jest.fn(
          () =>
            new Promise((resolve) => {
              open = () =>
                resolve({
                  status: 'replaced',
                  generationProtocolVersion: 2,
                  conversationId: 'convo-1',
                  streamId: 'stream-2',
                  generationCreatedAt: 200,
                });
            }),
        ),
      },
    );
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    await chat.stop();
    await sent;
    open?.();
    await flush();

    expect(transport.abort).not.toHaveBeenCalled();
  });

  it('reports a start the server settled before attaching for the host to reconcile', async () => {
    const { chat, onFinish } = setup(
      {},
      {
        sendMessages: jest.fn(async () => ({ status: 'settled' as const, conversationId: 'c-9' })),
      },
    );

    await chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });

    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isSettled: true, conversationId: 'c-9' }),
    );
  });

  it('reports no message when the named response left the list', async () => {
    const { chat, stream, state, onFinish } = setup({
      prepareRequest: jest.fn(() => ({
        payload,
        messages: [userMessage, placeholder],
        responseMessageId: 'response-1',
      })),
    });
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    state.replaceMessages([userMessage]);
    stream.push({ type: 'abort', data: {} } as ChatEvent);
    await sent;

    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ message: undefined }));
  });

  it('stops a generation whose stream dropped, which the server kept running', async () => {
    const { chat, stream, transport } = setup();
    const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
    await flush();
    stream.push(stepEvent);
    stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
    await sent;
    expect(chat.status).toBe('error');

    await chat.stop();

    expect(transport.abort).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'agents',
        streamId: 'convo-1',
        generationCreatedAt: 100,
      }),
    );
    expect(chat.status).toBe('ready');
    expect(chat.error).toBeUndefined();
  });

  it('continues a response with the continue trigger', async () => {
    const { chat, stream, transport } = setup();
    const sent = chat.continue({ messageId: 'response-1' });
    await flush();
    stream.push(finalEvent());
    await sent;

    expect(transport.sendMessages).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'continue-message', messageId: 'response-1' }),
    );
  });

  it('regenerates a given message', async () => {
    const { stream, transport } = setup();
    const prepareRequest = jest.fn(() => ({ payload }));
    const regenerating = new Chat({
      id: 'convo-1',
      state: createState(),
      transport,
      prepareRequest,
    });

    const sent = regenerating.regenerate({ messageId: 'response-1' });
    stream.push(finalEvent());
    await sent;

    expect(prepareRequest).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'regenerate-message', messageId: 'response-1' }),
    );
    expect(transport.sendMessages).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'regenerate-message', messageId: 'response-1' }),
    );
    expect(regenerating.status).toBe('ready');
  });

  it('resumes without flashing submitted, and stays ready when nothing is running', async () => {
    const idle = setup();
    await idle.chat.resumeStream();
    expect(idle.state.statuses).toEqual([]);

    const stream = createStream({ generationCreatedAt: 300 });
    const running = setup({}, { reconnectToStream: jest.fn(async () => stream) });
    const resumed = running.chat.resumeStream({ streamId: 'convo-1' });
    await flush();
    stream.push(stepEvent);
    stream.push(finalEvent());
    await resumed;

    expect(running.transport.reconnectToStream).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'convo-1', streamId: 'convo-1', resume: true }),
    );
    expect(running.state.statuses).toEqual(['streaming', 'ready']);
  });

  it('stops a resumed stream on the server, at the endpoint the host selects', async () => {
    const stream = createStream({ streamId: 'convo-1', generationCreatedAt: 300 });
    const { chat, transport } = setup(
      { resumeSelection: () => ({ endpoint: 'agents' }) },
      { reconnectToStream: jest.fn(async () => stream) },
    );
    transport.abort.mockImplementation(async () => {
      stream.push(finalEvent({ terminalStatus: 'aborted' }));
      return { success: true };
    });

    const resumed = chat.resumeStream({ streamId: 'convo-1' });
    await flush();
    stream.push(stepEvent);
    await flush();
    await chat.stop();
    await resumed;

    expect(transport.abort).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'agents',
        streamId: 'convo-1',
        generationCreatedAt: 300,
      }),
    );
    expect(chat.status).toBe('ready');
  });

  it('refuses to stop a resumed stream whose endpoint the host does not select', async () => {
    const stream = createStream({ streamId: 'convo-1' });
    const { chat, transport, onError } = setup(
      {},
      { reconnectToStream: jest.fn(async () => stream) },
    );

    const resumed = chat.resumeStream({ streamId: 'convo-1' });
    await flush();
    stream.push(stepEvent);
    await flush();

    await expect(chat.stop()).rejects.toThrow('without its endpoint');
    expect(transport.abort).not.toHaveBeenCalled();
    expect(stream.closed()).toBe(false);
    expect(chat.status).toBe('streaming');
    stream.push(finalEvent());
    await resumed;
    expect(onError).not.toHaveBeenCalled();
  });

  describe('paused generations', () => {
    const toolCall = (id: string) => ({
      type: ContentTypes.TOOL_CALL,
      tool_call: {
        id,
        name: 'search',
        args: '{}',
        type: 'tool_call',
        approval: { actionId: 'action-1', allowed_decisions: ['approve', 'reject'] },
      },
    });

    const approvalAction = {
      actionId: 'action-1',
      streamId: 'convo-1',
      conversationId: 'convo-1',
      createdAt: 1,
      payload: {
        type: 'tool_approval',
        action_requests: [
          { name: 'search', arguments: '{}', tool_call_id: 'call-1' },
          { name: 'search', arguments: '{}', tool_call_id: 'call-2' },
        ],
        review_configs: [],
      },
    } as Agents.PendingAction;

    const askAction = {
      actionId: 'action-2',
      streamId: 'convo-1',
      conversationId: 'convo-1',
      createdAt: 1,
      payload: {
        type: 'ask_user_question',
        question: { question: 'Which?' },
        tool_call_id: 'ask-1',
      },
    } as Agents.PendingAction;

    const pause = async (action: Agents.PendingAction, overrides: Partial<ChatInit> = {}) => {
      const paused = setup({
        resumeSelection: () => ({ endpoint: 'agents', agent_id: 'agent-1' }),
        prepareRequest: () => ({
          payload,
          messages: [
            userMessage,
            { ...placeholder, content: [toolCall('call-1'), toolCall('call-2')] } as TMessage,
          ],
        }),
        ...overrides,
      });
      const sent = paused.chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      paused.stream.push({ type: 'pending_action', data: action });
      await flush();
      return { ...paused, sent };
    };

    it('shows each decision and resumes once the whole batch is decided', async () => {
      const { chat, transport, stream, sent } = await pause(approvalAction);
      expect(chat.pendingAction).toBe(approvalAction);

      await chat.addToolApprovalResponse({ id: 'call-1', approved: true });
      expect(transport.resume).not.toHaveBeenCalled();
      const [first] = chat.messages[1].content as Array<{ tool_call: Agents.ToolCall }>;
      expect(first.tool_call).toMatchObject({ approval: { decision: 'approve' } });

      await chat.addToolApprovalResponse({ id: 'call-2', approved: false, reason: 'No' });
      expect(transport.resume).toHaveBeenCalledWith({
        endpoint: 'agents',
        agent_id: 'agent-1',
        conversationId: 'convo-1',
        generationCreatedAt: 100,
        actionId: 'action-1',
        decisions: [
          { tool_call_id: 'call-1', decision: 'approve' },
          { tool_call_id: 'call-2', decision: 'reject', reason: 'No' },
        ],
      });
      expect(chat.pendingAction).toBeUndefined();

      stream.push(finalEvent());
      await sent;
    });

    it('keeps the decisions of a pause the stream replays after a reconnect', async () => {
      const { chat, transport, stream, sent } = await pause(approvalAction);
      await chat.addToolApprovalResponse({ id: 'call-1', approved: true });
      stream.push({ type: 'pending_action', data: { ...approvalAction } });
      await flush();

      await chat.addToolApprovalResponse({ id: 'call-2', approved: false });

      expect(transport.resume).toHaveBeenCalledWith(
        expect.objectContaining({
          decisions: [
            { tool_call_id: 'call-1', decision: 'approve' },
            { tool_call_id: 'call-2', decision: 'reject' },
          ],
        }),
      );
      stream.push(finalEvent());
      await sent;
    });

    it('does not resume a batch whose pause was replaced while its last decision was shown', async () => {
      const { chat, transport, state } = setup();
      state.replaceMessages([
        userMessage,
        { ...placeholder, content: [toolCall('call-1'), toolCall('call-2')] } as TMessage,
      ]);
      chat.restorePendingAction(approvalAction, 500);
      await chat.addToolApprovalResponse({ id: 'call-1', approved: true });
      const unsubscribe = chat.subscribe(() => {
        if (chat.pendingAction === approvalAction) {
          chat.restorePendingAction(askAction, 500);
        }
      });

      await chat.addToolApprovalResponse({ id: 'call-2', approved: true });
      unsubscribe();

      expect(transport.resume).not.toHaveBeenCalled();
      expect(chat.pendingAction).toBe(askAction);
    });

    it('lets a subscriber start a turn once a reconnect drops a pause that ended elsewhere', async () => {
      const { chat, transport, stream } = setup();
      chat.restorePendingAction(askAction, 500);
      let next: Promise<void> | undefined;
      const unsubscribe = chat.subscribe(() => {
        if (!chat.pendingAction && !next) {
          next = Promise.resolve();
          next = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
        }
      });

      await chat.resumeStream({ streamId: 'convo-1' });
      unsubscribe();

      expect(chat.status).toBe('submitted');
      await flush();
      expect(transport.sendMessages).toHaveBeenCalled();
      stream.push(finalEvent());
      await next;
    });

    it('resumes a replayed pause once, with the decisions made before the replay', async () => {
      const { chat, transport, stream, sent } = await pause(approvalAction);
      let accept: (() => void) | undefined;
      transport.resume.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            accept = () =>
              resolve({ streamId: 'convo-1', conversationId: 'convo-1', status: 'resuming' });
          }),
      );
      await chat.addToolApprovalResponse({ id: 'call-1', approved: true });
      const resumed = chat.addToolApprovalResponse({ id: 'call-2', approved: true });
      await flush();
      stream.push({ type: 'pending_action', data: { ...approvalAction } });
      await flush();

      await expect(chat.addToolApprovalResponse({ id: 'call-2', approved: false })).rejects.toThrow(
        'already being resumed',
      );
      accept?.();
      await resumed;
      expect(transport.resume).toHaveBeenCalledTimes(1);
      expect(chat.pendingAction).toBeUndefined();
      stream.push(finalEvent());
      await sent;
    });

    it('keeps the decisions of a pause a status check restores again', async () => {
      const { chat, transport } = setup();
      chat.restorePendingAction(approvalAction, 500);
      await chat.addToolApprovalResponse({ id: 'call-1', approved: true });
      chat.restorePendingAction({ ...approvalAction }, 500);

      await chat.addToolApprovalResponse({ id: 'call-2', approved: true });

      expect(transport.resume).toHaveBeenCalledWith(
        expect.objectContaining({
          decisions: [
            { tool_call_id: 'call-1', decision: 'approve' },
            { tool_call_id: 'call-2', decision: 'approve' },
          ],
        }),
      );
    });

    it('does not reattach for a pause replaced while its resume was in flight', async () => {
      let accept: (() => void) | undefined;
      const { chat, transport } = setup(
        { resumeSelection: () => ({ endpoint: 'agents' }) },
        {
          resume: jest.fn(
            () =>
              new Promise((resolve) => {
                accept = () =>
                  resolve({ streamId: 'convo-1', conversationId: 'convo-1', status: 'resuming' });
              }),
          ),
        },
      );
      chat.restorePendingAction(askAction, 500);
      const answered = chat.addToolOutput({ toolCallId: 'ask-1', output: 'Blue' });
      await flush();
      const next = { ...approvalAction, actionId: 'action-9' } as Agents.PendingAction;
      chat.restorePendingAction(next, 900);

      accept?.();
      await answered;
      await flush();

      expect(transport.reconnectToStream).not.toHaveBeenCalled();
      expect(chat.pendingAction).toBe(next);
    });

    it('shows only the reason of the latest decision for a call', async () => {
      const { chat, stream, sent } = await pause(approvalAction);
      await chat.addToolApprovalResponse({ id: 'call-1', approved: false, reason: 'No' });
      await chat.addToolApprovalResponse({ id: 'call-1', approved: true });

      const call = chat.messages[1].content?.[0] as { tool_call: Agents.ToolCall };
      expect(call.tool_call).toMatchObject({ approval: { decision: 'approve' } });
      expect((call.tool_call as { approval?: { reason?: string } }).approval).not.toHaveProperty(
        'reason',
      );
      stream.push(finalEvent());
      await sent;
    });

    it('resumes a batch once when its last decisions arrive together', async () => {
      const { chat, transport, stream, sent } = await pause(approvalAction);
      transport.resume.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ streamId: 'convo-1', conversationId: 'convo-1', status: 'resuming' }),
              10,
            ),
          ),
      );

      await Promise.all([
        chat.addToolApprovalResponse({ id: 'call-1', approved: true }),
        chat.addToolApprovalResponse({ id: 'call-2', approved: true }),
      ]);

      expect(transport.resume).toHaveBeenCalledTimes(1);
      stream.push(finalEvent());
      await sent;
    });

    it('attaches to the continuation of a pause restored without a stream', async () => {
      const continuation = createStream();
      const { chat, transport } = setup(
        {},
        { reconnectToStream: jest.fn(async () => continuation) },
      );

      chat.restorePendingAction(askAction, 500);
      await chat.addToolOutput({ toolCallId: 'ask-1', output: 'Blue' });
      await flush();

      expect(transport.reconnectToStream).toHaveBeenCalledWith(
        expect.objectContaining({ streamId: 'convo-1', generationCreatedAt: 500, resume: true }),
      );
      continuation.push(stepEvent);
      continuation.push(finalEvent());
      await flush();
      expect(chat.status).toBe('ready');
      expect(chat.messages[1].text).toBe('Hello');
    });

    it('does not reattach once disposed while a resume is in flight', async () => {
      let accept: (() => void) | undefined;
      const { chat, transport } = setup(
        {},
        {
          resume: jest.fn(
            () =>
              new Promise((resolve) => {
                accept = () =>
                  resolve({ streamId: 'convo-1', conversationId: 'convo-1', status: 'resuming' });
              }),
          ),
        },
      );

      chat.restorePendingAction(askAction, 500);
      const answered = chat.addToolOutput({ toolCallId: 'ask-1', output: 'Blue' });
      await flush();
      chat.dispose();
      accept?.();
      await answered;
      await flush();

      expect(transport.reconnectToStream).not.toHaveBeenCalled();
      await expect(chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] })).rejects.toThrow(
        'disposed',
      );
    });

    it('stops the continuation of a restored pause with the generation it resumed', async () => {
      const continuation = createStream({ streamId: 'convo-1' });
      const { chat, transport } = setup(
        { resumeSelection: () => ({ endpoint: 'agents' }) },
        { reconnectToStream: jest.fn(async () => continuation) },
      );
      transport.abort.mockImplementation(async () => {
        continuation.push(finalEvent({ terminalStatus: 'aborted' }));
        return { success: true };
      });

      chat.restorePendingAction(askAction, 500);
      await chat.addToolOutput({ toolCallId: 'ask-1', output: 'Blue' });
      await flush();
      continuation.push(stepEvent);
      await flush();
      await chat.stop();

      expect(transport.abort).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'agents', generationCreatedAt: 500 }),
      );
      expect(chat.status).toBe('ready');
    });

    it('stops a restored pause on the server while its continuation is still attaching', async () => {
      const { chat, transport } = setup(
        { resumeSelection: () => ({ endpoint: 'agents' }) },
        { reconnectToStream: jest.fn(() => new Promise<null>(() => undefined)) },
      );
      chat.restorePendingAction(askAction, 500);

      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 500 });
      await flush();
      await chat.stop();
      await resumed;

      expect(transport.abort).toHaveBeenCalledWith({
        chatId: 'convo-1',
        endpoint: 'agents',
        streamId: 'convo-1',
        generationCreatedAt: 500,
      });
      expect(chat.pendingAction).toBeUndefined();
      expect(chat.status).toBe('ready');
    });

    it('refuses decisions and answers once disposed', async () => {
      const { chat, transport } = setup();
      chat.restorePendingAction(askAction, 500);
      chat.dispose();

      await expect(chat.addToolOutput({ toolCallId: 'ask-1', output: 'Blue' })).rejects.toThrow(
        'disposed',
      );
      expect(transport.resume).not.toHaveBeenCalled();
    });

    it('drops a restored pause once a reconnect finds nothing running', async () => {
      const { chat, transport } = setup();
      chat.restorePendingAction(askAction, 500);

      await chat.resumeStream({ streamId: 'convo-1' });

      expect(transport.reconnectToStream).toHaveBeenCalled();
      expect(chat.pendingAction).toBeUndefined();
    });

    it('drops a restored pause when the reattached stream is another generation', async () => {
      const other = createStream({ streamId: 'convo-1', generationCreatedAt: 200 });
      const { chat } = setup({}, { reconnectToStream: jest.fn(async () => other) });
      chat.restorePendingAction(askAction, 100);

      const resumed = chat.resumeStream({ streamId: 'convo-1' });
      await flush();

      expect(chat.pendingAction).toBeUndefined();
      other.push(finalEvent());
      await resumed;
    });

    it('refuses to restore a pause while a stream is attached', async () => {
      const { chat, stream, sent } = await pause(askAction);
      const newer = { ...askAction, actionId: 'action-7' } as Agents.PendingAction;

      expect(() => chat.restorePendingAction(newer, 900)).toThrow('in flight');
      expect(chat.pendingAction).toBe(askAction);
      stream.push(finalEvent());
      await sent;
    });

    it('drops a restored pause when an explicit reconnect names another generation', async () => {
      const other = createStream({ streamId: 'convo-1', generationCreatedAt: 200 });
      const { chat } = setup({}, { reconnectToStream: jest.fn(async () => other) });
      chat.restorePendingAction(askAction, 100);

      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 200 });
      await flush();

      expect(chat.pendingAction).toBeUndefined();
      other.push(finalEvent());
      await resumed;
    });

    it('ignores the replay of a pause it already resumed', async () => {
      let attach: (() => void) | undefined;
      const continuation = createStream({ streamId: 'convo-1' });
      const { chat } = setup(
        {},
        {
          reconnectToStream: jest.fn(
            () =>
              new Promise((resolve) => {
                attach = () => resolve(continuation);
              }),
          ),
        },
      );
      chat.restorePendingAction(askAction, 500);
      const resumed = chat.resumeStream({ streamId: 'convo-1' });
      await flush();
      await chat.addToolOutput({ toolCallId: 'ask-1', output: 'Blue' });
      attach?.();
      await flush();
      continuation.push({ type: 'pending_action', data: askAction });
      await flush();

      expect(chat.pendingAction).toBeUndefined();
      continuation.push(finalEvent());
      await resumed;
    });

    it('reports a continuation that finished before it attached as settled', async () => {
      const { chat, state, onFinish } = setup();
      state.error = new Error('dropped');
      state.status = 'error';
      chat.restorePendingAction(askAction, 500);

      await chat.addToolOutput({ toolCallId: 'ask-1', output: 'Blue' });
      await flush();

      expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isSettled: true }));
      expect(chat.status).toBe('ready');
      expect(chat.error).toBeUndefined();
    });

    it('submits edit, respond and session-scoped decisions as given', async () => {
      const { chat, transport, stream, sent } = await pause(approvalAction);
      await chat.addToolApprovalResponse({
        id: 'call-1',
        approved: true,
        decision: 'edit',
        editedArguments: { q: 'cats' },
      });
      await chat.addToolApprovalResponse({ id: 'call-2', approved: true, scope: 'session' });

      expect(transport.resume).toHaveBeenCalledWith(
        expect.objectContaining({
          decisions: [
            { tool_call_id: 'call-1', decision: 'edit', editedArguments: { q: 'cats' } },
            { tool_call_id: 'call-2', decision: 'approve', scope: 'session' },
          ],
        }),
      );
      stream.push(finalEvent());
      await sent;
    });

    it('does not restore an expired pause, and drops the one it held', async () => {
      const { chat } = setup();
      chat.restorePendingAction(askAction, 500);

      chat.restorePendingAction({ ...askAction, expiresAt: Date.now() - 1 }, 500);

      expect(chat.pendingAction).toBeUndefined();
      chat.restorePendingAction({ ...approvalAction, expiresAt: Date.now() - 1 }, 500);
      expect(chat.pendingAction).toBeUndefined();
    });

    it('stops a restored pause of a newer generation, not an older dropped one', async () => {
      const { chat, stream, sent, transport } = await pause(askAction, {
        resumeSelection: () => ({ endpoint: 'agents' }),
      });
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;
      const newer = {
        ...askAction,
        actionId: 'action-8',
        streamId: 'convo-1',
      } as Agents.PendingAction;
      chat.restorePendingAction(newer, 900);

      await chat.stop();

      expect(transport.abort).toHaveBeenCalledWith(
        expect.objectContaining({ generationCreatedAt: 900 }),
      );
      expect(chat.pendingAction).toBeUndefined();
    });

    it('holds new turns behind a restored pause until it is stopped on the server', async () => {
      const { chat, transport } = setup({ resumeSelection: () => ({ endpoint: 'agents' }) });
      chat.restorePendingAction(askAction, 500);

      await expect(chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] })).rejects.toThrow(
        'paused generation',
      );
      expect(transport.sendMessages).not.toHaveBeenCalled();

      await chat.stop();
      expect(transport.abort).toHaveBeenCalledWith({
        chatId: 'convo-1',
        endpoint: 'agents',
        streamId: 'convo-1',
        generationCreatedAt: 500,
      });
      expect(chat.pendingAction).toBeUndefined();
    });

    it('keeps the pause when only the connection drops', async () => {
      const { chat, stream, sent } = await pause(askAction);
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;

      expect(chat.status).toBe('error');
      expect(chat.pendingAction).toBe(askAction);
    });

    it('refuses a decision once the batch is being resumed', async () => {
      const single = {
        ...approvalAction,
        payload: {
          ...approvalAction.payload,
          action_requests: [{ name: 'search', arguments: '{}', tool_call_id: 'call-1' }],
        },
      } as Agents.PendingAction;
      const { chat, transport, stream, sent } = await pause(single);
      let accept: (() => void) | undefined;
      transport.resume.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            accept = () =>
              resolve({ streamId: 'convo-1', conversationId: 'convo-1', status: 'resuming' });
          }),
      );

      const approved = chat.addToolApprovalResponse({ id: 'call-1', approved: true });
      await flush();
      await expect(chat.addToolApprovalResponse({ id: 'call-1', approved: false })).rejects.toThrow(
        'already being resumed',
      );
      accept?.();
      await approved;

      expect(transport.resume).toHaveBeenCalledWith(
        expect.objectContaining({
          decisions: [{ tool_call_id: 'call-1', decision: 'approve' }],
        }),
      );
      stream.push(finalEvent());
      await sent;
    });

    it('drops the pause of a stopped generation whose stream disconnects instead of aborting', async () => {
      const { chat, transport, stream, sent } = await pause(askAction);
      transport.abort.mockImplementation(async () => {
        stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
        return { success: true };
      });

      await chat.stop();
      await sent;

      expect(chat.pendingAction).toBeUndefined();
    });

    it('drops a pause that arrives while a confirmed stop is in flight', async () => {
      const { chat, transport, stream } = setup();
      let confirm: (() => void) | undefined;
      transport.abort.mockImplementation(
        () =>
          new Promise((resolve) => {
            confirm = () => resolve({ success: true });
          }),
      );
      const turn = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push(stepEvent);
      await flush();

      const stopped = chat.stop();
      stream.push({ type: 'pending_action', data: askAction });
      await flush();
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await flush();
      confirm?.();
      await stopped;
      await turn;

      expect(chat.pendingAction).toBeUndefined();
    });

    it('keeps the pause of a turn started while a slow stop was in flight', async () => {
      const first = createStream({ streamId: 'convo-1', generationCreatedAt: 100 });
      const second = createStream({ streamId: 'convo-1', generationCreatedAt: 200 });
      let confirm: (() => void) | undefined;
      const { chat, transport } = setup(
        {},
        {
          sendMessages: jest
            .fn()
            .mockResolvedValueOnce({ status: 'stream', stream: first })
            .mockResolvedValueOnce({ status: 'stream', stream: second }),
          abort: jest.fn(
            () =>
              new Promise((resolve) => {
                confirm = () => resolve({ success: true });
              }),
          ),
        },
      );
      const firstTurn = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      const stopped = chat.stop();
      first.push(finalEvent());
      await firstTurn;

      const secondTurn = chat.sendMessage({ parts: [{ type: 'text', text: 'Again' }] });
      await flush();
      second.push({ type: 'pending_action', data: askAction });
      await flush();
      confirm?.();
      await stopped;

      expect(transport.abort).toHaveBeenCalledTimes(1);
      expect(chat.pendingAction).toBe(askAction);
      second.push(finalEvent());
      await secondTurn;
    });

    it('reports ready once a stop ends a pause its dropped connection left in error', async () => {
      const { chat, stream, sent } = await pause(askAction);
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;
      expect(chat.status).toBe('error');

      await chat.stop();

      expect(chat.pendingAction).toBeUndefined();
      expect(chat.status).toBe('ready');
      expect(chat.error).toBeUndefined();
    });

    it('drops the pause when the generation aborts or fails', async () => {
      const aborted = await pause(askAction);
      aborted.stream.push({ type: 'abort', data: {} } as ChatEvent);
      await aborted.sent;
      expect(aborted.chat.pendingAction).toBeUndefined();
      await expect(
        aborted.chat.addToolOutput({ toolCallId: 'ask-1', output: 'x' }),
      ).rejects.toThrow('No question is pending');

      const failed = await pause(askAction);
      failed.stream.push({ type: 'error', data: 'boom' } as ChatEvent);
      await failed.sent;
      expect(failed.chat.pendingAction).toBeUndefined();
    });

    it('resumes a later pause with its own generation, not the previous one', async () => {
      const first = createStream({ streamId: 'convo-1', generationCreatedAt: 100 });
      const second = createStream({ streamId: 'convo-1' });
      const { chat, transport } = setup(
        { resumeSelection: () => ({ endpoint: 'agents' }) },
        {
          sendMessages: jest
            .fn()
            .mockResolvedValueOnce({ status: 'stream', stream: first })
            .mockResolvedValueOnce({ status: 'stream', stream: second }),
        },
      );

      const firstTurn = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      first.push(finalEvent());
      await firstTurn;

      const secondTurn = chat.sendMessage({ parts: [{ type: 'text', text: 'Again' }] });
      await flush();
      second.push({ type: 'pending_action', data: askAction });
      await flush();
      await expect(chat.addToolOutput({ toolCallId: 'ask-1', output: 'x' })).rejects.toThrow(
        'paused generation is unknown',
      );
      expect(transport.resume).not.toHaveBeenCalled();
      second.push(finalEvent());
      await secondTurn;
    });

    it('refuses a decision for a call the pause does not hold', async () => {
      const { chat, stream, sent } = await pause(approvalAction);

      await expect(chat.addToolApprovalResponse({ id: 'other', approved: true })).rejects.toThrow(
        'not awaiting approval',
      );
      await expect(chat.addToolOutput({ toolCallId: 'call-1', output: 'x' })).rejects.toThrow(
        'No question is pending',
      );

      stream.push(finalEvent());
      await sent;
      await expect(chat.addToolApprovalResponse({ id: 'call-1', approved: true })).rejects.toThrow(
        'No tool approval is pending',
      );
    });

    it('answers a question with free text or keyed answers', async () => {
      const { chat, transport, stream, sent } = await pause(askAction);

      await expect(chat.addToolOutput({ toolCallId: 'other', output: 'x' })).rejects.toThrow(
        'not awaiting an answer',
      );
      await chat.addToolOutput({ toolCallId: 'ask-1', output: 'Blue' });
      expect(transport.resume).toHaveBeenCalledWith(
        expect.objectContaining({ actionId: 'action-2', answer: 'Blue' }),
      );

      stream.push(finalEvent());
      await sent;

      chat.restorePendingAction(askAction, 400);
      await chat.addToolOutput({ toolCallId: 'ask-1', output: { q1: 'Blue' } });
      expect(transport.resume).toHaveBeenLastCalledWith(
        expect.objectContaining({ generationCreatedAt: 400, answers: { q1: 'Blue' } }),
      );
    });

    it('refuses to answer over a transport that cannot resume', async () => {
      const { chat, transport, stream, sent } = await pause(askAction);
      (transport as Partial<Transport>).resume = undefined;

      await expect(chat.addToolOutput({ toolCallId: 'ask-1', output: 'Blue' })).rejects.toThrow(
        'cannot resume',
      );
      expect(chat.pendingAction).toBe(askAction);

      stream.push(finalEvent());
      await sent;
    });
  });

  describe('stop answers and reattachment targets', () => {
    const steer = { steerId: 'steer-1', text: 'Shorter' };
    const pausedAction = {
      actionId: 'action-5',
      streamId: 'new',
      createdAt: 1,
      payload: {
        type: 'ask_user_question',
        question: { question: 'Which?' },
        tool_call_id: 'ask-5',
      },
    } as Agents.PendingAction;

    it('hands back the steers a stop found uninjected, under the conversation it stopped', async () => {
      const { chat, stream, transport } = setup();
      transport.abort.mockImplementation(async () => {
        stream.push(finalEvent({ terminalStatus: 'aborted' }));
        return { success: true, aborted: 'convo-7', pendingSteers: [steer] };
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();

      await expect(chat.stop()).resolves.toEqual({
        status: 'stopped',
        conversationId: 'convo-7',
        pendingSteers: [steer],
      });
      await sent;
    });

    it('hands back no steers from a stop the run had already settled or could not save', async () => {
      for (const answer of [
        { settled: true, terminalStatus: 'complete' as const },
        { persistenceFailed: true },
      ]) {
        const { chat, stream, transport } = setup();
        transport.abort.mockImplementation(async () => {
          stream.push(finalEvent({ terminalStatus: 'aborted' }));
          return { success: true, aborted: 'convo-1', pendingSteers: [steer], ...answer };
        });
        const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
        await flush();

        await expect(chat.stop()).resolves.toEqual({
          status: 'stopped',
          conversationId: 'convo-1',
        });
        await sent;
      }
    });

    it('reports a turn under `new` it saw no frame for as unaddressable, leaving it attached', async () => {
      const stream = createStream();
      const { chat, transport } = setup(
        {
          id: 'new',
          prepareRequest: jest.fn(() => ({
            payload: { endpoint: 'assistants', text: 'Hi' } as TPayload,
            messages: [userMessage, placeholder],
            responseMessageId: 'response-1',
          })),
        },
        { sendMessages: jest.fn(async () => ({ status: 'stream' as const, stream })) },
      );
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push(stepEvent);
      await flush();

      await expect(chat.stop()).resolves.toEqual({ status: 'unaddressable' });

      expect(transport.abort).not.toHaveBeenCalled();
      expect(chat.status).toBe('streaming');
      stream.push(finalEvent());
      await sent;
    });

    it('reports a start cancelled before it reached the transport as stopped', async () => {
      const { chat, transport } = setup({
        prepareRequest: jest.fn(() => new Promise<never>(() => undefined)),
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();

      await expect(chat.stop()).resolves.toEqual({ status: 'stopped' });
      await sent.catch(() => undefined);
      expect(transport.sendMessages).not.toHaveBeenCalled();
    });

    it('drops a restored pause once a newer generation is restored with an expired one', async () => {
      const { chat } = setup();
      chat.restorePendingAction({ ...pausedAction, streamId: 'convo-1' }, 500);

      chat.restorePendingAction(
        { ...pausedAction, actionId: 'action-6', streamId: 'convo-1', expiresAt: 1 },
        900,
      );

      expect(chat.pendingAction).toBeUndefined();
    });

    it('sends no stop for a late start it cannot name', async () => {
      let open: ((result: { status: 'stream'; stream: ChatStream }) => void) | undefined;
      const late = createStream();
      const { chat, transport, onError } = setup(
        {
          id: 'new',
          prepareRequest: jest.fn(() => ({
            payload: { endpoint: 'assistants', text: 'Hi' } as TPayload,
            messages: [userMessage, placeholder],
            responseMessageId: 'response-1',
          })),
        },
        {
          sendMessages: jest.fn(
            () =>
              new Promise<{ status: 'stream'; stream: ChatStream }>((resolve) => {
                open = resolve;
              }),
          ),
        },
      );
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();

      await expect(chat.stop()).resolves.toEqual({ status: 'unaddressable' });
      open?.({ status: 'stream', stream: late });
      await sent.catch(() => undefined);
      await flush();

      expect(late.closed()).toBe(true);
      expect(transport.abort).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it("stops an Assistants run by the ids its sync frame named, from that frame's own callback", async () => {
      const stream = createStream();
      const stops: Promise<unknown>[] = [];
      const harness: { chat?: Chat } = {};
      const { chat, transport } = setup(
        {
          id: 'new',
          prepareRequest: jest.fn(() => ({
            payload: { endpoint: 'assistants', text: 'Hi' } as TPayload,
            messages: [userMessage, placeholder],
            responseMessageId: 'response-1',
          })),
          onEvent: (event) => {
            if (event.type === 'sync' && harness.chat) {
              stops.push(harness.chat.stop());
            }
          },
        },
        { sendMessages: jest.fn(async () => ({ status: 'stream' as const, stream })) },
      );
      harness.chat = chat;
      transport.abort.mockImplementation(async () => {
        stream.push(finalEvent({ terminalStatus: 'aborted' }));
        return { final: true, conversation: {}, runMessages: [] };
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();

      stream.push({
        type: 'sync',
        data: {
          conversationId: 'convo-9',
          responseMessage: { ...placeholder, messageId: 'response-9' },
        },
      } as ChatEvent);
      await sent;
      await Promise.all(stops);

      expect(transport.abort).toHaveBeenCalledWith(
        expect.objectContaining({ abortKey: 'convo-9:response-9' }),
      );
    });

    it('reports a restored pause a reconnect finds finished elsewhere as settled', async () => {
      const { chat, transport, onFinish } = setup();
      chat.restorePendingAction({ ...pausedAction, streamId: 'convo-1' }, 500);
      transport.reconnectToStream.mockResolvedValueOnce(null);

      await chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 500 });

      expect(chat.pendingAction).toBeUndefined();
      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isSettled: true }));
    });

    it('reattaches a dropped first turn under the conversation its sync frame assigned', async () => {
      const { chat, stream, transport, onFinish } = setup({ id: 'new' });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push({
        type: 'sync',
        data: { conversationId: 'convo-9', responseMessage: placeholder },
      } as ChatEvent);
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;
      transport.reconnectToStream.mockResolvedValueOnce(null);

      await chat.resumeStream({ streamId: 'convo-1' });

      expect(transport.reconnectToStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ chatId: 'convo-9' }),
      );
      expect(onFinish).toHaveBeenLastCalledWith(
        expect.objectContaining({ isSettled: true, conversationId: 'convo-9' }),
      );
    });

    it('stops a replacement from the reconnect notice and reattaches it under its conversation', async () => {
      const stream = createStream({ generationCreatedAt: 200 });
      const stops: Promise<unknown>[] = [];
      const { chat, transport, onFinish } = setup(
        { id: 'new' },
        {
          sendMessages: jest.fn(async () => ({
            status: 'replaced' as const,
            generationProtocolVersion: 2,
            conversationId: 'convo-9',
            streamId: 'stream-2',
            generationCreatedAt: 200,
          })),
          reconnectToStream: jest.fn(async () => stream),
        },
      );
      transport.abort.mockImplementation(async () => {
        stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
        return { success: true };
      });
      const unsubscribe = chat.subscribe(() => {
        if (chat.connection === 'reconnecting' && stops.length === 0) {
          stops.push(chat.stop());
        }
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      unsubscribe();
      await expect(stops[0]).resolves.toEqual({ status: 'stopped' });
      await sent;
      expect(transport.abort).toHaveBeenCalledWith(
        expect.objectContaining({ streamId: 'stream-2', generationCreatedAt: 200 }),
      );
      expect(onFinish).toHaveBeenCalledTimes(1);

      const dropped = setup(
        { id: 'new' },
        {
          sendMessages: jest.fn(async () => ({
            status: 'replaced' as const,
            generationProtocolVersion: 2,
            conversationId: 'convo-9',
            streamId: 'stream-2',
            generationCreatedAt: 200,
          })),
        },
      );
      const replacement = createStream({ generationCreatedAt: 200 });
      dropped.transport.reconnectToStream.mockResolvedValueOnce(replacement);
      const sentDropped = dropped.chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      replacement.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sentDropped;
      dropped.transport.reconnectToStream.mockResolvedValueOnce(null);
      await dropped.chat.resumeStream({ streamId: 'stream-2', generationCreatedAt: 200 });

      expect(dropped.transport.reconnectToStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ chatId: 'convo-9' }),
      );
    });

    it('reports nothing to stop as idle', async () => {
      const { chat, transport } = setup();

      await expect(chat.stop()).resolves.toEqual({ status: 'idle' });
      expect(transport.abort).not.toHaveBeenCalled();
    });

    it('keeps an unsaved stop attached, and reports it unsaved when nothing is left to attach to', async () => {
      let open: ((stream: ChatStream | null) => void) | undefined;
      const { chat, transport, onFinish } = setup(
        { resumeSelection: () => ({ endpoint: 'agents' }) },
        {
          reconnectToStream: jest.fn(
            () =>
              new Promise<ChatStream | null>((resolve) => {
                open = resolve;
              }),
          ),
          abort: jest.fn(async () => ({
            success: true,
            generationProtocolVersion: 2,
            aborted: 'convo-1',
            persistenceFailed: true,
          })),
        },
      );
      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 300 });
      await flush();

      const stopped = chat.stop();
      await flush();
      const [request] = transport.reconnectToStream.mock.calls[0];
      expect(request.abortSignal?.aborted).toBe(false);
      expect(onFinish).not.toHaveBeenCalled();

      open?.(null);
      await stopped;
      await resumed;
      expect(chat.status).toBe('ready');
      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(onFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          isAbort: true,
          isSettled: true,
          conversationId: 'convo-1',
          reconcileReason: 'abort_persistence_failed',
        }),
      );
    });

    it('settles a reconnect that finds nothing by the answer of a stop still in flight', async () => {
      let open: ((stream: ChatStream | null) => void) | undefined;
      let answer: ((result: ChatAbortResult) => void) | undefined;
      const { chat, onFinish } = setup(
        { resumeSelection: () => ({ endpoint: 'agents' }) },
        {
          reconnectToStream: jest.fn(
            () =>
              new Promise<ChatStream | null>((resolve) => {
                open = resolve;
              }),
          ),
          abort: jest.fn(
            () =>
              new Promise<ChatAbortResult>((resolve) => {
                answer = resolve;
              }),
          ),
        },
      );
      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 300 });
      await flush();

      const stopped = chat.stop();
      await flush();
      open?.(null);
      await flush();
      expect(onFinish).not.toHaveBeenCalled();

      answer?.({
        success: true,
        generationProtocolVersion: 2,
        aborted: 'convo-1',
        persistenceFailed: true,
      });
      await stopped;
      await resumed;
      expect(chat.status).toBe('ready');
      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(onFinish).toHaveBeenCalledWith(
        expect.objectContaining({
          isAbort: true,
          isSettled: true,
          conversationId: 'convo-1',
          reconcileReason: 'abort_persistence_failed',
        }),
      );
    });

    it('names the conversation an unframed stop of a dropped first turn settled under', async () => {
      const { chat, stream, transport, onFinish } = setup({ id: 'new' });
      transport.abort.mockResolvedValue({
        success: true,
        generationProtocolVersion: 2,
        aborted: 'convo-9',
        persistenceFailed: true,
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;

      await chat.stop();

      expect(onFinish).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isSettled: true,
          conversationId: 'convo-9',
          reconcileReason: 'abort_persistence_failed',
        }),
      );
    });

    it('stops a dropped turn it reattached to at the endpoint the turn started on', async () => {
      const reattached = createStream({ streamId: 'convo-1', generationCreatedAt: 100 });
      const { chat, stream, transport } = setup();
      transport.abort.mockImplementation(async () => {
        reattached.push(finalEvent({ terminalStatus: 'aborted' }));
        return { success: true };
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;
      transport.reconnectToStream.mockResolvedValueOnce(reattached);
      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 100 });
      await flush();

      await chat.stop();
      await resumed;

      expect(transport.abort).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'agents', streamId: 'convo-1' }),
      );
    });

    it('reports the response of a dropped turn it reattached to, not the list tail', async () => {
      const reattached = createStream({ streamId: 'convo-1', generationCreatedAt: 100 });
      const sibling: TMessage = { ...placeholder, messageId: 'sibling-1', text: 'Other branch' };
      const { chat, stream, transport, state, onFinish } = setup({
        prepareRequest: jest.fn(() => ({
          payload,
          messages: [userMessage, placeholder],
          responseMessageId: placeholder.messageId,
        })),
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;
      state.replaceMessages([...chat.messages, sibling]);
      transport.reconnectToStream.mockResolvedValueOnce(reattached);
      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 100 });
      await flush();

      reattached.push({ type: 'abort', data: {} } as ChatEvent);
      await resumed;

      expect(onFinish).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isAbort: true,
          message: expect.objectContaining({ messageId: placeholder.messageId }),
        }),
      );
    });

    it('does not report a dropped turn response for a reattachment to another generation', async () => {
      const reattached = createStream({ streamId: 'convo-1', generationCreatedAt: 200 });
      const { chat, stream, transport, state, onFinish } = setup({
        prepareRequest: jest.fn(() => ({
          payload,
          messages: [userMessage, placeholder],
          responseMessageId: placeholder.messageId,
        })),
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;
      const newer: TMessage = { ...placeholder, messageId: 'response-2', text: 'Newer' };
      state.replaceMessages([...chat.messages, newer]);
      transport.reconnectToStream.mockResolvedValueOnce(reattached);
      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 200 });
      await flush();

      reattached.push({ type: 'abort', data: {} } as ChatEvent);
      await resumed;

      expect(onFinish).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isAbort: true,
          message: expect.objectContaining({ messageId: 'response-2' }),
        }),
      );
    });

    it('reports the response of a replacement that ended before any frame named it as unknown', async () => {
      const replacing = () => {
        const stream = createStream({ streamId: 'stream-2', generationCreatedAt: 200 });
        const harness = setup(
          {
            prepareRequest: jest.fn(() => ({
              payload,
              messages: [userMessage, placeholder],
              responseMessageId: placeholder.messageId,
            })),
          },
          {
            sendMessages: jest.fn(async () => ({
              status: 'replaced' as const,
              generationProtocolVersion: 2,
              conversationId: 'convo-1',
              streamId: 'stream-2',
              generationCreatedAt: 200,
            })),
            reconnectToStream: jest.fn(async () => stream),
          },
        );
        return { ...harness, stream };
      };

      const early = replacing();
      const sent = early.chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      early.stream.push({ type: 'abort', data: {} } as ChatEvent);
      await sent;
      expect(early.onFinish).toHaveBeenLastCalledWith(
        expect.objectContaining({ isAbort: true, isResponseUnknown: true, message: undefined }),
      );

      const named = replacing();
      const replacement: TMessage = { ...placeholder, messageId: 'response-2' };
      const sentNamed = named.chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      named.state.replaceMessages([...named.chat.messages, replacement]);
      named.stream.push({
        type: 'sync',
        data: { conversationId: 'convo-1', responseMessage: replacement },
      } as ChatEvent);
      named.stream.push({ type: 'abort', data: {} } as ChatEvent);
      await sentNamed;
      expect(named.onFinish).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isResponseUnknown: false,
          message: expect.objectContaining({ messageId: 'response-2' }),
        }),
      );
    });

    it('reports the response unknown when a reattachment without a timestamp finds another generation', async () => {
      const reattached = createStream({ streamId: 'convo-1', generationCreatedAt: 200 });
      const { chat, stream, transport, onFinish } = setup({
        prepareRequest: jest.fn(() => ({
          payload,
          messages: [userMessage, placeholder],
          responseMessageId: placeholder.messageId,
        })),
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;
      transport.reconnectToStream.mockResolvedValueOnce(reattached);
      const resumed = chat.resumeStream({ streamId: 'convo-1' });
      await flush();

      reattached.push({ type: 'abort', data: {} } as ChatEvent);
      await resumed;

      expect(onFinish).toHaveBeenLastCalledWith(
        expect.objectContaining({ isAbort: true, isResponseUnknown: true, message: undefined }),
      );
    });

    it('ends the pause of a generation whose stream failed', async () => {
      const failing: ChatStream = {
        streamId: 'convo-1',
        close: () => undefined,
        async *[Symbol.asyncIterator]() {
          yield { type: 'pending_action', data: pausedAction } as ChatEvent;
          throw new Error('Malformed frame');
        },
      };
      const { chat, transport } = setup();
      transport.sendMessages.mockResolvedValueOnce({ status: 'stream', stream: failing });

      await chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });

      expect(chat.status).toBe('error');
      expect(chat.pendingAction).toBeUndefined();
      transport.sendMessages.mockResolvedValueOnce({
        status: 'settled',
        conversationId: 'convo-1',
      });
      await expect(
        chat.sendMessage({ parts: [{ type: 'text', text: 'Again' }] }),
      ).resolves.toBeUndefined();
    });

    it('reports a continuation that ended while an earlier reconnect was still opening', async () => {
      let open: ((stream: ChatStream | null) => void) | undefined;
      const { chat, onFinish } = setup(
        {},
        {
          reconnectToStream: jest.fn(
            () =>
              new Promise<ChatStream | null>((resolve) => {
                open = resolve;
              }),
          ),
        },
      );
      chat.restorePendingAction({ ...pausedAction, streamId: 'convo-1' }, 500);
      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 500 });
      await flush();

      await chat.addToolOutput({ toolCallId: 'ask-5', output: 'Blue' });
      open?.(null);
      await resumed;

      expect(chat.status).toBe('ready');
      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isSettled: true }));
    });

    it('ignores a status read that restores a pause this chat already resumed', async () => {
      const { chat } = setup();
      const action = { ...pausedAction, streamId: 'convo-1' };
      chat.restorePendingAction(action, 500);
      await chat.addToolOutput({ toolCallId: 'ask-5', output: 'Blue' });
      await flush();

      chat.restorePendingAction(action, 500);

      expect(chat.pendingAction).toBeUndefined();
    });

    it('lets a completion callback start a turn once a stopped pause ended', async () => {
      const next: Promise<void>[] = [];
      const { chat, transport } = setup({
        resumeSelection: () => ({ endpoint: 'agents' }),
        onFinish: () => {
          if (next.length > 0) {
            return;
          }
          transport.sendMessages.mockResolvedValueOnce({
            status: 'settled',
            conversationId: 'convo-1',
          });
          next.push(chat.sendMessage({ parts: [{ type: 'text', text: 'Next' }] }));
        },
      });
      transport.reconnectToStream.mockImplementation(
        (request) =>
          new Promise((_resolve, reject) => {
            request.abortSignal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      chat.restorePendingAction({ ...pausedAction, streamId: 'convo-1' }, 500);
      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 500 });
      await flush();

      await chat.stop();
      await resumed;

      expect(next).toHaveLength(1);
      await expect(next[0]).resolves.toBeUndefined();
      expect(chat.pendingAction).toBeUndefined();
    });

    it('reports nothing for a stop answered after the chat was disposed', async () => {
      for (const restore of [false, true]) {
        let answer: ((result: ChatAbortResult) => void) | undefined;
        const { chat, stream, transport, onFinish } = setup(
          { resumeSelection: () => ({ endpoint: 'agents' }) },
          {
            abort: jest.fn(
              () =>
                new Promise((resolve) => {
                  answer = resolve;
                }),
            ),
          },
        );
        if (restore) {
          chat.restorePendingAction({ ...pausedAction, streamId: 'convo-1' }, 500);
        } else {
          const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
          await flush();
          stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
          await sent;
        }
        const finishes = onFinish.mock.calls.length;

        const stopped = chat.stop();
        await flush();
        chat.dispose();
        answer?.({ success: true, persistenceFailed: true });
        await stopped;

        expect(transport.abort).toHaveBeenCalledTimes(1);
        expect(onFinish).toHaveBeenCalledTimes(finishes);
      }
    });

    it('sends the request options of a turn to the generation that replaced it', async () => {
      const stream = createStream();
      const { chat, transport } = setup(
        {},
        {
          sendMessages: jest.fn(async () => ({
            status: 'replaced' as const,
            generationProtocolVersion: 2,
            conversationId: 'convo-1',
            streamId: 'stream-2',
            generationCreatedAt: 200,
          })),
          reconnectToStream: jest.fn(async () => stream),
        },
      );
      const options = { headers: { 'x-tenant': 'acme' }, body: { spec: 'a' } };
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] }, options);
      await flush();
      stream.push(finalEvent());
      await sent;

      expect(transport.reconnectToStream).toHaveBeenCalledWith(
        expect.objectContaining({ ...options, chatId: 'convo-1', streamId: 'stream-2' }),
      );
    });

    it('reattaches an answered first-turn pause under the conversation the server assigned', async () => {
      const { chat, transport, onFinish } = setup(
        { id: 'new' },
        {
          resume: jest.fn(async () => ({
            streamId: 'convo-9',
            conversationId: 'convo-9',
            status: 'resuming' as const,
          })),
        },
      );

      chat.restorePendingAction(pausedAction, 500);
      await chat.addToolOutput({ toolCallId: 'ask-5', output: 'Blue' });
      await flush();

      expect(transport.reconnectToStream).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: 'convo-9', streamId: 'convo-9' }),
      );
      expect(onFinish).toHaveBeenCalledWith(
        expect.objectContaining({ isSettled: true, conversationId: 'convo-9' }),
      );
    });

    it('keeps the assigned conversation of a continuation that dropped before its sync frame', async () => {
      const continuation = createStream({ streamId: 'convo-9', generationCreatedAt: 500 });
      const { chat, transport, onFinish } = setup(
        { id: 'new', resumeSelection: () => ({ endpoint: 'agents' }) },
        {
          resume: jest.fn(async () => ({
            streamId: 'convo-9',
            conversationId: 'convo-9',
            status: 'resuming' as const,
          })),
          reconnectToStream: jest.fn(async () => continuation),
        },
      );
      chat.restorePendingAction(pausedAction, 500);
      await chat.addToolOutput({ toolCallId: 'ask-5', output: 'Blue' });
      await flush();
      continuation.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await flush();
      expect(onFinish).toHaveBeenLastCalledWith(expect.objectContaining({ isDisconnect: true }));
      transport.reconnectToStream.mockResolvedValueOnce(null);

      await chat.resumeStream();

      expect(transport.reconnectToStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ chatId: 'convo-9' }),
      );
      expect(onFinish).toHaveBeenLastCalledWith(
        expect.objectContaining({ isSettled: true, conversationId: 'convo-9' }),
      );
    });

    it('ends a reattachment of the same generation by a detached stop answered after it', async () => {
      const { chat, stream, transport, onFinish } = setup({
        resumeSelection: () => ({ endpoint: 'agents' }),
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push({ type: 'pending_action', data: pausedAction });
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;
      expect(chat.pendingAction?.actionId).toBe('action-5');

      let answer: (result: ChatAbortResult) => void = () => undefined;
      transport.abort.mockImplementationOnce(
        () =>
          new Promise<ChatAbortResult>((resolve) => {
            answer = resolve;
          }),
      );
      const stopped = chat.stop();
      await flush();
      const reattached = createStream({ streamId: 'convo-1', generationCreatedAt: 100 });
      transport.reconnectToStream.mockResolvedValueOnce(reattached);
      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 100 });
      await flush();
      expect(chat.connection).toBe('live');

      answer({ success: true });
      await flush();
      reattached.close();
      await resumed;

      await expect(stopped).resolves.toEqual({ status: 'stopped' });
      expect(transport.abort).toHaveBeenCalledTimes(1);
      expect(chat.status).toBe('ready');
      expect(chat.pendingAction).toBeUndefined();
      expect(onFinish).toHaveBeenLastCalledWith(
        expect.objectContaining({ isAbort: true, isDisconnect: false }),
      );
    });

    it('ends a reattachment of a restored pause by the stop answered after it', async () => {
      const { chat, transport, onFinish } = setup({
        resumeSelection: () => ({ endpoint: 'agents' }),
      });
      chat.restorePendingAction(pausedAction, 500);
      let answer: (result: ChatAbortResult) => void = () => undefined;
      transport.abort.mockImplementationOnce(
        () =>
          new Promise<ChatAbortResult>((resolve) => {
            answer = resolve;
          }),
      );
      const stopped = chat.stop();
      await flush();
      const reattached = createStream({ streamId: 'convo-1', generationCreatedAt: 500 });
      transport.reconnectToStream.mockResolvedValueOnce(reattached);
      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 500 });
      await flush();
      expect(chat.connection).toBe('live');

      answer({ success: true });
      await flush();
      reattached.close();
      await resumed;

      await expect(stopped).resolves.toEqual({ status: 'stopped' });
      expect(transport.abort).toHaveBeenCalledTimes(1);
      expect(chat.status).toBe('ready');
      expect(chat.pendingAction).toBeUndefined();
      expect(onFinish).toHaveBeenLastCalledWith(
        expect.objectContaining({ isAbort: true, isDisconnect: false }),
      );
    });

    it('does not end another generation a restored pause reattachment found by its stop', async () => {
      const { chat, transport, onFinish } = setup({
        resumeSelection: () => ({ endpoint: 'agents' }),
      });
      chat.restorePendingAction(pausedAction, 500);
      let answer: (result: ChatAbortResult) => void = () => undefined;
      transport.abort.mockImplementationOnce(
        () =>
          new Promise<ChatAbortResult>((resolve) => {
            answer = resolve;
          }),
      );
      const stopped = chat.stop();
      await flush();
      const newer = createStream({ streamId: 'convo-1', generationCreatedAt: 700 });
      transport.reconnectToStream.mockResolvedValueOnce(newer);
      const resumed = chat.resumeStream({ streamId: 'convo-1' });
      await flush();

      answer({ success: true });
      await stopped;
      newer.close();
      await resumed;

      expect(onFinish).toHaveBeenLastCalledWith(expect.objectContaining({ isDisconnect: true }));
    });

    it('addresses a stop made as a newer reattachment clears a restored pause to that one', async () => {
      const { chat, transport } = setup({
        resumeSelection: () => ({ endpoint: 'agents' }),
      });
      transport.reconnectToStream.mockImplementationOnce(() => new Promise(() => undefined));
      chat.restorePendingAction(pausedAction, 100);
      const stops: Promise<unknown>[] = [];
      chat.subscribe(() => {
        if (!chat.pendingAction && stops.length === 0) {
          stops.push(chat.stop().catch(() => undefined));
        }
      });

      void chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 200 });
      await Promise.all(stops);

      expect(transport.abort).toHaveBeenCalledWith(
        expect.objectContaining({ generationCreatedAt: 200 }),
      );
    });

    it.each([
      ['its preparation fails', 'prepare'],
      ['the server refuses its start', 'start'],
    ])('still stops a dropped generation after a retry where %s', async (_label, failure) => {
      const prepareRequest = jest.fn(() => ({ payload, messages: [userMessage, placeholder] }));
      const { chat, stream, transport } = setup({
        prepareRequest,
        resumeSelection: () => ({ endpoint: 'agents' }),
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;

      if (failure === 'prepare') {
        prepareRequest.mockImplementationOnce(() => {
          throw new Error('Preparation failed');
        });
      } else {
        transport.sendMessages.mockRejectedValueOnce(new Error('A run is already in progress'));
      }
      await chat.sendMessage({ parts: [{ type: 'text', text: 'Again' }] });
      expect(chat.status).toBe('error');

      await expect(chat.stop()).resolves.toEqual({ status: 'stopped' });
      expect(transport.abort).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'agents',
          streamId: 'convo-1',
          generationCreatedAt: 100,
        }),
      );
    });

    it('ignores a late status read restoring a pause whose generation was stopped', async () => {
      const { chat, stream } = setup({ resumeSelection: () => ({ endpoint: 'agents' }) });
      chat.restorePendingAction(pausedAction, 500);
      await expect(chat.stop()).resolves.toEqual({ status: 'stopped' });

      chat.restorePendingAction(pausedAction, 500);

      expect(chat.pendingAction).toBeUndefined();
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Next' }] });
      await flush();
      stream.push(finalEvent());
      await expect(sent).resolves.toBeUndefined();
    });

    it('sends one stop for a generation stopped again once a reattachment took it over', async () => {
      const { chat, stream, transport } = setup({
        resumeSelection: () => ({ endpoint: 'agents' }),
      });
      const sent = chat.sendMessage({ parts: [{ type: 'text', text: 'Hi' }] });
      await flush();
      stream.push({ type: 'error', status: 0, data: 'offline' } as ChatEvent);
      await sent;

      let answer: (result: ChatAbortResult) => void = () => undefined;
      transport.abort.mockImplementationOnce(
        () =>
          new Promise<ChatAbortResult>((resolve) => {
            answer = resolve;
          }),
      );
      const first = chat.stop();
      await flush();
      const reattached = createStream({ streamId: 'convo-1', generationCreatedAt: 100 });
      transport.reconnectToStream.mockResolvedValueOnce(reattached);
      const resumed = chat.resumeStream({ streamId: 'convo-1', generationCreatedAt: 100 });
      await flush();
      const second = chat.stop();
      await flush();

      answer({ success: true });
      await flush();
      reattached.push({ type: 'abort', data: {} } as ChatEvent);
      await resumed;

      await expect(Promise.all([first, second])).resolves.toEqual([
        { status: 'stopped' },
        { status: 'stopped' },
      ]);
      expect(transport.abort).toHaveBeenCalledTimes(1);
      expect(chat.status).toBe('ready');
    });
  });
});
