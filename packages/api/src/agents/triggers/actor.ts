import { createHash } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import {
  createEventActorExecutor,
  type EventActorEvent,
  type EventActorExecutionResult,
  type EventActorHead,
  type EventActorHostAdapter,
} from '@librechat/agents';
import type {
  AgentTriggerDeliveryMethods,
  ConversationMethods,
  IAgentEventActorState,
} from '@librechat/data-schemas';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { AgentTriggerExpectedAction } from './envelope';
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
  checkpointCaptureError: string | null;
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
  /** Authenticated binding that owns the delivery receipt. */
  bindingId?: string;
  invocationId: string;
  event: EventActorEvent;
  expectedAction?: AgentTriggerExpectedAction;
  signal: AbortSignal;
  checkpointer?: TCheckpointerConfig;
  /** Deprecated compatibility input. Elapsed time never proves replay safety. */
  legacyTurnStaleMs?: number;
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
  resolveReconciliation: ConversationMethods['resolveAgentEventActorReconciliation'];
  admitAction?: AgentTriggerDeliveryMethods['admitAgentEventActorAction'];
  releaseAction?: AgentTriggerDeliveryMethods['releaseAgentEventActorAction'];
  hasActionAdmission?: AgentTriggerDeliveryMethods['hasAgentEventActorActionAdmission'];
  getReceipt?: AgentTriggerDeliveryMethods['getAgentEventActorReceipt'];
  clearReconciliation?: ConversationMethods['clearAgentEventActorReconciliation'];
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

