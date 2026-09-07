import { Types } from 'mongoose';
import { Constants } from 'librechat-data-provider';
import type { IConversation, IMessage } from '@librechat/data-schemas';
import type { Response } from './types';
import {
  buildStoredResponseMetadata,
  filterCommittedResponseMessages,
  getStoredResponseSnapshot,
  persistStoredResponse,
  resolveStoredResponse,
  revalidateStoredResponseConversation,
  selectStoredResponseHistory,
  type StoredResponseLookup,
  type StoredResponseWriteDependencies,
} from './persistence';

const DEFAULT_MESSAGE_OBJECT_ID = new Types.ObjectId();

const conversation = (overrides: Partial<IConversation> = {}): IConversation =>
  ({
    conversationId: '11111111-1111-4111-8111-111111111111',
    user: 'owner',
    messages: [DEFAULT_MESSAGE_OBJECT_ID],
    isTemporary: false,
    expiredAt: null,
    ...overrides,
  }) as IConversation;

const message = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    messageId: 'resp_target',
    conversationId: '11111111-1111-4111-8111-111111111111',
    user: 'owner',
    _id: DEFAULT_MESSAGE_OBJECT_ID,
    isCreatedByUser: false,
    isUserSubmitted: false,
    parentMessageId: 'input-target',
    isTemporary: false,
    expiredAt: null,
    metadata: buildStoredResponseMetadata(response(), 'committed'),
    ...overrides,
  }) as IMessage;

