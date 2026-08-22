import type { IConversation, IMessage } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { createSubagentThreadViewHandler, SUBAGENT_THREAD_VIEW_LIMITS } from './view';

jest.mock('@librechat/data-schemas', () => ({
  CLIENT_MESSAGE_SELECT: '-_id -user',
  SUBAGENT_TRANSCRIPT_SOURCE_BYTE_LIMIT: 256 * 1024,
  logger: { error: jest.fn() },
}));

const parentConversationId = 'parent-conversation';
const threadId = 'child-thread';

const parent = {
  conversationId: parentConversationId,
  user: 'user-1',
  tenantId: 'tenant-1',
} as IConversation;

const child = {
  conversationId: threadId,
  user: 'user-1',
  tenantId: 'tenant-1',
  title: 'Research child',
  agent_id: 'agent-1',
  updatedAt: new Date('2026-08-21T12:00:00.000Z'),
  subagentThreadLease: {
    token: 'lease-token',
    taskId: 'task-1',
    expiresAt: new Date('2099-08-21T12:00:00.000Z'),
  },
  subagentThread: {
    rootConversationId: parentConversationId,
    parentConversationId,
    parentMessageId: 'parent-message',
    parentToolCallId: 'parent-tool-call',
    subagentType: 'researcher',
    subagentKind: 'agent',
    depth: 1,
  },
} as IConversation;

const message = (
  messageId: string,
  status: NonNullable<IMessage['subagentTask']>['status'],
  isCreatedByUser = false,
): IMessage =>
  ({
    messageId,
    conversationId: threadId,
    user: 'user-1',
    parentMessageId: isCreatedByUser ? '00000000-0000-0000-0000-000000000000' : 'task-1:user',
    sender: isCreatedByUser ? 'User' : 'researcher',
    text: isCreatedByUser ? 'Investigate this.' : 'Finished the research.',
    isCreatedByUser,
    createdAt: new Date(isCreatedByUser ? '2026-08-21T11:00:00.000Z' : '2026-08-21T11:01:00.000Z'),
    subagentTask: {
      attemptKey: 'attempt-1',
      status,
    },
  }) as IMessage;

const createResponse = () => {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return {
    response: { status } as unknown as Response,
    status,
    json,
  };
};

const createRequest = (
  params: Record<string, string> = {},
  query: Record<string, string> = {},
): ServerRequest =>
  ({
    params: { parentConversationId, threadId, ...params },
    query,
    user: { id: 'user-1', tenantId: 'tenant-1' },
  }) as ServerRequest;

