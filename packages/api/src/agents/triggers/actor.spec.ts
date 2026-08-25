import type { IAgentEventActorState } from '@librechat/data-schemas';
import {
  captureAgentEventCheckpoint,
  deleteAgentCheckpoint,
  forkAgentEventCheckpoint,
  getAgentCheckpointer,
} from '../checkpointer';
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
  let nextCheckpoint = 1;

  beforeEach(() => {
    state = null;
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
    mockedDelete.mockResolvedValue();
  });

  const deps = () => ({
    getState: jest.fn(async () => state),
    commitState: jest.fn(async ({ expected, checkpoint }) => {
      if (
        (state == null && expected != null) ||
        (state != null &&
          (expected == null ||
            expected.generation !== state.generation ||
            expected.checkpoint.checkpointId !== state.checkpoint.checkpointId))
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
    const result = await executeAgentEventActor(
      {
        user: 'user-1',
        conversationId,
        invocationId: 'event-action-then-error',
        event: { id: 'event-action-then-error' },
        signal: new AbortController().signal,
        invoke: async () => {
          throw new Error('provider stream failed after tool');
        },
        readAppliedAction: () => ({ toolName: 'submit_move' }),
      },
      dependencies,
    );

    expect(result.execution.status).toBe('applied');
    expect(dependencies.commitState).toHaveBeenCalledTimes(1);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('retains an applied fork when its terminal checkpoint cannot be observed', async () => {
    mockedCapture.mockResolvedValueOnce(null);
    const dependencies = deps();
    const result = await executeAgentEventActor(
      {
        user: 'user-1',
        conversationId,
        invocationId: 'event-checkpoint-indeterminate',
        event: { id: 'event-checkpoint-indeterminate' },
        signal: new AbortController().signal,
        invoke: async () => 'response',
        readAppliedAction: () => ({ toolName: 'submit_move' }),
      },
      dependencies,
    );

    expect(result.execution.status).toBe('commit_indeterminate');
    expect(dependencies.commitState).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('refuses a cold start after its bound child disappeared', async () => {
    const dependencies = {
      getState: jest.fn(async () => undefined),
      commitState: jest.fn(),
    };

    await expect(
      executeAgentEventActor(
        {
          user: 'user-1',
          conversationId,
          invocationId: 'event-after-delete',
          event: { id: 'event-after-delete' },
          signal: new AbortController().signal,
          invoke: async () => 'response',
          readAppliedAction: () => ({ toolName: 'submit_move' }),
        },
        dependencies,
      ),
    ).rejects.toThrow('Event actor binding is no longer active');
    expect(mockedGetCheckpointer).not.toHaveBeenCalled();
  });
});
