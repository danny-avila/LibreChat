import express from 'express';
import request from 'supertest';
import type { IConversation } from '@librechat/data-schemas';
import { createAgentEventBindingHandlers } from './bindings';

const USER_ID = '507f191e810c19729de860ea';
const SOURCE_KEY_ID = '507f191e810c19729de860eb';
const PARENT_ID = 'parent-conversation';
const PARENT_MESSAGE_ID = 'parent-message';
const PARENT_AGENT_ID = 'agent_director';
const CHILD_AGENT_ID = 'agent_player';

function parent(): IConversation {
  return {
    conversationId: PARENT_ID,
    user: USER_ID,
    tenantId: 'tenant-1',
    agent_id: PARENT_AGENT_ID,
  } as IConversation;
}

function dependencies() {
  const reserveThread = jest.fn(async (input) => ({
    created: true,
    conversation: {
      ...input.conversation,
      user: input.user,
      conversationId: input.conversationId,
    },
  }));
  return {
    getAgent: jest.fn(async ({ id }) =>
      id === PARENT_AGENT_ID
        ? {
            id: PARENT_AGENT_ID,
            subagents: { enabled: true, allowSelf: false, agent_ids: [CHILD_AGENT_ID] },
          }
        : { id },
    ),
    getConvo: jest.fn(async () => parent()),
    getBinding: jest.fn(async () => null),
    reserveThread,
    enabled: () => true,
  };
}

function app(deps = dependencies()) {
  const handlers = createAgentEventBindingHandlers(deps as never);
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    Object.assign(req, {
      user: { id: USER_ID, tenantId: 'tenant-1' },
      apiKeyId: { toString: () => SOURCE_KEY_ID },
    });
    next();
  });
  server.post('/bindings', handlers.register);
  server.post('/resolve', handlers.resolve, (req, res) => res.json(req.body));
  return { server, deps };
}

describe('agent event bindings', () => {
  it('keeps registration off until every API replica supports child turns', async () => {
    const deps = dependencies();
    deps.enabled = () => false;
    const { server } = app(deps);
    const response = await request(server)
      .post('/bindings')
      .set('Idempotency-Key', 'disabled-binding')
      .send({
        actorId: 'player-a',
        parentConversationId: PARENT_ID,
        parentMessageId: PARENT_MESSAGE_ID,
        target: { agentId: CHILD_AGENT_ID },
      });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('event_binding_unavailable');
    expect(deps.reserveThread).not.toHaveBeenCalled();
  });

  it('reserves a hidden depth-one actor thread bound to the authenticated API key', async () => {
    const { server, deps } = app();
    const response = await request(server)
      .post('/bindings')
      .set('Idempotency-Key', 'championship-player-a')
      .send({
        actorId: 'player-a',
        parentConversationId: PARENT_ID,
        parentMessageId: PARENT_MESSAGE_ID,
        target: { agentId: CHILD_AGENT_ID },
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.stringMatching(/^evtbind_/),
      actorId: 'player-a',
      agentId: CHILD_AGENT_ID,
      threadId: expect.any(String),
    });
    expect(deps.reserveThread).toHaveBeenCalledWith(
      expect.objectContaining({
        user: USER_ID,
        tenantId: 'tenant-1',
        conversation: expect.objectContaining({
          agent_id: CHILD_AGENT_ID,
          agentEventBinding: expect.objectContaining({ sourceKeyId: SOURCE_KEY_ID }),
          subagentThread: expect.objectContaining({
            parentConversationId: PARENT_ID,
            parentMessageId: PARENT_MESSAGE_ID,
            parentAgentId: PARENT_AGENT_ID,
            subagentType: CHILD_AGENT_ID,
            depth: 1,
          }),
        }),
      }),
    );
  });

  it('rejects a target that is not a configured direct child', async () => {
    const { server, deps } = app();
    deps.getAgent.mockResolvedValueOnce({
      id: PARENT_AGENT_ID,
      subagents: { enabled: true, allowSelf: false, agent_ids: [] },
    });
    const response = await request(server)
      .post('/bindings')
      .set('Idempotency-Key', 'not-configured')
      .send({
        actorId: 'player-a',
        parentConversationId: PARENT_ID,
        parentMessageId: PARENT_MESSAGE_ID,
        target: { agentId: CHILD_AGENT_ID },
      });

    expect(response.status).toBe(403);
    expect(deps.reserveThread).not.toHaveBeenCalled();
  });

  it('resolves a bound continue without accepting a caller-selected target', async () => {
    const deps = dependencies();
    deps.getBinding.mockResolvedValue({
      conversationId: 'child-thread',
      agentId: CHILD_AGENT_ID,
      tenantId: 'tenant-1',
      binding: {
        bindingId: `evtbind_${'a'.repeat(48)}`,
        sourceKeyId: SOURCE_KEY_ID,
        actorId: 'player-a',
      },
      lineage: {
        rootConversationId: PARENT_ID,
        parentConversationId: PARENT_ID,
        parentMessageId: PARENT_MESSAGE_ID,
        parentToolCallId: 'event-binding',
        parentAgentId: PARENT_AGENT_ID,
        subagentType: CHILD_AGENT_ID,
        subagentKind: 'agent',
        depth: 1,
      },
    });
    const { server } = app(deps);
    const response = await request(server)
      .post('/resolve')
      .send({
        mode: 'continue',
        bindingId: `evtbind_${'a'.repeat(48)}`,
        target: { agentId: 'agent_attacker', conversationId: 'foreign-thread' },
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      mode: 'continue',
      orderingKey: `evtbind_${'a'.repeat(48)}`,
      target: {
        agentId: CHILD_AGENT_ID,
        conversationId: 'child-thread',
        bindingId: `evtbind_${'a'.repeat(48)}`,
        sourceKeyId: SOURCE_KEY_ID,
      },
    });
    expect(response.body.target.agentId).not.toBe('agent_attacker');
    expect(deps.getBinding).toHaveBeenCalledWith({
      user: USER_ID,
      tenantId: 'tenant-1',
      bindingId: `evtbind_${'a'.repeat(48)}`,
      sourceKeyId: SOURCE_KEY_ID,
    });
  });

  it('leaves fire and steer deliveries unchanged', async () => {
    const { server, deps } = app();
    const response = await request(server)
      .post('/resolve')
      .send({ mode: 'fire', target: { agentId: CHILD_AGENT_ID } });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ mode: 'fire', target: { agentId: CHILD_AGENT_ID } });
    expect(deps.getBinding).not.toHaveBeenCalled();
  });

  it('does not reinterpret another mode merely because it contains a binding id', async () => {
    const { server, deps } = app();
    const response = await request(server)
      .post('/resolve')
      .send({
        mode: 'fire',
        bindingId: `evtbind_${'a'.repeat(48)}`,
        target: { agentId: CHILD_AGENT_ID },
      });

    expect(response.status).toBe(400);
    expect(deps.getBinding).not.toHaveBeenCalled();
  });
});
