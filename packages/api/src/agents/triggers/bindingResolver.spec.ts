import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { createAgentEventContinueResolver } from './bindingResolver';
import { createAgentTriggerEnvelope } from './envelope';

const bindingId = `evtbind_${'a'.repeat(48)}`;
const sourceKeyId = '507f191e810c19729de860eb';

function envelope() {
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
  });
}

describe('agent event continuation resolver', () => {
  it('defers without consuming attempts while the rollout gate is disabled', async () => {
    const resolver = createAgentEventContinueResolver({
      enabled: () => false,
      methods: {
        getAgentEventBinding: jest.fn(),
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
    const resolver = createAgentEventContinueResolver({
      enabled: () => true,
      methods: {
        getAgentEventBinding: jest.fn(async () => ({
          conversationId: 'child-thread',
          agentId: 'agent-player',
          tenantId: 'tenant-1',
          binding: { bindingId, sourceKeyId, actorId: 'player' },
          lineage: {} as never,
        })),
        getMessages: jest.fn(async () => [
          Object.assign(new HumanMessage('first'), {
            messageId: 'user-1',
            isCreatedByUser: true,
            createdAt: new Date(1),
          }),
          Object.assign(new AIMessage('done'), {
            messageId: 'assistant-1',
            isCreatedByUser: false,
            createdAt: new Date(2),
          }),
        ]) as never,
      },
    });

    await expect(resolver(envelope(), { idempotencyKey: 'trigger-1' } as never)).resolves.toEqual({
      status: 'ready',
      input: 'Your turn.',
      parentMessageId: 'assistant-1',
    });
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
        getMessages: jest.fn(async () => []) as never,
      },
    });

    await expect(
      resolver(envelope(), { idempotencyKey: 'trigger-1' } as never),
    ).rejects.toMatchObject({ code: 'EVENT_BINDING_INVALID', retryable: false });
  });
});
