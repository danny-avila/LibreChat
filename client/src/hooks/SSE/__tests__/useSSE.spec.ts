import { request } from 'librechat-data-provider';
import { renderHook, act } from '@testing-library/react';
import type { TMessage, TSubmission } from 'librechat-data-provider';

type SSEEventListener = (e: Partial<MessageEvent> & { responseCode?: number }) => void;

interface MockSSEInstance {
  _url: string;
  addEventListener: jest.Mock;
  dispatchEvent: jest.Mock;
  stream: jest.Mock;
  close: jest.Mock;
  readyState: number;
  headers: Record<string, string>;
  _emit: (event: string, data?: Partial<MessageEvent> & { responseCode?: number }) => void;
}

const mockSSEInstances: MockSSEInstance[] = [];

jest.mock('sse.js', () => ({
  SSE: jest
    .fn()
    .mockImplementation((url: string, options?: { headers?: Record<string, string> }) => {
      const listeners: Record<string, SSEEventListener> = {};
      const instance: MockSSEInstance = {
        _url: url,
        addEventListener: jest.fn((event: string, cb: SSEEventListener) => {
          listeners[event] = cb;
        }),
        dispatchEvent: jest.fn(),
        stream: jest.fn(),
        close: jest.fn(),
        /** Past OPEN, so unmount closes without dispatching the cancel event. */
        readyState: 2,
        headers: { ...options?.headers },
        _emit: (event, data = {}) => listeners[event]?.(data as MessageEvent),
      };
      mockSSEInstances.push(instance);
      return instance;
    }),
}));

const mockRedirectIfTwoFactorSetupPayload = jest.fn((_payload: unknown) => false);

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    createPayload: jest.fn(() => ({
      payload: { model: 'gpt-4o' },
      server: '/api/agents/chat',
    })),
    removeNullishValues: jest.fn((value: unknown) => value),
    request: {
      refreshToken: jest.fn(),
      dispatchTokenUpdatedEvent: jest.fn(),
      redirectIfTwoFactorSetupPayload: (payload: unknown) =>
        mockRedirectIfTwoFactorSetupPayload(payload),
    },
  };
});

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useSetRecoilState: () => jest.fn(),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    activeRunFamily: jest.fn(() => 'activeRun'),
    abortScrollFamily: jest.fn(() => 'abortScroll'),
    showStopButtonByIndex: jest.fn(() => 'showStopButton'),
  },
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ token: 'test-token', isAuthenticated: true }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { balance: { enabled: false } } }),
  useGetUserBalance: () => ({ refetch: jest.fn() }),
}));

const mockErrorHandler = jest.fn();

jest.mock('~/hooks/SSE/useEventHandlers', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    clearStepMaps: jest.fn(),
    stepHandler: jest.fn(),
    syncHandler: jest.fn(),
    finalHandler: jest.fn(),
    errorHandler: mockErrorHandler,
    messageHandler: jest.fn(),
    contentHandler: jest.fn(),
    createdHandler: jest.fn(),
    titleHandler: jest.fn(),
    attachmentHandler: jest.fn(),
    abortConversation: jest.fn(),
    cancelPendingDeltaFlush: jest.fn(),
    flushPendingDeltas: jest.fn(),
  })),
}));

jest.mock('~/hooks/SSE/useUsageHandler', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    contextHandler: jest.fn(),
    usageHandler: jest.fn(),
    tapStream: jest.fn(),
    tapContent: jest.fn(),
    finalizeUsage: jest.fn(),
    resetLive: jest.fn(),
    attributePending: jest.fn(),
  })),
}));

import useSSE from '~/hooks/SSE/useSSE';

const buildSubmission = (): TSubmission =>
  ({
    conversation: { conversationId: 'conv-abc-123' },
    userMessage: {
      messageId: 'msg-1',
      conversationId: 'conv-abc-123',
      text: 'Hello',
      isCreatedByUser: true,
      sender: 'User',
      parentMessageId: '00000000-0000-0000-0000-000000000000',
    },
    messages: [],
    isTemporary: false,
    initialResponse: {
      messageId: 'resp-1',
      conversationId: 'conv-abc-123',
      text: '',
      isCreatedByUser: false,
      sender: 'Assistant',
    },
    endpointOption: { endpoint: 'agents' },
  }) as unknown as TSubmission;