describe('Responses persistence', () => {
  it('resolves a canonical response through its owned assistant message', async () => {
    const storedConversation = conversation();
    const storedMessage = message();
    const deps: StoredResponseLookup = {
      getMessage: jest.fn().mockResolvedValue(storedMessage),
      getConvo: jest.fn().mockResolvedValue(storedConversation),
    };

    await expect(resolveStoredResponse(deps, 'owner', 'resp_target')).resolves.toEqual({
      status: 'found',
      reference: {
        conversation: storedConversation,
        conversationId: storedConversation.conversationId,
        responseMessage: storedMessage,
      },
    });
    expect(deps.getMessage).toHaveBeenCalledWith({ user: 'owner', messageId: 'resp_target' });
    expect(deps.getConvo).toHaveBeenCalledWith('owner', storedMessage.conversationId);
  });

  it.each([
    ['user message', message({ isCreatedByUser: true })],
    ['user-submitted assistant message', message({ isUserSubmitted: true })],
    ['Responses caller input', message({ metadata: { responsesInput: { role: 'assistant' } } })],
    ['temporary message', message({ isTemporary: true })],
    ['expired message', message({ expiredAt: new Date(0) })],
  ])('rejects a %s response target', async (_label, storedMessage) => {
    const deps: StoredResponseLookup = {
      getMessage: jest.fn().mockResolvedValue(storedMessage),
      getConvo: jest.fn(),
    };

    await expect(resolveStoredResponse(deps, 'owner', 'resp_target')).resolves.toEqual({
      status: 'not_found',
    });
    expect(deps.getConvo).not.toHaveBeenCalled();
  });

  it('rejects a canonical response that was staged but not committed', async () => {
    const storedMessage = message({ metadata: buildStoredResponseMetadata(response(), 'pending') });
    const deps: StoredResponseLookup = {
      getMessage: jest.fn().mockResolvedValue(storedMessage),
      getConvo: jest.fn().mockResolvedValue(conversation()),
    };

    await expect(resolveStoredResponse(deps, 'owner', 'resp_target')).resolves.toEqual({
      status: 'not_found',
    });
  });

  it('rejects hidden conversations and classifies child threads as read-only', async () => {
    const getMessage = jest.fn().mockResolvedValue(message());
    const temporary: StoredResponseLookup = {
      getMessage,
      getConvo: jest.fn().mockResolvedValue(conversation({ isTemporary: true })),
    };
    const child: StoredResponseLookup = {
      getMessage,
      getConvo: jest.fn().mockResolvedValue(
        conversation({
          subagentThread: {
            parentMessageId: 'parent-message',
            rootConversationId: 'root',
            parentConversationId: 'parent',
            parentToolCallId: 'tool-call',
            subagentType: 'worker',
            subagentKind: 'agent',
            depth: 1,
          },
        }),
      ),
    };

    await expect(resolveStoredResponse(temporary, 'owner', 'resp_target')).resolves.toEqual({
      status: 'not_found',
    });
    await expect(resolveStoredResponse(child, 'owner', 'resp_target')).resolves.toEqual({
      status: 'read_only',
    });
  });

  it('preserves legacy conversation-id lookup behavior', async () => {
    const storedConversation = conversation();
    const deps: StoredResponseLookup = {
      getMessage: jest.fn(),
      getConvo: jest.fn().mockResolvedValue(storedConversation),
    };

    await expect(
      resolveStoredResponse(deps, 'owner', storedConversation.conversationId),
    ).resolves.toEqual({
      status: 'found',
      reference: {
        conversation: storedConversation,
        conversationId: storedConversation.conversationId,
        responseMessage: null,
      },
    });
    expect(deps.getMessage).not.toHaveBeenCalled();
  });

  it('revalidates the conversation while retaining the resolved response target', async () => {
    const storedConversation = conversation({ title: 'fresh' });
    const storedMessage = message();
    const deps = { getConvo: jest.fn().mockResolvedValue(storedConversation) };

    await expect(
      revalidateStoredResponseConversation(deps, 'owner', {
        conversation: conversation({ title: 'stale' }),
        conversationId: storedConversation.conversationId,
        responseMessage: storedMessage,
      }),
    ).resolves.toEqual({
      status: 'found',
      reference: {
        conversation: storedConversation,
        conversationId: storedConversation.conversationId,
        responseMessage: storedMessage,
      },
    });
    expect(deps.getConvo).toHaveBeenCalledTimes(1);
    expect(deps.getConvo).toHaveBeenCalledWith('owner', storedConversation.conversationId);
  });

  it('selects only the target response branch', () => {
    const messages = [
      message({ messageId: 'root', parentMessageId: String(Constants.NO_PARENT) }),
      message({ messageId: 'input-a', parentMessageId: 'root', isCreatedByUser: true }),
      message({ messageId: 'resp_a', parentMessageId: 'input-a' }),
      message({ messageId: 'input-b', parentMessageId: 'root', isCreatedByUser: true }),
      message({ messageId: 'resp_b', parentMessageId: 'input-b' }),
    ];

    expect(selectStoredResponseHistory(messages, 'resp_a').map((item) => item.messageId)).toEqual([
      'root',
      'input-a',
      'resp_a',
    ]);
  });

  it('supports flat legacy Responses history without admitting malformed branches', () => {
    const legacy = [
      message({ messageId: 'input', parentMessageId: null, isCreatedByUser: true }),
      message({ messageId: 'resp_old', parentMessageId: null }),
    ];
    const broken = [
      message({ messageId: 'unrelated', parentMessageId: String(Constants.NO_PARENT) }),
      message({ messageId: 'resp_broken', parentMessageId: 'missing' }),
    ];

    expect(selectStoredResponseHistory(legacy, 'resp_old')).toEqual(legacy);
    expect(selectStoredResponseHistory(broken, 'resp_broken')).toEqual([]);
  });

  it('prepends the flat legacy prefix when a canonical branch reaches its last flat response', () => {
    const messages = [
      message({ messageId: 'legacy-input', parentMessageId: null, isCreatedByUser: true }),
      message({ messageId: 'legacy-response', parentMessageId: null }),
      message({
        messageId: 'canonical-input',
        parentMessageId: 'legacy-response',
        isCreatedByUser: true,
      }),
      message({ messageId: 'resp_canonical', parentMessageId: 'canonical-input' }),
      message({
        messageId: 'sibling-input',
        parentMessageId: 'legacy-response',
        isCreatedByUser: true,
      }),
      message({ messageId: 'resp_sibling', parentMessageId: 'sibling-input' }),
    ];

    expect(
      selectStoredResponseHistory(messages, 'resp_canonical').map((item) => item.messageId),
    ).toEqual(['legacy-input', 'legacy-response', 'canonical-input', 'resp_canonical']);
  });

  it('admits marked inputs only with their exact committed output and preserves unmarked legacy rows', () => {
    const committedOutput = message();
    const committedInput = message({
      messageId: 'input-committed',
      isCreatedByUser: true,
      isUserSubmitted: true,
      metadata: {
        responsesTurn: { version: 1, responseId: 'resp_target' },
        responsesInput: { role: 'user' },
      },
    });
    const pendingOutput = message({
      messageId: 'resp_pending',
      metadata: buildStoredResponseMetadata(
        response({ id: 'resp_pending', previous_response_id: null }),
        'pending',
      ),
    });
    const pendingInput = message({
      messageId: 'input-pending',
      isCreatedByUser: true,
      isUserSubmitted: true,
      metadata: {
        responsesTurn: { version: 1, responseId: 'resp_pending' },
        responsesInput: { role: 'user' },
      },
    });
    const malformedMarker = message({
      messageId: 'malformed-marker',
      metadata: { responsesTurn: { version: 99, responseId: 'resp_target' } },
    });
    const legacy = message({ messageId: 'legacy', metadata: undefined });

    expect(
      filterCommittedResponseMessages([
        committedInput,
        committedOutput,
        pendingInput,
        pendingOutput,
        malformedMarker,
        legacy,
      ]),
    ).toEqual([committedInput, committedOutput, legacy]);
  });

  it('round-trips the exact stored output, usage, and predecessor snapshot', () => {
    const storedResponse = response();
    const storedMessage = message({ metadata: buildStoredResponseMetadata(storedResponse) });

    expect(getStoredResponseSnapshot(storedMessage)).toEqual({
      output: storedResponse.output,
      usage: storedResponse.usage,
      previousResponseId: storedResponse.previous_response_id,
    });
  });

  it('stages a turn and publishes all message ids through one manifest commit', async () => {
    const inputId = new Types.ObjectId();
    const outputId = new Types.ObjectId();
    const saveMessage = jest
      .fn()
      .mockResolvedValueOnce(message({ _id: inputId, messageId: 'input' }))
      .mockResolvedValueOnce(message({ _id: outputId, messageId: 'resp_target' }));
    const saveConvo = jest
      .fn()
      .mockResolvedValueOnce(conversation({ messages: [] }))
      .mockImplementationOnce((_context, _data, metadata) =>
        conversation({ messages: metadata?.appendMessageIds }),
      );
    const params = persistenceParams({ saveConvo, saveMessage });

    await expect(persistStoredResponse(params)).resolves.toMatchObject({
      conversation: { conversationId: params.conversation.data.conversationId },
      outputMessage: { messageId: 'resp_target' },
    });
    expect(saveConvo).toHaveBeenNthCalledWith(
      1,
      params.context,
      params.conversation.data,
      expect.objectContaining({ appendMessageIds: [] }),
    );
    expect(saveConvo).toHaveBeenNthCalledWith(
      2,
      params.context,
      params.conversation.data,
      expect.objectContaining({ appendMessageIds: [inputId, outputId], noUpsert: true }),
    );
    expect(saveMessage.mock.calls[1][1].metadata).toEqual(
      buildStoredResponseMetadata(params.response),
    );
    expect(params.deps.commitStoredResponseTurn).toHaveBeenCalledWith({
      userId: params.context.userId,
      conversationId: params.conversation.data.conversationId,
      responseId: params.responseId,
    });
    expect(saveMessage.mock.calls[0][1].metadata).toEqual(
      expect.objectContaining({
        responsesTurn: { version: 1, responseId: params.responseId },
      }),
    );
  });

  it('accepts a lost manifest-write result only after read-back proves the commit', async () => {
    const inputId = new Types.ObjectId();
    const outputId = new Types.ObjectId();
    const committedConversation = conversation({ messages: [inputId, outputId] });
    const saveConvo = jest
      .fn()
      .mockResolvedValueOnce(conversation({ messages: [] }))
      .mockRejectedValueOnce(new Error('acknowledgement lost'));
    const params = persistenceParams({
      saveConvo,
      saveMessage: stagedMessages(inputId, outputId),
      getConvo: jest.fn().mockResolvedValue(committedConversation),
    });

    await expect(persistStoredResponse(params)).resolves.toMatchObject({
      conversation: committedConversation,
    });
    expect(saveConvo).toHaveBeenCalledTimes(2);
  });

  it('accepts an indeterminate marker result only after read-back proves the commit', async () => {
    const inputId = new Types.ObjectId();
    const outputId = new Types.ObjectId();
    const committedOutput = message({ _id: outputId });
    const params = persistenceParams({
      saveConvo: jest
        .fn()
        .mockResolvedValueOnce(conversation({ messages: [] }))
        .mockResolvedValueOnce(conversation({ messages: [inputId, outputId] })),
      saveMessage: stagedMessages(inputId, outputId),
      commitStoredResponseTurn: jest.fn().mockRejectedValue(new Error('acknowledgement lost')),
      getMessage: jest.fn().mockResolvedValue(committedOutput),
    });

    await expect(persistStoredResponse(params)).resolves.toMatchObject({
      outputMessage: committedOutput,
    });
    expect(params.deps.commitStoredResponseTurn).toHaveBeenCalledTimes(1);
  });

  it('never rolls back a turn after an indeterminate marker write', async () => {
    const inputId = new Types.ObjectId();
    const outputId = new Types.ObjectId();
    let markerState = 'pending';
    const params = persistenceParams({
      saveConvo: jest
        .fn()
        .mockResolvedValueOnce(conversation({ messages: [] }))
        .mockResolvedValueOnce(conversation({ messages: [inputId, outputId] })),
      saveMessage: stagedMessages(inputId, outputId),
      commitStoredResponseTurn: jest.fn().mockImplementation(async () => {
        markerState = 'committed';
        throw new Error('acknowledgement lost');
      }),
      getMessage: jest.fn().mockRejectedValue(new Error('readback unavailable')),
    });

    await expect(persistStoredResponse(params)).rejects.toThrow('readback unavailable');
    expect(markerState).toBe('committed');
    expect(params.deps.commitStoredResponseTurn).toHaveBeenCalledTimes(2);
    expect(params.deps.deleteStoredResponseTurn).not.toHaveBeenCalled();
  });

  it('retries one incomplete manifest append without upserting', async () => {
    const inputId = new Types.ObjectId();
    const outputId = new Types.ObjectId();
    const saveConvo = jest
      .fn()
      .mockResolvedValueOnce(conversation({ messages: [] }))
      .mockResolvedValueOnce({ message: 'write failed' })
      .mockResolvedValueOnce(conversation({ messages: [inputId, outputId] }));
    const getConvo = jest.fn().mockResolvedValue(conversation({ messages: [] }));
    const params = persistenceParams({
      saveConvo,
      saveMessage: stagedMessages(inputId, outputId),
      getConvo,
    });

    await expect(persistStoredResponse(params)).resolves.toBeDefined();
    expect(saveConvo).toHaveBeenCalledTimes(3);
    expect(saveConvo.mock.calls[1][2]).toEqual(
      expect.objectContaining({ appendMessageIds: [inputId, outputId], noUpsert: true }),
    );
    expect(saveConvo.mock.calls[2][2]).toEqual(
      expect.objectContaining({ appendMessageIds: [inputId, outputId], noUpsert: true }),
    );
  });

  it('fails when deletion wins during staging and never upserts the final manifest', async () => {
    const inputId = new Types.ObjectId();
    const outputId = new Types.ObjectId();
    const saveConvo = jest
      .fn()
      .mockResolvedValueOnce(conversation({ messages: [] }))
      .mockResolvedValueOnce(null);
    const params = persistenceParams({
      saveConvo,
      saveMessage: stagedMessages(inputId, outputId),
      getConvo: jest.fn().mockResolvedValue(null),
    });

    await expect(persistStoredResponse(params)).rejects.toThrow(
      'Conversation was deleted before message references were stored',
    );
    expect(saveConvo.mock.calls[1][2]).toEqual(expect.objectContaining({ noUpsert: true }));
    expect(params.deps.deleteStoredResponseTurn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['input', jest.fn().mockResolvedValue(undefined)],
    [
      'output',
      jest
        .fn()
        .mockResolvedValueOnce(message({ _id: new Types.ObjectId(), messageId: 'input' }))
        .mockResolvedValueOnce(message({ _id: undefined, messageId: 'resp_target' })),
    ],
  ])('does not publish a turn with a missing %s message id', async (_label, saveMessage) => {
    const saveConvo = jest.fn().mockResolvedValue(conversation({ messages: [] }));
    const params = persistenceParams({ saveConvo, saveMessage });

    await expect(persistStoredResponse(params)).rejects.toThrow(/message could not be stored/);
    expect(saveConvo).toHaveBeenCalledTimes(1);
    expect(params.deps.deleteStoredResponseTurn).toHaveBeenCalledTimes(1);
  });
});

function response(overrides: Partial<Response> = {}): Response {
  return {
    id: 'resp_target',
    status: 'completed',
    previous_response_id: 'resp_previous',
    output: [
      {
        type: 'message',
        id: 'message-output',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'Answer', annotations: [], logprobs: [] }],
      },
    ],
    usage: {
      input_tokens: 12,
      output_tokens: 7,
      total_tokens: 19,
      input_tokens_details: { cached_tokens: 3 },
      output_tokens_details: { reasoning_tokens: 2 },
      primary: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      subagent: { input_tokens: 2, output_tokens: 2, total_tokens: 4 },
    },
    ...overrides,
  } as Response;
}

