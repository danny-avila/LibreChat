import express from 'express';
import request from 'supertest';
import type { AllMethods, IConversation } from '@librechat/data-schemas';
import type { Request } from 'express';
import { SubagentThreadTaskStore } from './subagentThreads';
import { createSubagentThreadTurnGuard } from './guard';

interface SubagentThreadTurnLease {
  retain(): void;
  release(): void;
}

type SubagentTurnRequest = Request & {
  subagentThreadTurnLease?: SubagentThreadTurnLease;
};

function childConversation(overrides: Partial<IConversation> = {}): IConversation {
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
      userRunnable: true,
    },
    ...overrides,
  } as IConversation;
}

function makeStore(): SubagentThreadTaskStore {
  const unused = jest.fn();
  return new SubagentThreadTaskStore({
    deleteConvos: unused as AllMethods['deleteConvos'],
    deleteMessages: unused as AllMethods['deleteMessages'],
    getConvo: unused as AllMethods['getConvo'],
    getFiles: unused as AllMethods['getFiles'],
    getMessages: unused as AllMethods['getMessages'],
    saveConvo: unused as AllMethods['saveConvo'],
    saveMessage: unused as AllMethods['saveMessage'],
  });
}

function createApp(
  basePath: string,
  getConvo: AllMethods['getConvo'],
  store: SubagentThreadTaskStore,
  onTurn: (req: Request) => void = () => undefined,
) {
  const app = express();
  const router = express.Router();
  app.use(express.json());
  router.use((req, _res, next) => {
    req.user = { id: 'user-1', tenantId: 'tenant-1' };
    next();
  });
  router.post('/', createSubagentThreadTurnGuard({ getConvo, store }), (req, res) => {
    onTurn(req);
    res.json({ ok: true });
  });
  app.use(basePath, router);
  return app;
}

describe('createSubagentThreadTurnGuard', () => {
  it('atomically holds and releases the child writer lease for an agents turn', async () => {
    const store = makeStore();
    const acquire = jest.spyOn(store, 'acquireUserTurn');
    const response = await request(
      createApp('/api/agents/chat', jest.fn().mockResolvedValue(childConversation()), store),
    )
      .post('/api/agents/chat')
      .send({
        conversationId: 'child-conversation',
        agent_id: 'child-agent',
        clientRequestId: 'attempt-1',
      });

    expect(response.status).toBe(200);
    expect(acquire).toHaveBeenCalledWith(
      JSON.stringify({
        version: 1,
        userId: 'user-1',
        parentConversationId: 'parent-conversation',
        tenantId: 'tenant-1',
      }),
      'child-conversation',
      'attempt-1',
    );
    expect(store.isThreadActive(acquire.mock.calls[0][0], 'child-conversation')).toBe(false);
  });

  it('retains the lease beyond the HTTP acknowledgement until generation settles', async () => {
    const store = makeStore();
    const scopeId = JSON.stringify({
      version: 1,
      userId: 'user-1',
      parentConversationId: 'parent-conversation',
      tenantId: 'tenant-1',
    });
    let generationLease: SubagentThreadTurnLease | undefined;
    const response = await request(
      createApp(
        '/api/agents/chat',
        jest.fn().mockResolvedValue(childConversation()),
        store,
        (req) => {
          generationLease = (req as SubagentTurnRequest).subagentThreadTurnLease;
          generationLease?.retain();
        },
      ),
    )
      .post('/api/agents/chat')
      .send({ conversationId: 'child-conversation', agent_id: 'child-agent' });

    expect(response.status).toBe(200);
    expect(generationLease).toBeDefined();
    expect(store.isThreadActive(scopeId, 'child-conversation')).toBe(true);
    generationLease?.release();
    generationLease?.release();
    expect(store.isThreadActive(scopeId, 'child-conversation')).toBe(false);
  });

  it('rejects view-only, cross-endpoint, identity-switched, and concurrent turns', async () => {
    const store = makeStore();
    const getViewOnly = jest.fn().mockResolvedValue(
      childConversation({
        subagentThread: {
          ...childConversation().subagentThread!,
          userRunnable: false,
        },
      }),
    );
    const viewOnly = await request(createApp('/api/agents/chat', getViewOnly, store))
      .post('/api/agents/chat')
      .send({ conversationId: 'child-conversation', agent_id: 'child-agent' });
    const assistant = await request(
      createApp('/api/assistants/v1/chat', jest.fn().mockResolvedValue(childConversation()), store),
    )
      .post('/api/assistants/v1/chat')
      .send({ conversationId: 'child-conversation' });
    const switched = await request(
      createApp('/api/agents/chat', jest.fn().mockResolvedValue(childConversation()), store),
    )
      .post('/api/agents/chat')
      .send({ conversationId: 'child-conversation', agent_id: 'different-agent' });

    const scopeId = JSON.stringify({
      version: 1,
      userId: 'user-1',
      parentConversationId: 'parent-conversation',
      tenantId: 'tenant-1',
    });
    const release = store.acquireUserTurn(scopeId, 'child-conversation');
    const busy = await request(
      createApp('/api/agents/chat', jest.fn().mockResolvedValue(childConversation()), store),
    )
      .post('/api/agents/chat')
      .send({ conversationId: 'child-conversation', agent_id: 'child-agent' });
    release?.();

    expect(viewOnly.status).toBe(409);
    expect(viewOnly.body.error).toContain('view-only');
    expect(assistant.status).toBe(409);
    expect(switched.status).toBe(409);
    expect(busy.status).toBe(409);
    expect(busy.body.error).toContain('still running');
  });

  it('rejects a provisionally leased child before its conversation is durable', async () => {
    const store = makeStore();
    const scopeId = JSON.stringify({
      version: 1,
      userId: 'user-1',
      parentConversationId: 'parent-conversation',
      tenantId: 'tenant-1',
    });
    const release = store.acquireUserTurn(scopeId, 'provisional-child');

    const response = await request(
      createApp('/api/agents/chat', jest.fn().mockResolvedValue(null), store),
    )
      .post('/api/agents/chat')
      .send({ conversationId: 'provisional-child', agent_id: 'child-agent' });
    release?.();

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('still running');
  });
});
