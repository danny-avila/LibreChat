import type {
  IAgentEventActorReconciliation,
  IAgentEventActorState,
} from '@librechat/data-schemas';
import {
  captureAgentEventCheckpoint,
  deleteAgentCheckpoint,
  forkAgentEventCheckpoint,
  getAgentCheckpointer,
} from '../checkpointer';
import { createAgentEventActionRecorder, findAgentEventAppliedAction } from './outcome';
import { executeAgentEventActor } from './actor';

jest.mock('../checkpointer', () => ({
  ...jest.requireActual('../checkpointer'),
  captureAgentEventCheckpoint: jest.fn(),
  deleteAgentCheckpoint: jest.fn(),
  forkAgentEventCheckpoint: jest.fn(),
  getAgentCheckpointer: jest.fn(),
}));

const mockedCapture = jest.mocked(captureAgentEventCheckpoint);
const mockedDelete = jest.mocked(deleteAgentCheckpoint);
const mockedFork = jest.mocked(forkAgentEventCheckpoint);
const mockedGetCheckpointer = jest.mocked(getAgentCheckpointer);

describe('event actor host adapter', () => {
  const conversationId = 'actor-thread';
  let state: IAgentEventActorState | null;
  let epoch = 0;
  let legacyTurn: { token: string; startedAt: Date } | null = null;
  let nextCheckpoint = 1;

  beforeEach(() => {
    state = null;
    epoch = 0;
    legacyTurn = null;
    nextCheckpoint = 1;
    jest.clearAllMocks();
    mockedGetCheckpointer.mockResolvedValue({} as never);
    mockedFork.mockImplementation(async (source, checkpointNs) => ({
      ...source,
      checkpointNs,
    }));
    mockedCapture.mockImplementation(async (threadId, checkpointNs) => ({
      threadId,
      checkpointNs,
      checkpointId: `checkpoint-${nextCheckpoint++}`,
    }));
    mockedDelete.mockReset();
    mockedDelete.mockResolvedValue();
  });

  const deps = () => ({
    getSnapshot: jest.fn(async () => ({
      state,
      reconciliations: [] as IAgentEventActorReconciliation[],
      legacyTurn,
      epoch,
    })),
    commitState: jest.fn(async ({ expected, expectedEpoch, checkpoint }) => {
      if (
        expectedEpoch !== epoch ||
        (state == null && expected != null) ||
        (state != null &&
          (expected == null ||
            expected.generation !== state.generation ||
            expected.checkpoint.checkpointId !== state.checkpoint.checkpointId ||
            (expected.requiresColdStart === true) !== (state.requiresColdStart === true)))
      ) {
        return { status: 'stale' as const, ...(state == null ? {} : { state }) };
      }
      const previous = state?.checkpoint;
      state = {
        generation: (state?.generation ?? 0) + 1,
        checkpoint,
        ...(previous == null ? {} : { previousCheckpoint: previous }),
      };
      return { status: 'committed' as const, state };
    }),
    recordReconciliation: jest.fn(async () => true),
    resolveReconciliation: jest.fn(async () => true),
    admitAction: jest.fn(async () => true),
    releaseAction: jest.fn(async () => true),
    hasActionAdmission: jest.fn(async () => false),
  });

  it('cold-starts once, then forks and warm-continues only the next event', async () => {
    const dependencies = deps();
    const invocations: Array<{ continuation: string; checkpointId?: string }> = [];
    const run = async (invocationId: string) =>
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId,
          event: { id: invocationId, type: 'turn' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async (context) => {
            invocations.push({
              continuation: context.continuation,
              ...(context.checkpointId == null ? {} : { checkpointId: context.checkpointId }),
            });
            return `response-${invocationId}`;
          },
          readAppliedAction: () => ({ toolName: 'submit_move', toolCallId: invocationId }),
        },
        dependencies,
      );

    const first = await run('event-1');
    const second = await run('event-2');

    expect(first).toMatchObject({ value: 'response-event-1', execution: { status: 'applied' } });
    expect(second).toMatchObject({ value: 'response-event-2', execution: { status: 'applied' } });
    expect(invocations).toEqual([
      { continuation: 'cold' },
      { continuation: 'warm', checkpointId: 'checkpoint-1' },
    ]);
    expect(mockedFork).toHaveBeenCalledWith(
      expect.objectContaining({ checkpointId: 'checkpoint-1' }),
      expect.stringMatching(/^event-actor\//),
      'event-2',
      undefined,
    );
    expect(state).toMatchObject({ generation: 2, checkpoint: { checkpointId: 'checkpoint-2' } });
  });

  it('commits from the execution-time receipt when run steps lag sendMessage', async () => {
    const dependencies = deps();
    const expectedAction = { toolName: 'submit_move', argumentSubset: { gameId: 'game-1' } };
    const invocations: Array<{ continuation: string }> = [];
    let toolExecutions = 0;
    const run = async (invocationId: string) => {
      const recorder = createAgentEventActionRecorder(expectedAction);
      return executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId,
          event: { id: invocationId, type: 'turn' },
          expectedAction,
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async (context) => {
            invocations.push({ continuation: context.continuation });
            toolExecutions += 1;
            recorder.observeToolEnd({
              input: { gameId: 'game-1', move: 'e4' },
              output: {
                name: 'submit_move_mcp_chess',
                tool_call_id: `call-${invocationId}`,
                content: '{"ok":true}',
              },
            });
            return `response-${invocationId}`;
          },
          /** Reproduces the observed race: the run-step collection is still
           * empty the instant sendMessage resolves, so only the graph-context
           * receipt carries the applied-action proof. */
          readAppliedAction: () =>
            recorder.read() ?? findAgentEventAppliedAction(expectedAction, [], []),
        },
        dependencies,
      );
    };

    const first = await run('event-1');
    const second = await run('event-2');

    expect(first.execution).toMatchObject({
      status: 'applied',
      result: { action: { toolName: 'submit_move_mcp_chess', toolCallId: 'call-event-1' } },
    });
    expect(second.execution).toMatchObject({ status: 'applied' });
    expect(invocations).toEqual([{ continuation: 'cold' }, { continuation: 'warm' }]);
    expect(toolExecutions).toBe(2);
    expect(state).toMatchObject({ generation: 2, checkpoint: { checkpointId: 'checkpoint-2' } });
  });

  it('refuses to prepare while a legacy turn fence is open', async () => {
    state = {
      generation: 1,
      checkpoint: {
        threadId: conversationId,
        checkpointId: 'checkpoint-fenced',
        checkpointNs: 'event-actor/fenced',
      },
    };
    legacyTurn = { token: 'legacy-live', startedAt: new Date() };
    const dependencies = deps();
    let invoked = false;

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-during-legacy',
          event: { id: 'event-during-legacy' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => {
            invoked = true;
            return 'response';
          },
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('blocked on an in-flight legacy turn');

    expect(invoked).toBe(false);
    expect(mockedFork).not.toHaveBeenCalled();
    expect(dependencies.commitState).not.toHaveBeenCalled();
  });

  it('preserves an old ambiguous fence instead of replaying based on age', async () => {
    legacyTurn = { token: 'legacy-crashed', startedAt: new Date(Date.now() - 120_000) };
    const dependencies = deps();

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-after-crash',
          event: { id: 'event-after-crash' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => 'response',
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('blocked on an in-flight legacy turn');

    /** Elapsed time does not establish whether the external action ran. */
    expect(dependencies.commitState).not.toHaveBeenCalled();
  });

  it('cold-starts after a legacy fallback invalidates the committed head', async () => {
    state = {
      generation: 1,
      checkpoint: {
        threadId: conversationId,
        checkpointId: 'checkpoint-before-legacy',
        checkpointNs: 'event-actor/before-legacy',
      },
      requiresColdStart: true,
    };
    const dependencies = deps();
    let continuation: 'warm' | 'cold' | undefined;

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-after-legacy',
          event: { id: 'event-after-legacy' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async (context) => {
            continuation = context.continuation;
            return 'response';
          },
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).resolves.toMatchObject({ execution: { status: 'applied', continuation: 'cold' } });

    expect(continuation).toBe('cold');
    expect(mockedFork).not.toHaveBeenCalled();
    expect(dependencies.commitState).toHaveBeenCalledWith(
      expect.objectContaining({
        expected: expect.objectContaining({ requiresColdStart: true }),
      }),
    );
    expect(state?.requiresColdStart).toBeUndefined();
  });

  it('cannot commit a cold rebuild past a legacy turn its history predates', async () => {
    const dependencies = deps();

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-stale-cold',
          event: { id: 'event-stale-cold' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => {
            /** A concurrent legacy delivery lands after this cold rebuild
             * loaded its history. With no head to mark and nothing else to
             * change, the invalidation epoch is its only durable trace. */
            epoch += 1;
            return 'response';
          },
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('commit_conflict reconciliation');

    expect(state).toBeNull();
    expect(dependencies.commitState).toHaveBeenCalledWith(
      expect.objectContaining({ expectedEpoch: 0 }),
    );
    expect(dependencies.recordReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliation: expect.objectContaining({ status: 'commit_conflict' }),
      }),
    );
  });

  it('cannot clear a cold-start marker written after warm preparation', async () => {
    state = {
      generation: 1,
      checkpoint: {
        threadId: conversationId,
        checkpointId: 'checkpoint-warm',
        checkpointNs: 'event-actor/warm',
      },
    };
    const dependencies = deps();

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-raced-by-legacy',
          event: { id: 'event-raced-by-legacy' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => {
            state = { ...state!, requiresColdStart: true };
            return 'response';
          },
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('requires commit_conflict reconciliation');

    expect(dependencies.recordReconciliation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reconciliation: expect.objectContaining({ status: 'commit_conflict' }),
      }),
    );

    expect(dependencies.commitState).toHaveBeenCalledWith(
      expect.objectContaining({
        expected: expect.not.objectContaining({ requiresColdStart: true }),
      }),
    );
    expect(state?.requiresColdStart).toBe(true);
  });

  it('discards a no-action fork without advancing the actor head', async () => {
    state = {
      generation: 1,
      checkpoint: {
        threadId: conversationId,
        checkpointId: 'checkpoint-base',
        checkpointNs: 'event-actor/base',
      },
    };
    const dependencies = deps();
    const result = await executeAgentEventActor(
      {
        user: 'user-1',
        conversationId,
        invocationId: 'event-no-action',
        event: { id: 'event-no-action' },
        signal: new AbortController().signal,
        legacyTurnStaleMs: 60_000,
        invoke: async () => 'response',
        readAppliedAction: () => undefined,
      },
      dependencies,
    );

    expect(result.execution.status).toBe('completed_no_action');
    expect(dependencies.commitState).not.toHaveBeenCalled();
    expect(mockedDelete).toHaveBeenCalledWith(
      conversationId,
      undefined,
      undefined,
      expect.objectContaining({
        throwOnError: true,
        checkpointNamespace: expect.stringMatching(/^event-actor\//),
      }),
    );
    expect(state.generation).toBe(1);
  });

  it('preserves action evidence when the provider fails after the tool completed', async () => {
    const dependencies = deps();
    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-action-then-error',
          event: { id: 'event-action-then-error' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => {
            throw new Error('provider stream failed after tool');
          },
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('provider stream failed after tool');

    expect(dependencies.commitState).toHaveBeenCalledTimes(1);
    expect(dependencies.recordReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          invocationId: 'event-action-then-error',
          status: 'invocation_pending',
        }),
      }),
    );
    expect(dependencies.resolveReconciliation).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('retains an applied fork when its terminal checkpoint cannot be observed', async () => {
    mockedCapture.mockResolvedValueOnce(null);
    const dependencies = deps();
    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-checkpoint-indeterminate',
          event: { id: 'event-checkpoint-indeterminate' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => 'response',
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('requires commit_indeterminate reconciliation');

    expect(dependencies.commitState).not.toHaveBeenCalled();
    expect(dependencies.recordReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliation: expect.objectContaining({ status: 'commit_indeterminate' }),
      }),
    );
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('recovers an indeterminate cleanup after the actor head was committed', async () => {
    state = {
      generation: 2,
      checkpoint: {
        threadId: conversationId,
        checkpointId: 'checkpoint-base',
        checkpointNs: 'event-actor/base',
      },
      previousCheckpoint: {
        threadId: conversationId,
        checkpointId: 'checkpoint-old',
        checkpointNs: 'event-actor/old',
      },
    };
    mockedDelete.mockRejectedValueOnce(new Error('checkpoint cleanup unavailable'));
    const dependencies = deps();
    const result = await executeAgentEventActor(
      {
        user: 'user-1',
        conversationId,
        invocationId: 'event-commit-then-cleanup-error',
        event: { id: 'event-commit-then-cleanup-error' },
        signal: new AbortController().signal,
        legacyTurnStaleMs: 60_000,
        invoke: async () => 'response',
        readAppliedAction: () => ({ toolName: 'submit_move' }),
      },
      dependencies,
    );

    expect(result.execution.status).toBe('applied');
    expect(dependencies.recordReconciliation).toHaveBeenCalledTimes(1);
    expect(dependencies.recordReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliation: expect.objectContaining({ status: 'invocation_pending' }),
      }),
    );
    expect(state.generation).toBe(3);
  });

  it('persists and surfaces a checkpoint conflict after the action was applied', async () => {
    state = {
      generation: 1,
      checkpoint: {
        threadId: conversationId,
        checkpointId: 'checkpoint-base',
        checkpointNs: 'event-actor/base',
      },
    };
    const dependencies = deps();

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-conflict',
          event: { id: 'event-conflict' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => {
            state = {
              generation: 2,
              checkpoint: {
                threadId: conversationId,
                checkpointId: 'checkpoint-competing',
                checkpointNs: 'event-actor/competing',
              },
            };
            return 'response';
          },
          readAppliedAction: () => ({ toolName: 'submit_move', toolCallId: 'call-conflict' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('requires commit_conflict reconciliation');

    expect(dependencies.recordReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          invocationId: 'event-conflict',
          status: 'commit_conflict',
          action: { toolName: 'submit_move', toolCallId: 'call-conflict' },
        }),
      }),
    );
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('still records reconciliation when an indeterminate commit cannot be read back', async () => {
    const baseState: IAgentEventActorState = {
      generation: 1,
      checkpoint: {
        threadId: conversationId,
        checkpointId: 'checkpoint-base',
        checkpointNs: 'event-actor/base',
      },
    };
    const dependencies = {
      getSnapshot: jest
        .fn()
        .mockResolvedValueOnce({
          state: baseState,
          reconciliations: [],
          legacyTurn: null,
          epoch: 0,
        })
        .mockRejectedValueOnce(new Error('readback unavailable')),
      commitState: jest.fn(async () => {
        throw new Error('commit result unavailable');
      }),
      recordReconciliation: jest.fn(async () => true),
      resolveReconciliation: jest.fn(async () => true),
    };

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-ambiguous-commit',
          event: { id: 'event-ambiguous-commit' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => 'response',
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('requires commit_indeterminate reconciliation');

    expect(dependencies.recordReconciliation).toHaveBeenCalledTimes(2);
    expect(dependencies.recordReconciliation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reconciliation: expect.objectContaining({ status: 'commit_indeterminate' }),
      }),
    );
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('does not clear a checkpoint marker before durable history is verified', async () => {
    const authoritative: IAgentEventActorState = {
      generation: 1,
      checkpoint: {
        threadId: conversationId,
        checkpointId: 'checkpoint-authoritative',
        checkpointNs: 'event-actor/authoritative',
      },
    };
    state = authoritative;
    const marker = {
      invocationId: 'event-recovered',
      status: 'commit_indeterminate' as const,
      checkpoint: authoritative.checkpoint,
      action: { toolName: 'submit_move' },
      observedAt: new Date(),
    };
    const dependencies = deps();
    dependencies.getSnapshot.mockResolvedValueOnce({
      state: authoritative,
      reconciliations: [marker],
      legacyTurn: null,
      epoch: 0,
    });

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-next',
          event: { id: 'event-next' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => 'response',
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('blocked on commit_indeterminate reconciliation');

    expect(dependencies.resolveReconciliation).not.toHaveBeenCalled();
  });

  it('does not clear a persistence failure merely because its checkpoint is authoritative', async () => {
    const authoritative: IAgentEventActorState = {
      generation: 1,
      checkpoint: {
        threadId: conversationId,
        checkpointId: 'checkpoint-with-missing-history',
        checkpointNs: 'event-actor/missing-history',
      },
    };
    const dependencies = {
      ...deps(),
      getSnapshot: jest.fn(async () => ({
        state: authoritative,
        reconciliations: [
          {
            invocationId: 'event-persistence-failed',
            status: 'persistence_failed' as const,
            checkpoint: authoritative.checkpoint,
            action: { toolName: 'submit_move' },
            observedAt: new Date(),
          },
        ],
        legacyTurn: null,
        epoch: 0,
      })),
    };

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-after-persistence-failure',
          event: { id: 'event-after-persistence-failure' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => 'response',
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('blocked on persistence_failed reconciliation');
    expect(dependencies.resolveReconciliation).not.toHaveBeenCalled();
  });

  it('blocks new invocations while a prior applied fork needs reconciliation', async () => {
    const dependencies = {
      getSnapshot: jest.fn(async () => ({
        state: null,
        reconciliations: [
          {
            invocationId: 'event-conflict',
            status: 'commit_conflict' as const,
            checkpoint: {
              threadId: conversationId,
              checkpointNs: 'event-actor/conflict',
            },
            action: { toolName: 'submit_move' },
            observedAt: new Date(),
          },
        ],
        legacyTurn: null,
        epoch: 0,
      })),
      commitState: jest.fn(),
      recordReconciliation: jest.fn(),
      resolveReconciliation: jest.fn(),
    };

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-after-conflict',
          event: { id: 'event-after-conflict' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => 'response',
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('blocked on commit_conflict reconciliation');
    expect(mockedGetCheckpointer).not.toHaveBeenCalled();
  });

  it('refuses a cold start after its bound child disappeared', async () => {
    const dependencies = {
      getSnapshot: jest.fn(async () => undefined),
      commitState: jest.fn(),
      recordReconciliation: jest.fn(),
      resolveReconciliation: jest.fn(),
    };

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-after-delete',
          event: { id: 'event-after-delete' },
          signal: new AbortController().signal,
          legacyTurnStaleMs: 60_000,
          invoke: async () => 'response',
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('Event actor binding is no longer active');
    expect(mockedGetCheckpointer).not.toHaveBeenCalled();
  });

  it('replays a delivery receipt and cleans its stranded active marker without executing', async () => {
    const checkpoint = {
      threadId: conversationId,
      checkpointId: 'checkpoint-terminal',
      checkpointNs: 'event-actor/event-replay',
    };
    const invoke = jest.fn(async () => 'must not run');
    const clearReconciliation = jest.fn(async () => true);
    const dependencies = {
      ...deps(),
      getSnapshot: jest.fn(async () => ({
        state: { generation: 1, checkpoint },
        reconciliations: [
          {
            invocationId: 'event-replay',
            status: 'history_persisted' as const,
            checkpoint,
            action: { toolName: 'submit_move' },
            observedAt: new Date(),
          },
        ],
        legacyTurn: null,
        epoch: 0,
      })),
      getReceipt: jest.fn(async () => ({
        bindingId: 'binding-1',
        resolution: 'checkpoint_verified' as const,
        checkpoint,
        action: { toolName: 'submit_move' },
        settledAt: new Date(),
      })),
      clearReconciliation,
    };

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          bindingId: 'binding-1',
          invocationId: 'event-replay',
          event: { id: 'event-replay' },
          signal: new AbortController().signal,
          invoke,
          readAppliedAction: () => undefined,
        },
        dependencies,
      ),
    ).rejects.toThrow('already has a terminal receipt');

    expect(clearReconciliation).toHaveBeenCalledWith({
      user: 'user-1',
      conversationId,
      invocationId: 'event-replay',
      checkpoint,
      resolution: 'checkpoint_verified',
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(dependencies.recordReconciliation).not.toHaveBeenCalled();
  });

  it('abandons the lifecycle when delivery-owned action admission already settled', async () => {
    const invoke = jest.fn(async () => 'must not run');
    const resolveReconciliation = jest.fn(async () => true);
    const dependencies = {
      ...deps(),
      getReceipt: jest.fn().mockResolvedValue(null),
      admitAction: jest.fn().mockResolvedValue(false),
      resolveReconciliation,
    };

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          bindingId: 'binding-1',
          invocationId: 'event-race',
          event: { id: 'event-race' },
          signal: new AbortController().signal,
          invoke,
          readAppliedAction: () => undefined,
        },
        dependencies,
      ),
    ).rejects.toThrow('action admission was already consumed or settled');

    expect(dependencies.recordReconciliation).toHaveBeenCalledTimes(1);
    expect(dependencies.admitAction).toHaveBeenCalledWith({
      deliveryKey: 'event-race',
      user: 'user-1',
      bindingId: 'binding-1',
      conversationId,
      admittedAt: expect.any(Date),
      admissionId: expect.any(String),
    });
    expect(resolveReconciliation).toHaveBeenNthCalledWith(1, {
      user: 'user-1',
      conversationId,
      invocationId: 'event-race',
      checkpoint: expect.objectContaining({ threadId: conversationId }),
      expectedActionAdmitted: false,
      resolution: 'invocation_abandoned',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('releases delivery admission when the actor completes without an external action', async () => {
    const dependencies = {
      ...deps(),
      getReceipt: jest.fn().mockResolvedValue(null),
    };

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          bindingId: 'binding-1',
          invocationId: 'event-no-action',
          event: { id: 'event-no-action' },
          signal: new AbortController().signal,
          invoke: async () => 'no action',
          readAppliedAction: () => undefined,
        },
        dependencies,
      ),
    ).resolves.toMatchObject({ execution: { status: 'completed_no_action' } });

    expect(dependencies.releaseAction).toHaveBeenCalledWith({
      deliveryKey: 'event-no-action',
      user: 'user-1',
      bindingId: 'binding-1',
      conversationId,
      admissionId: expect.any(String),
    });
    expect(dependencies.releaseAction.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.resolveReconciliation.mock.invocationCallOrder[0],
    );
  });

  it('recovers a no-action lifecycle after admission was released before owner exit', async () => {
    const invoke = jest.fn(async () => 'retried without action');
    const checkpoint = {
      threadId: conversationId,
      checkpointNs: 'event-actor/orphaned-no-action',
    };
    const dependencies = {
      ...deps(),
      getReceipt: jest.fn().mockResolvedValue(null),
    };
    dependencies.getSnapshot.mockResolvedValue({
      state: null,
      reconciliations: [
        {
          invocationId: 'event-orphaned-no-action',
          actionAdmitted: true,
          status: 'invocation_pending',
          checkpoint,
          action: { toolName: 'submit_move' },
          observedAt: new Date(),
        },
      ],
      legacyTurn: null,
      epoch: 0,
    });

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          bindingId: 'binding-1',
          invocationId: 'event-orphaned-no-action',
          event: { id: 'event-orphaned-no-action' },
          signal: new AbortController().signal,
          invoke,
          readAppliedAction: () => undefined,
        },
        dependencies,
      ),
    ).resolves.toMatchObject({ execution: { status: 'completed_no_action' } });

    expect(dependencies.hasActionAdmission).toHaveBeenCalledWith({
      deliveryKey: 'event-orphaned-no-action',
      user: 'user-1',
      bindingId: 'binding-1',
      conversationId,
      admissionId: expect.any(String),
    });
    expect(dependencies.resolveReconciliation).toHaveBeenNthCalledWith(1, {
      user: 'user-1',
      conversationId,
      invocationId: 'event-orphaned-no-action',
      checkpoint,
      expectedActionAdmitted: true,
      resolution: 'invocation_abandoned',
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('never invokes after a retry supersedes its pre-admission lifecycle', async () => {
    const invoke = jest.fn(async () => 'must not run');
    const dependencies = {
      ...deps(),
      recordReconciliation: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      admitAction: jest.fn().mockResolvedValue(true),
      releaseAction: jest.fn().mockResolvedValue(true),
      getReceipt: jest.fn().mockResolvedValue(null),
    };

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          bindingId: 'binding-1',
          invocationId: 'event-pre-admission-race',
          event: { id: 'event-pre-admission-race' },
          signal: new AbortController().signal,
          invoke,
          readAppliedAction: () => undefined,
        },
        dependencies,
      ),
    ).rejects.toThrow('admission lifecycle was superseded before invoke');

    expect(dependencies.admitAction).toHaveBeenCalledTimes(1);
    expect(dependencies.releaseAction).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not clear an admission it failed to acquire', async () => {
    const invoke = jest.fn(async () => 'must not run');
    const dependencies = {
      ...deps(),
      recordReconciliation: jest.fn().mockResolvedValue(true),
      admitAction: jest.fn().mockResolvedValue(false),
      getReceipt: jest.fn().mockResolvedValue(null),
    };

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          bindingId: 'binding-1',
          invocationId: 'event-orphaned-admission',
          event: { id: 'event-orphaned-admission' },
          signal: new AbortController().signal,
          invoke,
          readAppliedAction: () => undefined,
        },
        dependencies,
      ),
    ).rejects.toThrow('action admission was already consumed or settled');

    expect(dependencies.resolveReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        invocationId: 'event-orphaned-admission',
        expectedActionAdmitted: false,
        resolution: 'invocation_abandoned',
      }),
    );
    expect(dependencies.releaseAction).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not release or replay while legacy terminal proof awaits migration', async () => {
    const invoke = jest.fn(async () => 'must not run');
    const dependencies = {
      ...deps(),
      getReceipt: jest.fn().mockResolvedValue(null),
    };
    dependencies.getSnapshot.mockResolvedValue({
      state: null,
      reconciliations: [
        {
          invocationId: 'event-legacy-terminal',
          status: 'settled',
          resolution: 'checkpoint_verified',
          checkpoint: {
            threadId: conversationId,
            checkpointId: 'checkpoint-terminal',
            checkpointNs: 'event-actor/terminal',
          },
          action: { toolName: 'submit_move' },
          observedAt: new Date(),
        },
      ],
      legacyTurn: null,
      epoch: 0,
    });

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          bindingId: 'binding-1',
          invocationId: 'event-legacy-terminal',
          event: { id: 'event-legacy-terminal' },
          signal: new AbortController().signal,
          invoke,
          readAppliedAction: () => undefined,
        },
        dependencies,
      ),
    ).rejects.toThrow('legacy terminal proof awaiting migration');

    expect(dependencies.admitAction).not.toHaveBeenCalled();
    expect(dependencies.releaseAction).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
