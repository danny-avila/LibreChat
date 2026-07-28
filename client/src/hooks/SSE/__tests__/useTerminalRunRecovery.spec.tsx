import { MemoryRouter } from 'react-router-dom';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import type { TConversation, TMessage } from 'librechat-data-provider';
import type { MutableSnapshot } from 'recoil';
import type { ReactNode } from 'react';
import type { RunEnd } from '~/store/families';
import {
  getDisconnectedRunRecovery,
  getPendingRunReconciliations,
  queuePendingRunReconciliation,
  requestTerminalRunRecovery,
  setDisconnectedRunRecovery,
} from '../resumableRecovery';
import useTerminalRunRecovery from '../useTerminalRunRecovery';
import store from '~/store';

const mockUseActiveJobs = jest.fn();
const mockFetchStreamStatus = jest.fn();

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

jest.mock('~/data-provider', () => {
  const messages = jest.requireActual('~/data-provider/Messages/queries');
  return {
    fetchMessagesWithCacheProtection: messages.fetchMessagesWithCacheProtection,
    useActiveJobs: (enabled: boolean) => mockUseActiveJobs(enabled),
    fetchStreamStatus: (conversationId: string) => mockFetchStreamStatus(conversationId),
  };
});

const mockGetMessagesByConvoId = dataService.getMessagesByConvoId as jest.MockedFunction<
  typeof dataService.getMessagesByConvoId
>;

const CONVERSATION_ID = 'terminal-conversation';
const USER_MESSAGE_ID = 'terminal-user';
const RESPONSE_MESSAGE_ID = 'terminal-response_';

function buildConversation(conversationId = CONVERSATION_ID): TConversation {
  return {
    conversationId,
    endpoint: 'agents',
  } as TConversation;
}

function buildUserMessage(): TMessage {
  return {
    messageId: USER_MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    parentMessageId: Constants.NO_PARENT,
    isCreatedByUser: true,
    text: 'Run the report',
  } as TMessage;
}

function buildAssistantMessage(overrides: Partial<TMessage> = {}): TMessage {
  return {
    messageId: RESPONSE_MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    parentMessageId: USER_MESSAGE_ID,
    isCreatedByUser: false,
    text: '',
    ...overrides,
  } as TMessage;
}

function renderTerminalRecovery({
  queryClient,
  initialPath = `/c/${CONVERSATION_ID}`,
  initialConversation = buildConversation(),
  onRunEnd,
}: {
  queryClient: QueryClient;
  initialPath?: string;
  initialConversation?: TConversation;
  onRunEnd?: (runEnd: RunEnd | null) => void;
}) {
  const initializeState = (snapshot: MutableSnapshot) => {
    snapshot.set(store.conversationByIndex(0), initialConversation);
  };
  const RunEndProbe = () => {
    const runEnd = useRecoilValue(store.runEndByIndex(0));
    onRunEnd?.(runEnd);
    return null;
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter
      initialEntries={[initialPath]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <QueryClientProvider client={queryClient}>
        <RecoilRoot initializeState={initializeState}>
          <RunEndProbe />
          {children}
        </RecoilRoot>
      </QueryClientProvider>
    </MemoryRouter>
  );
  const getMessages = (conversationId?: string | null) =>
    queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]);

  return renderHook(
    () =>
      useTerminalRunRecovery({
        conversationId: CONVERSATION_ID,
        getMessages,
        restoreSteerChips: jest.fn(),
        runIndex: 0,
        enabled: true,
      }),
    { wrapper },
  );
}

