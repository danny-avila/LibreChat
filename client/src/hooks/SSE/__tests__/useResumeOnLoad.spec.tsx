import { renderHook, act } from '@testing-library/react';
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Constants, ContentTypes, QueryKeys } from 'librechat-data-provider';
import type { TMessage, TConversation, TSubmission } from 'librechat-data-provider';
import type { MutableSnapshot } from 'recoil';
import type { ReactNode } from 'react';
import type { StreamStatusResponse } from '~/data-provider';
import type { PendingSteer, QueuedMessage } from '~/store/families';
import useResumeOnLoad from '../useResumeOnLoad';
import store from '~/store';

const mockUseStreamStatus = jest.fn();
const mockUseActiveJobs = jest.fn();

jest.mock('~/data-provider', () => ({
  useStreamStatus: (conversationId: string | undefined, enabled: boolean) =>
    mockUseStreamStatus(conversationId, enabled),
  useActiveJobs: (enabled?: boolean) => mockUseActiveJobs(enabled),
  streamStatusQueryKey: (conversationId: string) => ['streamStatus', conversationId],
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
  submissionStart,
  onSubmissionStart,
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
  submissionStart?: number;
  onSubmissionStart?: (submissionStart: number | null) => void;
}) {
  const getMessages = jest.fn(getMessagesOverride ?? (() => messages));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let setSubmissionState: ((submission: TSubmission | null) => void) | undefined;
  const initializeState = (snapshot: MutableSnapshot) => {
    snapshot.set(store.conversationByIndex(0), buildConversation(conversationId));
    snapshot.set(store.submissionByIndex(0), submission);
    if (submissionStart != null) {
      snapshot.set(store.submissionStartFamily(0), submissionStart);
    }
    if (pendingSteers) {
      snapshot.set(store.pendingSteersByConvoId(conversationId), pendingSteers);
    }
  };

  const SubmissionProbe = () => {
    const currentSubmission = useRecoilValue(store.submissionByIndex(0));
    setSubmissionState = useSetRecoilState(store.submissionByIndex(0));
    onSubmission?.(currentSubmission);
    return null;
  };
  const SubmissionStartProbe = () => {
    const currentStart = useRecoilValue(store.submissionStartFamily(0));
    onSubmissionStart?.(currentStart);
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
  const SiblingIndexProbe = () => {
    const siblingIndex = useRecoilValue(store.messagesSiblingIdxFamily(siblingIndexParentId));
    if (siblingIndexParentId) {
      onSiblingIndex?.(siblingIndex);
    }
    return null;
  };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot initializeState={initializeState}>
        <SubmissionProbe />
        <SubmissionStartProbe />
        <SiblingIndexProbe />
        <PendingSteersProbe />
        <QueuedMessagesProbe />
        {children}
      </RecoilRoot>
    </QueryClientProvider>
  );

  return {
    queryClient,
    getMessages,
    setSubmission: (nextSubmission: TSubmission | null) => setSubmissionState?.(nextSubmission),
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
    mockUseActiveJobs.mockReturnValue({ data: { activeJobIds: [] }, dataUpdatedAt: 1 });
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

  describe('a run started by another client', () => {
    /** Mirrors `ACTIVE_JOB_REARM_INTERVAL_MS` in the hook. */
    const ACTIVE_JOB_REARM_INTERVAL_MS = 5_000;

    const INACTIVE_STATUS = {
      isSuccess: true,
      isFetching: false,
      data: { active: false },
    };

    const ACTIVE_STATUS = {
      isSuccess: true,
      isFetching: false,
      data: {
        active: true,
        status: 'running',
        createdAt: 4242,
        streamId: CONVERSATION_ID,
        resumeState: {
          aggregatedContent: [{ type: ContentTypes.TEXT, text: 'partial' }],
          responseMessageId: RESPONSE_MESSAGE_ID,
          userMessage: { messageId: USER_MESSAGE_ID, conversationId: CONVERSATION_ID },
        },
      },
    };

    it('stops asking about a conversation once it has answered inactive', async () => {
      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);

      const { rerender } = renderUseResumeOnLoad({ messages: [] });
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockUseStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID, true);

      rerender();

      /** Documents the gap this suite's next case closes: the status query is
       *  the only thing that could notice another client's run, and it is now
       *  switched off for the rest of this conversation's mount. */
      expect(mockUseStreamStatus).toHaveBeenLastCalledWith(CONVERSATION_ID, false);
    });

    it('attaches when a job for the viewed conversation becomes active elsewhere', async () => {
      const observedSubmissions: Array<TSubmission | null> = [];
      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);

      const { rerender } = renderUseResumeOnLoad({
        messages: [buildUserMessage(CONVERSATION_ID)],
        onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(observedSubmissions[observedSubmissions.length - 1]).toBeNull();

      /** Another tab (or another device) sends into this same conversation.
       *  `/chat/active` is scoped to the user, not to the client that started
       *  the run, so this pane can see it — and it refetches on focus. */
      mockUseStreamStatus.mockClear();
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      mockUseStreamStatus.mockReturnValue(ACTIVE_STATUS);
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      /** Re-armed: the status query re-opens off the announcement... */
      expect(mockUseStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID, true);
      /** ...and closes again once the attachment exists, rather than staying
       *  open for the run's whole lifetime. */
      expect(mockUseStreamStatus).toHaveBeenLastCalledWith(CONVERSATION_ID, false);
      const attached = observedSubmissions[observedSubmissions.length - 1] as
        | (TSubmission & { resumeStreamId?: string; resumeGenerationCreatedAt?: number })
        | null;
      expect(attached?.resumeStreamId).toBe(CONVERSATION_ID);
      expect(attached?.resumeGenerationCreatedAt).toBe(4242);
    });

    /** The elapsed indicator's baseline must be the generation's real start:
     *  an attach with no surviving anchor (a reload, or a run another client
     *  started) rebuilds it clock-locally from the server-computed generation
     *  age, subtracted from the moment the status response ARRIVED — so
     *  neither cross-machine clock skew nor a slow history fetch between
     *  receipt and apply can distort the reading. */
    it('anchors the elapsed baseline via the server-computed generation age', async () => {
      const observedStarts: Array<number | null> = [];
      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);

      const { rerender } = renderUseResumeOnLoad({
        messages: [buildUserMessage(CONVERSATION_ID)],
        onSubmissionStart: (start) => observedStarts.push(start),
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(observedStarts[observedStarts.length - 1]).toBeNull();

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      mockUseStreamStatus.mockReturnValue({
        ...ACTIVE_STATUS,
        dataUpdatedAt: 1_000_000,
        data: { ...ACTIVE_STATUS.data, elapsedMs: 30_000 },
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      expect(observedStarts[observedStarts.length - 1]).toBe(1_000_000 - 30_000);
    });

    /** An older server without `elapsedMs` still beats counting from attach:
     *  the raw server start is adopted and the indicator clamps its skew. */
    it('falls back to the server-recorded generation start without elapsedMs', async () => {
      const observedStarts: Array<number | null> = [];
      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);

      const { rerender } = renderUseResumeOnLoad({
        messages: [buildUserMessage(CONVERSATION_ID)],
        onSubmissionStart: (start) => observedStarts.push(start),
      });
      await act(async () => {
        await Promise.resolve();
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      mockUseStreamStatus.mockReturnValue(ACTIVE_STATUS);
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      expect(observedStarts[observedStarts.length - 1]).toBe(4242);
    });

    /** A reattach to the run this session already anchored must keep the ask
     *  baseline — the atom deliberately outlives the submission it timed. */
    it('preserves a surviving elapsed baseline over the server-recorded start', async () => {
      const observedStarts: Array<number | null> = [];
      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);

      const { rerender } = renderUseResumeOnLoad({
        messages: [buildUserMessage(CONVERSATION_ID)],
        submissionStart: 1111,
        onSubmissionStart: (start) => observedStarts.push(start),
      });
      await act(async () => {
        await Promise.resolve();
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      mockUseStreamStatus.mockReturnValue(ACTIVE_STATUS);
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      expect(observedStarts[observedStarts.length - 1]).toBe(1111);
    });

    it('restores an externally started regeneration after history refreshes', async () => {
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
      const observedSubmissions: Array<TSubmission | null> = [];
      let messages = [rootUser];
      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);

      const { rerender, queryClient } = renderUseResumeOnLoad({
        getMessages: () => messages,
        onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
      });
      await act(async () => {
        await Promise.resolve();
      });

      const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      messages = [rootUser, newerResponse, olderResponse];
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      mockUseStreamStatus.mockReturnValue({
        isSuccess: true,
        isFetching: false,
        data: {
          active: true,
          status: 'running',
          createdAt: 4242,
          streamId: CONVERSATION_ID,
          resumeState: {
            aggregatedContent: [{ type: ContentTypes.TEXT, text: 'regenerating' }],
            responseMessageId: `${olderResponse.messageId}_`,
            userMessage: {
              messageId: rootUser.messageId,
              conversationId: CONVERSATION_ID,
            },
          },
        },
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      expect(invalidate).toHaveBeenCalledWith({
        queryKey: [QueryKeys.messages, CONVERSATION_ID],
      });
      const attached = observedSubmissions[observedSubmissions.length - 1];
      expect(attached?.isRegenerate).toBe(true);
      expect(attached?.initialResponse?.messageId).toBe(`${olderResponse.messageId}_`);
      expect(attached?.messages?.map((message) => message.messageId)).toEqual([
        rootUser.messageId,
        newerResponse.messageId,
        olderResponse.messageId,
      ]);
      expect(attached?.regenerateMessages?.map((message) => message.messageId)).toEqual([
        rootUser.messageId,
        newerResponse.messageId,
        olderResponse.messageId,
      ]);
    });

    it('re-arms once per run rather than on every poll of the active list', async () => {
      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);
      const { rerender } = renderUseResumeOnLoad({ messages: [] });
      await act(async () => {
        await Promise.resolve();
      });

      /** The job is listed, but the status read that answers the announcement
       *  finds it already finished — a run that ended between the two calls. */
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockUseStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID, true);

      mockUseStreamStatus.mockClear();
      /** The list keeps reporting the same job on its heartbeat. Each poll is a
       *  fresh fetch stamp, so the effect does run — only the elapsed-time gate
       *  stops it from re-reading status every time. */
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 3,
      });
      rerender();
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 4,
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockUseStreamStatus).not.toHaveBeenCalledWith(CONVERSATION_ID, true);
    });

    it('forces fresh status and history reads instead of trusting warm caches', async () => {
      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);
      const { rerender, queryClient } = renderUseResumeOnLoad({ messages: [] });
      await act(async () => {
        await Promise.resolve();
      });

      const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      /** An inactive status answered inside its `staleTime` is still fresh, so
       *  re-enabling the query would replay "nothing running" and the
       *  announcement would be consumed without ever attaching. */
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['streamStatus', CONVERSATION_ID],
      });
      /** History has to be authoritative whichever way the status lands: the
       *  resume submission and `finalHandler` both build on this snapshot. */
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: [QueryKeys.messages, CONVERSATION_ID],
      });
    });

    it('refetches history even when the announced run has already finished', async () => {
      const observedSubmissions: Array<TSubmission | null> = [];
      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);
      const { rerender, queryClient } = renderUseResumeOnLoad({
        messages: [buildUserMessage(CONVERSATION_ID)],
        onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
      });
      await act(async () => {
        await Promise.resolve();
      });

      const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      /** Announced, but the run ends before the status read answers. Nothing
       *  attaches — so the refetch is the entire repair, and without it the
       *  turns that other client just completed stay missing here. */
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      expect(observedSubmissions[observedSubmissions.length - 1]).toBeNull();
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: [QueryKeys.messages, CONVERSATION_ID],
      });
    });

    it('answers a second external run that never left the list', async () => {
      const nowSpy = jest.spyOn(Date, 'now');
      let clock = 1_000_000;
      nowSpy.mockImplementation(() => clock);

      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);
      const { rerender } = renderUseResumeOnLoad({ messages: [] });
      await act(async () => {
        await Promise.resolve();
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      mockUseStreamStatus.mockClear();
      /**
       * The first run ended and a second began between two polls of the active
       * list, so the list reads `[conversationId]` the whole time and never
       * shows the gap a latch would need. Only elapsed time distinguishes them.
       */
      clock += ACTIVE_JOB_REARM_INTERVAL_MS + 1;
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 3,
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockUseStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID, true);
      nowSpy.mockRestore();
    });

    it('re-arms again for the next run once the previous one leaves the list', async () => {
      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);
      const { rerender } = renderUseResumeOnLoad({ messages: [] });
      await act(async () => {
        await Promise.resolve();
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      mockUseActiveJobs.mockReturnValue({ data: { activeJobIds: [] }, dataUpdatedAt: 1 });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      mockUseStreamStatus.mockClear();
      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockUseStreamStatus).toHaveBeenCalledWith(CONVERSATION_ID, true);
    });

    it('does not re-arm for a conversation that is not the one being viewed', async () => {
      const observedSubmissions: Array<TSubmission | null> = [];
      mockUseStreamStatus.mockReturnValue(INACTIVE_STATUS);

      const { rerender } = renderUseResumeOnLoad({
        messages: [buildUserMessage(CONVERSATION_ID)],
        onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
      });
      await act(async () => {
        await Promise.resolve();
      });

      mockUseActiveJobs.mockReturnValue({
        data: { activeJobIds: [STALE_CONVERSATION_ID] },
        dataUpdatedAt: 2,
      });
      rerender();
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockUseStreamStatus).toHaveBeenLastCalledWith(CONVERSATION_ID, false);
      expect(observedSubmissions[observedSubmissions.length - 1]).toBeNull();
    });
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
        createdAt: 1234,
        generationProtocolVersion: 2,
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
    expect(
      (
        observedSubmissions[observedSubmissions.length - 1] as TSubmission & {
          resumeGenerationCreatedAt?: number;
          resumeGenerationProtocolVersion?: number;
        }
      ).resumeGenerationCreatedAt,
    ).toBe(1234);
    expect(
      (
        observedSubmissions[observedSubmissions.length - 1] as TSubmission & {
          resumeGenerationProtocolVersion?: number;
        }
      ).resumeGenerationProtocolVersion,
    ).toBe(2);
  });

  it('reprocesses the same conversation when a stale attachment hands off to a newer epoch', async () => {
    const observedSubmissions: Array<TSubmission | null> = [];
    const staleSubmission = buildSubmission(CONVERSATION_ID);
    const handoffStatus: StreamStatusResponse = {
      active: true,
      generationHandoff: true,
      generationProtocolVersion: 2,
      status: 'running',
      streamId: CONVERSATION_ID,
      createdAt: 2000,
      resumeState: {
        runSteps: [],
        aggregatedContent: [{ type: 'text', text: 'replacement content' }],
        responseMessageId: 'replacement-response',
        conversationId: CONVERSATION_ID,
        userMessage: {
          messageId: 'replacement-user',
          parentMessageId: String(Constants.NO_PARENT),
          conversationId: CONVERSATION_ID,
          text: 'Replacement prompt',
        },
      },
    };
    mockUseStreamStatus.mockReturnValue({
      isSuccess: true,
      isFetching: false,
      data: handoffStatus,
    });

    const rendered = renderUseResumeOnLoad({
      submission: staleSubmission,
      messages: [buildUserMessage(CONVERSATION_ID)],
      onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
    });

    await act(async () => {
      rendered.setSubmission(null);
      await Promise.resolve();
    });

    const replacement = observedSubmissions[observedSubmissions.length - 1] as TSubmission & {
      resumeStreamId?: string;
      resumeGenerationCreatedAt?: number;
    };
    expect(replacement.resumeStreamId).toBe(CONVERSATION_ID);
    expect(replacement.resumeGenerationCreatedAt).toBe(2000);
    expect(replacement.userMessage?.messageId).toBe('replacement-user');

    mockUseStreamStatus.mockReturnValue({
      isSuccess: true,
      isFetching: false,
      data: { ...handoffStatus },
    });
    rendered.rerender();

    await act(async () => {
      rendered.setSubmission(null);
      await Promise.resolve();
    });

    expect(observedSubmissions[observedSubmissions.length - 1]).toBeNull();
  });

  it('reprocesses a route when verification discovers a newly active generation', async () => {
    const observedSubmissions: Array<TSubmission | null> = [];
    let status: StreamStatusResponse = { active: false };
    mockUseStreamStatus.mockImplementation(() => ({
      isSuccess: true,
      isFetching: false,
      data: status,
    }));
    const rendered = renderUseResumeOnLoad({
      messages: [buildUserMessage(CONVERSATION_ID)],
      onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(observedSubmissions.filter(Boolean)).toHaveLength(0);

    status = {
      active: true,
      generationHandoff: true,
      generationProtocolVersion: 2,
      status: 'running',
      streamId: CONVERSATION_ID,
      createdAt: 2000,
      resumeState: {
        runSteps: [],
        aggregatedContent: [{ type: 'text', text: 'now active' }],
        responseMessageId: RESPONSE_MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        userMessage: {
          messageId: USER_MESSAGE_ID,
          parentMessageId: String(Constants.NO_PARENT),
          conversationId: CONVERSATION_ID,
          text: 'Hello',
        },
      },
    };
    rendered.rerender();

    await act(async () => {
      await Promise.resolve();
    });

    const resumed = observedSubmissions[observedSubmissions.length - 1] as TSubmission & {
      resumeStreamId?: string;
      resumeGenerationCreatedAt?: number;
    };
    expect(resumed.resumeStreamId).toBe(CONVERSATION_ID);
    expect(resumed.resumeGenerationCreatedAt).toBe(2000);

    await act(async () => {
      rendered.setSubmission(null);
      await Promise.resolve();
    });
    expect(
      observedSubmissions.filter(
        (candidate) =>
          (candidate as (TSubmission & { resumeGenerationCreatedAt?: number }) | null)
            ?.resumeGenerationCreatedAt === 2000,
      ),
    ).toHaveLength(1);
  });

  it('reprocesses a route when verification discovers an active protocol-v1 generation', async () => {
    const observedSubmissions: Array<TSubmission | null> = [];
    let status: StreamStatusResponse = { active: false };
    mockUseStreamStatus.mockImplementation(() => ({
      isSuccess: true,
      isFetching: false,
      data: status,
    }));
    const rendered = renderUseResumeOnLoad({
      messages: [buildUserMessage(CONVERSATION_ID)],
      onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
    });

    await act(async () => {
      await Promise.resolve();
    });

    status = {
      active: true,
      generationHandoff: true,
      generationProtocolVersion: 1,
      status: 'running',
      streamId: CONVERSATION_ID,
      resumeState: {
        runSteps: [],
        aggregatedContent: [{ type: 'text', text: 'legacy generation' }],
        responseMessageId: RESPONSE_MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        userMessage: {
          messageId: USER_MESSAGE_ID,
          parentMessageId: String(Constants.NO_PARENT),
          conversationId: CONVERSATION_ID,
          text: 'Hello',
        },
      },
    };
    rendered.rerender();

    await act(async () => {
      await Promise.resolve();
    });

    const resumed = observedSubmissions[observedSubmissions.length - 1] as TSubmission & {
      resumeStreamId?: string;
      resumeGenerationProtocolVersion?: number;
    };
    expect(resumed.resumeStreamId).toBe(CONVERSATION_ID);
    expect(resumed.resumeGenerationProtocolVersion).toBe(1);

    await act(async () => {
      rendered.setSubmission(null);
      await Promise.resolve();
    });
    expect(
      observedSubmissions.filter(
        (candidate) =>
          (candidate as (TSubmission & { resumeGenerationProtocolVersion?: number }) | null)
            ?.resumeGenerationProtocolVersion === 1,
      ),
    ).toHaveLength(1);
  });

  it('treats the empty submission sentinel as idle for a verified handoff', async () => {
    const observedSubmissions: Array<TSubmission | null> = [];
    let status: StreamStatusResponse = { active: false };
    mockUseStreamStatus.mockImplementation(() => ({
      isSuccess: true,
      isFetching: false,
      data: status,
    }));
    const rendered = renderUseResumeOnLoad({
      submission: {} as TSubmission,
      messages: [buildUserMessage(CONVERSATION_ID)],
      onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
    });

    await act(async () => {
      await Promise.resolve();
    });

    status = {
      active: true,
      generationHandoff: true,
      generationProtocolVersion: 2,
      status: 'running',
      streamId: CONVERSATION_ID,
      createdAt: 2000,
      resumeState: {
        runSteps: [],
        aggregatedContent: [{ type: 'text', text: 'handoff content' }],
        responseMessageId: RESPONSE_MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        userMessage: {
          messageId: USER_MESSAGE_ID,
          parentMessageId: String(Constants.NO_PARENT),
          conversationId: CONVERSATION_ID,
          text: 'Hello',
        },
      },
    };
    rendered.rerender();

    await act(async () => {
      await Promise.resolve();
    });

    const resumed = observedSubmissions[observedSubmissions.length - 1] as TSubmission & {
      resumeGenerationCreatedAt?: number;
    };
    expect(resumed.resumeGenerationCreatedAt).toBe(2000);
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

  it('prefers the exact active response over an older assistant sibling', async () => {
    const observedSubmissions: Array<TSubmission | null> = [];
    const userMessage = buildUserMessage(CONVERSATION_ID);
    const olderSibling = {
      messageId: 'older-sibling-response',
      parentMessageId: userMessage.messageId,
      conversationId: CONVERSATION_ID,
      text: 'Older sibling',
      isCreatedByUser: false,
    } as TMessage;
    const activeResponse = {
      messageId: 'active-response',
      parentMessageId: userMessage.messageId,
      conversationId: CONVERSATION_ID,
      text: '',
      isCreatedByUser: false,
      unfinished: true,
    } as TMessage;

    mockUseStreamStatus.mockReturnValue({
      isSuccess: true,
      isFetching: false,
      data: {
        active: true,
        status: 'running',
        streamId: CONVERSATION_ID,
        resumeState: {
          runSteps: [],
          aggregatedContent: [{ type: 'text', text: 'Active branch streaming' }],
          responseMessageId: activeResponse.messageId,
          conversationId: CONVERSATION_ID,
          userMessage: {
            messageId: userMessage.messageId,
            parentMessageId: userMessage.parentMessageId,
            conversationId: CONVERSATION_ID,
            text: userMessage.text,
          },
        },
      },
    });

    renderUseResumeOnLoad({
      messages: [userMessage, olderSibling, activeResponse],
      onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
    });

    await act(async () => {
      await Promise.resolve();
    });

    const submission = observedSubmissions[observedSubmissions.length - 1];
    expect(submission?.initialResponse?.messageId).toBe(activeResponse.messageId);
    expect((submission?.messages ?? []).map((message) => message.messageId)).toEqual([
      olderSibling.messageId,
    ]);
  });

  it('does not claim an older sibling when resume state omits the response ID', async () => {
    const observedSubmissions: Array<TSubmission | null> = [];
    const userMessage = buildUserMessage(CONVERSATION_ID);
    const olderSibling = {
      messageId: 'older-sibling-response',
      parentMessageId: userMessage.messageId,
      conversationId: CONVERSATION_ID,
      text: 'Older sibling',
      isCreatedByUser: false,
    } as TMessage;

    mockUseStreamStatus.mockReturnValue({
      isSuccess: true,
      isFetching: false,
      data: {
        active: true,
        status: 'running',
        streamId: CONVERSATION_ID,
        resumeState: {
          runSteps: [],
          aggregatedContent: [{ type: 'text', text: 'Active branch streaming' }],
          conversationId: CONVERSATION_ID,
          userMessage: {
            messageId: userMessage.messageId,
            parentMessageId: userMessage.parentMessageId,
            conversationId: CONVERSATION_ID,
            text: userMessage.text,
          },
        },
      },
    });

    renderUseResumeOnLoad({
      messages: [userMessage, olderSibling],
      onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
    });

    await act(async () => {
      await Promise.resolve();
    });

    const submission = observedSubmissions[observedSubmissions.length - 1];
    expect(submission?.initialResponse?.messageId).toBe(`${userMessage.messageId}_`);
    expect((submission?.messages ?? []).map((message) => message.messageId)).toEqual([
      olderSibling.messageId,
    ]);
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

  it('restores the regenerate branch without claiming its older response', async () => {
    const rootUser = buildUserMessage(CONVERSATION_ID, 'root-user');
    const olderResponse = {
      messageId: 'older-response',
      parentMessageId: rootUser.messageId,
      conversationId: CONVERSATION_ID,
      text: 'Older response',
      sender: 'Agent One',
      model: 'gpt-5',
      iconURL: 'https://example.com/agent-one.png',
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
      // Put the unrelated sibling first: parent-only fallback would select it.
      messages: [rootUser, newerResponse, olderResponse],
      siblingIndexParentId: rootUser.messageId,
      onSiblingIndex: (siblingIndex) => observedSiblingIndexes.push(siblingIndex),
      onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(observedSiblingIndexes[observedSiblingIndexes.length - 1]).toBe(0);
    const submission = observedSubmissions[observedSubmissions.length - 1];
    expect(submission?.initialResponse?.messageId).toBe(`${olderResponse.messageId}_`);
    expect(submission?.initialResponse).toEqual(
      expect.objectContaining({
        sender: olderResponse.sender,
        model: olderResponse.model,
        iconURL: olderResponse.iconURL,
      }),
    );
    expect(submission?.isRegenerate).toBe(true);
    expect((submission?.messages ?? []).map((message) => message.messageId)).toEqual([
      rootUser.messageId,
      newerResponse.messageId,
      olderResponse.messageId,
    ]);
    expect((submission?.regenerateMessages ?? []).map((message) => message.messageId)).toEqual([
      rootUser.messageId,
      newerResponse.messageId,
      olderResponse.messageId,
    ]);
  });

  it('preserves an exact-ID edited regeneration branch for early-abort rollback', async () => {
    const rootUser = buildUserMessage(CONVERSATION_ID, 'root-user');
    const editedResponse = {
      messageId: 'edited-response',
      parentMessageId: rootUser.messageId,
      conversationId: CONVERSATION_ID,
      text: 'Original response before the edit',
      isCreatedByUser: false,
    } as TMessage;
    const siblingResponse = {
      messageId: 'sibling-response',
      parentMessageId: rootUser.messageId,
      conversationId: CONVERSATION_ID,
      text: 'Unrelated sibling',
      isCreatedByUser: false,
    } as TMessage;
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
          aggregatedContent: [],
          responseMessageId: editedResponse.messageId,
          isRegenerate: true,
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
      messages: [rootUser, siblingResponse, editedResponse],
      onSubmission: (currentSubmission) => observedSubmissions.push(currentSubmission),
    });

    await act(async () => {
      await Promise.resolve();
    });

    const submission = observedSubmissions[observedSubmissions.length - 1];
    expect(submission?.isRegenerate).toBe(true);
    expect(submission?.initialResponse?.messageId).toBe(editedResponse.messageId);
    expect(submission?.messages?.map((message) => message.messageId)).toEqual([
      rootUser.messageId,
      siblingResponse.messageId,
    ]);
    expect(submission?.regenerateMessages?.map((message) => message.messageId)).toEqual([
      rootUser.messageId,
      siblingResponse.messageId,
      editedResponse.messageId,
    ]);
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
          createdAt: 1234,
          generationProtocolVersion: 2,
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
        {
          steerId: 'queued-1',
          text: 'still queued',
          status: 'pending',
          createdAt: 5,
          files,
          generationCreatedAt: 1234,
          generationProtocolVersion: 2,
        },
      ]);
    });

    it('seeds the pending snapshot before settling an inline applied steer', async () => {
      const observedSteers: PendingSteer[][] = [];
      mockUseStreamStatus.mockReturnValue({
        isSuccess: true,
        isFetching: false,
        data: {
          active: true,
          status: 'running',
          streamId: CONVERSATION_ID,
          resumeState: {
            runSteps: [],
            pendingSteers: [
              {
                steerId: 'steer-snapshot-race',
                clientSteerId: 'local-snapshot-race',
                text: 'applied at snapshot boundary',
                createdAt: 5,
              },
            ],
            aggregatedContent: [
              {
                type: ContentTypes.STEER,
                steerId: 'steer-snapshot-race',
                clientSteerId: 'local-snapshot-race',
                steer: 'applied at snapshot boundary',
              },
            ],
            responseMessageId: RESPONSE_MESSAGE_ID,
            conversationId: CONVERSATION_ID,
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
        messages: [buildUserMessage(CONVERSATION_ID)],
        onPendingSteers: (steers) => observedSteers.push(steers),
      });

      await act(async () => {
        await Promise.resolve();
      });

      // The status snapshot and aggregated content can straddle the same apply
      // boundary. Restore-then-settle must finish with no resurrected chip.
      expect(observedSteers[observedSteers.length - 1]).toEqual([]);
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
