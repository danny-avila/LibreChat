import { ContentTypes, StepEvents } from 'librechat-data-provider';
import type { Agents, TMessage, TPayload, ChatEvent } from 'librechat-data-provider';
import type { ChatStream, ChatStatus, ChatTransport, ChatConnection } from '../types';
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
      const { chat, stream, state, onError } = setup(
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
      const { chat, onFinish } = setup({}, { [opener]: pending });

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
      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ isAbort: true }));
    },
  );

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

      chat.restorePendingAction(askAction, 400);
      await chat.addToolOutput({ toolCallId: 'ask-1', output: { q1: 'Blue' } });
      expect(transport.resume).toHaveBeenLastCalledWith(
        expect.objectContaining({ generationCreatedAt: 400, answers: { q1: 'Blue' } }),
      );

      stream.push(finalEvent());
      await sent;
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
});
