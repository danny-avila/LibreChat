import express from 'express';
import request from 'supertest';
import type { AllMethods, IConversation } from '@librechat/data-schemas';
import {
  CHILD_THREAD_READ_ONLY_ERROR,
  createSubagentThreadTurnGuard,
  isSubagentThreadWriteBlocked,
} from './guard';
import { createSubagentThreadId } from './subagentThreadIds';
import { SubagentThreadTaskStore } from './subagentThreads';

function childConversation(): IConversation {
  return {
    conversationId: 'child-conversation',
    endpoint: 'agents',
    title: 'Child',
    agent_id: 'child-agent',
    subagentThread: {
      rootConversationId: 'parent-conversation',
      parentConversationId: 'parent-conversation',
      parentMessageId: 'parent-message',
      parentToolCallId: 'parent-tool-call',
      subagentType: 'child-agent',
      subagentKind: 'agent',
      depth: 1,
    },
  } as IConversation;
}

function makeStore(): SubagentThreadTaskStore {
  const unused = jest.fn();
  return new SubagentThreadTaskStore({
    acquireSubagentThreadLease: unused as AllMethods['acquireSubagentThreadLease'],
    claimSubagentTaskResult: unused as AllMethods['claimSubagentTaskResult'],
    countActiveSubagentThreadLeases: unused as AllMethods['countActiveSubagentThreadLeases'],
    deleteConvos: unused as AllMethods['deleteConvos'],
    deleteMessages: unused as AllMethods['deleteMessages'],
    getConvo: unused as AllMethods['getConvo'],
    getMessages: unused as AllMethods['getMessages'],
    listActiveSubagentThreadLeases: unused as AllMethods['listActiveSubagentThreadLeases'],
    releaseSubagentThreadLease: unused as AllMethods['releaseSubagentThreadLease'],
    reserveSubagentThread: unused as AllMethods['reserveSubagentThread'],
    renewSubagentThreadLease: unused as AllMethods['renewSubagentThreadLease'],
    saveConvo: unused as AllMethods['saveConvo'],
    saveMessage: unused as AllMethods['saveMessage'],
  });
}

function createApp(getConvo: AllMethods['getConvo'], store: SubagentThreadTaskStore) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', tenantId: 'tenant-1' };
    next();
  });
  app.post('/chat', createSubagentThreadTurnGuard({ getConvo, store }), (req, res) => {
    res.json({
      ok: true,
      resolvedConversationId: (req as typeof req & { resolvedConversation?: IConversation | null })
        .resolvedConversation?.conversationId,
    });
  });
  return app;
}

describe('subagent child-thread write policy', () => {
  it('allows an ordinary conversation and new-conversation requests', async () => {
    const getConvo = jest.fn().mockResolvedValue({
      conversationId: 'ordinary-conversation',
      endpoint: 'agents',
    });
    const store = makeStore();
    const app = createApp(getConvo, store);

    const ordinary = await request(app)
      .post('/chat')
      .send({ conversationId: 'ordinary-conversation' });
    const fresh = await request(app).post('/chat').send({ conversationId: 'new' });

    expect(ordinary.status).toBe(200);
    expect(ordinary.body).toEqual({
      ok: true,
      resolvedConversationId: 'ordinary-conversation',
    });
    expect(fresh.status).toBe(200);
    expect(getConvo).toHaveBeenCalledTimes(1);
  });

  it('rejects every model-bound human turn against a durable child conversation', async () => {
    const store = makeStore();
    const response = await request(
      createApp(jest.fn().mockResolvedValue(childConversation()), store),
    )
      .post('/chat')
      .send({ conversationId: 'child-conversation', agent_id: 'child-agent' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: CHILD_THREAD_READ_ONLY_ERROR });
  });

  it('rejects a provisional child before its conversation becomes durable', async () => {
    const store = makeStore();
    jest.spyOn(store, 'isThreadActiveForOwner').mockReturnValue(true);
    const getConvo = jest.fn().mockResolvedValue(null);

    const response = await request(createApp(getConvo, store))
      .post('/chat')
      .send({ conversationId: 'provisional-child' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: CHILD_THREAD_READ_ONLY_ERROR });
    expect(store.isThreadActiveForOwner).toHaveBeenCalledWith(
      'user-1',
      'provisional-child',
      'tenant-1',
    );
    expect(getConvo).not.toHaveBeenCalled();
  });

  it('rejects a reserved provisional child on a different API worker', async () => {
    const store = makeStore();
    const getConvo = jest.fn().mockResolvedValue(null);
    const reservedThreadId = createSubagentThreadId('scope', 'attempt');

    const response = await request(createApp(getConvo, store))
      .post('/chat')
      .send({ conversationId: reservedThreadId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: CHILD_THREAD_READ_ONLY_ERROR });
    expect(getConvo).not.toHaveBeenCalled();
  });

  it('keeps the shared policy owner-scoped and treats child lineage as immutable', async () => {
    const store = makeStore();
    const getConvo = jest.fn().mockResolvedValue(childConversation());

    await expect(
      isSubagentThreadWriteBlocked(
        { getConvo, store },
        {
          userId: 'owner',
          conversationId: 'child-conversation',
          tenantId: 'tenant-1',
        },
      ),
    ).resolves.toBe(true);

    expect(getConvo).toHaveBeenCalledWith('owner', 'child-conversation');
  });
});
