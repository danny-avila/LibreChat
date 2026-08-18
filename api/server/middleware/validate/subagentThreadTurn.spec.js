const express = require('express');
const request = require('supertest');

const mockGetConvo = jest.fn();
const mockAcquireUserTurn = jest.fn();
const mockBuildSubagentThreadTaskConfig = jest.fn(() => ({ scopeId: 'trusted-scope' }));

jest.mock('~/models', () => ({ getConvo: mockGetConvo }));
jest.mock('~/server/services/Endpoints/agents/subagentThreadStore', () => ({
  acquireUserTurn: mockAcquireUserTurn,
}));
jest.mock('@librechat/api', () => ({
  buildSubagentThreadTaskConfig: mockBuildSubagentThreadTaskConfig,
}));

const guardSubagentThreadTurn = require('./subagentThreadTurn');

function childConversation(overrides = {}) {
  return {
    conversationId: 'child-conversation',
    agent_id: 'child-agent',
    subagentThread: {
      parentConversationId: 'parent-conversation',
      userRunnable: true,
    },
    ...overrides,
  };
}

function createApp(basePath, onTurn = () => undefined) {
  const app = express();
  const router = express.Router();
  app.use(express.json());
  router.use((req, _res, next) => {
    req.user = { id: 'user-1', tenantId: 'tenant-1' };
    next();
  });
  router.post('/', guardSubagentThreadTurn, (req, res) => {
    onTurn(req);
    res.json({ ok: true });
  });
  app.use(basePath, router);
  return app;
}

describe('guardSubagentThreadTurn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAcquireUserTurn.mockReturnValue(jest.fn());
  });

  it('atomically holds and releases the shared child-thread lease for an agents turn', async () => {
    const release = jest.fn();
    mockGetConvo.mockResolvedValue(childConversation());
    mockAcquireUserTurn.mockReturnValue(release);

    const response = await request(
      createApp('/api/agents/chat', () => expect(release).not.toHaveBeenCalled()),
    )
      .post('/api/agents/chat')
      .send({ conversationId: 'child-conversation', agent_id: 'child-agent' });

    expect(response.status).toBe(200);
    expect(mockBuildSubagentThreadTaskConfig).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      parentConversationId: 'parent-conversation',
      tenantId: 'tenant-1',
    });
    expect(mockAcquireUserTurn).toHaveBeenCalledWith(
      'trusted-scope',
      'child-conversation',
      undefined,
    );
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('retains the lease beyond the HTTP acknowledgement until generation settles', async () => {
    const release = jest.fn();
    let generationLease;
    mockGetConvo.mockResolvedValue(childConversation());
    mockAcquireUserTurn.mockReturnValue(release);

    const response = await request(
      createApp('/api/agents/chat', (req) => {
        generationLease = req.subagentThreadTurnLease;
        generationLease.retain();
      }),
    )
      .post('/api/agents/chat')
      .send({ conversationId: 'child-conversation', agent_id: 'child-agent' });

    expect(response.status).toBe(200);
    expect(release).not.toHaveBeenCalled();
    generationLease.release();
    generationLease.release();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rejects a view-only child before acquiring a lease', async () => {
    mockGetConvo.mockResolvedValue(
      childConversation({
        subagentThread: { parentConversationId: 'parent-conversation', userRunnable: false },
      }),
    );

    const response = await request(createApp('/api/agents/chat'))
      .post('/api/agents/chat')
      .send({ conversationId: 'child-conversation', agent_id: 'child-agent' });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('view-only');
    expect(mockAcquireUserTurn).not.toHaveBeenCalled();
  });

  it('rejects an assistants turn and an agents identity change', async () => {
    mockGetConvo.mockResolvedValue(childConversation());

    const assistantResponse = await request(createApp('/api/assistants/v1/chat'))
      .post('/api/assistants/v1/chat')
      .send({ conversationId: 'child-conversation' });
    const switchedAgentResponse = await request(createApp('/api/agents/chat'))
      .post('/api/agents/chat')
      .send({ conversationId: 'child-conversation', agent_id: 'different-agent' });

    expect(assistantResponse.status).toBe(409);
    expect(switchedAgentResponse.status).toBe(409);
    expect(mockAcquireUserTurn).not.toHaveBeenCalled();
  });

  it('rejects a second writer when the shared lease is already held', async () => {
    mockGetConvo.mockResolvedValue(childConversation());
    mockAcquireUserTurn.mockReturnValue(null);

    const response = await request(createApp('/api/agents/chat'))
      .post('/api/agents/chat')
      .send({ conversationId: 'child-conversation', agent_id: 'child-agent' });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('still running');
  });
});