function stagedMessages(inputId: Types.ObjectId, outputId: Types.ObjectId) {
  return jest
    .fn()
    .mockResolvedValueOnce(message({ _id: inputId, messageId: 'input' }))
    .mockResolvedValueOnce(message({ _id: outputId, messageId: 'resp_target' }));
}

function persistenceParams(
  overrides: Partial<StoredResponseWriteDependencies> = {},
): Parameters<typeof persistStoredResponse>[0] {
  return {
    deps: {
      saveConvo: jest.fn(),
      saveMessage: jest.fn(),
      getConvo: jest.fn(),
      getMessage: jest.fn().mockResolvedValue(message()),
      commitStoredResponseTurn: jest.fn().mockResolvedValue(message()),
      deleteStoredResponseTurn: jest
        .fn()
        .mockResolvedValue({ acknowledged: true, deletedCount: 0 }),
      createMessageId: () => 'generated-input',
      ...overrides,
    },
    context: { userId: 'owner' },
    conversation: {
      data: {
        conversationId: '11111111-1111-4111-8111-111111111111',
        endpoint: 'agents',
        agent_id: 'agent-1',
        model: 'model-1',
      },
      initialAgentId: 'agent-1',
      isContinuation: false,
    },
    inputMessages: [{ role: 'user', content: 'Question' }],
    parentMessageId: null,
    responseId: 'resp_target',
    response: response(),
    agentId: 'agent-1',
    visibleOutputTokens: 7,
  };
}
