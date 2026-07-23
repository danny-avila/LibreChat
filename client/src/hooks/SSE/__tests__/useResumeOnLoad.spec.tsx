import { RecoilRoot, useRecoilValue } from 'recoil';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Constants, ContentTypes, QueryKeys } from 'librechat-data-provider';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { TMessage, TConversation, TSubmission } from 'librechat-data-provider';
import type { MutableSnapshot } from 'recoil';
import type { ReactNode } from 'react';
import type { PendingSteer, QueuedMessage, RunEnd } from '~/store/families';
import useResumeOnLoad from '../useResumeOnLoad';
import {
  getDisconnectedRunRecovery,
  markTerminalEventSeen,
  setDisconnectedRunRecovery,
} from '../resumableRecovery';
import store from '~/store';

const mockUseStreamStatus = jest.fn();
const mockUseActiveJobs = jest.fn();
const mockFetchStreamStatus = jest.fn();

jest.mock('~/data-provider', () => ({
  useStreamStatus: (conversationId: string | undefined, enabled: boolean) =>
    mockUseStreamStatus(conversationId, enabled),
  useActiveJobs: (enabled: boolean) => mockUseActiveJobs(enabled),
  fetchStreamStatus: (conversationId: string) => mockFetchStreamStatus(conversationId),
}));

const CONVERSATION_ID = 'conv-current';
const STALE_CONVERSATION_ID = 'conv-stale';
const USER_MESSAGE_ID = 'user-message-1';
const RESPONSE_MESSAGE_ID = 'user-message-1_';

function buildConversation(conversationId = CONVERSATION_ID): TConversation {
  return {
    conversationId,
    endpoint: 'agents',
  } as TConversation;
}

function buildUserMessage(
  conversationId: string | null = CONVERSATION_ID,
  messageId = USER_MESSAGE_ID,
): TMessage {
  return {
    text: 'Hello',
    sender: 'User',
    messageId,
    conversationId,
    isCreatedByUser: true,
    parentMessageId: Constants.NO_PARENT,
  } as TMessage;
}

function buildSubmission(conversationId: string | null | undefined): TSubmission {
  return {
    messages: [],
    isTemporary: false,
    endpointOption: { endpoint: 'agents' },
    conversation: { conversationId },
    userMessage: buildUserMessage(null),
    initialResponse: {
      text: '',
      sender: 'Assistant',
      messageId: RESPONSE_MESSAGE_ID,
      conversationId,
      isCreatedByUser: false,
      parentMessageId: USER_MESSAGE_ID,
    } as TMessage,
  } as unknown as TSubmission;
}

function renderUseResumeOnLoad({
  messages = [],
  getMessages: getMessagesOverride,
  submission = null,
  conversationId = CONVERSATION_ID,
  messagesLoaded = true,
  onSubmission,
  siblingIndexParentId,
  onSiblingIndex,
  pendingSteers,
  onPendingSteers,
  onQueuedMessages,
  onRunEnd,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  messageQueryFn,
}: {
  messages?: TMessage[];
  getMessages?: () => TMessage[] | undefined;
  submission?: TSubmission | null;
  conversationId?: string;
  messagesLoaded?: boolean;
  onSubmission?: (submission: TSubmission | null) => void;
  siblingIndexParentId?: string;
  onSiblingIndex?: (siblingIndex: number) => void;
  pendingSteers?: PendingSteer[];
  onPendingSteers?: (steers: PendingSteer[]) => void;
  onQueuedMessages?: (queued: QueuedMessage[]) => void;
  onRunEnd?: (runEnd: RunEnd | null) => void;
  queryClient?: QueryClient;
  messageQueryFn?: () => Promise<TMessage[]>;
}) {
  const getMessages = jest.fn(getMessagesOverride ?? (() => messages));
  const initializeState = (snapshot: MutableSnapshot) => {
    snapshot.set(store.conversationByIndex(0), buildConversation(conversationId));
    snapshot.set(store.submissionByIndex(0), submission);
    if (pendingSteers) {
      snapshot.set(store.pendingSteersByConvoId(conversationId), pendingSteers);
    }
  };

  const SubmissionProbe = () => {
    const currentSubmission = useRecoilValue(store.submissionByIndex(0));
    onSubmission?.(currentSubmission);
    return null;
  };
  const PendingSteersProbe = () => {
    const steers = useRecoilValue(store.pendingSteersByConvoId(conversationId));
    onPendingSteers?.(steers);
    return null;
  };
  const QueuedMessagesProbe = () => {
    const queued = useRecoilValue(store.queuedMessagesByConvoId(conversationId));
    onQueuedMessages?.(queued);
    return null;
  };
  const RunEndProbe = () => {
    const runEnd = useRecoilValue(store.runEndByIndex(0));
    onRunEnd?.(runEnd);
    return null;
  };
  const SiblingIndexProbe = () => {
    const siblingIndex = useRecoilValue(store.messagesSiblingIdxFamily(siblingIndexParentId));
    if (siblingIndexParentId) {
      onSiblingIndex?.(siblingIndex);
    }
    return null;
  };
  const MessageQueryProbe = () => {
    useQuery<TMessage[]>(
      [QueryKeys.messages, conversationId],
      () => messageQueryFn?.() ?? Promise.resolve([]),
      {
        enabled: messageQueryFn != null,
        refetchOnMount: false,
      },
    );
    return null;
  };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot initializeState={initializeState}>
        <MessageQueryProbe />
        <SubmissionProbe />
        <SiblingIndexProbe />
        <PendingSteersProbe />
        <QueuedMessagesProbe />
        <RunEndProbe />
        {children}
      </RecoilRoot>
    </QueryClientProvider>
  );

  return {
    getMessages,
    queryClient,
    ...renderHook(() => useResumeOnLoad(conversationId, getMessages, 0, messagesLoaded), {
      wrapper,
    }),
  };
}

