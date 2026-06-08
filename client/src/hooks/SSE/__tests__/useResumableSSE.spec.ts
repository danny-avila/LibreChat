import { renderHook, act } from '@testing-library/react';
import { Constants, LocalStorageKeys, QueryKeys, request } from 'librechat-data-provider';
import type { TSubmission } from 'librechat-data-provider';

type SSEEventListener = (e: Partial<MessageEvent> & { responseCode?: number }) => void;

interface MockSSEInstance {
  addEventListener: jest.Mock;
  stream: jest.Mock;
  close: jest.Mock;
  headers: Record<string, string>;
  _listeners: Record<string, SSEEventListener>;
  _emit: (event: string, data?: Partial<MessageEvent> & { responseCode?: number }) => void;
}

const mockSSEInstances: MockSSEInstance[] = [];

jest.mock('sse.js', () => ({
  SSE: jest.fn().mockImplementation(() => {
    const listeners: Record<string, SSEEventListener> = {};
    const instance: MockSSEInstance = {
      addEventListener: jest.fn((event: string, cb: SSEEventListener) => {
        listeners[event] = cb;
      }),
      stream: jest.fn(),
      close: jest.fn(),
      headers: {},
      _listeners: listeners,
      _emit: (event, data = {}) => listeners[event]?.(data as MessageEvent),
    };
    mockSSEInstances.push(instance);
    return instance;
  }),
}));

const mockSetQueryData = jest.fn();
const mockGetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRemoveQueries = jest.fn();
const mockFindAll = jest.fn((): Array<{ queryKey: unknown[] }> => []);
const mockQueryClient = {
  setQueryData: mockSetQueryData,
  getQueryData: mockGetQueryData,
  invalidateQueries: mockInvalidateQueries,
  removeQueries: mockRemoveQueries,
  getQueryCache: () => ({
    findAll: mockFindAll,
  }),
};

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => mockQueryClient,
}));

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useSetRecoilState: () => jest.fn(),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    activeRunFamily: jest.fn(),
    abortScrollFamily: jest.fn(),
    showStopButtonByIndex: jest.fn(),
  },
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ token: 'test-token', isAuthenticated: true }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { balance: { enabled: false } } }),
  useGetUserBalance: () => ({ refetch: jest.fn() }),
  queueTitleGeneration: jest.fn(),
  streamStatusQueryKey: (conversationId: string) => ['streamStatus', conversationId],
}));

const mockErrorHandler = jest.fn();
const mockCreatedHandler = jest.fn();
const mockStepHandler = jest.fn();
const mockTitleHandler = jest.fn();
const mockSetIsSubmitting = jest.fn();
const mockClearStepMaps = jest.fn();

jest.mock('~/hooks/SSE/useEventHandlers', () =>
  jest.fn(() => ({
    errorHandler: mockErrorHandler,
    finalHandler: jest.fn(),
    createdHandler: mockCreatedHandler,
    attachmentHandler: jest.fn(),
    stepHandler: mockStepHandler,
    titleHandler: mockTitleHandler,
    contentHandler: jest.fn(),
    resetContentHandler: jest.fn(),
    syncStepMessage: jest.fn(),
    clearStepMaps: mockClearStepMaps,
    messageHandler: jest.fn(),
    setIsSubmitting: mockSetIsSubmitting,
    setShowStopButton: jest.fn(),
  })),
);

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    createPayload: jest.fn(() => ({
      payload: { model: 'gpt-4o' },
      server: '/api/agents/chat',
    })),
    removeNullishValues: jest.fn((v: unknown) => v),
    apiBaseUrl: jest.fn(() => ''),
    request: {
      post: jest.fn().mockResolvedValue({ streamId: 'stream-123' }),
      refreshToken: jest.fn(),
      dispatchTokenUpdatedEvent: jest.fn(),
    },
  };
});

import useResumableSSE from '~/hooks/SSE/useResumableSSE';

const CONV_ID = 'conv-abc-123';

type PartialSubmission = {
  conversation: { conversationId?: string };
  userMessage: Record<string, unknown>;
  messages: never[];
  isTemporary: boolean;
  initialResponse: Record<string, unknown>;
  endpointOption: { endpoint: string };
};

const buildSubmission = (overrides: Partial<PartialSubmission> = {}): TSubmission => {
  const conversationId = overrides.conversation?.conversationId ?? CONV_ID;
  return {
    conversation: { conversationId },
    userMessage: {
      messageId: 'msg-1',
      conversationId,
      text: 'Hello',
      isCreatedByUser: true,
      sender: 'User',
      parentMessageId: '00000000-0000-0000-0000-000000000000',
    },
    messages: [],
    isTemporary: false,
    initialResponse: {
      messageId: 'resp-1',
      conversationId,
      text: '',
      isCreatedByUser: false,
      sender: 'Assistant',
    },
    endpointOption: { endpoint: 'agents' },
    ...overrides,
  } as unknown as TSubmission;
};

