import { RecoilRoot, useRecoilValue } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TConversation, TMessage } from 'librechat-data-provider';
import type { MutableSnapshot } from 'recoil';
import type { ReactNode } from 'react';
import type { RunEnd } from '~/store/families';
import useTerminalRunRecovery from '../useTerminalRunRecovery';
import { getDisconnectedRunRecovery, setDisconnectedRunRecovery } from '../resumableRecovery';
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
});