function actionAdmissionId(
  invocationId: string,
  checkpoint: { threadId: string; checkpointId?: string; checkpointNs: string },
): string {
  return createHash('sha256')
    .update(invocationId)
    .update('\0')
    .update(checkpoint.threadId)
    .update('\0')
    .update(checkpoint.checkpointNs)
    .update('\0')
    .update(checkpoint.checkpointId ?? '')
    .digest('hex');
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
  let ownedActionAdmissionId: string | undefined;
  let observedState: IAgentEventActorState | null | undefined;
  let observedEpoch: number | undefined;
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
      if (input.bindingId != null && deps.getReceipt != null) {
        const receipt = await deps.getReceipt({
          deliveryKey: input.invocationId,
          user: input.user,
          ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
          bindingId: input.bindingId,
          conversationId: input.conversationId,
        });
        if (receipt != null) {
          const marker = snapshot.reconciliations.find(
            (item) => item.invocationId === input.invocationId,
          );
          if (marker != null && deps.clearReconciliation != null) {
            const cleared = await deps.clearReconciliation({
              user: input.user,
              conversationId: input.conversationId,
              ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
              invocationId: input.invocationId,
              checkpoint: receipt.checkpoint,
              resolution: receipt.resolution,
            });
            if (!cleared) {
              throw new Error('Event actor terminal marker could not be recovered');
            }
          }
          throw new Error('Event actor invocation already has a terminal receipt');
        }
      }
      if (
        snapshot.reconciliations.some(
          (item) => item.invocationId === input.invocationId && item.status === 'settled',
        )
      ) {
        /** Mixed-version proof must be migrated by the terminal handler before
         * the same delivery identity can execute again. Delivery admission
         * alone cannot distinguish that proof from a pre-invoke orphan. */
        throw new Error('Event actor invocation has legacy terminal proof awaiting migration');
      }
      let recoveredInvocationId: string | undefined;
      const pendingInvocation = snapshot.reconciliations.find(
        (item) => item.invocationId === input.invocationId && item.status === 'invocation_pending',
      );
      if (pendingInvocation != null && input.bindingId != null && deps.hasActionAdmission != null) {
        const pendingAdmissionId = actionAdmissionId(
          input.invocationId,
          pendingInvocation.checkpoint,
        );
        const actionAdmitted = await deps.hasActionAdmission({
          deliveryKey: input.invocationId,
          user: input.user,
          ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
          bindingId: input.bindingId,
          conversationId: input.conversationId,
          admissionId: pendingAdmissionId,
        });
        if (pendingInvocation.actionAdmitted !== true || !actionAdmitted) {
          /** Abandoning the conversation marker fences a paused pre-admission
           * owner: it must confirm this exact marker after winning delivery
           * admission and therefore cannot invoke after takeover. */
          const abandoned = await deps.resolveReconciliation({
            user: input.user,
            conversationId: input.conversationId,
            ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
            invocationId: input.invocationId,
            checkpoint: pendingInvocation.checkpoint,
            expectedActionAdmitted: pendingInvocation.actionAdmitted === true,
            resolution: 'invocation_abandoned',
          });
          if (!abandoned) {
            throw new Error('Event actor orphaned no-action lifecycle could not be recovered');
          }
          if (actionAdmitted) {
            const released = await deps.releaseAction?.({
              deliveryKey: input.invocationId,
              user: input.user,
              ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
              bindingId: input.bindingId,
              conversationId: input.conversationId,
              admissionId: pendingAdmissionId,
            });
            if (!released) {
              throw new Error('Event actor orphaned action admission could not be released');
            }
          }
          recoveredInvocationId = input.invocationId;
        }
      }
      const unresolved = snapshot.reconciliations.filter(
        (item) => item.status !== 'settled' && item.invocationId !== recoveredInvocationId,
      );
      if (unresolved.length > 0) {
        throw new Error(
          `Event actor is blocked on ${unresolved.map((item) => item.status).join(', ')} reconciliation`,
        );
      }
      /** A legacy turn is or may have been mid-flight: its external action and
       * durable-history outcome are unknown, so no amount of elapsed time can
       * prove that replay is safe. Keep the fence closed until a terminal owner
       * proves persistence and seals its exact token, or an operator performs
       * an explicit reconciliation. */
      const legacyTurn = snapshot.legacyTurn;
      if (legacyTurn != null) {
        throw new Error('Event actor is blocked on an in-flight legacy turn');
      }
      const state = snapshot.state;
      observedState = state;
      observedEpoch = snapshot.epoch;
      const head = toHead(input.conversationId, state);
      if (state == null || state.requiresColdStart === true) {
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
          ...(head.checkpoint == null ? {} : { checkpointId: head.checkpoint.checkpointId }),
          invocationId: request.invocationId,
        },
      };
    },
    async invoke(invocation, context) {
      const fenced = await deps.recordReconciliation({
        user: input.user,
        conversationId: input.conversationId,
        ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
        reconciliation: {
          invocationId: invocation.invocationId,
          status: 'invocation_pending',
          checkpoint: {
            threadId: invocation.fork.threadId,
            checkpointNs: invocation.fork.checkpointNs,
            ...(invocation.fork.checkpointId == null
              ? {}
              : { checkpointId: invocation.fork.checkpointId }),
          },
          action: { toolName: input.expectedAction?.toolName ?? 'expected_action' },
          observedAt: new Date(),
        },
      });
      if (!fenced) {
        throw new Error('Event actor invocation could not acquire its durable lifecycle fence');
      }
      /** The delivery row is the serialization point between action admission
       * and terminal settlement. A plain receipt read cannot close the final
       * read-before-invoke race across two Mongo documents. */
      if (input.bindingId != null && deps.admitAction != null) {
        const admissionId = actionAdmissionId(input.invocationId, invocation.fork);
        const admitted = await deps.admitAction({
          deliveryKey: input.invocationId,
          user: input.user,
          ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
          bindingId: input.bindingId,
          conversationId: input.conversationId,
          admittedAt: new Date(),
          admissionId,
        });
        if (!admitted) {
          const abandoned = await deps.resolveReconciliation({
            user: input.user,
            conversationId: input.conversationId,
            ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
            invocationId: invocation.invocationId,
            checkpoint: {
              threadId: invocation.fork.threadId,
              checkpointNs: invocation.fork.checkpointNs,
              ...(invocation.fork.checkpointId == null
                ? {}
                : { checkpointId: invocation.fork.checkpointId }),
            },
            expectedActionAdmitted: false,
            resolution: 'invocation_abandoned',
          });
          if (!abandoned) {
            throw new Error('Event actor duplicate lifecycle fence could not be abandoned');
          }
          throw new Error('Event actor action admission was already consumed or settled');
        }
        const confirmed = await deps.recordReconciliation({
          user: input.user,
          conversationId: input.conversationId,
          ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
          reconciliation: {
            invocationId: invocation.invocationId,
            actionAdmitted: true,
            status: 'invocation_pending',
            checkpoint: {
              threadId: invocation.fork.threadId,
              checkpointNs: invocation.fork.checkpointNs,
              ...(invocation.fork.checkpointId == null
                ? {}
                : { checkpointId: invocation.fork.checkpointId }),
            },
            action: { toolName: input.expectedAction?.toolName ?? 'expected_action' },
            observedAt: new Date(),
          },
        });
        if (!confirmed) {
          const released = await deps.releaseAction?.({
            deliveryKey: input.invocationId,
            user: input.user,
            ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
            bindingId: input.bindingId,
            conversationId: input.conversationId,
            admissionId,
          });
          if (!released) {
            throw new Error(
              'Event actor lost admission lifecycle and could not release its action',
            );
          }
          throw new Error('Event actor action admission lifecycle was superseded before invoke');
        }
        ownedActionAdmissionId = admissionId;
      }
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
        result: { action, checkpointCaptureError: null },
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
      if (observedState === undefined || observedEpoch === undefined) {
        throw new Error('Event actor commit is missing its prepared host state');
      }
      const expectedHeadCheckpoint = request.expectedHead.checkpoint;
      if (observedState != null && expectedHeadCheckpoint == null) {
        throw new Error('Event actor commit lost its prepared checkpoint head');
      }
      /** The SDK head intentionally contains only portable checkpoint identity.
       * Retain the host-private cold-start observation from prepare so the CAS
       * cannot clear a legacy-path invalidation that races before acquisition. */
      const expected =
        observedState == null
          ? undefined
          : {
              generation: request.expectedHead.generation,
              checkpoint: {
                threadId: expectedHeadCheckpoint!.threadId,
                checkpointId: expectedCheckpointId!,
                checkpointNs: expectedHeadCheckpoint!.checkpointNs,
              },
              ...(observedState.requiresColdStart === true ? { requiresColdStart: true } : {}),
            };
      const committed = await deps.commitState({
        user: input.user,
        conversationId: input.conversationId,
        ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
        invocationId: request.invocation.invocationId,
        action: request.result.action,
        ...(expected == null ? {} : { expected }),
        /** Legacy-path invalidations against headless or already cold-marked
         * actors are visible ONLY through the epoch; the CAS must require the
         * exact epoch observed at preparation. */
        expectedEpoch: observedEpoch,
        checkpoint: {
          threadId: request.checkpoint.threadId,
          checkpointId: appliedCheckpointId,
          checkpointNs: request.checkpoint.checkpointNs,
        },
      });
      if (committed.status === 'stale') {
        /** A host-private cold marker can invalidate the CAS without advancing
         * the portable SDK head. Omit that non-advanced head so the SDK reports
         * an ordinary conflict instead of misclassifying it as indeterminate. */
        const advanced =
          committed.state != null && committed.state.generation > request.expectedHead.generation;
        return {
          status: 'stale',
          ...(advanced ? { head: toHead(input.conversationId, committed.state!) } : {}),
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
      /** Release the delivery-owned action admission before deleting either
       * the fork or its conversation-side lifecycle evidence. A crash after
       * this release is retryable; the inverse order can orphan admission
       * forever with no durable marker left to recover it from. */
      if (ownedActionAdmissionId != null && input.bindingId != null && deps.releaseAction != null) {
        const releasedAction = await deps.releaseAction({
          deliveryKey: input.invocationId,
          user: input.user,
          ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
          bindingId: input.bindingId,
          conversationId: input.conversationId,
          admissionId: ownedActionAdmissionId,
        });
        if (!releasedAction) {
          const receipt = await deps.getReceipt?.({
            deliveryKey: input.invocationId,
            user: input.user,
            ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
            bindingId: input.bindingId,
            conversationId: input.conversationId,
          });
          if (receipt == null) {
            throw new Error('Event actor action admission could not be released');
          }
        }
        ownedActionAdmissionId = undefined;
      }
      await deleteAgentCheckpoint(request.invocation.fork.threadId, input.checkpointer, undefined, {
        throwOnError: true,
        checkpointNamespace: request.invocation.fork.checkpointNs,
      });
      const released = await deps.resolveReconciliation({
        user: input.user,
        conversationId: input.conversationId,
        ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
        invocationId: request.invocation.invocationId,
        checkpoint: {
          threadId: request.invocation.fork.threadId,
          checkpointNs: request.invocation.fork.checkpointNs,
          ...(request.invocation.fork.checkpointId == null
            ? {}
            : { checkpointId: request.invocation.fork.checkpointId }),
        },
        ...(input.bindingId != null && deps.admitAction != null
          ? { expectedActionAdmitted: true }
          : {}),
        resolution: 'invocation_abandoned',
      });
      if (!released) {
        const snapshot = await deps.getSnapshot({
          user: input.user,
          conversationId: input.conversationId,
          ...(input.tenantId == null ? {} : { tenantId: input.tenantId }),
        });
        if (
          snapshot?.reconciliations.some(
            (item) => item.invocationId === request.invocation.invocationId,
          ) === true
        ) {
          throw new Error('Event actor invocation lifecycle fence could not be released');
        }
      }
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
      snapshot?.reconciliations.some(
        (item) => item.invocationId === input.invocationId && item.status === 'persistence_pending',
      ) === true &&
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
        ...(input.bindingId != null && deps.admitAction != null ? { actionAdmitted: true } : {}),
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
