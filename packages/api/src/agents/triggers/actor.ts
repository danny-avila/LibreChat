import { logger } from '@librechat/data-schemas';
import {
  createEventActorExecutor,
  type EventActorEvent,
  type EventActorExecutionResult,
  type EventActorHead,
  type EventActorHostAdapter,
} from '@librechat/agents';
import type { ConversationMethods, IAgentEventActorState } from '@librechat/data-schemas';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { AgentEventAppliedAction } from './outcome';
import {
  captureAgentEventCheckpoint,
  deleteAgentCheckpoint,
  forkAgentEventCheckpoint,
  getAgentCheckpointer,
  getApprovalTtlMs,
} from '../checkpointer';

interface EventActorResult extends Record<string, EventActorEvent> {
  action: AgentEventAppliedAction;
  checkpointCaptureError?: string;
}

export interface AgentEventActorInvocationContext {
  checkpointNamespace: string;
  checkpointId?: string;
  invocationId: string;
  continuation: 'warm' | 'cold';
  signal: AbortSignal;
}

export interface ExecuteAgentEventActorInput<T> {
  user: string;
  tenantId?: string;
  conversationId: string;
  invocationId: string;
  event: EventActorEvent;
  signal: AbortSignal;
  checkpointer?: TCheckpointerConfig;
  invoke(context: AgentEventActorInvocationContext): Promise<T>;
  readAppliedAction(): AgentEventAppliedAction | undefined;
}

export interface ExecuteAgentEventActorResult<T> {
  value: T;
  execution: EventActorExecutionResult<EventActorResult>;
}

export interface AgentEventActorDependencies {
  getSnapshot: ConversationMethods['getAgentEventActorSnapshot'];
  commitState: ConversationMethods['commitAgentEventActorState'];
  recordReconciliation: ConversationMethods['recordAgentEventActorReconciliation'];
}

