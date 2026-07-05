import { renderHook, act, waitFor } from '@testing-library/react';
import {
  Constants,
  LocalStorageKeys,
  QueryKeys,
  StepEvents,
  request,
} from 'librechat-data-provider';
import type { TMessage, TSubmission } from 'librechat-data-provider';

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

const mockActiveRunAtom = { key: 'activeRun' };
const mockAbortScrollAtom = { key: 'abortScroll' };
const mockSubmissionAtom = { key: 'submission' };
const mockShowStopButtonAtom = { key: 'showStopButton' };
const mockSetActiveRun = jest.fn();
const mockSetAbortScroll = jest.fn();
const mockSetSubmission = jest.fn();
const mockSetShowStopButton = jest.fn();
const mockUseSetRecoilStateMock = jest.fn((atom: unknown) => {
  if (atom === mockActiveRunAtom) {
    return mockSetActiveRun;
  }
  if (atom === mockAbortScrollAtom) {
    return mockSetAbortScroll;
  }
  if (atom === mockSubmissionAtom) {
    return mockSetSubmission;
  }
  if (atom === mockShowStopButtonAtom) {
    return mockSetShowStopButton;
  }
  return jest.fn();
});
function mockUseSetRecoilState(atom: unknown) {
  return mockUseSetRecoilStateMock(atom);
}

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => mockQueryClient,
}));

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useSetRecoilState: mockUseSetRecoilState,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    activeRunFamily: jest.fn(() => mockActiveRunAtom),
    abortScrollFamily: jest.fn(() => mockAbortScrollAtom),
    submissionByIndex: jest.fn(() => mockSubmissionAtom),
    showStopButtonByIndex: jest.fn(() => mockShowStopButtonAtom),
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
const mockFinalHandler = jest.fn();
const mockCreatedHandler = jest.fn();
const mockStepHandler = jest.fn();
const mockTitleHandler = jest.fn();
const mockSetIsSubmitting = jest.fn();
const mockClearStepMaps = jest.fn();

