import type { EnqueueAgentTrigger } from './subagentCompletionWakeup';
import type { SubagentTaskSettlement } from './subagentThreads';
import { getAgentTriggerIdempotencyKey, parseAgentTriggerEnvelope } from './triggers/envelope';
import { createSubagentCompletionWakeupHandler } from './subagentCompletionWakeup';

const NOW = 1_775_000_000_000;

function enqueueMock(): jest.MockedFunction<EnqueueAgentTrigger> {
  return jest.fn<ReturnType<EnqueueAgentTrigger>, Parameters<EnqueueAgentTrigger>>(async () => ({
    id: 'delivery-1',
  }));
}

function settlement(overrides: Partial<SubagentTaskSettlement> = {}): SubagentTaskSettlement {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    parentConversationId: 'conversation-1',
    parentMessageId: 'response-1',
    parentAgentId: 'agent-1',
    taskId: 'task-1',
    threadId: 'thread-1',
    subagentType: 'researcher',
    settledAt: NOW - 10,
    status: 'completed',
    ...overrides,
  } as SubagentTaskSettlement;
}

describe('createSubagentCompletionWakeupHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enqueues a bounded continuation on the exact parent branch without copying child output', async () => {
    const enqueue = enqueueMock();
    const notify = createSubagentCompletionWakeupHandler(enqueue);

    await notify(settlement());

    expect(enqueue).toHaveBeenCalledTimes(1);
    const [envelopeValue, options] = enqueue.mock.calls[0]!;
    const envelope = parseAgentTriggerEnvelope(envelopeValue);
    expect(envelope).toMatchObject({
      version: 1,
      mode: 'continue',
      principal: { userId: 'user-1', tenantId: 'tenant-1' },
      target: {
        agentId: 'agent-1',
        conversationId: 'conversation-1',
        parentMessageId: 'response-1',
      },
      event: {
        id: 'task-1:completed',
        type: 'subagent.completed',
        source: { id: 'subagent-completion', type: 'internal' },
        payload: {
          taskId: 'task-1',
          threadId: 'thread-1',
          subagentType: 'researcher',
          status: 'completed',
        },
      },
    });
    expect(envelope.input).toContain('check_background_task');
    expect(envelope.input).not.toContain('"result":');
    expect(options).toEqual({
      orderingKey: 'subagent-completion:conversation-1',
      availableAt: new Date(NOW + 250),
    });
  });

  it('keeps one idempotency identity across duplicate settlement callbacks', async () => {
    const enqueue = enqueueMock();
    const notify = createSubagentCompletionWakeupHandler(enqueue);
    const event = settlement({ status: 'error' });

    await notify(event);
    await notify(event);

    const first = parseAgentTriggerEnvelope(enqueue.mock.calls[0]![0]);
    const retry = parseAgentTriggerEnvelope(enqueue.mock.calls[1]![0]);
    expect(first.requestId).not.toBe(retry.requestId);
    expect(first.deliveryId).toBe('task-1:error');
    expect(getAgentTriggerIdempotencyKey(first)).toBe(getAgentTriggerIdempotencyKey(retry));
    expect(first.input).toContain('has error');
  });

  it('does not enqueue without a stable initiating agent', async () => {
    const enqueue = enqueueMock();
    const notify = createSubagentCompletionWakeupHandler(enqueue);

    await notify(settlement({ parentAgentId: undefined }));

    expect(enqueue).not.toHaveBeenCalled();
  });
});