const buildChatHelpers = () => ({
  setMessages: jest.fn(),
  getMessages: jest.fn(() => []),
  setConversation: jest.fn(),
  setIsSubmitting: mockSetIsSubmitting,
  newConversation: jest.fn(),
});

const getLastSSE = (): MockSSEInstance => {
  const sse = mockSSEInstances[mockSSEInstances.length - 1];
  expect(sse).toBeDefined();
  return sse;
};

const serverNotReadyError = (retryAfter = '0') => ({
  response: {
    status: 503,
    data: { code: 'SERVER_NOT_READY' },
    headers: { 'retry-after': retryAfter },
  },
});

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const advanceRetryTimer = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
  await flushMicrotasks();
};

describe('useResumableSSE - 404 error path', () => {
  beforeEach(() => {
    mockSSEInstances.length = 0;
    localStorage.clear();
    mockErrorHandler.mockClear();
    mockCreatedHandler.mockClear();
    mockStepHandler.mockClear();
    mockTitleHandler.mockClear();
    mockClearStepMaps.mockClear();
    mockSetIsSubmitting.mockClear();
    mockSetQueryData.mockClear();
    mockGetQueryData.mockClear();
    mockInvalidateQueries.mockClear();
    mockRemoveQueries.mockClear();
    mockFindAll.mockClear();
    (request.post as jest.Mock).mockReset();
    (request.post as jest.Mock).mockResolvedValue({ streamId: 'stream-123' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const seedDraft = (conversationId: string) => {
    localStorage.setItem(`${LocalStorageKeys.TEXT_DRAFT}${conversationId}`, 'draft text');
    localStorage.setItem(`${LocalStorageKeys.FILES_DRAFT}${conversationId}`, '[]');
  };

  const render404Scenario = async (conversationId = CONV_ID) => {
    const submission = buildSubmission({ conversation: { conversationId } });
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const sse = getLastSSE();

    await act(async () => {
      sse._emit('error', { responseCode: 404 });
    });

    return { sse, unmount, chatHelpers };
  };

  it('clears the text and files draft from localStorage on 404', async () => {
    seedDraft(CONV_ID);
    expect(localStorage.getItem(`${LocalStorageKeys.TEXT_DRAFT}${CONV_ID}`)).not.toBeNull();
    expect(localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}${CONV_ID}`)).not.toBeNull();

    const { unmount } = await render404Scenario(CONV_ID);

    expect(localStorage.getItem(`${LocalStorageKeys.TEXT_DRAFT}${CONV_ID}`)).toBeNull();
    expect(localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}${CONV_ID}`)).toBeNull();
    unmount();
  });

  it('invalidates message cache and clears stream status on 404 instead of showing error', async () => {
    const { unmount } = await render404Scenario(CONV_ID);

    expect(mockErrorHandler).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['messages', CONV_ID],
    });
    expect(mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ['streamStatus', CONV_ID],
    });
    expect(mockClearStepMaps).toHaveBeenCalled();
    expect(mockSetIsSubmitting).toHaveBeenCalledWith(false);
    unmount();
  });

  it('clears both TEXT and FILES drafts for new-convo when conversationId is absent', async () => {
    localStorage.setItem(`${LocalStorageKeys.TEXT_DRAFT}${Constants.NEW_CONVO}`, 'unsent message');
    localStorage.setItem(`${LocalStorageKeys.FILES_DRAFT}${Constants.NEW_CONVO}`, '[]');

    const submission = buildSubmission({ conversation: {} });
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const sse = getLastSSE();
    await act(async () => {
      sse._emit('error', { responseCode: 404 });
    });

    expect(localStorage.getItem(`${LocalStorageKeys.TEXT_DRAFT}${Constants.NEW_CONVO}`)).toBeNull();
    expect(
      localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}${Constants.NEW_CONVO}`),
    ).toBeNull();
    unmount();
  });

  it('invalidates the stream conversation id on 404 for a new conversation', async () => {
    mockFindAll.mockReturnValue([{ queryKey: [QueryKeys.allConversations] }]);
    const submission = buildSubmission({
      conversation: {},
      userMessage: {
        messageId: 'msg-1',
        conversationId: null,
        text: 'Hello',
        isCreatedByUser: true,
        sender: 'User',
        parentMessageId: Constants.NO_PARENT,
      },
      initialResponse: {
        messageId: 'msg-1_',
        conversationId: null,
        text: '',
        isCreatedByUser: false,
        sender: 'Assistant',
      },
    });
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const sse = getLastSSE();
    await act(async () => {
      sse._emit('error', { responseCode: 404 });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: [QueryKeys.messages, 'stream-123'],
    });
    expect(mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ['streamStatus', 'stream-123'],
    });

    const allConversationWrites = mockSetQueryData.mock.calls.filter(
      ([queryKey]) => Array.isArray(queryKey) && queryKey[0] === QueryKeys.allConversations,
    );
    expect(allConversationWrites).toHaveLength(2);

    const removeUpdater = allConversationWrites[1][1] as (data: {
      pages: { conversations: { conversationId: string }[]; nextCursor: null }[];
      pageParams: never[];
    }) => { pages: { conversations: { conversationId: string }[] }[] };
    const result = removeUpdater({
      pages: [
        {
          conversations: [{ conversationId: 'stream-123' }, { conversationId: 'other' }],
          nextCursor: null,
        },
      ],
      pageParams: [],
    });
    expect(result.pages[0].conversations).toEqual([{ conversationId: 'other' }]);
    unmount();
  });

  it('closes the SSE connection on 404', async () => {
    const { sse, unmount } = await render404Scenario();

    expect(sse.close).toHaveBeenCalled();
    unmount();
  });

  it('seeds sidebar and message caches for a new conversation once the stream id is known', async () => {
    const submission = buildSubmission({
      conversation: {},
      userMessage: {
        messageId: 'msg-1',
        conversationId: null,
        text: 'Hello',
        isCreatedByUser: true,
        sender: 'User',
        parentMessageId: Constants.NO_PARENT,
      },
      initialResponse: {
        messageId: 'msg-1_',
        conversationId: null,
        text: '',
        isCreatedByUser: false,
        sender: 'Assistant',
      },
    });
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSetQueryData).toHaveBeenCalledWith(
      [QueryKeys.conversation, 'stream-123'],
      expect.any(Function),
    );
    expect(mockSetQueryData).toHaveBeenCalledWith(
      [QueryKeys.messages, 'stream-123'],
      expect.arrayContaining([
        expect.objectContaining({ messageId: 'msg-1', conversationId: 'stream-123' }),
        expect.objectContaining({ messageId: 'msg-1_', conversationId: 'stream-123' }),
      ]),
    );
    expect(mockSetQueryData).toHaveBeenCalledWith(
      [QueryKeys.messages, Constants.NEW_CONVO],
      expect.arrayContaining([
        expect.objectContaining({ messageId: 'msg-1', conversationId: 'stream-123' }),
      ]),
    );
    expect(mockFindAll).toHaveBeenCalledWith([QueryKeys.allConversations], { exact: false });

    unmount();
  });

  it('hydrates the submission conversation id before created handlers run', async () => {
    const submission = buildSubmission({
      conversation: {},
      userMessage: {
        messageId: 'msg-1',
        conversationId: null,
        text: 'Hello',
        isCreatedByUser: true,
        sender: 'User',
        parentMessageId: Constants.NO_PARENT,
      },
      initialResponse: {
        messageId: 'msg-1_',
        conversationId: null,
        text: '',
        isCreatedByUser: false,
        sender: 'Assistant',
      },
    });
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const sse = getLastSSE();
    await act(async () => {
      sse._emit('message', {
        data: JSON.stringify({
          created: true,
          message: {
            messageId: 'msg-1',
            conversationId: 'stream-123',
          },
        }),
      });
    });

    expect(mockCreatedHandler).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        conversation: expect.objectContaining({ conversationId: 'stream-123' }),
        userMessage: expect.objectContaining({ conversationId: 'stream-123' }),
      }),
    );
    unmount();
  });

  it('routes title stream events to the title handler', async () => {
    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const titleEvent = {
      event: 'title',
      data: {
        conversationId: CONV_ID,
        title: 'Streamed Title',
      },
    };
    const sse = getLastSSE();
    await act(async () => {
      sse._emit('message', { data: JSON.stringify(titleEvent) });
    });

    expect(mockTitleHandler).toHaveBeenCalledWith(titleEvent);
    expect(mockStepHandler).not.toHaveBeenCalled();
    unmount();
  });

  it('continues retrying chat start while the server reports startup readiness pending', async () => {
    jest.useFakeTimers();
    for (let i = 0; i < 9; i++) {
      (request.post as jest.Mock).mockRejectedValueOnce(serverNotReadyError('1'));
    }
    (request.post as jest.Mock).mockResolvedValueOnce({ streamId: 'stream-ready' });

    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await flushMicrotasks();

    for (let i = 0; i < 9; i++) {
      await advanceRetryTimer(1000);
    }

    expect(request.post).toHaveBeenCalledTimes(10);
    expect(mockSSEInstances).toHaveLength(1);
    expect(mockSSEInstances[0].stream).toHaveBeenCalledTimes(1);
    expect(mockErrorHandler).not.toHaveBeenCalled();
    unmount();
    jest.useRealTimers();
  });

  it('cancels startup readiness retries on cleanup before opening a stream', async () => {
    jest.useFakeTimers();
    (request.post as jest.Mock)
      .mockRejectedValueOnce(serverNotReadyError('1'))
      .mockResolvedValueOnce({ streamId: 'stale-stream' });

    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await flushMicrotasks();
    unmount();
    await advanceRetryTimer(1000);

    expect(request.post).toHaveBeenCalledTimes(1);
    expect(mockSSEInstances).toHaveLength(0);
    expect(mockErrorHandler).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('replays title events from resume state sync', async () => {
    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const titleEvent = {
      event: 'title',
      data: {
        conversationId: CONV_ID,
        title: 'Resumed Title',
      },
    };
    const sse = getLastSSE();
    await act(async () => {
      sse._emit('message', {
        data: JSON.stringify({
          sync: true,
          resumeState: {
            runSteps: [],
            titleEvent,
          },
        }),
      });
    });

    expect(mockTitleHandler).toHaveBeenCalledWith(titleEvent);
    unmount();
  });

  it.each([undefined, 500, 503])(
    'does not call errorHandler for responseCode %s (reconnect path)',
    async (responseCode) => {
      const submission = buildSubmission();
      const chatHelpers = buildChatHelpers();

      const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

      await act(async () => {
        await Promise.resolve();
      });

      const sse = getLastSSE();

      await act(async () => {
        sse._emit('error', { responseCode });
      });

      expect(mockErrorHandler).not.toHaveBeenCalled();
      unmount();
    },
  );

  it('treats responseCode === 0 with raw SSE buffer data as transport failure (reconnect path)', async () => {
    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const sse = getLastSSE();

    await act(async () => {
      sse._emit('error', {
        responseCode: 0,
        data: 'event: message\ndata: {"created":true,"message":{}}\n\n',
      });
    });

    expect(mockErrorHandler).not.toHaveBeenCalled();
    unmount();
  });

  it('parses and surfaces server-sent error events (no responseCode, JSON data)', async () => {
    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const sse = getLastSSE();

    const errorPayload = JSON.stringify({
      error: JSON.stringify({ type: 'token_limit' }),
    });

    await act(async () => {
      sse._emit('error', { data: errorPayload });
    });

    expect(mockErrorHandler).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('removes the optimistic sidebar row when a new conversation errors before created', async () => {
    mockFindAll.mockReturnValue([{ queryKey: [QueryKeys.allConversations] }]);
    const submission = buildSubmission({
      conversation: {},
      userMessage: {
        messageId: 'msg-1',
        conversationId: null,
        text: 'Hello',
        isCreatedByUser: true,
        sender: 'User',
        parentMessageId: Constants.NO_PARENT,
      },
      initialResponse: {
        messageId: 'msg-1_',
        conversationId: null,
        text: '',
        isCreatedByUser: false,
        sender: 'Assistant',
      },
    });
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const sse = getLastSSE();
    await act(async () => {
      sse._emit('error', { data: JSON.stringify({ error: 'failed before created' }) });
    });

    const allConversationWrites = mockSetQueryData.mock.calls.filter(
      ([queryKey]) => Array.isArray(queryKey) && queryKey[0] === QueryKeys.allConversations,
    );
    expect(allConversationWrites).toHaveLength(2);

    const removeUpdater = allConversationWrites[1][1] as (data: {
      pages: { conversations: { conversationId: string }[]; nextCursor: null }[];
      pageParams: never[];
    }) => { pages: { conversations: { conversationId: string }[] }[] };
    const result = removeUpdater({
      pages: [
        {
          conversations: [{ conversationId: 'stream-123' }, { conversationId: 'other' }],
          nextCursor: null,
        },
      ],
      pageParams: [],
    });
    expect(result.pages[0].conversations).toEqual([{ conversationId: 'other' }]);
    expect(mockErrorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        submission: expect.objectContaining({
          conversation: expect.objectContaining({ conversationId: 'stream-123' }),
        }),
      }),
    );
    unmount();
  });
});
