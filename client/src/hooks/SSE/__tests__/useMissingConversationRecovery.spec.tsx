import { createElement } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import useMissingConversationRecovery from '../useMissingConversationRecovery';

const mockUseStreamStatus = jest.fn();
const mockFetchStreamStatus = jest.fn();
const mockConvertSteersToQueued = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getMessagesByConvoId: jest.fn(),
    },
  };
});

jest.mock('~/data-provider', () => ({
  fetchStreamStatus: (...args: unknown[]) => mockFetchStreamStatus(...args),
  getGenerationProtocolVersion: (value: { generationProtocolVersion?: number }) =>
    value.generationProtocolVersion === 2 ? 2 : 1,
  streamStatusQueryKey: (conversationId: string) => ['streamStatus', conversationId],
  useStreamStatus: (...args: unknown[]) => mockUseStreamStatus(...args),
}));

jest.mock('~/hooks/Chat/useSteerConvert', () => ({
  __esModule: true,
  default: () => mockConvertSteersToQueued,
}));

const CONVERSATION_ID = 'missing-conversation';
const mockGetMessages = dataService.getMessagesByConvoId as jest.MockedFunction<
  typeof dataService.getMessagesByConvoId
>;

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

async function advanceRecoveryDelay() {
  await act(async () => {
    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useMissingConversationRecovery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    mockUseStreamStatus.mockReturnValue({
      data: { active: false },
      isFetching: false,
      isSuccess: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    {
      missingKind: 'a repeated 404',
      arrangeMessages: () => mockGetMessages.mockRejectedValue({ status: 404 }),
    },
    {
      missingKind: 'an empty message list',
      arrangeMessages: () => mockGetMessages.mockResolvedValue([]),
    },
  ])('removes a conversation after $missingKind and inactive status', async (scenario) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    scenario.arrangeMessages();
    mockFetchStreamStatus.mockResolvedValue({ active: false });
    queryClient.setQueryData([QueryKeys.allConversations], {
      pages: [
        {
          conversations: [
            { conversationId: CONVERSATION_ID },
            { conversationId: 'other-conversation' },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [undefined],
    });
    queryClient.setQueryData([QueryKeys.messages, CONVERSATION_ID], []);

    renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );
    await advanceRecoveryDelay();

    expect(mockGetMessages).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(mockFetchStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(onConfirmedMissing).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData([QueryKeys.messages, CONVERSATION_ID])).toBeUndefined();
    expect(queryClient.getQueryData([QueryKeys.messages, Constants.NEW_CONVO])).toEqual([]);
    expect(queryClient.getQueryData([QueryKeys.allConversations])).toEqual({
      pages: [
        {
          conversations: [{ conversationId: 'other-conversation' }],
          nextCursor: null,
        },
      ],
      pageParams: [undefined],
    });
  });

  it('restores the route and rechecks status when messages become visible', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    const messages = [{ messageId: 'persisted-message' }] as TMessage[];
    mockGetMessages.mockResolvedValue(messages);
    mockFetchStreamStatus.mockResolvedValue({ active: false });

    renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );
    await advanceRecoveryDelay();

    expect(queryClient.getQueryData([QueryKeys.messages, CONVERSATION_ID])).toEqual(messages);
    expect(mockFetchStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(onConfirmedMissing).not.toHaveBeenCalled();
  });

  it('hands off a generation that starts while messages become visible', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    const messages = [{ messageId: 'persisted-message' }] as TMessage[];
    mockGetMessages.mockResolvedValue(messages);
    mockFetchStreamStatus.mockResolvedValue({
      active: true,
      generationProtocolVersion: 1,
      streamId: CONVERSATION_ID,
    });

    renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );
    await advanceRecoveryDelay();

    expect(queryClient.getQueryData([QueryKeys.messages, CONVERSATION_ID])).toEqual(messages);
    expect(queryClient.getQueryData(['streamStatus', CONVERSATION_ID])).toEqual({
      active: true,
      generationHandoff: true,
      generationProtocolVersion: 1,
      streamId: CONVERSATION_ID,
    });
    expect(onConfirmedMissing).not.toHaveBeenCalled();
  });

  it('restores visible messages when the status recheck fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    const messages = [{ messageId: 'persisted-message' }] as TMessage[];
    mockGetMessages.mockResolvedValue(messages);
    mockFetchStreamStatus.mockRejectedValue(new Error('status unavailable'));

    renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );
    await advanceRecoveryDelay();

    expect(queryClient.getQueryData([QueryKeys.messages, CONVERSATION_ID])).toEqual(messages);
    expect(onConfirmedMissing).not.toHaveBeenCalled();
  });

  it('retries a transient message recheck once before confirming the route is missing', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    mockGetMessages
      .mockRejectedValueOnce(new Error('messages unavailable'))
      .mockRejectedValue({ status: 404 });
    mockFetchStreamStatus.mockResolvedValue({ active: false });

    renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await advanceRecoveryDelay();
    expect(mockGetMessages).toHaveBeenCalledTimes(1);

    await advanceRecoveryDelay();
    expect(mockGetMessages).toHaveBeenCalledTimes(2);
    expect(mockFetchStreamStatus).toHaveBeenCalledTimes(1);
    expect(onConfirmedMissing).toHaveBeenCalledTimes(1);

    await advanceRecoveryDelay();
    expect(mockGetMessages).toHaveBeenCalledTimes(2);
  });

  it('does not recheck or remove a conversation with an active generation', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    mockUseStreamStatus.mockReturnValue({
      data: { active: true },
      isFetching: false,
      isSuccess: true,
    });

    renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );
    await advanceRecoveryDelay();

    expect(mockGetMessages).not.toHaveBeenCalled();
    expect(mockFetchStreamStatus).not.toHaveBeenCalled();
    expect(onConfirmedMissing).not.toHaveBeenCalled();
  });

  it('retries a transient status-readiness failure', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    const refetch = jest.fn();
    mockUseStreamStatus.mockReturnValue({
      data: undefined,
      error: {
        response: {
          status: 503,
          data: { code: 'SERVER_NOT_READY' },
        },
      },
      isFetching: false,
      isSuccess: false,
      refetch,
    });

    renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await advanceRecoveryDelay();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(mockGetMessages).not.toHaveBeenCalled();
    expect(mockFetchStreamStatus).not.toHaveBeenCalled();
    expect(onConfirmedMissing).not.toHaveBeenCalled();
  });

  it('retries a readiness failure from delayed verification', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    const refetch = jest.fn();
    mockUseStreamStatus.mockReturnValue({
      data: { active: false },
      isFetching: false,
      isSuccess: true,
      refetch,
    });
    mockGetMessages.mockRejectedValue({ status: 404 });
    mockFetchStreamStatus.mockRejectedValue({
      response: {
        status: 503,
        data: { code: 'SERVER_NOT_READY' },
      },
    });

    renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await advanceRecoveryDelay();
    expect(refetch).not.toHaveBeenCalled();
    await advanceRecoveryDelay();

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(onConfirmedMissing).not.toHaveBeenCalled();
  });

  it('hands off an active shared-status update that cancels delayed recovery', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    const { rerender } = renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    mockUseStreamStatus.mockReturnValue({
      data: {
        active: true,
        generationProtocolVersion: 1,
        streamId: CONVERSATION_ID,
      },
      isFetching: false,
      isSuccess: true,
    });
    rerender();

    expect(queryClient.getQueryData(['streamStatus', CONVERSATION_ID])).toEqual({
      active: true,
      generationHandoff: true,
      generationProtocolVersion: 1,
      streamId: CONVERSATION_ID,
    });
    await advanceRecoveryDelay();
    expect(mockGetMessages).not.toHaveBeenCalled();
    expect(mockFetchStreamStatus).not.toHaveBeenCalled();
    expect(onConfirmedMissing).not.toHaveBeenCalled();
  });

  it('preserves a conversation when a generation starts during verification', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    const claimedSteer = { steerId: 'initial-legacy-claim', text: 'retain me', createdAt: 1 };
    mockUseStreamStatus.mockReturnValue({
      data: {
        active: false,
        generationProtocolVersion: 1,
        unrecoveredSteers: [claimedSteer],
      },
      isFetching: false,
      isSuccess: true,
    });
    mockGetMessages.mockRejectedValue({ status: 404 });
    mockFetchStreamStatus.mockResolvedValue({
      active: true,
      generationProtocolVersion: 2,
      streamId: CONVERSATION_ID,
      createdAt: 2000,
    });

    renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );
    await advanceRecoveryDelay();

    expect(queryClient.getQueryData(['streamStatus', CONVERSATION_ID])).toEqual({
      active: true,
      generationHandoff: true,
      generationProtocolVersion: 2,
      streamId: CONVERSATION_ID,
      createdAt: 2000,
    });
    expect(mockConvertSteersToQueued).toHaveBeenCalledWith(CONVERSATION_ID, [claimedSteer], {
      generationProtocolVersion: 1,
    });
    expect(onConfirmedMissing).not.toHaveBeenCalled();
  });

  it('retains the route and converts parked steers before a destructive status claim is lost', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    const unrecoveredSteer = { steerId: 'parked', text: 'recover me', createdAt: 1 };
    const pendingSteer = { steerId: 'pending', text: 'also recover me', createdAt: 2 };
    mockGetMessages.mockRejectedValue({ status: 404 });
    mockFetchStreamStatus.mockResolvedValue({
      active: false,
      generationProtocolVersion: 2,
      unrecoveredSteers: [unrecoveredSteer],
      resumeState: { pendingSteers: [unrecoveredSteer, pendingSteer] },
    });
    queryClient.setQueryData([QueryKeys.allConversations], {
      pages: [
        {
          conversations: [{ conversationId: CONVERSATION_ID }],
          nextCursor: null,
        },
      ],
      pageParams: [undefined],
    });

    renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );
    await advanceRecoveryDelay();

    expect(mockConvertSteersToQueued).toHaveBeenCalledWith(
      CONVERSATION_ID,
      [unrecoveredSteer, pendingSteer],
      { generationProtocolVersion: 2 },
    );
    expect(onConfirmedMissing).not.toHaveBeenCalled();
    expect(queryClient.getQueryData([QueryKeys.allConversations])).toEqual({
      pages: [
        {
          conversations: [{ conversationId: CONVERSATION_ID }],
          nextCursor: null,
        },
      ],
      pageParams: [undefined],
    });
  });

  it('retains steers claimed by the initial legacy status read', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    const claimedSteer = { steerId: 'initial-claim', text: 'retain me', createdAt: 1 };
    mockUseStreamStatus.mockReturnValue({
      data: {
        active: false,
        generationProtocolVersion: 1,
        unrecoveredSteers: [claimedSteer],
      },
      isFetching: false,
      isSuccess: true,
    });
    mockGetMessages.mockRejectedValue({ status: 404 });
    mockFetchStreamStatus.mockResolvedValue({ active: false, generationProtocolVersion: 1 });
    queryClient.setQueryData([QueryKeys.allConversations], {
      pages: [
        {
          conversations: [{ conversationId: CONVERSATION_ID }],
          nextCursor: null,
        },
      ],
      pageParams: [undefined],
    });

    renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );
    expect(mockConvertSteersToQueued).toHaveBeenCalledWith(CONVERSATION_ID, [claimedSteer], {
      generationProtocolVersion: 1,
    });
    await advanceRecoveryDelay();

    expect(mockConvertSteersToQueued).toHaveBeenCalledTimes(1);
    expect(onConfirmedMissing).not.toHaveBeenCalled();
    expect(queryClient.getQueryData([QueryKeys.allConversations])).toEqual({
      pages: [
        {
          conversations: [{ conversationId: CONVERSATION_ID }],
          nextCursor: null,
        },
      ],
      pageParams: [undefined],
    });
  });

  it('retains steers claimed by a status response after recovery is cancelled', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onConfirmedMissing = jest.fn();
    const claimedSteer = { steerId: 'cancelled-claim', text: 'retain me', createdAt: 1 };
    let resolveStatus!: (status: {
      active: boolean;
      generationProtocolVersion: number;
      unrecoveredSteers: (typeof claimedSteer)[];
    }) => void;
    mockGetMessages.mockRejectedValue({ status: 404 });
    mockFetchStreamStatus.mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );

    const { unmount } = renderHook(
      () =>
        useMissingConversationRecovery({
          conversationId: CONVERSATION_ID,
          enabled: true,
          onConfirmedMissing,
        }),
      { wrapper: createWrapper(queryClient) },
    );
    await advanceRecoveryDelay();
    expect(mockFetchStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID);

    unmount();
    await act(async () => {
      resolveStatus({
        active: false,
        generationProtocolVersion: 1,
        unrecoveredSteers: [claimedSteer],
      });
      await Promise.resolve();
    });

    expect(mockConvertSteersToQueued).toHaveBeenCalledWith(CONVERSATION_ID, [claimedSteer], {
      generationProtocolVersion: 1,
    });
    expect(queryClient.getQueryData(['streamStatus', CONVERSATION_ID])).toBeUndefined();
    expect(onConfirmedMissing).not.toHaveBeenCalled();
  });
});