describe('useTerminalRunRecovery', () => {
  let active: boolean;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    active = true;
    mockUseActiveJobs.mockReset();
    mockUseActiveJobs.mockImplementation(() => ({
      data: { activeJobIds: active ? [CONVERSATION_ID] : [] },
    }));
    mockFetchStreamStatus.mockReset();
    mockFetchStreamStatus.mockResolvedValue({ active: false });
    mockGetMessagesByConvoId.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reconciles a provisional stream 404 from the persisted completed response', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observedRunEnds: Array<RunEnd | null> = [];
    const finalMessages = [
      buildUserMessage(),
      buildAssistantMessage({
        messageId: 'terminal-response',
        text: 'Persisted before stream cleanup',
        createdAt: '2026-07-28T08:00:00.000Z',
        updatedAt: '2026-07-28T08:00:00.000Z',
        unfinished: false,
      }),
    ];
    queryClient.setQueryData(
      [QueryKeys.messages, CONVERSATION_ID],
      [buildUserMessage(), buildAssistantMessage()],
    );
    setDisconnectedRunRecovery(queryClient, CONVERSATION_ID, {
      startedAsNewConvo: false,
      created: true,
      userMessageId: USER_MESSAGE_ID,
      responseMessageId: RESPONSE_MESSAGE_ID,
    });
    mockGetMessagesByConvoId.mockResolvedValue(finalMessages);

    const { rerender } = renderTerminalRecovery({
      queryClient,
      onRunEnd: (runEnd) => observedRunEnds.push(runEnd),
    });

    active = false;
    rerender();

    await waitFor(() => {
      expect(observedRunEnds[observedRunEnds.length - 1]).toMatchObject({
        conversationId: CONVERSATION_ID,
        outcome: 'completed',
      });
    });
    expect(mockFetchStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(getDisconnectedRunRecovery(queryClient, CONVERSATION_ID)).toBeUndefined();
  });

  it('retries terminal recovery when a failed follow-up start requests it', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const finalMessages = [
      buildUserMessage(),
      buildAssistantMessage({
        messageId: 'terminal-response',
        text: 'Recovered after the follow-up failed to start',
        createdAt: '2026-07-28T08:00:00.000Z',
        updatedAt: '2026-07-28T08:00:00.000Z',
      }),
    ];
    const failedUserMessage = {
      ...buildUserMessage(),
      messageId: 'failed-start-user',
      parentMessageId: 'terminal-response',
      text: 'Follow-up that failed to start',
    };
    const failedResponse = buildAssistantMessage({
      messageId: 'failed-start-response_',
      parentMessageId: failedUserMessage.messageId,
      text: 'Failed to start generation',
      createdAt: undefined,
      updatedAt: undefined,
      error: true,
    });
    active = false;
    queryClient.setQueryData(
      [QueryKeys.messages, CONVERSATION_ID],
      [buildUserMessage(), buildAssistantMessage(), failedUserMessage, failedResponse],
    );
    setDisconnectedRunRecovery(queryClient, CONVERSATION_ID, {
      startedAsNewConvo: false,
      created: true,
      userMessageId: USER_MESSAGE_ID,
      responseMessageId: RESPONSE_MESSAGE_ID,
    });
    mockFetchStreamStatus.mockResolvedValue({ active: false, status: 'complete' });
    mockGetMessagesByConvoId.mockResolvedValue(finalMessages);

    renderTerminalRecovery({ queryClient });
    expect(mockFetchStreamStatus).not.toHaveBeenCalled();

    act(() => {
      requestTerminalRunRecovery(queryClient, CONVERSATION_ID);
    });

    await waitFor(() => {
      expect(getDisconnectedRunRecovery(queryClient, CONVERSATION_ID)).toBeUndefined();
    });
    expect(mockFetchStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(queryClient.getQueryData([QueryKeys.messages, CONVERSATION_ID])).toEqual([
      ...finalMessages,
      failedUserMessage,
      failedResponse,
    ]);
  });

  it('reconciles an older run after a newer run without emitting stale run-end state', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const observedRunEnds: Array<RunEnd | null> = [];
    const newerUserMessage = {
      ...buildUserMessage(),
      messageId: 'newer-user',
      parentMessageId: RESPONSE_MESSAGE_ID,
      text: 'A newer run',
    };
    const newerResponse = buildAssistantMessage({
      messageId: 'newer-response',
      parentMessageId: newerUserMessage.messageId,
      text: 'Newer result',
      createdAt: '2026-07-28T08:01:00.000Z',
      updatedAt: '2026-07-28T08:01:00.000Z',
    });
    const recoveredOlderResponse = buildAssistantMessage({
      messageId: 'terminal-response',
      text: 'Older result',
      createdAt: '2026-07-28T08:00:00.000Z',
      updatedAt: '2026-07-28T08:00:00.000Z',
    });
    queryClient.setQueryData(
      [QueryKeys.messages, CONVERSATION_ID],
      [buildUserMessage(), buildAssistantMessage(), newerUserMessage, newerResponse],
    );
    queuePendingRunReconciliation(
      queryClient,
      CONVERSATION_ID,
      {
        startedAsNewConvo: false,
        created: true,
        userMessageId: USER_MESSAGE_ID,
        responseMessageId: RESPONSE_MESSAGE_ID,
      },
      1,
    );
    mockGetMessagesByConvoId.mockResolvedValue([buildUserMessage(), recoveredOlderResponse]);
    active = false;

    renderTerminalRecovery({
      queryClient,
      onRunEnd: (runEnd) => observedRunEnds.push(runEnd),
    });

    await waitFor(() => {
      expect(getPendingRunReconciliations(queryClient, CONVERSATION_ID)).toEqual([]);
    });
    expect(queryClient.getQueryData([QueryKeys.messages, CONVERSATION_ID])).toEqual([
      buildUserMessage(),
      recoveredOlderResponse,
      newerUserMessage,
      newerResponse,
    ]);
    expect(mockFetchStreamStatus).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(observedRunEnds[observedRunEnds.length - 1]).toBeNull();
  });

  it('keeps the failed follow-up visible while the older response is still provisional', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const failedUserMessage = {
      ...buildUserMessage(),
      messageId: 'failed-start-user',
      parentMessageId: RESPONSE_MESSAGE_ID,
      text: 'Follow-up that failed to start',
    };
    const failedResponse = buildAssistantMessage({
      messageId: 'failed-start-response_',
      parentMessageId: failedUserMessage.messageId,
      text: 'Failed to start generation',
      createdAt: undefined,
      updatedAt: undefined,
      error: true,
    });
    const persistedPartial = buildAssistantMessage({
      text: 'Persisted partial response',
      createdAt: undefined,
      updatedAt: undefined,
    });
    active = false;
    queryClient.setQueryData(
      [QueryKeys.messages, CONVERSATION_ID],
      [buildUserMessage(), buildAssistantMessage(), failedUserMessage, failedResponse],
    );
    setDisconnectedRunRecovery(queryClient, CONVERSATION_ID, {
      startedAsNewConvo: false,
      created: true,
      userMessageId: USER_MESSAGE_ID,
      responseMessageId: RESPONSE_MESSAGE_ID,
    });
    mockFetchStreamStatus.mockResolvedValue({ active: false, status: 'complete' });
    mockGetMessagesByConvoId.mockResolvedValue([buildUserMessage(), persistedPartial]);

    const { unmount } = renderTerminalRecovery({ queryClient });
    act(() => {
      requestTerminalRunRecovery(queryClient, CONVERSATION_ID);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData([QueryKeys.messages, CONVERSATION_ID])).toEqual([
        buildUserMessage(),
        persistedPartial,
        failedUserMessage,
        failedResponse,
      ]);
    });
    unmount();
  });

  it('restores a recovered first conversation to the sidebar without stealing another route', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const recoveredConversation = {
      ...buildConversation(),
      title: 'Recovered conversation',
    };
    const finalMessages = [
      buildUserMessage(),
      buildAssistantMessage({
        messageId: 'terminal-response',
        text: 'Recovered response',
        createdAt: '2026-07-28T08:00:00.000Z',
        updatedAt: '2026-07-28T08:00:00.000Z',
      }),
    ];
    queryClient.setQueryData(
      [QueryKeys.messages, CONVERSATION_ID],
      [buildUserMessage(), buildAssistantMessage()],
    );
    queryClient.setQueryData([QueryKeys.conversation, CONVERSATION_ID], recoveredConversation);
    queryClient.setQueryData([QueryKeys.allConversations], {
      pages: [
        {
          conversations: [buildConversation('other-conversation')],
          nextCursor: null,
        },
      ],
      pageParams: [],
    });
    setDisconnectedRunRecovery(queryClient, CONVERSATION_ID, {
      startedAsNewConvo: true,
      created: false,
      userMessageId: USER_MESSAGE_ID,
      responseMessageId: RESPONSE_MESSAGE_ID,
    });
    mockFetchStreamStatus.mockResolvedValue({ active: false, status: 'complete' });
    mockGetMessagesByConvoId.mockResolvedValue(finalMessages);

    const { rerender } = renderTerminalRecovery({
      queryClient,
      initialPath: '/c/other-conversation',
      initialConversation: buildConversation('other-conversation'),
    });

    active = false;
    rerender();

    await waitFor(() => {
      expect(getDisconnectedRunRecovery(queryClient, CONVERSATION_ID)).toBeUndefined();
    });
    const sidebar = queryClient.getQueryData<{
      pages: Array<{ conversations: TConversation[] }>;
    }>([QueryKeys.allConversations]);
    expect(sidebar?.pages[0].conversations[0]).toMatchObject({
      conversationId: CONVERSATION_ID,
      title: 'Recovered conversation',
    });
  });

  it('preserves canonical sidebar metadata when first-turn recovery finishes', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const optimisticConversation = {
      ...buildConversation(),
      title: 'New Chat',
      updatedAt: '2026-07-28T08:00:00.000Z',
    };
    const canonicalConversation = {
      ...buildConversation(),
      title: 'Canonical server title',
      updatedAt: '2026-07-28T08:01:00.000Z',
    };
    const finalMessages = [
      buildUserMessage(),
      buildAssistantMessage({
        messageId: 'terminal-response',
        text: 'Recovered response',
        createdAt: '2026-07-28T08:00:00.000Z',
        updatedAt: '2026-07-28T08:00:00.000Z',
      }),
    ];
    queryClient.setQueryData(
      [QueryKeys.messages, CONVERSATION_ID],
      [buildUserMessage(), buildAssistantMessage()],
    );
    queryClient.setQueryData([QueryKeys.conversation, CONVERSATION_ID], optimisticConversation);
    queryClient.setQueryData([QueryKeys.allConversations], {
      pages: [{ conversations: [canonicalConversation], nextCursor: null }],
      pageParams: [],
    });
    setDisconnectedRunRecovery(queryClient, CONVERSATION_ID, {
      startedAsNewConvo: true,
      created: false,
      userMessageId: USER_MESSAGE_ID,
      responseMessageId: RESPONSE_MESSAGE_ID,
    });
    mockFetchStreamStatus.mockResolvedValue({ active: false, status: 'complete' });
    mockGetMessagesByConvoId.mockResolvedValue(finalMessages);

    const { rerender } = renderTerminalRecovery({ queryClient });
    active = false;
    rerender();

    await waitFor(() => {
      expect(getDisconnectedRunRecovery(queryClient, CONVERSATION_ID)).toBeUndefined();
    });
    const sidebar = queryClient.getQueryData<{
      pages: Array<{ conversations: TConversation[] }>;
    }>([QueryKeys.allConversations]);
    expect(sidebar?.pages[0].conversations[0]).toEqual(canonicalConversation);
  });
});
