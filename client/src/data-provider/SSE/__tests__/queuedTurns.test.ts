import { act, renderHook, waitFor } from '@testing-library/react';

const mockListAgentQueuedTurns = jest.fn();
const mockEnqueueAgentQueuedTurn = jest.fn();
const mockCancelAgentQueuedTurn = jest.fn();
const mockRefetch = jest.fn();
const mockCancelQueries = jest.fn().mockResolvedValue(undefined);
const mockQueryClient = { cancelQueries: mockCancelQueries };
const mockUseQuery = jest.fn((options: unknown) => ({ options, refetch: mockRefetch }));

jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
  useMutation: jest.fn(),
  useQueryClient: () => mockQueryClient,
}));

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
  isDefiniteQueuedTurnRejection,
  isDefiniteQueuedTurnsUnsupported,
  shouldPollAgentQueuedTurns,
  useAgentQueuedTurns,
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

    await expect(
      fetchAgentQueuedTurns('conversation/one', ['request/one', 'request,two']),
    ).resolves.toEqual([]);
    await expect(
      cancelAgentQueuedTurn({
        conversationId: 'conversation/one',
        queuedTurnId: 'queued/two',
      }),
    ).resolves.toEqual({ queuedTurnId: 'queued/two', status: 'cancelled' });

    expect(mockListAgentQueuedTurns).toHaveBeenCalledWith('conversation/one', [
      'request/one',
      'request,two',
    ]);
    expect(mockCancelAgentQueuedTurn).toHaveBeenCalledWith('queued/two');
  });

  it('distinguishes an old route from an application-level 404', () => {
    expect(isDefiniteQueuedTurnsUnsupported({ response: { status: 404 } })).toBe(true);
    expect(
      isDefiniteQueuedTurnsUnsupported({
        response: { status: 404, data: { code: 'CONVERSATION_NOT_FOUND' } },
      }),
    ).toBe(false);
  });

  it('keeps the explicit priority fallback on the legacy local path', () => {
    expect(
      isDefiniteQueuedTurnsUnsupported({
        response: { status: 501, data: { code: 'QUEUED_TURN_PRIORITY_UNSUPPORTED' } },
      }),
    ).toBe(true);
  });

  it.each([400, 409, 500, undefined])(
    'keeps status %s server-owned because it is not an unsupported route',
    (status) => {
      const error = status == null ? new Error('network') : { response: { status } };
      expect(isDefiniteQueuedTurnsUnsupported(error)).toBe(false);
    },
  );

  it.each([400, 403, 409, 413, 429])(
    'classifies %s as a definite non-commit rejection',
    (status) => {
      expect(isDefiniteQueuedTurnRejection({ response: { status } })).toBe(true);
    },
  );

  it('classifies a coded conversation 404 as a definite rejection', () => {
    expect(
      isDefiniteQueuedTurnRejection({
        response: { status: 404, data: { code: 'CONVERSATION_NOT_FOUND' } },
      }),
    ).toBe(true);
  });

  it.each([408, 425, 500, 503, undefined])(
    'keeps %s outcome-ambiguous for request-id reconciliation',
    (status) => {
      const error = status == null ? new Error('network') : { response: { status } };
      expect(isDefiniteQueuedTurnRejection(error)).toBe(false);
    },
  );

  it('stops background polling for a fail-closed indeterminate claim', () => {
    expect(
      shouldPollAgentQueuedTurns([
        {
          status: 'claimed',
          failure: { code: 'ADMISSION_INDETERMINATE' },
        },
      ]),
    ).toBe(false);
    expect(shouldPollAgentQueuedTurns([{ status: 'claimed' }])).toBe(true);
    expect(shouldPollAgentQueuedTurns([{ status: 'queued' }])).toBe(true);
  });

  it('refreshes stopped reconciliation work on every mount and focus', () => {
    renderHook(() => useAgentQueuedTurns('conversation/one', true));

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always',
      }),
    );
  });

  it('keeps one cache authority and refetches when known receipt ids change', async () => {
    const rendered = renderHook(
      ({ ids }: { ids: string[] }) => useAgentQueuedTurns('conversation/one', true, ids),
      { initialProps: { ids: ['request-one'] } },
    );

    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ['agentQueuedTurns', 'conversation/one'],
      }),
    );
    expect(mockRefetch).not.toHaveBeenCalled();

    rendered.rerender({ ids: [] });

    await waitFor(() =>
      expect(mockCancelQueries).toHaveBeenCalledWith({
        queryKey: ['agentQueuedTurns', 'conversation/one'],
        exact: true,
      }),
    );
    await waitFor(() =>
      expect(mockRefetch).toHaveBeenCalledWith({
        cancelRefetch: true,
      }),
    );
    expect(mockCancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      mockRefetch.mock.invocationCallOrder[0],
    );
    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ['agentQueuedTurns', 'conversation/one'],
      }),
    );
  });

  it('lets only the newest identity projection refetch after cancellation', async () => {
    let releaseFirstCancellation: (() => void) | undefined;
    mockCancelQueries
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirstCancellation = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const rendered = renderHook(
      ({ ids }: { ids: string[] }) => useAgentQueuedTurns('conversation/one', true, ids),
      { initialProps: { ids: ['request-one'] } },
    );

    rendered.rerender({ ids: ['request-two'] });
    rendered.rerender({ ids: ['request-three'] });

    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    await act(async () => releaseFirstCancellation?.());
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
