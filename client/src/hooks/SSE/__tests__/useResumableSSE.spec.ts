import { renderHook, act } from '@testing-library/react';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import type { TMessage, TSubmission } from 'librechat-data-provider';
import { logger } from '~/utils';

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
const mockInvalidateQueries = jest.fn();
const mockRemoveQueries = jest.fn();
const mockQueryClient = {
  setQueryData: mockSetQueryData,
  invalidateQueries: mockInvalidateQueries,
  removeQueries: mockRemoveQueries,
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
const mockSetIsSubmitting = jest.fn();
const mockClearStepMaps = jest.fn();

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  logger: {
    log: jest.fn(),
  },
}));

const mockLoggerLog = logger.log as jest.Mock;

jest.mock('~/hooks/SSE/useEventHandlers', () =>
  jest.fn(() => ({
    errorHandler: mockErrorHandler,
    finalHandler: jest.fn(),
    createdHandler: jest.fn(),
    attachmentHandler: jest.fn(),
    stepHandler: jest.fn(),
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
  getMessages: jest.fn((): TMessage[] => []),
  setConversation: jest.fn(),
  setIsSubmitting: mockSetIsSubmitting,
  newConversation: jest.fn(),
  setLatestMessage: jest.fn(),
});

const getLastSSE = (): MockSSEInstance => {
  const sse = mockSSEInstances[mockSSEInstances.length - 1];
  expect(sse).toBeDefined();
  return sse;
};

describe('useResumableSSE - resume sync latest message alignment', () => {
  beforeEach(() => {
    mockSSEInstances.length = 0;
    jest.clearAllMocks();
  });

  const renderResumeScenario = async (chatHelpers: ReturnType<typeof buildChatHelpers>) => {
    const submission = {
      ...buildSubmission(),
      resumeStreamId: 'stream-resume-123',
    } as TSubmission & { resumeStreamId: string };

    const { unmount } = renderHook(() => useResumableSSE(submission, chatHelpers));

    await act(async () => {
      await Promise.resolve();
    });

    return { sse: getLastSSE(), submission, unmount };
  };

  const emitResumeSync = async (
    sse: MockSSEInstance,
    resumeState: {
      aggregatedContent: Array<{ type: string; text: string }>;
      responseMessageId?: string;
    },
  ) => {
    await act(async () => {
      sse._emit('message', {
        data: JSON.stringify({
          sync: true,
          resumeState,
          pendingEvents: [],
        }),
      });
    });
  };

  it('sets latestMessage before replacing an existing resumed response', async () => {
    const userMessage = {
      messageId: 'msg-1',
      conversationId: CONV_ID,
      text: 'Hello',
      isCreatedByUser: true,
    } as TMessage;
    const responseMessage = {
      messageId: 'resp-server',
      parentMessageId: 'msg-1',
      conversationId: CONV_ID,
      text: '',
      content: [{ type: 'text', text: 'old content' }],
      isCreatedByUser: false,
    } as TMessage;
    const chatHelpers = buildChatHelpers();
    chatHelpers.getMessages.mockReturnValue([userMessage, responseMessage]);

    const { sse, unmount } = await renderResumeScenario(chatHelpers);
    chatHelpers.setLatestMessage.mockClear();
    mockLoggerLog.mockClear();

    await emitResumeSync(sse, {
      responseMessageId: 'resp-server',
      aggregatedContent: [{ type: 'text', text: 'resumed content' }],
    });

    const updatedMessages = chatHelpers.setMessages.mock.calls[0][0] as TMessage[];
    const updatedResponse = updatedMessages[1];

    expect(updatedResponse).toEqual({
      ...responseMessage,
      content: [{ type: 'text', text: 'resumed content' }],
    });
    expect(chatHelpers.setLatestMessage).toHaveBeenCalledWith(updatedResponse);
    expect(chatHelpers.setLatestMessage.mock.invocationCallOrder[0]).toBeLessThan(
      chatHelpers.setMessages.mock.invocationCallOrder[0],
    );
    expect(mockLoggerLog).toHaveBeenCalledWith(
      'latest_message',
      'useResumableSSE.sync: setting latest message',
    );
    unmount();
  });

  it('sets latestMessage before appending a missing resumed response', async () => {
    const userMessage = {
      messageId: 'msg-1',
      conversationId: CONV_ID,
      text: 'Hello',
      isCreatedByUser: true,
    } as TMessage;
    const chatHelpers = buildChatHelpers();
    chatHelpers.getMessages.mockReturnValue([userMessage]);

    const { sse, unmount } = await renderResumeScenario(chatHelpers);
    chatHelpers.setLatestMessage.mockClear();
    mockLoggerLog.mockClear();

    await emitResumeSync(sse, {
      responseMessageId: 'resp-server',
      aggregatedContent: [{ type: 'text', text: 'resumed content' }],
    });

    const updatedMessages = chatHelpers.setMessages.mock.calls[0][0] as TMessage[];
    const newResponse = updatedMessages[1];

    expect(updatedMessages).toEqual([userMessage, newResponse]);
    expect(newResponse).toEqual({
      messageId: 'resp-server',
      parentMessageId: 'msg-1',
      conversationId: CONV_ID,
      text: '',
      content: [{ type: 'text', text: 'resumed content' }],
      isCreatedByUser: false,
    });
    expect(chatHelpers.setLatestMessage).toHaveBeenCalledWith(newResponse);
    expect(chatHelpers.setLatestMessage.mock.invocationCallOrder[0]).toBeLessThan(
      chatHelpers.setMessages.mock.invocationCallOrder[0],
    );
    expect(mockLoggerLog).toHaveBeenCalledWith(
      'latest_message',
      'useResumableSSE.sync: setting latest message',
    );
    unmount();
  });

  it('seeds latestMessage from the resume submission after marking the stream submitting', async () => {
    const chatHelpers = buildChatHelpers();

    const { submission, unmount } = await renderResumeScenario(chatHelpers);

    expect(mockSetIsSubmitting).toHaveBeenCalledWith(true);
    expect(chatHelpers.setLatestMessage).toHaveBeenCalledWith(submission.initialResponse);
    expect(mockSetIsSubmitting.mock.invocationCallOrder[0]).toBeLessThan(
      chatHelpers.setLatestMessage.mock.invocationCallOrder[0],
    );
    expect(mockLoggerLog).toHaveBeenCalledWith(
      'latest_message',
      'useResumableSSE.resume: seeding latest message',
    );
    unmount();
  });
});

describe('useResumableSSE - 404 error path', () => {
  beforeEach(() => {
    mockSSEInstances.length = 0;
    localStorage.clear();
    mockErrorHandler.mockClear();
    mockClearStepMaps.mockClear();
    mockSetIsSubmitting.mockClear();
    mockInvalidateQueries.mockClear();
    mockRemoveQueries.mockClear();
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

  it('closes the SSE connection on 404', async () => {
    const { sse, unmount } = await render404Scenario();

    expect(sse.close).toHaveBeenCalled();
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
});
