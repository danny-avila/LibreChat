import { AIMessage } from '@langchain/core/messages';
import type { IConversation } from '@librechat/data-schemas';
import { createAgentTriggerEnvelope, type AgentContinueTriggerEnvelope } from './envelope';
import { createAgentEventContinueResolver } from './bindingResolver';

const bindingId = `evtbind_${'a'.repeat(48)}`;
const sourceKeyId = '507f191e810c19729de860eb';

function envelope(): AgentContinueTriggerEnvelope {
  return createAgentTriggerEnvelope({
    mode: 'continue',
    requestId: 'request-1',
    deliveryId: 'delivery-1',
    receivedAt: 1,
    principal: { id: 'user-1', tenantId: 'tenant-1' },
    event: {
      id: 'event-1',
      type: 'chess.turn.ready',
      occurredAt: 1,
      source: { id: 'chess', type: 'webhook' },
    },
    input: 'Your turn.',
    target: {
      agentId: 'agent-player',
      conversationId: 'child-thread',
      parentMessageId: 'placeholder',
      bindingId,
      sourceKeyId,
    },
  }) as AgentContinueTriggerEnvelope;
}

describe('agent event continuation resolver', () => {
  it('defers without consuming attempts while the rollout gate is disabled', async () => {
    const resolver = createAgentEventContinueResolver({
      enabled: () => false,
      methods: {
        getAgentEventBinding: jest.fn(),
        getConvo: jest.fn(),
        getMessages: jest.fn(),
      } as never,
    });

    await expect(
      resolver(envelope(), { idempotencyKey: 'trigger-1' } as never),
    ).rejects.toMatchObject({
      code: 'EVENT_BINDING_DISABLED',
      retryable: true,
      deferWithoutAttempt: true,
    });
  });

  it('re-resolves the latest assistant leaf immediately before dispatch', async () => {
    const getMessages = jest.fn(async () => [
      Object.assign(new AIMessage('done'), {
        messageId: 'assistant-1',
        isCreatedByUser: false,
        createdAt: new Date(2),
      }),
    ]) as never;
    const resolver = createAgentEventContinueResolver({
      enabled: () => true,
      methods: {
        getAgentEventBinding: jest.fn(async () => ({
          conversationId: 'child-thread',
          agentId: 'agent-player',
          tenantId: 'tenant-1',
          binding: { bindingId, sourceKeyId, actorId: 'player' },
          lineage: {
            parentConversationId: 'parent-thread',
            parentAgentId: 'agent-director',
          } as never,
        })),
        getConvo: jest.fn(
          async () =>
            ({
              conversationId: 'parent-thread',
              agent_id: 'agent-director',
              tenantId: 'tenant-1',
            }) as IConversation,
        ),
        getMessages,
      },
    });

    await expect(resolver(envelope(), { idempotencyKey: 'trigger-1' } as never)).resolves.toEqual({
      status: 'ready',
      input: 'Your turn.',
      parentMessageId: 'assistant-1',
    });
    expect(getMessages).toHaveBeenCalledWith(
      { user: 'user-1', conversationId: 'child-thread', isCreatedByUser: false },
      'messageId createdAt',
      { sort: { createdAt: -1, _id: -1 }, limit: 1 },
    );
  });

  it('fails closed when the durable binding target changed', async () => {
    const resolver = createAgentEventContinueResolver({
      enabled: () => true,
      methods: {
        getAgentEventBinding: jest.fn(async () => ({
          conversationId: 'another-thread',
          agentId: 'agent-player',
          binding: { bindingId, sourceKeyId, actorId: 'player' },
          lineage: {} as never,
        })),
        getConvo: jest.fn(),
        getMessages: jest.fn(async () => []) as never,
      },
    });

    await expect(
      resolver(envelope(), { idempotencyKey: 'trigger-1' } as never),
    ).rejects.toMatchObject({ code: 'EVENT_BINDING_INVALID', retryable: false });
  });

  it('defers an event while the actor has an active generation', async () => {
    const resolver = createAgentEventContinueResolver({
      enabled: () => true,
      getGenerationJob: jest.fn(async () => ({ status: 'running' })),
      methods: {
        getAgentEventBinding: jest.fn(async () => ({
          conversationId: 'child-thread',
          agentId: 'agent-player',
          tenantId: 'tenant-1',
          binding: { bindingId, sourceKeyId, actorId: 'player' },
          lineage: {
            parentConversationId: 'parent-thread',
            parentAgentId: 'agent-director',
          } as never,
        })),
        getConvo: jest.fn(
          async () =>
            ({
              conversationId: 'parent-thread',
              agent_id: 'agent-director',
              tenantId: 'tenant-1',
            }) as IConversation,
        ),
        getMessages: jest.fn(),
      },
    });

    await expect(
      resolver(envelope(), { idempotencyKey: 'trigger-1' } as never),
    ).rejects.toMatchObject({
      code: 'EVENT_ACTOR_NOT_READY',
      retryable: true,
      deferWithoutAttempt: true,
    });
  });

  it('fails closed after the binding parent is removed', async () => {
    const resolver = createAgentEventContinueResolver({
      enabled: () => true,
      methods: {
        getAgentEventBinding: jest.fn(async () => ({
          conversationId: 'child-thread',
          agentId: 'agent-player',
          tenantId: 'tenant-1',
          binding: { bindingId, sourceKeyId, actorId: 'player' },
          lineage: { parentConversationId: 'missing-parent' } as never,
        })),
        getConvo: jest.fn(async () => null),
        getMessages: jest.fn(),
      },
    });

    await expect(
      resolver(envelope(), { idempotencyKey: 'trigger-1' } as never),
    ).rejects.toMatchObject({ code: 'EVENT_BINDING_INVALID', retryable: false });
  });

  it('fails closed when the binding or its parent passed its retention deadline', async () => {
    const getAgentEventBinding = jest.fn(async () => ({
      conversationId: 'child-thread',
      agentId: 'agent-player',
      tenantId: 'tenant-1',
      expiredAt: new Date(0),
      binding: { bindingId, sourceKeyId, actorId: 'player' },
      lineage: {
        parentConversationId: 'parent-thread',
        parentAgentId: 'agent-director',
      } as never,
    }));
    const resolver = createAgentEventContinueResolver({
      enabled: () => true,
      methods: {
        getAgentEventBinding,
        getConvo: jest.fn(),
        getMessages: jest.fn(),
      },
    });

    await expect(
      resolver(envelope(), { idempotencyKey: 'trigger-1' } as never),
    ).rejects.toMatchObject({ code: 'EVENT_BINDING_INVALID', retryable: false });
  });
});
