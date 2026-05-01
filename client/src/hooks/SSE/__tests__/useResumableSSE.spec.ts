import { renderHook, act, waitFor } from '@testing-library/react';
import { Constants, LocalStorageKeys, request } from 'librechat-data-provider';
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
      get: jest.fn().mockResolvedValue({ active: false }),
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
  resetLatestMessage: jest.fn(),
});

const getLastSSE = (): MockSSEInstance => {
  const sse = mockSSEInstances[mockSSEInstances.length - 1];
  expect(sse).toBeDefined();
  return sse;
};

describe('useResumableSSE - 404 error path', () => {
  beforeEach(() => {
    mockSSEInstances.length = 0;
    localStorage.clear();
    mockErrorHandler.mockClear();
    mockClearStepMaps.mockClear();
    mockSetIsSubmitting.mockClear();
    mockInvalidateQueries.mockClear();
    mockRemoveQueries.mockClear();
    (request.post as jest.Mock).mockClear();
    (request.post as jest.Mock).mockResolvedValue({ streamId: 'stream-123' });
    (request.get as jest.Mock).mockClear();
    (request.get as jest.Mock).mockResolvedValue({ active: false });
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

  it('aborts an active same-conversation job before starting a replacement generation', async () => {
    const requestPost = request.post as jest.Mock;
    const requestGet = request.get as jest.Mock;
    requestPost.mockResolvedValue({ streamId: CONV_ID });
    requestGet.mockResolvedValue({ active: true, streamId: CONV_ID });
    const chatHelpers = buildChatHelpers();
    const firstSubmission = buildSubmission({
      userMessage: { messageId: 'msg-1' },
    } as Partial<PartialSubmission>);
    const secondSubmission = buildSubmission({
      userMessage: { messageId: 'msg-2' },
    } as Partial<PartialSubmission>);

    const { rerender, unmount } = renderHook(
      ({ submission }) => useResumableSSE(submission, chatHelpers),
      { initialProps: { submission: firstSubmission } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(requestPost).toHaveBeenCalledWith('/api/agents/chat', { model: 'gpt-4o' });

    rerender({ submission: secondSubmission });

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(requestGet).toHaveBeenCalledWith(`/api/agents/chat/status/${CONV_ID}`);
      expect(requestPost).toHaveBeenNthCalledWith(2, '/api/agents/chat/abort', {
        streamId: CONV_ID,
        conversationId: CONV_ID,
      });
      expect(requestPost).toHaveBeenNthCalledWith(3, '/api/agents/chat', { model: 'gpt-4o' });
    });
    unmount();
  });

  it('uses the active stream ID to verify replacement jobs for new conversations', async () => {
    const requestPost = request.post as jest.Mock;
    const requestGet = request.get as jest.Mock;
    const generatedConversationId = 'generated-conv-123';
    requestPost
      .mockResolvedValueOnce({ streamId: generatedConversationId })
      .mockResolvedValueOnce({ streamId: 'replacement-stream' });
    requestGet.mockResolvedValue({ active: true, streamId: generatedConversationId });
    const chatHelpers = buildChatHelpers();
    const firstSubmission = buildSubmission({
      conversation: { conversationId: 'new' },
      userMessage: { messageId: 'msg-1' },
    } as Partial<PartialSubmission>);
    const secondSubmission = buildSubmission({
      conversation: { conversationId: 'new' },
      userMessage: { messageId: 'msg-2' },
    } as Partial<PartialSubmission>);

    const { rerender, unmount } = renderHook(
      ({ submission }) => useResumableSSE(submission, chatHelpers),
      { initialProps: { submission: firstSubmission } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    rerender({ submission: secondSubmission });

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(requestGet).toHaveBeenCalledWith(`/api/agents/chat/status/${generatedConversationId}`);
      expect(requestPost).toHaveBeenNthCalledWith(2, '/api/agents/chat/abort', {
        streamId: generatedConversationId,
        conversationId: 'new',
      });
      expect(requestPost).toHaveBeenNthCalledWith(3, '/api/agents/chat', { model: 'gpt-4o' });
    });
    unmount();
  });

  it('does not abort a stale same-conversation ref when stream status is no longer active', async () => {
    const requestPost = request.post as jest.Mock;
    const requestGet = request.get as jest.Mock;
    requestPost.mockResolvedValue({ streamId: CONV_ID });
    requestGet.mockResolvedValue({ active: false, streamId: CONV_ID });
    const chatHelpers = buildChatHelpers();
    const firstSubmission = buildSubmission({
      userMessage: { messageId: 'msg-1' },
    } as Partial<PartialSubmission>);
    const secondSubmission = buildSubmission({
      userMessage: { messageId: 'msg-2' },
    } as Partial<PartialSubmission>);

    const { rerender, unmount } = renderHook(
      ({ submission }) => useResumableSSE(submission, chatHelpers),
      { initialProps: { submission: firstSubmission } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    rerender({ submission: secondSubmission });

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(requestGet).toHaveBeenCalledWith(`/api/agents/chat/status/${CONV_ID}`);
      expect(requestPost).toHaveBeenCalledTimes(2);
      expect(requestPost).not.toHaveBeenCalledWith('/api/agents/chat/abort', expect.anything());
      expect(requestPost).toHaveBeenNthCalledWith(2, '/api/agents/chat', { model: 'gpt-4o' });
    });
    unmount();
  });
});