const buildChatHelpers = () => ({
  setMessages: jest.fn(),
  getMessages: jest.fn<TMessage[], []>(() => []),
  setConversation: jest.fn(),
  setIsSubmitting: jest.fn(),
  newConversation: jest.fn(),
});

const getLastSSE = (): MockSSEInstance => {
  const sse = mockSSEInstances[mockSSEInstances.length - 1];
  expect(sse).toBeDefined();
  return sse;
};

const enrollmentPayload = {
  code: 'two_factor_enrollment_required',
  twoFASetupRequired: true,
  tempToken: 'setup-token',
};

describe('useSSE', () => {
  beforeEach(() => {
    mockSSEInstances.length = 0;
    mockErrorHandler.mockReset();
    mockRedirectIfTwoFactorSetupPayload.mockReset();
    mockRedirectIfTwoFactorSetupPayload.mockReturnValue(false);
    (request.refreshToken as jest.Mock).mockReset();
    (request.dispatchTokenUpdatedEvent as jest.Mock).mockReset();
  });

  it('retries the stream with a refreshed token on a 401', async () => {
    (request.refreshToken as jest.Mock).mockResolvedValueOnce({ token: 'refreshed-token' });

    const { unmount } = renderHook(() => useSSE(buildSubmission(), buildChatHelpers()));
    const sse = getLastSSE();

    await act(async () => {
      sse._emit('error', { responseCode: 401 });
      await Promise.resolve();
    });

    expect(sse.headers.Authorization).toBe('Bearer refreshed-token');
    expect(request.dispatchTokenUpdatedEvent).toHaveBeenCalledWith('refreshed-token');
    expect(sse.stream).toHaveBeenCalledTimes(2);
    expect(mockErrorHandler).not.toHaveBeenCalled();
    unmount();
  });

  /**
   * An access token that expired first turns enforcement into a 401, so the refresh is where the
   * setup credential arrives. It answers successfully and without a token, which reads as a failed
   * refresh unless the payload is inspected.
   */
  it('leaves for setup when the 401 refresh answers with enrollment', async () => {
    (request.refreshToken as jest.Mock).mockResolvedValueOnce(enrollmentPayload);
    mockRedirectIfTwoFactorSetupPayload.mockReturnValue(true);

    const { unmount } = renderHook(() => useSSE(buildSubmission(), buildChatHelpers()));
    const sse = getLastSSE();

    await act(async () => {
      sse._emit('error', { responseCode: 401 });
      await Promise.resolve();
    });

    expect(mockRedirectIfTwoFactorSetupPayload).toHaveBeenCalledWith(enrollmentPayload);
    expect(sse.stream).toHaveBeenCalledTimes(1);
    expect(mockErrorHandler).not.toHaveBeenCalled();
    unmount();
  });

  /**
   * The stream runs on a raw XHR, so the interceptor that turns an enrollment 403 into the setup
   * redirect never sees it.
   */
  it('leaves for setup on an enrollment 403 instead of reporting a stream error', async () => {
    const enrollmentBody = JSON.stringify(enrollmentPayload);
    mockRedirectIfTwoFactorSetupPayload.mockReturnValue(true);

    const { unmount } = renderHook(() => useSSE(buildSubmission(), buildChatHelpers()));
    const sse = getLastSSE();

    await act(async () => {
      sse._emit('error', { responseCode: 403, data: enrollmentBody });
      await Promise.resolve();
    });

    expect(mockRedirectIfTwoFactorSetupPayload).toHaveBeenCalledWith(enrollmentBody);
    expect(mockErrorHandler).not.toHaveBeenCalled();
    unmount();
  });

  it('reports a 403 that is not an enrollment response through the error handler', async () => {
    const { unmount } = renderHook(() => useSSE(buildSubmission(), buildChatHelpers()));
    const sse = getLastSSE();

    await act(async () => {
      sse._emit('error', { responseCode: 403, data: JSON.stringify({ message: 'Forbidden' }) });
      await Promise.resolve();
    });

    /** Only enrollment may short-circuit; every other 403 keeps the existing reporting. */
    expect(mockErrorHandler).toHaveBeenCalledTimes(1);
    unmount();
  });
});
