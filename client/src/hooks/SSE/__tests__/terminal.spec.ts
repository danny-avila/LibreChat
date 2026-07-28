import { Constants } from 'librechat-data-provider';
import type { TMessage, TSubmission } from 'librechat-data-provider';
import {
  getPersistedRunState,
  getRunRecoveryTarget,
  getStatusRunOutcome,
  getUnreconciledAssistantTail,
  isRetryableTerminalError,
  preserveMessagesAfterRecoveryTarget,
  recoveryOwnsCurrentRoute,
  submissionBelongsToConversation,
  withCurrentSearch,
} from '../terminal';

const CONVERSATION_ID = 'conversation-1';
const USER_MESSAGE_ID = 'user-1';

function buildUserMessage(): TMessage {
  return {
    messageId: USER_MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    parentMessageId: Constants.NO_PARENT,
    isCreatedByUser: true,
    text: 'Hello',
  } as TMessage;
}

function buildAssistantMessage(overrides: Partial<TMessage> = {}): TMessage {
  return {
    messageId: 'response-1',
    conversationId: CONVERSATION_ID,
    parentMessageId: USER_MESSAGE_ID,
    isCreatedByUser: false,
    text: 'Done',
    createdAt: '2026-07-28T08:00:00.000Z',
    updatedAt: '2026-07-28T08:00:00.000Z',
    ...overrides,
  } as TMessage;
}

