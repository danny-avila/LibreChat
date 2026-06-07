import { RecoilRoot, useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { renderHook, act } from '@testing-library/react';

import type { TMessage, TConversation, TSubmission } from 'librechat-data-provider';
import type { MutableSnapshot } from 'recoil';
import type { ReactNode } from 'react';

import useResumeOnLoad from '../useResumeOnLoad';
import store from '~/store';

const mockUseStreamStatus = jest.fn();

jest.mock('~/data-provider', () => ({
  useStreamStatus: (conversationId: string | undefined, enabled: boolean) =>
    mockUseStreamStatus(conversationId, enabled),
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
}: {
  messages?: TMessage[];
  getMessages?: () => TMessage[] | undefined;
  submission?: TSubmission | null;
  conversationId?: string;
  messagesLoaded?: boolean;
  onSubmission?: (submission: TSubmission | null) => void;
  siblingIndexParentId?: string;
  onSiblingIndex?: (siblingIndex: number) => void;
}) {
  const getMessages = jest.fn(getMessagesOverride ?? (() => messages));
  const initializeState = (snapshot: MutableSnapshot) => {
    snapshot.set(store.conversationByIndex(0), buildConversation(conversationId));
    snapshot.set(store.submissionByIndex(0), submission);
  };

  const SubmissionProbe = () => {
    const currentSubmission = useRecoilValue(store.submissionByIndex(0));
    onSubmission?.(currentSubmission);
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
    <RecoilRoot initializeState={initializeState}>
      <SubmissionProbe />
      <SiblingIndexProbe />
      {children}
    </RecoilRoot>
  );

  return {
    getMessages,
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
});