describe('useResumeOnLoad', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockUseStreamStatus.mockReset();
    mockUseStreamStatus.mockReturnValue({
      data: undefined,
      isSuccess: false,
      isFetching: false,
    });
    mockUseActiveJobs.mockReset();
    mockUseActiveJobs.mockReturnValue({
      data: { activeJobIds: [] },
    });
    mockFetchStreamStatus.mockReset();
    mockFetchStreamStatus.mockResolvedValue({ active: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not check for resume when a null-conversation submission matches a loaded user message', () => {
    renderUseResumeOnLoad({
      submission: buildSubmission(null),
      messages: [buildUserMessage(CONVERSATION_ID)],
    });

    expect(mockUseStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID, false);
  });

  it('checks for resume when the active submission belongs to a different conversation', () => {
    renderUseResumeOnLoad({
      submission: buildSubmission(STALE_CONVERSATION_ID),
      messages: [buildUserMessage(CONVERSATION_ID)],
    });

    expect(mockUseStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID, true);
  });

  it('checks for resume when a null-conversation submission cannot be matched to loaded messages', () => {
    renderUseResumeOnLoad({
      submission: buildSubmission(null),
      messages: [buildUserMessage(CONVERSATION_ID, 'different-user-message')],
    });

    expect(mockUseStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID, true);
  });

  it('stops checking for resume after loaded messages prove a null-conversation submission belongs to the route', () => {
    const submission = buildSubmission(null);
    let messages: TMessage[] = [];
    const { rerender } = renderUseResumeOnLoad({
      submission,
      getMessages: () => messages,
    });

    expect(mockUseStreamStatus).toHaveBeenLastCalledWith(CONVERSATION_ID, true);

    messages = [buildUserMessage(CONVERSATION_ID)];
    rerender();

    expect(mockUseStreamStatus).toHaveBeenLastCalledWith(CONVERSATION_ID, false);
  });

  it('does not replace a null-conversation submission when stream status matches its resume state', async () => {
    const submission = buildSubmission(null);
    const observedSubmissions: Array<TSubmission | null> = [];
    mockUseStreamStatus.mockReturnValue({
      isSuccess: true,
      isFetching: false,
      data: {
        active: true,
        status: 'running',
        streamId: 'stream-1',
        resumeState: {
          aggregatedContent: [],
          responseMessageId: RESPONSE_MESSAGE_ID,
          userMessage: { messageId: USER_MESSAGE_ID },
        },
      },
    });

    renderUseResumeOnLoad({
      submission,
      messages: [],
      onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockUseStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID, true);
    expect(observedSubmissions[observedSubmissions.length - 1]).toBe(submission);
  });

  it('restores model spec icon metadata on the resumed assistant placeholder', async () => {
    const observedSubmissions: Array<TSubmission | null> = [];
    mockUseStreamStatus.mockReturnValue({
      isSuccess: true,
      isFetching: false,
      data: {
        active: true,
        status: 'running',
        streamId: CONVERSATION_ID,
        resumeState: {
          runSteps: [],
          aggregatedContent: [{ type: 'text', text: 'Streaming...' }],
          responseMessageId: RESPONSE_MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          sender: 'Spec Agent',
          iconURL: 'https://example.com/spec-icon.png',
          model: 'gpt-4.1',
          userMessage: {
            messageId: USER_MESSAGE_ID,
            parentMessageId: Constants.NO_PARENT,
            conversationId: CONVERSATION_ID,
            text: 'Hello',
          },
        },
      },
    });

    renderUseResumeOnLoad({
      messages: [
        buildUserMessage(CONVERSATION_ID),
        {
          messageId: RESPONSE_MESSAGE_ID,
          parentMessageId: USER_MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          text: '',
          isCreatedByUser: false,
          iconURL: '',
          model: '',
        } as TMessage,
      ],
      onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(observedSubmissions[observedSubmissions.length - 1]?.initialResponse).toEqual(
      expect.objectContaining({
        messageId: RESPONSE_MESSAGE_ID,
        sender: 'Spec Agent',
        iconURL: 'https://example.com/spec-icon.png',
        model: 'gpt-4.1',
      }),
    );
  });

  it('strips the paused user/assistant rows from submission.messages (no duplicate on resume)', async () => {
    const observedSubmissions: Array<TSubmission | null> = [];
    mockUseStreamStatus.mockReturnValue({
      isSuccess: true,
      isFetching: false,
      data: {
        active: true,
        status: 'running',
        streamId: CONVERSATION_ID,
        resumeState: {
          runSteps: [],
          aggregatedContent: [{ type: 'text', text: 'Streaming...' }],
          responseMessageId: RESPONSE_MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          sender: 'Agent',
          userMessage: {
            messageId: USER_MESSAGE_ID,
            parentMessageId: Constants.NO_PARENT,
            conversationId: CONVERSATION_ID,
            text: 'Hello',
          },
        },
      },
    });

    renderUseResumeOnLoad({
      // The reloaded DB array already holds the paused user row + the partial
      // (unfinished) assistant row under the same ids the resume re-supplies.
      messages: [
        buildUserMessage(CONVERSATION_ID),
        {
          messageId: RESPONSE_MESSAGE_ID,
          parentMessageId: USER_MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          text: '',
          isCreatedByUser: false,
          unfinished: true,
        } as TMessage,
      ],
      onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
    });

    await act(async () => {
      await Promise.resolve();
    });

    const submission = observedSubmissions[observedSubmissions.length - 1];
    const ids = (submission?.messages ?? []).map((m) => m.messageId);
    // Stripped from the flat array (re-supplied via the placeholders + final event)...
    expect(ids).not.toContain(USER_MESSAGE_ID);
    expect(ids).not.toContain(RESPONSE_MESSAGE_ID);
    // ...but still carried on the placeholders for re-insertion.
    expect(submission?.userMessage?.messageId).toBe(USER_MESSAGE_ID);
    expect(submission?.initialResponse?.messageId).toBe(RESPONSE_MESSAGE_ID);
  });

  it('restores the branch that owns a pending OAuth resume user message', async () => {
    const rootUser = buildUserMessage(CONVERSATION_ID, 'root-user');
    const branchOneResponse = {
      messageId: 'branch-one-response',
      parentMessageId: rootUser.messageId,
      conversationId: CONVERSATION_ID,
      text: 'Branch one response',
      isCreatedByUser: false,
    } as TMessage;
    const branchOneFollowUp = buildUserMessage(CONVERSATION_ID, 'branch-one-follow-up');
    branchOneFollowUp.parentMessageId = branchOneResponse.messageId;
    const branchOneTail = {
      messageId: 'branch-one-tail',
      parentMessageId: branchOneFollowUp.messageId,
      conversationId: CONVERSATION_ID,
      text: 'Branch one tail',
      isCreatedByUser: false,
    } as TMessage;
    const branchTwoResponse = {
      messageId: 'branch-two-response',
      parentMessageId: rootUser.messageId,
      conversationId: CONVERSATION_ID,
      text: 'Branch two response',
      isCreatedByUser: false,
    } as TMessage;
    const observedSiblingIndexes: number[] = [];

    mockUseStreamStatus.mockReturnValue({
      isSuccess: true,
      isFetching: false,
      data: {
        active: true,
        status: 'running',
        streamId: CONVERSATION_ID,
        resumeState: {
          runSteps: [],
          aggregatedContent: [],
          replayEvents: [],
          responseMessageId: 'pending-user_',
          conversationId: CONVERSATION_ID,
          userMessage: {
            messageId: 'pending-user',
            parentMessageId: branchOneTail.messageId,
            conversationId: CONVERSATION_ID,
            text: 'Use OAuth tool on branch one',
          },
        },
      },
    });

    renderUseResumeOnLoad({
      messages: [rootUser, branchOneResponse, branchOneFollowUp, branchOneTail, branchTwoResponse],
      siblingIndexParentId: rootUser.messageId,
      onSiblingIndex: (siblingIndex) => observedSiblingIndexes.push(siblingIndex),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(observedSiblingIndexes[observedSiblingIndexes.length - 1]).toBe(1);
  });

  it('restores the assistant sibling selected by a pending regenerate response', async () => {
    const rootUser = buildUserMessage(CONVERSATION_ID, 'root-user');
    const olderResponse = {
      messageId: 'older-response',
      parentMessageId: rootUser.messageId,
      conversationId: CONVERSATION_ID,
      text: 'Older response',
      isCreatedByUser: false,
    } as TMessage;
    const newerResponse = {
      messageId: 'newer-response',
      parentMessageId: rootUser.messageId,
      conversationId: CONVERSATION_ID,
      text: 'Newer response',
      isCreatedByUser: false,
    } as TMessage;
    const observedSiblingIndexes: number[] = [];

    mockUseStreamStatus.mockReturnValue({
      isSuccess: true,
      isFetching: false,
      data: {
        active: true,
        status: 'running',
        streamId: CONVERSATION_ID,
        resumeState: {
          runSteps: [],
          aggregatedContent: [],
          replayEvents: [],
          responseMessageId: `${olderResponse.messageId}_`,
          conversationId: CONVERSATION_ID,
          userMessage: {
            messageId: rootUser.messageId,
            parentMessageId: rootUser.parentMessageId,
            conversationId: CONVERSATION_ID,
            text: rootUser.text,
          },
        },
      },
    });

    renderUseResumeOnLoad({
      messages: [rootUser, olderResponse, newerResponse],
      siblingIndexParentId: rootUser.messageId,
      onSiblingIndex: (siblingIndex) => observedSiblingIndexes.push(siblingIndex),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(observedSiblingIndexes[observedSiblingIndexes.length - 1]).toBe(1);
  });

  describe('completed run refresh', () => {
    function buildAssistantMessage(overrides: Partial<TMessage> = {}): TMessage {
      return {
        messageId: RESPONSE_MESSAGE_ID,
        parentMessageId: USER_MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        text: '',
        isCreatedByUser: false,
        createdAt: '2026-07-23T06:29:43.276Z',
        updatedAt: '2026-07-23T06:29:43.276Z',
        ...overrides,
      } as TMessage;
    }

    it('loads the persisted final response when an inactive job left an unfinished cache tail', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const unfinishedMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({ unfinished: true }),
      ];
      const finalMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({
          messageId: 'response-message-final',
          text: 'Completed report',
          unfinished: false,
          content: [{ type: ContentTypes.TEXT, text: 'Completed report' }],
          updatedAt: '2026-07-23T06:48:48.678Z',
        }),
      ];
      queryClient.setQueryData([QueryKeys.messages, CONVERSATION_ID], unfinishedMessages);
      const messageQueryFn = jest.fn().mockResolvedValue(finalMessages);
      mockUseStreamStatus.mockReturnValue({
        isSuccess: true,
        isFetching: false,
        data: { active: false },
      });

      renderUseResumeOnLoad({
        getMessages: () =>
          queryClient.getQueryData<TMessage[]>([QueryKeys.messages, CONVERSATION_ID]),
        queryClient,
        messageQueryFn,
      });

      await waitFor(() => {
        expect(queryClient.getQueryData([QueryKeys.messages, CONVERSATION_ID])).toEqual(
          finalMessages,
        );
      });
      expect(messageQueryFn).toHaveBeenCalledTimes(1);
    });

    it('keeps a completed cached response without an extra message refresh', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
      mockUseStreamStatus.mockReturnValue({
        isSuccess: true,
        isFetching: false,
        data: { active: false },
      });

      renderUseResumeOnLoad({
        messages: [
          buildUserMessage(CONVERSATION_ID),
          buildAssistantMessage({
            messageId: 'response-message-final',
            unfinished: false,
          }),
        ],
        queryClient,
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('does not probe a timestamp-less tail when this client received the final event', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      const liveFinalMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({
          createdAt: undefined,
          updatedAt: undefined,
          unfinished: false,
          text: 'Live final',
        }),
      ];
      queryClient.setQueryData([QueryKeys.messages, CONVERSATION_ID], liveFinalMessages);
      markTerminalEventSeen(queryClient, CONVERSATION_ID);
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
      });

      const { rerender } = renderUseResumeOnLoad({
        submission: buildSubmission(CONVERSATION_ID),
        getMessages: () =>
          queryClient.getQueryData<TMessage[]>([QueryKeys.messages, CONVERSATION_ID]),
        queryClient,
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [] },
      });
      rerender();

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockFetchStreamStatus).not.toHaveBeenCalled();
      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('refreshes each run when a provisional response id is reused', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const unfinishedMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({ unfinished: true }),
      ];
      const finalMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({
          messageId: 'response-message-final',
          text: 'Completed report',
          unfinished: false,
          content: [{ type: ContentTypes.TEXT, text: 'Completed report' }],
          updatedAt: '2026-07-23T06:48:48.678Z',
        }),
      ];
      const secondFinalMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({
          messageId: 'response-message-final',
          text: 'Regenerated report',
          unfinished: false,
          content: [{ type: ContentTypes.TEXT, text: 'Regenerated report' }],
          updatedAt: '2026-07-23T07:10:12.345Z',
        }),
      ];
      queryClient.setQueryData([QueryKeys.messages, CONVERSATION_ID], unfinishedMessages);
      const messageQueryFn = jest
        .fn()
        .mockResolvedValueOnce(finalMessages)
        .mockResolvedValueOnce(secondFinalMessages);
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
      });

      const { rerender } = renderUseResumeOnLoad({
        submission: buildSubmission(CONVERSATION_ID),
        getMessages: () =>
          queryClient.getQueryData<TMessage[]>([QueryKeys.messages, CONVERSATION_ID]),
        queryClient,
        messageQueryFn,
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [] },
      });
      rerender();

      await waitFor(() => {
        expect(queryClient.getQueryData([QueryKeys.messages, CONVERSATION_ID])).toEqual(
          finalMessages,
        );
      });
      expect(messageQueryFn).toHaveBeenCalledTimes(1);

      queryClient.setQueryData([QueryKeys.messages, CONVERSATION_ID], unfinishedMessages);
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [] },
      });
      rerender();

      await waitFor(() => {
        expect(queryClient.getQueryData([QueryKeys.messages, CONVERSATION_ID])).toEqual(
          secondFinalMessages,
        );
      });
      expect(mockFetchStreamStatus).toHaveBeenCalledTimes(2);
      expect(messageQueryFn).toHaveBeenCalledTimes(2);
    });

    it('recovers terminal steers only after the server confirms the job is inactive', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const observedSteers: PendingSteer[][] = [];
      const observedQueues: QueuedMessage[][] = [];
      const observedRunEnds: Array<RunEnd | null> = [];
      const pendingSteer = {
        steerId: 'steer-after-disconnect',
        text: 'Follow up after the report',
        status: 'pending' as const,
        createdAt: 7,
      };
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
      });
      mockFetchStreamStatus.mockResolvedValue({
        active: false,
        unrecoveredSteers: [pendingSteer],
      });
      const unfinishedMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({ unfinished: true }),
      ];
      const finalMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({
          messageId: 'response-message-final',
          text: 'Completed report',
          unfinished: false,
        }),
      ];
      queryClient.setQueryData([QueryKeys.messages, CONVERSATION_ID], unfinishedMessages);

      const { rerender } = renderUseResumeOnLoad({
        submission: buildSubmission(CONVERSATION_ID),
        getMessages: () =>
          queryClient.getQueryData<TMessage[]>([QueryKeys.messages, CONVERSATION_ID]),
        pendingSteers: [pendingSteer],
        onPendingSteers: (steers) => observedSteers.push(steers),
        onQueuedMessages: (queued) => observedQueues.push(queued),
        onRunEnd: (runEnd) => observedRunEnds.push(runEnd),
        queryClient,
        messageQueryFn: jest.fn().mockResolvedValue(finalMessages),
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [] },
      });
      rerender();

      await waitFor(() => {
        expect(observedQueues[observedQueues.length - 1]).toEqual([
          expect.objectContaining({
            id: pendingSteer.steerId,
            text: pendingSteer.text,
          }),
        ]);
      });
      expect(mockFetchStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID);
      expect(observedSteers[observedSteers.length - 1]).toEqual([]);
      expect(observedRunEnds[observedRunEnds.length - 1]).toMatchObject({
        conversationId: CONVERSATION_ID,
        outcome: 'completed',
      });
    });

    it('keeps live pending steers with the server when status confirms the job is active', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const observedSteers: PendingSteer[][] = [];
      const observedQueues: QueuedMessage[][] = [];
      const observedRunEnds: Array<RunEnd | null> = [];
      const pendingSteer: PendingSteer = {
        steerId: 'steer-still-live',
        text: 'Apply this to the running response',
        status: 'pending',
        createdAt: 7,
      };
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
      });
      mockFetchStreamStatus.mockResolvedValue({
        active: true,
        resumeState: {
          pendingSteers: [pendingSteer],
        },
      });

      const { rerender } = renderUseResumeOnLoad({
        submission: buildSubmission(CONVERSATION_ID),
        messages: [buildUserMessage(CONVERSATION_ID), buildAssistantMessage({ unfinished: true })],
        pendingSteers: [pendingSteer],
        onPendingSteers: (steers) => observedSteers.push(steers),
        onQueuedMessages: (queued) => observedQueues.push(queued),
        onRunEnd: (runEnd) => observedRunEnds.push(runEnd),
        queryClient,
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [] },
      });
      rerender();

      await waitFor(() => {
        expect(queryClient.getQueryData([QueryKeys.activeJobs])).toEqual({
          activeJobIds: [CONVERSATION_ID],
        });
      });
      expect(observedSteers[observedSteers.length - 1]).toEqual([pendingSteer]);
      expect(observedQueues[observedQueues.length - 1]).toEqual([]);
      expect(observedRunEnds[observedRunEnds.length - 1]).toBeNull();
    });

    it('recovers claimed steers when another run starts before status resolves', async () => {
      let resolveStatus!: (status: { active: boolean; unrecoveredSteers: PendingSteer[] }) => void;
      mockFetchStreamStatus.mockReturnValue(
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
      );
      const observedSteers: PendingSteer[][] = [];
      const observedQueues: QueuedMessage[][] = [];
      const observedRunEnds: Array<RunEnd | null> = [];
      const claimedSteer: PendingSteer = {
        steerId: 'claimed-old-run',
        text: 'Do not lose this',
        status: 'pending',
        createdAt: 8,
      };
      const newRunSteer: PendingSteer = {
        steerId: 'new-run-steer',
        text: 'Belongs to the new run',
        status: 'pending',
        createdAt: 9,
      };
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
      });

      const { rerender } = renderUseResumeOnLoad({
        submission: buildSubmission(CONVERSATION_ID),
        messages: [buildUserMessage(CONVERSATION_ID), buildAssistantMessage({ unfinished: true })],
        pendingSteers: [claimedSteer, newRunSteer],
        onPendingSteers: (steers) => observedSteers.push(steers),
        onQueuedMessages: (queued) => observedQueues.push(queued),
        onRunEnd: (runEnd) => observedRunEnds.push(runEnd),
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [] },
      });
      rerender();
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
      });
      rerender();

      await act(async () => {
        resolveStatus({
          active: false,
          unrecoveredSteers: [claimedSteer],
        });
        await Promise.resolve();
      });

      expect(observedQueues[observedQueues.length - 1]).toEqual([
        expect.objectContaining({ id: claimedSteer.steerId, text: claimedSteer.text }),
      ]);
      expect(observedSteers[observedSteers.length - 1]).toEqual([newRunSteer]);
      expect(observedRunEnds[observedRunEnds.length - 1]).toBeNull();
    });

    it('prunes an unpersisted optimistic first turn when its message refresh returns 404', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const removeQueriesSpy = jest.spyOn(queryClient, 'removeQueries');
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const observedRunEnds: Array<RunEnd | null> = [];
      const unfinishedMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({ unfinished: true }),
      ];
      queryClient.setQueryData([QueryKeys.messages, CONVERSATION_ID], unfinishedMessages);
      setDisconnectedRunRecovery(queryClient, CONVERSATION_ID, {
        startedAsNewConvo: true,
        created: false,
      });
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
      });
      mockFetchStreamStatus.mockResolvedValue({ active: false });
      const notFoundError = Object.assign(new Error('Conversation not found'), {
        isAxiosError: true,
        response: { status: 404 },
      });

      const { rerender } = renderUseResumeOnLoad({
        submission: buildSubmission(CONVERSATION_ID),
        getMessages: () =>
          queryClient.getQueryData<TMessage[]>([QueryKeys.messages, CONVERSATION_ID]),
        onRunEnd: (runEnd) => observedRunEnds.push(runEnd),
        queryClient,
        messageQueryFn: jest.fn().mockRejectedValue(notFoundError),
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [] },
      });
      rerender();

      await waitFor(() => {
        expect(observedRunEnds[observedRunEnds.length - 1]).toMatchObject({
          conversationId: String(Constants.NEW_CONVO),
          outcome: 'error',
        });
      });
      expect(removeQueriesSpy).toHaveBeenCalledWith({
        queryKey: [QueryKeys.conversation, CONVERSATION_ID],
      });
      expect(removeQueriesSpy).toHaveBeenCalledWith({
        queryKey: [QueryKeys.messages, CONVERSATION_ID],
      });
      expect(getDisconnectedRunRecovery(queryClient, CONVERSATION_ID)).toBeUndefined();
    });

    it('keeps first-turn recovery state when the message refresh fails transiently', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const removeQueriesSpy = jest.spyOn(queryClient, 'removeQueries');
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const observedRunEnds: Array<RunEnd | null> = [];
      const unfinishedMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({ unfinished: true }),
      ];
      queryClient.setQueryData([QueryKeys.messages, CONVERSATION_ID], unfinishedMessages);
      setDisconnectedRunRecovery(queryClient, CONVERSATION_ID, {
        startedAsNewConvo: true,
        created: false,
      });
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
      });
      mockFetchStreamStatus.mockResolvedValue({ active: false });
      const messageQueryFn = jest.fn().mockRejectedValue(new Error('Network unavailable'));

      const { rerender } = renderUseResumeOnLoad({
        submission: buildSubmission(CONVERSATION_ID),
        getMessages: () =>
          queryClient.getQueryData<TMessage[]>([QueryKeys.messages, CONVERSATION_ID]),
        onRunEnd: (runEnd) => observedRunEnds.push(runEnd),
        queryClient,
        messageQueryFn,
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [] },
      });
      rerender();

      await waitFor(() => {
        expect(messageQueryFn).toHaveBeenCalledTimes(1);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(observedRunEnds[observedRunEnds.length - 1]).toBeNull();
      expect(removeQueriesSpy).not.toHaveBeenCalledWith({
        queryKey: [QueryKeys.conversation, CONVERSATION_ID],
      });
      expect(removeQueriesSpy).not.toHaveBeenCalledWith({
        queryKey: [QueryKeys.messages, CONVERSATION_ID],
      });
      expect(getDisconnectedRunRecovery(queryClient, CONVERSATION_ID)).toEqual({
        startedAsNewConvo: true,
        created: false,
      });
    });

    it('publishes run end when status fails but the fallback refresh completes', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const observedSteers: PendingSteer[][] = [];
      const observedRunEnds: Array<RunEnd | null> = [];
      const pendingSteer: PendingSteer = {
        steerId: 'steer-without-status',
        text: 'Keep this pending until status is known',
        status: 'pending',
        createdAt: 10,
      };
      const unfinishedMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({ unfinished: true }),
      ];
      const finalMessages = [
        buildUserMessage(CONVERSATION_ID),
        buildAssistantMessage({
          messageId: 'response-message-final',
          text: 'Completed despite status failure',
          unfinished: false,
        }),
      ];
      queryClient.setQueryData([QueryKeys.messages, CONVERSATION_ID], unfinishedMessages);
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
      });
      mockFetchStreamStatus.mockRejectedValue(new Error('Status unavailable'));

      const { rerender } = renderUseResumeOnLoad({
        submission: buildSubmission(CONVERSATION_ID),
        getMessages: () =>
          queryClient.getQueryData<TMessage[]>([QueryKeys.messages, CONVERSATION_ID]),
        pendingSteers: [pendingSteer],
        onPendingSteers: (steers) => observedSteers.push(steers),
        onRunEnd: (runEnd) => observedRunEnds.push(runEnd),
        queryClient,
        messageQueryFn: jest.fn().mockResolvedValue(finalMessages),
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [] },
      });
      rerender();

      await waitFor(() => {
        expect(observedRunEnds[observedRunEnds.length - 1]).toMatchObject({
          conversationId: CONVERSATION_ID,
          outcome: 'completed',
        });
      });
      expect(queryClient.getQueryData([QueryKeys.messages, CONVERSATION_ID])).toEqual(
        finalMessages,
      );
      expect(observedSteers[observedSteers.length - 1]).toEqual([pendingSteer]);
    });
  });

  describe('steer chip restore', () => {
    const staleChip: PendingSteer = {
      steerId: 'stale-1',
      text: 'applied while away',
      status: 'pending',
      createdAt: 1,
    };
    const failedChip: PendingSteer = {
      steerId: 'failed-1',
      text: 'recoverable words',
      status: 'failed',
      createdAt: 2,
    };

    function buildActiveStatus(pendingSteers?: Array<Record<string, unknown>>) {
      return {
        isSuccess: true,
        isFetching: false,
        data: {
          active: true,
          status: 'running',
          streamId: CONVERSATION_ID,
          resumeState: {
            runSteps: [],
            aggregatedContent: [],
            responseMessageId: RESPONSE_MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            userMessage: {
              messageId: USER_MESSAGE_ID,
              parentMessageId: Constants.NO_PARENT,
              conversationId: CONVERSATION_ID,
              text: 'Hello',
            },
            ...(pendingSteers && { pendingSteers }),
          },
        },
      };
    }

    it('clears stale pending chips when the server reports no still-queued steers', async () => {
      const observedSteers: PendingSteer[][] = [];
      mockUseStreamStatus.mockReturnValue(buildActiveStatus());

      renderUseResumeOnLoad({
        messages: [buildUserMessage(CONVERSATION_ID)],
        pendingSteers: [staleChip, failedChip],
        onPendingSteers: (steers) => observedSteers.push(steers),
      });

      await act(async () => {
        await Promise.resolve();
      });

      // Only the failed chip survives — its text is client-local and recoverable.
      expect(observedSteers[observedSteers.length - 1]).toEqual([failedChip]);
    });

    it('restores still-queued steers (with files) and drops chips absent from the server list', async () => {
      const observedSteers: PendingSteer[][] = [];
      const files = [{ file_id: 'f1', filename: 'notes.pdf', type: 'application/pdf' }];
      mockUseStreamStatus.mockReturnValue(
        buildActiveStatus([{ steerId: 'queued-1', text: 'still queued', createdAt: 5, files }]),
      );

      renderUseResumeOnLoad({
        messages: [buildUserMessage(CONVERSATION_ID)],
        pendingSteers: [staleChip],
        onPendingSteers: (steers) => observedSteers.push(steers),
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(observedSteers[observedSteers.length - 1]).toEqual([
        { steerId: 'queued-1', text: 'still queued', status: 'pending', createdAt: 5, files },
      ]);
    });

    it('clears stale pending chips when the run finished while away (no active job)', async () => {
      const observedSteers: PendingSteer[][] = [];
      mockUseStreamStatus.mockReturnValue({
        isSuccess: true,
        isFetching: false,
        data: { active: false },
      });

      renderUseResumeOnLoad({
        messages: [buildUserMessage(CONVERSATION_ID)],
        pendingSteers: [staleChip, failedChip],
        onPendingSteers: (steers) => observedSteers.push(steers),
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(observedSteers[observedSteers.length - 1]).toEqual([failedChip]);
    });

    it('converts resumeState.pendingSteers to queued when inactive (expired action, unparked queue)', async () => {
      const observedSteers: PendingSteer[][] = [];
      const observedQueues: QueuedMessage[][] = [];
      mockUseStreamStatus.mockReturnValue({
        isSuccess: true,
        isFetching: false,
        data: {
          active: false,
          resumeState: {
            pendingSteers: [{ steerId: 'steer-unparked', text: 'still queued', createdAt: 5 }],
          },
        },
      });

      renderUseResumeOnLoad({
        messages: [buildUserMessage(CONVERSATION_ID)],
        // Local chip carries the client-only context the server list lacks.
        pendingSteers: [
          {
            steerId: 'steer-unparked',
            text: 'still queued',
            status: 'pending',
            createdAt: 5,
            quotes: ['carried quote'],
            manualSkills: ['carried-skill'],
          },
        ],
        onPendingSteers: (steers) => observedSteers.push(steers),
        onQueuedMessages: (queued) => observedQueues.push(queued),
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(observedQueues[observedQueues.length - 1]).toEqual([
        expect.objectContaining({
          id: 'steer-unparked',
          text: 'still queued',
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        }),
      ]);
      expect(observedSteers[observedSteers.length - 1]).toEqual([]);
    });

    it('dedupes unrecoveredSteers against resumeState.pendingSteers by steer id', async () => {
      const observedQueues: QueuedMessage[][] = [];
      mockUseStreamStatus.mockReturnValue({
        isSuccess: true,
        isFetching: false,
        data: {
          active: false,
          unrecoveredSteers: [{ steerId: 'steer-dup', text: 'delivered once', createdAt: 3 }],
          resumeState: {
            pendingSteers: [
              { steerId: 'steer-dup', text: 'delivered once', createdAt: 3 },
              { steerId: 'steer-extra', text: 'second words', createdAt: 4 },
            ],
          },
        },
      });

      renderUseResumeOnLoad({
        messages: [buildUserMessage(CONVERSATION_ID)],
        onQueuedMessages: (queued) => observedQueues.push(queued),
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(observedQueues[observedQueues.length - 1]).toEqual([
        expect.objectContaining({ id: 'steer-dup', text: 'delivered once' }),
        expect.objectContaining({ id: 'steer-extra', text: 'second words' }),
      ]);
    });
  });
});