describe('terminal recovery policy', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it.each([
    ['complete', 'completed'],
    ['error', 'error'],
    ['aborted', 'aborted'],
    ['running', undefined],
  ] as const)('maps status %s to %s', (status, outcome) => {
    expect(getStatusRunOutcome({ active: false, status })).toBe(outcome);
  });

  it.each([
    [buildAssistantMessage(), false],
    [buildAssistantMessage({ messageId: 'response-1_' }), true],
    [buildAssistantMessage({ createdAt: undefined }), true],
    [buildAssistantMessage({ updatedAt: undefined }), true],
    [buildUserMessage(), false],
  ])('detects whether the assistant tail needs reconciliation', (message, expected) => {
    expect(getUnreconciledAssistantTail([message]) != null).toBe(expected);
  });

  it('prefers stored run identity over the provisional message tail', () => {
    expect(
      getRunRecoveryTarget(
        {
          startedAsNewConvo: false,
          created: true,
          userMessageId: 'stored-user',
          responseMessageId: 'stored-response',
        },
        [
          buildAssistantMessage({
            messageId: 'provisional-response_',
            parentMessageId: 'provisional-user',
          }),
        ],
      ),
    ).toEqual({
      userMessageId: 'stored-user',
      responseMessageId: 'stored-response',
    });
  });

  it('preserves local turns appended after the recovered response', () => {
    const recoveredResponse = buildAssistantMessage();
    const failedUserMessage = {
      ...buildUserMessage(),
      messageId: 'failed-user',
      parentMessageId: recoveredResponse.messageId,
      text: 'Follow-up that failed to start',
    };
    const failedResponse = buildAssistantMessage({
      messageId: 'failed-response_',
      parentMessageId: failedUserMessage.messageId,
      text: 'Failed to start',
      createdAt: undefined,
      updatedAt: undefined,
      error: true,
    });

    expect(
      preserveMessagesAfterRecoveryTarget(
        [buildUserMessage(), recoveredResponse],
        [
          buildUserMessage(),
          buildAssistantMessage({
            messageId: 'response-1_',
            createdAt: undefined,
            updatedAt: undefined,
          }),
          failedUserMessage,
          failedResponse,
        ],
        {
          userMessageId: USER_MESSAGE_ID,
          responseMessageId: 'response-1_',
        },
      ),
    ).toEqual([buildUserMessage(), recoveredResponse, failedUserMessage, failedResponse]);
  });

  it('does not duplicate later messages already returned by the server', () => {
    const recoveredResponse = buildAssistantMessage();
    const laterUserMessage = {
      ...buildUserMessage(),
      messageId: 'later-user',
      parentMessageId: recoveredResponse.messageId,
    };

    expect(
      preserveMessagesAfterRecoveryTarget(
        [buildUserMessage(), recoveredResponse, laterUserMessage],
        [
          buildUserMessage(),
          buildAssistantMessage({
            messageId: 'response-1_',
            createdAt: undefined,
            updatedAt: undefined,
          }),
          laterUserMessage,
        ],
        {
          userMessageId: USER_MESSAGE_ID,
          responseMessageId: 'response-1_',
        },
      ),
    ).toEqual([buildUserMessage(), recoveredResponse, laterUserMessage]);
  });

  it('matches a persisted response when the provisional id loses its suffix', () => {
    expect(
      getPersistedRunState([buildUserMessage(), buildAssistantMessage()], {
        userMessageId: USER_MESSAGE_ID,
        responseMessageId: 'response-1_',
      }),
    ).toMatchObject({
      outcome: 'completed',
      responseFound: true,
    });
  });

  it('uses the parent fallback only for a provisional response id', () => {
    const messages = [
      buildUserMessage(),
      buildAssistantMessage({ messageId: 'server-response-id' }),
    ];

    expect(
      getPersistedRunState(messages, {
        userMessageId: USER_MESSAGE_ID,
        responseMessageId: 'client-response_',
      }),
    ).toMatchObject({
      outcome: 'completed',
      responseFound: true,
    });
    expect(
      getPersistedRunState(messages, {
        userMessageId: USER_MESSAGE_ID,
        responseMessageId: 'different-final-response',
      }),
    ).toEqual({
      outcome: undefined,
      responseFound: false,
      userMessageFound: true,
    });
  });

  it.each([
    [buildAssistantMessage({ error: true }), 'error'],
    [buildAssistantMessage({ unfinished: true }), 'aborted'],
    [buildAssistantMessage(), 'completed'],
  ])('derives the persisted assistant outcome', (response, outcome) => {
    expect(
      getPersistedRunState([buildUserMessage(), response], {
        userMessageId: USER_MESSAGE_ID,
        responseMessageId: response.messageId,
      }).outcome,
    ).toBe(outcome);
  });

  it.each([
    [undefined, true],
    [{}, true],
    [{ status: 408 }, true],
    [{ response: { status: 429 } }, true],
    [{ status: 503 }, true],
    [{ status: 404 }, false],
    [{ response: { status: 400 } }, false],
  ])('classifies terminal retryability', (error, retryable) => {
    expect(isRetryableTerminalError(error)).toBe(retryable);
  });

  it('recognizes recovery ownership during first-turn route adoption', () => {
    window.history.replaceState({}, '', `/c/${CONVERSATION_ID}`);

    expect(recoveryOwnsCurrentRoute(`/c/${Constants.NEW_CONVO}`, CONVERSATION_ID)).toBe(true);
    expect(recoveryOwnsCurrentRoute('/c/another-conversation', CONVERSATION_ID)).toBe(false);
  });

  it('preserves the current search when navigating after recovery', () => {
    window.history.replaceState({}, '', '/c/new?projectId=project-1');

    expect(withCurrentSearch(`/c/${CONVERSATION_ID}`)).toBe(
      `/c/${CONVERSATION_ID}?projectId=project-1`,
    );
  });

  it('matches a submission through any of its conversation-bearing fields', () => {
    const submission = {
      conversation: { conversationId: 'another-conversation' },
      userMessage: { conversationId: CONVERSATION_ID },
      initialResponse: { conversationId: 'third-conversation' },
    } as TSubmission;

    expect(submissionBelongsToConversation(submission, CONVERSATION_ID)).toBe(true);
    expect(submissionBelongsToConversation(submission, 'missing-conversation')).toBe(false);
  });
});