jest.mock('~/hooks/SSE/useEventHandlers', () => {
  const actual = jest.requireActual('~/hooks/SSE/useEventHandlers');
  return {
    __esModule: true,
    ...actual,
    default: jest.fn(() => ({
      errorHandler: mockErrorHandler,
      finalHandler: mockFinalHandler,
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
  };
});

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
  messages: TMessage[];
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
  getMessages: jest.fn<TMessage[], []>(() => []),
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

describe('useResumableSSE', () => {
  beforeEach(() => {
    mockSSEInstances.length = 0;
    localStorage.clear();
    mockErrorHandler.mockClear();
    mockFinalHandler.mockClear();
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
    mockUseSetRecoilStateMock.mockClear();
    mockSetActiveRun.mockClear();
    mockSetAbortScroll.mockClear();
    mockSetSubmission.mockClear();
    mockSetShowStopButton.mockClear();
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

  it('replaces the new-chat URL when the stream id is known despite a stale parent id', async () => {
    window.history.pushState({}, '', '/c/new');
    const submission = buildSubmission({
      conversation: {},
      userMessage: {
        messageId: 'msg-1',
        conversationId: null,
        text: 'Hello',
        isCreatedByUser: true,
        sender: 'User',
        parentMessageId: 'stale-parent-message',
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

    expect(window.location.pathname).toBe('/c/stream-123');
    expect(mockSetQueryData).toHaveBeenCalledWith(
      [QueryKeys.messages, 'stream-123'],
      expect.arrayContaining([
        expect.objectContaining({ messageId: 'msg-1', conversationId: 'stream-123' }),
      ]),
    );

    unmount();
    window.history.pushState({}, '', '/');
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

  it('queues run step events until created hydrates the submission', async () => {
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

    const runStepEvent = {
      event: StepEvents.ON_RUN_STEP,
      data: {
        id: 'step-oauth',
        runId: 'msg-1_',
        index: 0,
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-oauth', name: 'Google-Workspace', args: '' }],
        },
      },
    };

    const sse = getLastSSE();
    await act(async () => {
      sse._emit('message', { data: JSON.stringify(runStepEvent) });
    });

    expect(mockStepHandler).not.toHaveBeenCalled();

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

    expect(mockStepHandler).toHaveBeenCalledWith(
      runStepEvent,
      expect.objectContaining({
        userMessage: expect.objectContaining({
          messageId: 'msg-1',
          conversationId: 'stream-123',
        }),
      }),
    );
    unmount();
  });

  it('renders OAuth run step events before created while retaining replay after hydration', async () => {
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

    const runStepEvent = {
      event: StepEvents.ON_RUN_STEP,
      data: {
        id: 'step-oauth',
        runId: Constants.USE_PRELIM_RESPONSE_MESSAGE_ID,
        index: 0,
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-oauth', name: 'oauth_mcp_Google-Workspace', args: '' }],
        },
      },
    };
    const runStepDeltaEvent = {
      event: StepEvents.ON_RUN_STEP_DELTA,
      data: {
        id: 'step-oauth',
        delta: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-oauth', name: 'oauth_mcp_Google-Workspace', args: '' }],
          auth: 'https://auth.example.com/oauth',
          expires_at: 1780791946,
        },
      },
    };

    const sse = getLastSSE();
    await act(async () => {
      sse._emit('message', { data: JSON.stringify(runStepEvent) });
      sse._emit('message', { data: JSON.stringify(runStepDeltaEvent) });
    });

    expect(mockStepHandler).toHaveBeenCalledTimes(2);
    expect(mockStepHandler).toHaveBeenNthCalledWith(
      1,
      runStepEvent,
      expect.objectContaining({
        userMessage: expect.objectContaining({
          messageId: 'msg-1',
          conversationId: 'stream-123',
        }),
      }),
    );
    expect(mockStepHandler).toHaveBeenNthCalledWith(
      2,
      runStepDeltaEvent,
      expect.objectContaining({
        userMessage: expect.objectContaining({
          messageId: 'msg-1',
          conversationId: 'stream-123',
        }),
      }),
    );

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

    expect(mockStepHandler).toHaveBeenCalledTimes(4);
    expect(mockStepHandler).toHaveBeenNthCalledWith(
      3,
      runStepEvent,
      expect.objectContaining({
        userMessage: expect.objectContaining({
          messageId: 'msg-1',
          conversationId: 'stream-123',
        }),
      }),
    );
    expect(mockStepHandler).toHaveBeenNthCalledWith(
      4,
      runStepDeltaEvent,
      expect.objectContaining({
        userMessage: expect.objectContaining({
          messageId: 'msg-1',
          conversationId: 'stream-123',
        }),
      }),
    );
    unmount();
  });

  it('replays pre-created OAuth completion against the hydrated response id', async () => {
    const previousUser = {
      messageId: 'previous-user',
      conversationId: CONV_ID,
      text: 'hi',
      isCreatedByUser: true,
      sender: 'User',
      parentMessageId: Constants.NO_PARENT,
    } as TMessage;
    const previousResponse = {
      messageId: 'previous-response',
      conversationId: CONV_ID,
      text: 'hello',
      isCreatedByUser: false,
      sender: 'Assistant',
      parentMessageId: previousUser.messageId,
    } as TMessage;
    const submission = buildSubmission({
      conversation: { conversationId: CONV_ID },
      userMessage: {
        messageId: 'optimistic-user',
        conversationId: CONV_ID,
        text: 'thanks!',
        isCreatedByUser: true,
        sender: 'User',
        parentMessageId: previousResponse.messageId,
      },
      messages: [previousUser, previousResponse],
      initialResponse: {
        messageId: 'optimistic-user_',
        conversationId: CONV_ID,
        text: '',
        isCreatedByUser: false,
        sender: 'Assistant',
        parentMessageId: 'optimistic-user',
      },
    });
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const runStepEvent = {
      event: StepEvents.ON_RUN_STEP,
      data: {
        id: 'step-oauth',
        runId: Constants.USE_PRELIM_RESPONSE_MESSAGE_ID,
        index: 0,
        type: 'tool_calls',
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-oauth', name: 'oauth_mcp_Google-Workspace', args: '' }],
        },
      },
    };
    const runStepDeltaEvent = {
      event: StepEvents.ON_RUN_STEP_DELTA,
      data: {
        id: 'step-oauth',
        delta: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-oauth', name: 'oauth_mcp_Google-Workspace', args: '' }],
          auth: 'https://auth.example.com/oauth',
          expires_at: 1780791946,
        },
      },
    };
    const completedEvent = {
      event: StepEvents.ON_RUN_STEP_COMPLETED,
      data: {
        result: {
          id: 'step-oauth',
          index: 0,
          tool_call: {
            id: 'call-oauth',
            name: 'oauth_mcp_Google-Workspace',
            args: '',
            output: 'OAuth authentication completed',
            type: 'tool_call',
          },
        },
      },
    };
    const createdEvent = {
      created: true,
      message: {
        messageId: 'server-user',
        parentMessageId: previousResponse.messageId,
        conversationId: CONV_ID,
        sender: 'User',
        text: 'thanks!',
        isCreatedByUser: true,
      },
      streamId: CONV_ID,
    };

    const sse = getLastSSE();
    await act(async () => {
      sse._emit('message', { data: JSON.stringify(runStepEvent) });
      sse._emit('message', { data: JSON.stringify(runStepDeltaEvent) });
      sse._emit('message', { data: JSON.stringify(completedEvent) });
    });

    expect(mockStepHandler).toHaveBeenCalledTimes(3);
    expect(mockStepHandler).toHaveBeenNthCalledWith(
      3,
      completedEvent,
      expect.objectContaining({
        initialResponse: expect.objectContaining({
          messageId: 'optimistic-user_',
          parentMessageId: 'optimistic-user',
        }),
      }),
    );

    await act(async () => {
      sse._emit('message', { data: JSON.stringify(createdEvent) });
    });

    expect(mockCreatedHandler).toHaveBeenCalledWith(
      createdEvent,
      expect.objectContaining({
        userMessage: expect.objectContaining({
          messageId: 'server-user',
          parentMessageId: previousResponse.messageId,
        }),
        initialResponse: expect.objectContaining({
          messageId: 'server-user_',
          parentMessageId: 'server-user',
        }),
      }),
    );
    expect(mockStepHandler).toHaveBeenCalledTimes(6);
    for (let callIndex = 4; callIndex <= 6; callIndex++) {
      expect(mockStepHandler).toHaveBeenNthCalledWith(
        callIndex,
        expect.any(Object),
        expect.objectContaining({
          userMessage: expect.objectContaining({
            messageId: 'server-user',
            parentMessageId: previousResponse.messageId,
          }),
          initialResponse: expect.objectContaining({
            messageId: 'server-user_',
            parentMessageId: 'server-user',
          }),
        }),
      );
    }

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

  it('clears submission and stop state when starting generation fails', async () => {
    (request.post as jest.Mock).mockRejectedValueOnce({
      response: {
        status: 500,
        data: { message: 'failed to start' },
      },
    });
    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await waitFor(() => {
      expect(mockSetSubmission).toHaveBeenCalledWith(null);
    });

    expect(mockSSEInstances).toHaveLength(0);
    expect(mockErrorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          text: JSON.stringify({ message: 'failed to start' }),
          metadata: { streamStartFailed: true },
        },
        submission,
      }),
    );
    expect(mockSetIsSubmitting).toHaveBeenCalledWith(true);
    expect(mockSetIsSubmitting).toHaveBeenCalledWith(false);
    expect(mockSetShowStopButton).toHaveBeenCalledWith(true);
    expect(mockSetShowStopButton).toHaveBeenCalledWith(false);
    unmount();
  });

  it('surfaces SSE error bodies returned while starting generation', async () => {
    (request.post as jest.Mock).mockResolvedValueOnce(
      'event: error\ndata: {"text":"No model spec selected"}\n\n',
    );
    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await waitFor(() => {
      expect(mockSetSubmission).toHaveBeenCalledWith(null);
    });

    expect(mockSSEInstances).toHaveLength(0);
    expect(mockErrorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          text: 'No model spec selected',
          metadata: { streamStartFailed: true },
        },
        submission,
      }),
    );
    expect(mockSetIsSubmitting).toHaveBeenCalledWith(false);
    expect(mockSetShowStopButton).toHaveBeenCalledWith(false);
    unmount();
  });

  it('surfaces CRLF SSE error bodies returned while starting generation', async () => {
    (request.post as jest.Mock).mockResolvedValueOnce(
      'event: error\r\ndata: {"text":"No model spec selected"}\r\n\r\n',
    );
    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await waitFor(() => {
      expect(mockSetSubmission).toHaveBeenCalledWith(null);
    });

    expect(mockErrorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          text: 'No model spec selected',
          metadata: { streamStartFailed: true },
        },
        submission,
      }),
    );
    unmount();
  });

  it('uses only the error event data from multi-event SSE start failures', async () => {
    (request.post as jest.Mock).mockResolvedValueOnce(
      [
        'event: message',
        'data: {"created":true,"message":{"messageId":"msg-1"}}',
        '',
        'event: error',
        'data: {"text":"Request was blocked"}',
        '',
        '',
      ].join('\n'),
    );
    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await waitFor(() => {
      expect(mockSetSubmission).toHaveBeenCalledWith(null);
    });

    expect(mockErrorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          text: 'Request was blocked',
          metadata: { streamStartFailed: true },
        },
        submission,
      }),
    );
    unmount();
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

  it('replays OAuth run step delta events from resume state sync', async () => {
    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const runStep = {
      id: 'step-oauth',
      runId: 'resp-1',
      index: 0,
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'call-oauth', name: 'Google-Workspace', args: '' }],
      },
    };
    const replayEvent = {
      event: StepEvents.ON_RUN_STEP_DELTA,
      data: {
        id: 'step-oauth',
        delta: {
          type: 'tool_calls',
          tool_calls: [{ name: 'Google-Workspace', args: '' }],
          auth: 'https://auth.example.com/oauth',
          expires_at: 1780791946,
        },
      },
    };

    const sse = getLastSSE();
    await act(async () => {
      sse._emit('message', {
        data: JSON.stringify({
          sync: true,
          resumeState: {
            runSteps: [runStep],
            replayEvents: [replayEvent],
          },
        }),
      });
    });

    expect(mockStepHandler).toHaveBeenNthCalledWith(
      1,
      { event: StepEvents.ON_RUN_STEP, data: runStep },
      expect.objectContaining({ userMessage: expect.objectContaining({ messageId: 'msg-1' }) }),
    );
    expect(mockStepHandler).toHaveBeenNthCalledWith(
      2,
      replayEvent,
      expect.objectContaining({ userMessage: expect.objectContaining({ messageId: 'msg-1' }) }),
    );

    unmount();
  });

  it('anchors preliminary OAuth replay events to the response message from resume state sync', async () => {
    const submission = buildSubmission({
      userMessage: {
        messageId: 'original-user',
        conversationId: CONV_ID,
        text: 'Original prompt',
        isCreatedByUser: true,
        sender: 'User',
        parentMessageId: Constants.NO_PARENT,
      },
      initialResponse: {
        messageId: 'original-response',
        conversationId: CONV_ID,
        text: 'Original response',
        isCreatedByUser: false,
        sender: 'Assistant',
        parentMessageId: 'original-user',
      },
    });
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const runStep = {
      id: 'step-oauth',
      runId: Constants.USE_PRELIM_RESPONSE_MESSAGE_ID,
      index: 0,
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'call-oauth', name: 'oauth_mcp_Google-Workspace', args: '' }],
      },
    };
    const replayEvent = {
      event: StepEvents.ON_RUN_STEP_DELTA,
      data: {
        id: 'step-oauth',
        delta: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-oauth', name: 'oauth_mcp_Google-Workspace', args: '' }],
          auth: 'https://auth.example.com/oauth',
          expires_at: 1780791946,
        },
      },
    };

    const sse = getLastSSE();
    await act(async () => {
      sse._emit('message', {
        data: JSON.stringify({
          sync: true,
          resumeState: {
            runSteps: [runStep],
            replayEvents: [replayEvent],
            responseMessageId: 'follow-up-response',
            conversationId: CONV_ID,
            iconURL: 'https://example.com/spec-icon.png',
            model: 'gpt-4.1',
            userMessage: {
              messageId: 'follow-up-user',
              parentMessageId: 'original-response',
              conversationId: CONV_ID,
              text: 'Follow-up prompt',
            },
          },
        }),
      });
    });

    expect(mockStepHandler).toHaveBeenNthCalledWith(
      1,
      { event: StepEvents.ON_RUN_STEP, data: runStep },
      expect.objectContaining({
        userMessage: expect.objectContaining({ messageId: 'follow-up-user' }),
        initialResponse: expect.objectContaining({
          messageId: 'follow-up-response',
          parentMessageId: 'follow-up-user',
        }),
      }),
    );
    expect(mockStepHandler).toHaveBeenNthCalledWith(
      2,
      replayEvent,
      expect.objectContaining({
        userMessage: expect.objectContaining({ messageId: 'follow-up-user' }),
        initialResponse: expect.objectContaining({
          messageId: 'follow-up-response',
          parentMessageId: 'follow-up-user',
        }),
      }),
    );

    unmount();
  });

  it('merges resumed user and response messages into loaded conversation history', async () => {
    const originalUser = {
      messageId: 'original-user',
      conversationId: CONV_ID,
      text: 'Original prompt',
      isCreatedByUser: true,
      sender: 'User',
      parentMessageId: '00000000-0000-0000-0000-000000000000',
    };
    const originalResponse = {
      messageId: 'original-response',
      conversationId: CONV_ID,
      text: 'Original response',
      isCreatedByUser: false,
      sender: 'Assistant',
      parentMessageId: 'original-user',
    };
    const submission = {
      ...buildSubmission({
        conversation: { conversationId: CONV_ID },
        userMessage: originalUser,
        initialResponse: originalResponse,
      }),
      resumeStreamId: CONV_ID,
    } as TSubmission & { resumeStreamId: string };
    const chatHelpers = buildChatHelpers();
    chatHelpers.getMessages.mockReturnValue([originalUser, originalResponse]);

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const sse = getLastSSE();
    await act(async () => {
      sse._emit('message', {
        data: JSON.stringify({
          sync: true,
          resumeState: {
            runSteps: [],
            replayEvents: [],
            aggregatedContent: [
              {
                type: 'tool_call',
                tool_call: {
                  id: 'call-oauth',
                  name: 'oauth_mcp_Google-Workspace',
                  args: '',
                },
              },
            ],
            responseMessageId: 'follow-up-response',
            conversationId: CONV_ID,
            iconURL: 'https://example.com/spec-icon.png',
            model: 'gpt-4.1',
            userMessage: {
              messageId: 'follow-up-user',
              parentMessageId: 'original-response',
              conversationId: CONV_ID,
              text: 'Follow-up prompt',
            },
          },
        }),
      });
    });

    const lastMessages = chatHelpers.setMessages.mock.calls.at(-1)?.[0];
    expect(lastMessages.map((message: { messageId: string }) => message.messageId)).toEqual([
      'original-user',
      'original-response',
      'follow-up-user',
      'follow-up-response',
    ]);
    expect(lastMessages[2]).toEqual(
      expect.objectContaining({
        messageId: 'follow-up-user',
        parentMessageId: 'original-response',
        text: 'Follow-up prompt',
      }),
    );
    expect(lastMessages[3]).toEqual(
      expect.objectContaining({
        messageId: 'follow-up-response',
        parentMessageId: 'follow-up-user',
        content: expect.any(Array),
        iconURL: 'https://example.com/spec-icon.png',
        model: 'gpt-4.1',
      }),
    );

    unmount();
  });

  it('uses the resumed submission for final events after sync', async () => {
    const originalUser = {
      messageId: 'original-user',
      conversationId: CONV_ID,
      text: 'Original prompt',
      isCreatedByUser: true,
      sender: 'User',
      parentMessageId: String(Constants.NO_PARENT),
    };
    const originalResponse = {
      messageId: 'original-response',
      conversationId: CONV_ID,
      text: 'Original response',
      isCreatedByUser: false,
      sender: 'Assistant',
      parentMessageId: 'original-user',
    };
    const submission = {
      ...buildSubmission({
        conversation: { conversationId: CONV_ID },
        userMessage: originalUser,
        initialResponse: originalResponse,
      }),
      resumeStreamId: CONV_ID,
    } as TSubmission & { resumeStreamId: string };
    const chatHelpers = buildChatHelpers();
    chatHelpers.getMessages.mockReturnValue([originalUser, originalResponse]);

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const sse = getLastSSE();
    await act(async () => {
      sse._emit('message', {
        data: JSON.stringify({
          sync: true,
          resumeState: {
            runSteps: [],
            replayEvents: [],
            responseMessageId: 'follow-up-response',
            conversationId: CONV_ID,
            userMessage: {
              messageId: 'follow-up-user',
              parentMessageId: 'original-response',
              conversationId: CONV_ID,
              text: 'Follow-up prompt',
            },
          },
        }),
      });
    });

    const finalPayload = {
      final: true,
      conversation: { conversationId: CONV_ID },
      requestMessage: {
        messageId: 'follow-up-user',
        parentMessageId: 'original-response',
        conversationId: CONV_ID,
        text: 'Follow-up prompt',
        isCreatedByUser: true,
      },
      responseMessage: {
        messageId: 'follow-up-response',
        parentMessageId: 'follow-up-user',
        conversationId: CONV_ID,
        text: 'Done',
        isCreatedByUser: false,
      },
    };

    await act(async () => {
      sse._emit('message', {
        data: JSON.stringify(finalPayload),
      });
    });

    expect(mockFinalHandler).toHaveBeenCalledWith(
      finalPayload,
      expect.objectContaining({
        userMessage: expect.objectContaining({ messageId: 'follow-up-user' }),
        initialResponse: expect.objectContaining({
          messageId: 'follow-up-response',
          parentMessageId: 'follow-up-user',
        }),
      }),
    );

    unmount();
  });

  it('uses the resumed submission for final events after reconnecting from sync', async () => {
    jest.useFakeTimers();
    const originalUser = {
      messageId: 'original-user',
      conversationId: CONV_ID,
      text: 'Original prompt',
      isCreatedByUser: true,
      sender: 'User',
      parentMessageId: String(Constants.NO_PARENT),
    };
    const originalResponse = {
      messageId: 'original-response',
      conversationId: CONV_ID,
      text: 'Original response',
      isCreatedByUser: false,
      sender: 'Assistant',
      parentMessageId: 'original-user',
    };
    const submission = {
      ...buildSubmission({
        conversation: { conversationId: CONV_ID },
        userMessage: originalUser,
        initialResponse: originalResponse,
      }),
      resumeStreamId: CONV_ID,
    } as TSubmission & { resumeStreamId: string };
    const chatHelpers = buildChatHelpers();
    chatHelpers.getMessages.mockReturnValue([originalUser, originalResponse]);

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const initialSSE = getLastSSE();
    await act(async () => {
      initialSSE._emit('message', {
        data: JSON.stringify({
          sync: true,
          resumeState: {
            runSteps: [],
            replayEvents: [],
            responseMessageId: 'follow-up-response',
            conversationId: CONV_ID,
            userMessage: {
              messageId: 'follow-up-user',
              parentMessageId: 'original-response',
              conversationId: CONV_ID,
              text: 'Follow-up prompt',
            },
          },
        }),
      });
    });

    await act(async () => {
      initialSSE._emit('error');
    });
    await advanceRetryTimer(1000);

    expect(mockSSEInstances).toHaveLength(2);
    const reconnectedSSE = getLastSSE();
    const finalPayload = {
      final: true,
      conversation: { conversationId: CONV_ID },
      requestMessage: {
        messageId: 'follow-up-user',
        parentMessageId: 'original-response',
        conversationId: CONV_ID,
        text: 'Follow-up prompt',
        isCreatedByUser: true,
      },
      responseMessage: {
        messageId: 'follow-up-response',
        parentMessageId: 'follow-up-user',
        conversationId: CONV_ID,
        text: 'Done',
        isCreatedByUser: false,
      },
    };

    await act(async () => {
      reconnectedSSE._emit('message', {
        data: JSON.stringify(finalPayload),
      });
    });

    expect(mockFinalHandler).toHaveBeenLastCalledWith(
      finalPayload,
      expect.objectContaining({
        userMessage: expect.objectContaining({ messageId: 'follow-up-user' }),
        initialResponse: expect.objectContaining({
          messageId: 'follow-up-response',
          parentMessageId: 'follow-up-user',
        }),
      }),
    );

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

  it('ignores responseCode === 0 after FINAL instead of reconnecting a completed stream', async () => {
    jest.useFakeTimers();
    const submission = buildSubmission();
    const chatHelpers = buildChatHelpers();

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    const sse = getLastSSE();
    const sseCount = mockSSEInstances.length;
    const finalPayload = {
      final: true,
      conversation: { conversationId: CONV_ID },
      requestMessage: {
        messageId: 'msg-1',
        conversationId: CONV_ID,
        text: 'Hello',
        isCreatedByUser: true,
      },
      responseMessage: {
        messageId: 'resp-1',
        parentMessageId: 'msg-1',
        conversationId: CONV_ID,
        text: 'Done',
        isCreatedByUser: false,
      },
    };

    await act(async () => {
      sse._emit('message', {
        data: JSON.stringify(finalPayload),
      });
    });

    expect(sse.close).toHaveBeenCalled();
    mockSetIsSubmitting.mockClear();
    mockSetShowStopButton.mockClear();

    await act(async () => {
      sse._emit('error', { responseCode: 0 });
    });
    await advanceRetryTimer(1000);

    expect(mockSSEInstances).toHaveLength(sseCount);
    expect(mockSetIsSubmitting).not.toHaveBeenCalledWith(true);
    expect(mockSetShowStopButton).not.toHaveBeenCalledWith(true);
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
