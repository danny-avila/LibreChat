import { Types } from 'mongoose';
import type { AgentQueuedTurnMethods, AgentQueuedTurnRecord } from '@librechat/data-schemas';
import type { AgentQueuedTurnHttpDeps } from './queuedTurnHttp';
import { handleAgentQueuedTurnEnqueue } from './queuedTurnHttp';

const USER_ID = '507f191e810c19729de860ea';

function turn(status: AgentQueuedTurnRecord['status']): AgentQueuedTurnRecord {
  return {
    queuedTurnId: 'queued-turn-1',
    user: new Types.ObjectId(USER_ID),
    conversationId: 'conversation-1',
    agentId: 'agent_1',
    parentMessageId: 'assistant-1',
    clientRequestId: 'client-request-1',
    fingerprint: 'fingerprint-1',
    sequence: 1,
    status,
    priority: false,
    text: 'follow up',
    attempts: status === 'admitted' ? 1 : 0,
    availableAt: new Date('2026-08-30T12:00:00Z'),
    createdAt: new Date('2026-08-30T12:00:00Z'),
  };
}

function requestBody() {
  return {
    conversationId: 'conversation-1',
    parentMessageId: 'assistant-1',
    clientRequestId: 'client-request-1',
    text: 'follow up',
  };
}

describe('Agent queued-turn HTTP admission receipts', () => {
  it('resolves a scheduling-pending response through an exact same-body terminal replay', async () => {
    const enqueueAgentQueuedTurn = jest
      .fn()
      .mockResolvedValueOnce({ turn: turn('queued'), replayed: false });
    const getAgentQueuedTurnByClientRequestId = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(turn('admitted'));
    const schedule = jest.fn().mockRejectedValueOnce(new Error('scheduler unavailable'));
    const methods = {
      getConvo: jest.fn(async () => ({
        agent_id: 'agent_1',
        endpoint: 'agents',
      })),
      enqueueAgentQueuedTurn,
      getAgentQueuedTurnByClientRequestId,
      listActiveAgentQueuedTurns: jest.fn(async () => []),
    };
    const deps = {
      methods: methods as unknown as AgentQueuedTurnMethods & {
        getConvo: typeof methods.getConvo;
      },
      scheduler: { schedule },
      checkAgentAccess: jest.fn(async () => true),
    } satisfies AgentQueuedTurnHttpDeps;

    await expect(
      handleAgentQueuedTurnEnqueue({ id: USER_ID }, requestBody(), deps),
    ).resolves.toMatchObject({
      status: 503,
      body: { code: 'QUEUED_TURN_SCHEDULING_PENDING' },
    });
    await expect(
      handleAgentQueuedTurnEnqueue({ id: USER_ID }, requestBody(), deps),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        receipt: {
          queuedTurnId: 'queued-turn-1',
          clientRequestId: 'client-request-1',
          status: 'admitted',
        },
      },
    });

    expect(getAgentQueuedTurnByClientRequestId).toHaveBeenCalledTimes(2);
    expect(getAgentQueuedTurnByClientRequestId.mock.calls[1][0]).toEqual(
      getAgentQueuedTurnByClientRequestId.mock.calls[0][0],
    );
    expect(enqueueAgentQueuedTurn).toHaveBeenCalledTimes(1);
    expect(methods.getConvo).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