describe('subagent thread parent-scoped view', () => {
  it('returns a bounded public child projection through the owning parent', async () => {
    const getConvoOwnership = jest.fn().mockResolvedValue(parent);
    const newest = {
      ...message('task-1:assistant', 'completed'),
      text: 'a'.repeat(SUBAGENT_THREAD_VIEW_LIMITS.messageTextBytes / 4),
      textProjectionTruncated: true,
    } as IMessage & { textProjectionTruncated: boolean };
    const getMessages = jest
      .fn()
      .mockResolvedValue([newest, message('task-1:user', 'running', true)]);
    const getSubagentThreadForParent = jest.fn().mockResolvedValue(child);
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership,
      getSubagentThreadForParent,
      getMessagesForSubagentThreadView: getMessages,
    });
    const { response, json } = createResponse();

    await handler(createRequest(), response);

    expect(getMessages).toHaveBeenCalledWith({
      conversationId: threadId,
      user: 'user-1',
      tenantId: 'tenant-1',
      limit: SUBAGENT_THREAD_VIEW_LIMITS.messages + 1,
      textCodePointLimit: SUBAGENT_THREAD_VIEW_LIMITS.messageTextBytes / 4,
    });
    expect(getConvoOwnership).toHaveBeenCalledWith('user-1', parentConversationId, 'tenant-1');
    expect(json).toHaveBeenCalledWith({
      threadId,
      parentConversationId,
      parentMessageId: 'parent-message',
      parentToolCallId: 'parent-tool-call',
      subagentType: 'researcher',
      subagentKind: 'agent',
      agentId: 'agent-1',
      title: 'Research child',
      status: 'completed',
      activity: [],
      activityTruncated: false,
      messages: [
        expect.objectContaining({ messageId: 'task-1:user', role: 'user' }),
        expect.objectContaining({
          messageId: 'task-1:assistant',
          role: 'assistant',
          textTruncated: true,
        }),
      ],
      historyTruncated: false,
      updatedAt: '2026-08-21T12:00:00.000Z',
    });
    expect(Buffer.byteLength(json.mock.calls[0][0].messages[1].text, 'utf8')).toBeLessThanOrEqual(
      SUBAGENT_THREAD_VIEW_LIMITS.messageTextBytes,
    );
    expect(Buffer.byteLength(JSON.stringify(json.mock.calls[0][0]), 'utf8')).toBeLessThanOrEqual(
      SUBAGENT_THREAD_VIEW_LIMITS.responseBytes,
    );
    expect(json.mock.calls[0][0].messages[1]).not.toHaveProperty('subagentTask');
  });

  it("returns only the selected task's sanitized bounded activity", async () => {
    const selected = {
      ...message('task-1:assistant', 'completed'),
      subagentTranscript: {
        taskId: 'task-1',
        mode: 'append' as const,
        messagesJson: JSON.stringify([
          {
            type: 'ai',
            data: {
              content: [{ type: 'reasoning', reasoning: 'private thought' }],
              tool_calls: [{ id: 'inner-1', name: 'search', args: { query: 'release' } }],
              response_metadata: { private: true },
            },
          },
          {
            type: 'tool',
            data: {
              tool_call_id: 'inner-1',
              name: 'search',
              content: 'Found it.',
            },
          },
          { type: 'ai', data: { content: 'Final answer.' } },
        ]),
      },
    } as IMessage;
    const getMessages = jest.fn().mockResolvedValue([selected]);
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership: jest.fn().mockResolvedValue(parent),
      getSubagentThreadForParent: jest
        .fn()
        .mockResolvedValue({ ...child, subagentThreadLease: undefined }),
      getMessagesForSubagentThreadView: getMessages,
    });
    const { response, json } = createResponse();

    await handler(createRequest({}, { taskId: 'task-1' }), response);

    expect(getMessages).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1' }));
    const view = json.mock.calls[0][0];
    expect(view.activity).toEqual([
      { type: 'reasoning' },
      expect.objectContaining({
        type: 'tool',
        toolCallId: 'inner-1',
        status: 'completed',
        output: 'Found it.',
      }),
      { type: 'writing', text: 'Final answer.' },
    ]);
    expect(JSON.stringify(view)).not.toContain('private thought');
    expect(JSON.stringify(view)).not.toContain('response_metadata');
    expect(view.messages[0]).not.toHaveProperty('subagentTranscript');
  });

  it('fences replacement activity to the exact selected task input', async () => {
    const selected = {
      ...message('task-1:assistant', 'completed'),
      subagentTranscript: {
        taskId: 'task-1',
        mode: 'replace' as const,
        messagesJson: JSON.stringify([
          { type: 'human', data: { content: 'Earlier request.' } },
          { type: 'ai', data: { content: 'Earlier activity.' } },
          { type: 'human', data: { content: 'Investigate this.' } },
          { type: 'ai', data: { content: 'Selected activity.' } },
        ]),
      },
    } as IMessage;
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership: jest.fn().mockResolvedValue(parent),
      getSubagentThreadForParent: jest
        .fn()
        .mockResolvedValue({ ...child, subagentThreadLease: undefined }),
      getMessagesForSubagentThreadView: jest
        .fn()
        .mockResolvedValue([selected, message('task-1:user', 'running', true)]),
    });
    const { response, json } = createResponse();

    await handler(createRequest({}, { taskId: 'task-1' }), response);

    expect(json.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        activity: [{ type: 'writing', text: 'Selected activity.' }],
        activityTruncated: false,
      }),
    );
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('Earlier activity.');
  });

  it('fails closed when the selected row carries a mismatched transcript identity', async () => {
    const selected = {
      ...message('task-1:assistant', 'completed'),
      subagentTranscript: {
        taskId: 'task-other',
        mode: 'append' as const,
        messagesJson: JSON.stringify([{ type: 'ai', data: { content: 'Wrong task.' } }]),
      },
    } as IMessage;
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership: jest.fn().mockResolvedValue(parent),
      getSubagentThreadForParent: jest
        .fn()
        .mockResolvedValue({ ...child, subagentThreadLease: undefined }),
      getMessagesForSubagentThreadView: jest.fn().mockResolvedValue([selected]),
    });
    const { response, json } = createResponse();

    await handler(createRequest({}, { taskId: 'task-1' }), response);

    expect(json.mock.calls[0][0]).toEqual(
      expect.objectContaining({ activity: [], activityTruncated: true }),
    );
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('Wrong task.');
  });

  it('falls back to the bounded final message when storage omits an oversized transcript', async () => {
    const selected = {
      ...message('task-1:assistant', 'completed'),
      text: 'The bounded final answer.',
      subagentTranscriptProjectionTruncated: true,
    } as IMessage & { subagentTranscriptProjectionTruncated: boolean };
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership: jest.fn().mockResolvedValue(parent),
      getSubagentThreadForParent: jest
        .fn()
        .mockResolvedValue({ ...child, subagentThreadLease: undefined }),
      getMessagesForSubagentThreadView: jest.fn().mockResolvedValue([selected]),
    });
    const { response, json } = createResponse();

    await handler(createRequest({}, { taskId: 'task-1' }), response);

    const view = json.mock.calls[0][0];
    expect(view).toEqual(
      expect.objectContaining({
        activity: [],
        activityTruncated: true,
        messages: [expect.objectContaining({ text: 'The bounded final answer.' })],
      }),
    );
    expect(JSON.stringify(view)).not.toContain('subagentTranscript');
  });

  it('bounds the complete UTF-8 response while retaining the newest history', async () => {
    const getConvoOwnership = jest.fn().mockResolvedValue(parent);
    const messages = Array.from(
      { length: SUBAGENT_THREAD_VIEW_LIMITS.messages },
      (_, index) =>
        ({
          ...message(`task-${index}:assistant`, 'completed'),
          text: '🧵'.repeat(SUBAGENT_THREAD_VIEW_LIMITS.messageTextBytes),
        }) as IMessage,
    );
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership,
      getSubagentThreadForParent: jest.fn().mockResolvedValue(child),
      getMessagesForSubagentThreadView: jest.fn().mockResolvedValue(messages),
    });
    const { response, json } = createResponse();

    await handler(createRequest(), response);

    const view = json.mock.calls[0][0];
    expect(Buffer.byteLength(JSON.stringify(view), 'utf8')).toBeLessThanOrEqual(
      SUBAGENT_THREAD_VIEW_LIMITS.responseBytes,
    );
    expect(view.historyTruncated).toBe(true);
    expect(view.messages.at(-1).messageId).toBe('task-0:assistant');
  });

  it('requires tenantless messages when the authenticated request has no tenant', async () => {
    const getMessages = jest.fn().mockResolvedValue([]);
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership: jest.fn().mockResolvedValue({ ...parent, tenantId: undefined }),
      getSubagentThreadForParent: jest
        .fn()
        .mockResolvedValue({ ...child, tenantId: undefined, subagentThreadLease: undefined }),
      getMessagesForSubagentThreadView: getMessages,
    });
    const { response } = createResponse();

    await handler(
      { ...createRequest(), user: { id: 'user-1', tenantId: undefined } } as ServerRequest,
      response,
    );

    expect(getMessages).toHaveBeenCalledWith({
      conversationId: threadId,
      user: 'user-1',
      limit: SUBAGENT_THREAD_VIEW_LIMITS.messages + 1,
      textCodePointLimit: SUBAGENT_THREAD_VIEW_LIMITS.messageTextBytes / 4,
    });
  });

  it.each([
    ['running', 'running'],
    ['error', 'failed'],
    ['cancelled', 'cancelled'],
  ] as const)('normalizes durable %s tasks as %s', async (durableStatus, publicStatus) => {
    const getConvoOwnership = jest.fn().mockResolvedValue(parent);
    const getMessages = jest
      .fn()
      .mockResolvedValue([
        message(
          durableStatus === 'running' ? 'task-1:user' : 'task-1:assistant',
          durableStatus,
          durableStatus === 'running',
        ),
      ]);
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership,
      getSubagentThreadForParent: jest.fn().mockResolvedValue(child),
      getMessagesForSubagentThreadView: getMessages,
    });
    const { response, json } = createResponse();

    await handler(createRequest(), response);

    expect(json.mock.calls[0][0]).toEqual(expect.objectContaining({ status: publicStatus }));
  });

  it('reports a reserved child with no durable task messages as dispatched', async () => {
    const getConvoOwnership = jest.fn().mockResolvedValue(parent);
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership,
      getSubagentThreadForParent: jest
        .fn()
        .mockResolvedValue({ ...child, subagentThreadLease: undefined }),
      getMessagesForSubagentThreadView: jest.fn().mockResolvedValue([]),
    });
    const { response, json } = createResponse();

    await handler(createRequest(), response);

    expect(json.mock.calls[0][0]).toEqual(
      expect.objectContaining({ status: 'dispatched', messages: [] }),
    );
  });

  it('reports a child with an active preparation lease as running before its seed exists', async () => {
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership: jest.fn().mockResolvedValue(parent),
      getSubagentThreadForParent: jest.fn().mockResolvedValue(child),
      getMessagesForSubagentThreadView: jest.fn().mockResolvedValue([]),
    });
    const { response, json } = createResponse();

    await handler(createRequest(), response);

    expect(json.mock.calls[0][0]).toEqual(
      expect.objectContaining({ status: 'running', messages: [] }),
    );
  });

  it('does not mistake an older completed turn for the active leased turn', async () => {
    const activeChild = {
      ...child,
      subagentThreadLease: { ...child.subagentThreadLease!, taskId: 'task-2' },
    } as IConversation;
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership: jest.fn().mockResolvedValue(parent),
      getSubagentThreadForParent: jest.fn().mockResolvedValue(activeChild),
      getMessagesForSubagentThreadView: jest
        .fn()
        .mockResolvedValue([message('task-1:assistant', 'completed')]),
    });
    const { response, json } = createResponse();

    await handler(createRequest(), response);

    expect(json.mock.calls[0][0]).toEqual(expect.objectContaining({ status: 'running' }));
  });

  it('keeps the newest bounded tail and marks older history as truncated', async () => {
    const getConvoOwnership = jest.fn().mockResolvedValue(parent);
    const messages = Array.from({ length: SUBAGENT_THREAD_VIEW_LIMITS.messages + 1 }, (_, index) =>
      message(`task-${index}:assistant`, 'completed'),
    );
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership,
      getSubagentThreadForParent: jest.fn().mockResolvedValue(child),
      getMessagesForSubagentThreadView: jest.fn().mockResolvedValue(messages),
    });
    const { response, json } = createResponse();

    await handler(createRequest(), response);

    const view = json.mock.calls[0][0];
    expect(view.historyTruncated).toBe(true);
    expect(view.messages).toHaveLength(SUBAGENT_THREAD_VIEW_LIMITS.messages);
    expect(view.messages[0].messageId).toBe(
      `task-${SUBAGENT_THREAD_VIEW_LIMITS.messages - 1}:assistant`,
    );
    expect(view.messages.at(-1).messageId).toBe('task-0:assistant');
  });

  it.each([
    ['missing parent', null, child, 'tenant-1'],
    ['missing child', parent, null, 'tenant-1'],
    [
      'unrelated child',
      parent,
      {
        ...child,
        subagentThread: { ...child.subagentThread, parentConversationId: 'another-parent' },
      },
      'tenant-1',
    ],
    ['parent tenant mismatch', { ...parent, tenantId: 'tenant-2' }, child, 'tenant-1'],
    ['child tenant mismatch', parent, { ...child, tenantId: 'tenant-2' }, 'tenant-1'],
  ])('returns the same 404 for %s', async (_, parentRecord, childRecord, tenantId) => {
    const getConvoOwnership = jest.fn().mockResolvedValue(parentRecord);
    const getMessages = jest.fn().mockResolvedValue([message('task-1:assistant', 'completed')]);
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership,
      getSubagentThreadForParent: jest.fn().mockResolvedValue(childRecord),
      getMessagesForSubagentThreadView: getMessages,
    });
    const { response, status, json } = createResponse();

    await handler(
      {
        ...createRequest(),
        user: { id: 'user-1', tenantId },
      } as ServerRequest,
      response,
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'Conversation not found' });
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('rejects a child id used as its own parent before reading storage', async () => {
    const getConvoOwnership = jest.fn();
    const getSubagentThreadForParent = jest.fn();
    const getMessages = jest.fn();
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership,
      getSubagentThreadForParent,
      getMessagesForSubagentThreadView: getMessages,
    });
    const { response, status } = createResponse();

    await handler(createRequest({ parentConversationId: threadId }), response);

    expect(status).toHaveBeenCalledWith(404);
    expect(getConvoOwnership).not.toHaveBeenCalled();
    expect(getSubagentThreadForParent).not.toHaveBeenCalled();
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('rejects oversized route identifiers before reading storage', async () => {
    const getConvoOwnership = jest.fn();
    const getSubagentThreadForParent = jest.fn();
    const getMessages = jest.fn();
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership,
      getSubagentThreadForParent,
      getMessagesForSubagentThreadView: getMessages,
    });
    const { response, status } = createResponse();

    await handler(createRequest({ threadId: 'x'.repeat(257) }), response);

    expect(status).toHaveBeenCalledWith(404);
    expect(getConvoOwnership).not.toHaveBeenCalled();
    expect(getSubagentThreadForParent).not.toHaveBeenCalled();
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('rejects an oversized task selector before reading storage', async () => {
    const getConvoOwnership = jest.fn();
    const getSubagentThreadForParent = jest.fn();
    const getMessages = jest.fn();
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership,
      getSubagentThreadForParent,
      getMessagesForSubagentThreadView: getMessages,
    });
    const { response, status } = createResponse();

    await handler(createRequest({}, { taskId: 'x'.repeat(513) }), response);

    expect(status).toHaveBeenCalledWith(404);
    expect(getConvoOwnership).not.toHaveBeenCalled();
    expect(getSubagentThreadForParent).not.toHaveBeenCalled();
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('marks an unleased running seed as interrupted', async () => {
    const getConvoOwnership = jest.fn().mockResolvedValue(parent);
    const handler = createSubagentThreadViewHandler({
      getConvoOwnership,
      getSubagentThreadForParent: jest
        .fn()
        .mockResolvedValue({ ...child, subagentThreadLease: undefined }),
      getMessagesForSubagentThreadView: jest
        .fn()
        .mockResolvedValue([message('task-1:user', 'running', true)]),
    });
    const { response, json } = createResponse();

    await handler(createRequest(), response);

    expect(json.mock.calls[0][0]).toEqual(expect.objectContaining({ status: 'interrupted' }));
  });
});
