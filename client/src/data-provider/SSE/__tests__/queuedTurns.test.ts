const mockListAgentQueuedTurns = jest.fn();
const mockEnqueueAgentQueuedTurn = jest.fn();
const mockCancelAgentQueuedTurn = jest.fn();

jest.mock('librechat-data-provider', () => ({
  QueryKeys: { agentQueuedTurns: 'agentQueuedTurns' },
  MutationKeys: {
    enqueueAgentQueuedTurn: 'enqueueAgentQueuedTurn',
    cancelAgentQueuedTurn: 'cancelAgentQueuedTurn',
  },
  dataService: {
    listAgentQueuedTurns: (...args: unknown[]) => mockListAgentQueuedTurns(...args),
    enqueueAgentQueuedTurn: (...args: unknown[]) => mockEnqueueAgentQueuedTurn(...args),
    cancelAgentQueuedTurn: (...args: unknown[]) => mockCancelAgentQueuedTurn(...args),
  },
}));

import {
  cancelAgentQueuedTurn,
  enqueueAgentQueuedTurn,
  fetchAgentQueuedTurns,
  isDefiniteQueuedTurnsUnsupported,
} from '../queuedTurns';

describe('Agent queued-turn data adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts the stable request identity and exact visible parent', async () => {
    const input = {
      conversationId: 'conversation/one',
      clientRequestId: 'client-1',
      parentMessageId: 'assistant-1',
      text: 'next turn',
    };
    mockEnqueueAgentQueuedTurn.mockResolvedValueOnce({
      receipt: { queuedTurnId: 'queued-1' },
    });

    await expect(enqueueAgentQueuedTurn(input)).resolves.toEqual({
      queuedTurnId: 'queued-1',
    });

    expect(mockEnqueueAgentQueuedTurn).toHaveBeenCalledWith(input);
  });

  it('unwraps the shared list and cancel responses', async () => {
    mockListAgentQueuedTurns.mockResolvedValueOnce({ queuedTurns: [] });
    mockCancelAgentQueuedTurn.mockResolvedValueOnce({
      receipt: { queuedTurnId: 'queued/two', status: 'cancelled' },
    });

    await expect(fetchAgentQueuedTurns('conversation/one')).resolves.toEqual([]);
    await expect(
      cancelAgentQueuedTurn({
        conversationId: 'conversation/one',
        queuedTurnId: 'queued/two',
      }),
    ).resolves.toEqual({ queuedTurnId: 'queued/two', status: 'cancelled' });

    expect(mockListAgentQueuedTurns).toHaveBeenCalledWith('conversation/one');
    expect(mockCancelAgentQueuedTurn).toHaveBeenCalledWith('queued/two');
  });

  it.each([404, 501])('classifies %s as a definite old-server fallback', (status) => {
    expect(isDefiniteQueuedTurnsUnsupported({ response: { status } })).toBe(true);
  });

  it.each([400, 409, 500, undefined])(
    'keeps status %s server-owned because it is not an unsupported route',
    (status) => {
      const error = status == null ? new Error('network') : { response: { status } };
      expect(isDefiniteQueuedTurnsUnsupported(error)).toBe(false);
    },
  );
});