function toHead(actorThreadId: string, state: IAgentEventActorState | null): EventActorHead {
  return state == null
    ? { actorThreadId, generation: 0 }
    : { actorThreadId, generation: state.generation, checkpoint: state.checkpoint };
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function checkpointMatches(
  state: IAgentEventActorState,
  checkpoint: { threadId: string; checkpointId?: string; checkpointNs: string },
): boolean {
  return (
    typeof checkpoint.checkpointId === 'string' &&
    state.checkpoint.threadId === checkpoint.threadId &&
    state.checkpoint.checkpointId === checkpoint.checkpointId &&
    state.checkpoint.checkpointNs === checkpoint.checkpointNs
  );
}

/**
 * Executes one authenticated bound-child event through the SDK's checkpoint-fork lifecycle.
 * The request controller still owns generation admission and terminal receipts; this adapter owns
 * only checkpoint preparation, invocation isolation, CAS commit, and bounded cleanup.
 */
export async function executeAgentEventActor<T>(
  input: ExecuteAgentEventActorInput<T>,
  deps: AgentEventActorDependencies,
): Promise<ExecuteAgentEventActorResult<T>> {
  let value: T | undefined;
  let invocationError: unknown;
  const adapter: EventActorHostAdapter<EventActorEvent, EventActorResult> = {
    async prepare(request, context) {
      if (context.signal.aborted) {
        throw context.signal.reason;
      }
      const snapshot = await deps.getSnapshot({
        user: input.user,
        conversationId: input.conversationId,
        ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
      });
      if (snapshot === undefined) {
        throw new Error('Event actor binding is no longer active');
      }
      if (snapshot.reconciliation != null) {
        throw new Error(
          `Event actor is blocked on ${snapshot.reconciliation.status} reconciliation`,
        );
      }
      const state = snapshot.state;
      const head = toHead(input.conversationId, state);
      if (state == null) {
        return { status: 'checkpoint_unavailable', head };
      }
      const fork = await forkAgentEventCheckpoint(
        state.checkpoint,
        request.checkpointNs,
        request.invocationId,
        input.checkpointer,
      );
      if (fork == null) {
        return { status: 'checkpoint_unavailable', head };
      }
      return {
        status: 'ready',
        invocation: {
          ...request,
          continuation: 'warm',
          base: head,
          fork: { ...fork, invocationId: request.invocationId },
        },
      };
    },
    async coldContinue(request, head, context) {
      if (context.signal.aborted) {
        throw context.signal.reason;
      }
      if (!(await getAgentCheckpointer(input.checkpointer))) {
        throw new Error('Event actor checkpoint forks require a durable Mongo checkpointer');
      }
      return {
        ...request,
        continuation: 'cold',
        base: head,
        fork: {
          threadId: input.conversationId,
          checkpointNs: request.checkpointNs,
          invocationId: request.invocationId,
        },
      };
    },
    async invoke(invocation, context) {
      try {
        value = await input.invoke({
          checkpointNamespace: invocation.fork.checkpointNs,
          ...(invocation.fork.checkpointId == null
            ? {}
            : { checkpointId: invocation.fork.checkpointId }),
          invocationId: invocation.invocationId,
          continuation: invocation.continuation,
          signal: context.signal,
        });
      } catch (error) {
        invocationError = error;
      }
      const action = input.readAppliedAction();
      if (action == null) {
        if (invocationError != null) {
          throw invocationError;
        }
        return { status: 'completed_no_action' };
      }
      let checkpoint: Awaited<ReturnType<typeof captureAgentEventCheckpoint>>;
      try {
        checkpoint = await captureAgentEventCheckpoint(
          input.conversationId,
          invocation.fork.checkpointNs,
          invocation.invocationId,
          input.checkpointer,
        );
      } catch (error) {
        return {
          status: 'applied',
          result: { action, checkpointCaptureError: asError(error).message },
          checkpoint: invocation.fork,
        };
      }
      if (checkpoint == null) {
        return {
          status: 'applied',
          result: {
            action,
            checkpointCaptureError: 'Applied turn has no observable terminal checkpoint',
          },
          checkpoint: invocation.fork,
        };
      }
      return {
        status: 'applied',
        result: { action },
        checkpoint: { ...checkpoint, invocationId: invocation.invocationId },
      };
    },
    async commit(request) {
      if (request.result.checkpointCaptureError != null) {
        throw new Error(request.result.checkpointCaptureError);
      }
      const expectedCheckpointId = request.expectedHead.checkpoint?.checkpointId;
      if (
        request.expectedHead.checkpoint != null &&
        (typeof expectedCheckpointId !== 'string' || expectedCheckpointId.length === 0)
      ) {
        throw new Error('Event actor head is missing its checkpoint id');
      }
      const appliedCheckpointId = request.checkpoint.checkpointId;
      if (typeof appliedCheckpointId !== 'string' || appliedCheckpointId.length === 0) {
        throw new Error('Applied event actor checkpoint is missing its id');
      }
      const expected =
        request.expectedHead.checkpoint == null
          ? undefined
          : {
              generation: request.expectedHead.generation,
              checkpoint: {
                threadId: request.expectedHead.checkpoint.threadId,
                checkpointId: expectedCheckpointId,
                checkpointNs: request.expectedHead.checkpoint.checkpointNs,
              },
            };
      const committed = await deps.commitState({
        user: input.user,
        conversationId: input.conversationId,
        ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
        ...(expected == null ? {} : { expected }),
        checkpoint: {
          threadId: request.checkpoint.threadId,
          checkpointId: appliedCheckpointId,
          checkpointNs: request.checkpoint.checkpointNs,
        },
      });
      if (committed.status === 'stale') {
        return {
          status: 'stale',
          ...(committed.state == null
            ? {}
            : { head: toHead(input.conversationId, committed.state) }),
        };
      }
      if (committed.prunableCheckpoint != null) {
        await deleteAgentCheckpoint(
          committed.prunableCheckpoint.threadId,
          input.checkpointer,
          undefined,
          {
            throwOnError: true,
            checkpointNamespace: committed.prunableCheckpoint.checkpointNs,
          },
        );
      }
      return { status: 'committed', head: toHead(input.conversationId, committed.state) };
    },
    async discard(request) {
      await deleteAgentCheckpoint(request.invocation.fork.threadId, input.checkpointer, undefined, {
        throwOnError: true,
        checkpointNamespace: request.invocation.fork.checkpointNs,
      });
    },
  };

  const executor = createEventActorExecutor(adapter, {
    maxDepth: 1,
    dormantCheckpointTtlMs: getApprovalTtlMs(input.checkpointer),
  });
  let execution: EventActorExecutionResult<EventActorResult> = await executor.execute({
    actorThreadId: input.conversationId,
    invocationId: input.invocationId,
    event: input.event,
    depth: 1,
    signal: input.signal,
  });
  if (execution.status === 'failed') {
    throw execution.error;
  }
  if (execution.status === 'cancelled') {
    throw asError(input.signal.reason ?? 'Event actor invocation cancelled');
  }
  if (
    execution.status === 'commit_indeterminate' &&
    typeof execution.checkpoint.checkpointId === 'string'
  ) {
    let snapshot: Awaited<ReturnType<AgentEventActorDependencies['getSnapshot']>>;
    try {
      snapshot = await deps.getSnapshot({
        user: input.user,
        conversationId: input.conversationId,
        ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
      });
    } catch (error) {
      logger.warn('[event-actor] Could not verify an indeterminate checkpoint commit', {
        conversationId: input.conversationId,
        invocationId: input.invocationId,
        error: asError(error).message,
      });
    }
    if (
      snapshot?.reconciliation == null &&
      snapshot?.state != null &&
      checkpointMatches(snapshot.state, execution.checkpoint) &&
      execution.result != null
    ) {
      execution = {
        status: 'applied',
        result: execution.result,
        head: toHead(input.conversationId, snapshot.state),
        continuation: execution.continuation,
      };
    }
  }
  if (execution.status === 'commit_conflict' || execution.status === 'commit_indeterminate') {
    const action = execution.result?.action ?? input.readAppliedAction();
    if (action == null) {
      throw new Error(`Event actor ${execution.status} did not retain applied-action evidence`);
    }
    const error =
      execution.status === 'commit_indeterminate'
        ? execution.error.message
        : 'A competing checkpoint advanced the actor head';
    const recorded = await deps.recordReconciliation({
      user: input.user,
      conversationId: input.conversationId,
      ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
      reconciliation: {
        invocationId: input.invocationId,
        status: execution.status,
        checkpoint: {
          threadId: execution.checkpoint.threadId,
          checkpointNs: execution.checkpoint.checkpointNs,
          ...(execution.checkpoint.checkpointId == null
            ? {}
            : { checkpointId: execution.checkpoint.checkpointId }),
        },
        action,
        error: error.slice(0, 1024),
        observedAt: new Date(),
      },
    });
    if (!recorded) {
      throw new Error(`Failed to persist event actor ${execution.status} reconciliation`);
    }
    logger.error('[event-actor] Applied action blocked the actor pending reconciliation', {
      conversationId: input.conversationId,
      invocationId: input.invocationId,
      status: execution.status,
      error,
    });
    throw new Error(`Event actor action requires ${execution.status} reconciliation`);
  }
  if (invocationError != null) {
    throw invocationError;
  }
  return { value: value as T, execution };
}
