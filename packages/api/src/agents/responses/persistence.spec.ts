import { Constants } from 'librechat-data-provider';
import type { IConversation, IMessage } from '@librechat/data-schemas';
import {
  resolveStoredResponse,
  revalidateStoredResponseConversation,
  selectStoredResponseHistory,
  type StoredResponseLookup,
} from './persistence';

const conversation = (overrides: Partial<IConversation> = {}): IConversation =>
  ({
    conversationId: '11111111-1111-4111-8111-111111111111',
    user: 'owner',
    isTemporary: false,
    expiredAt: null,
    ...overrides,
  }) as IConversation;

const message = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    messageId: 'resp_target',
    conversationId: '11111111-1111-4111-8111-111111111111',
    user: 'owner',
    isCreatedByUser: false,
    parentMessageId: 'input-target',
    isTemporary: false,
    expiredAt: null,
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
});
