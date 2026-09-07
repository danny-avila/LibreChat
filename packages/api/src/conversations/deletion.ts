import { waitForGenerationPersistence } from '../stream/persistence';
import type { ConversationMethods, MessageMethods, ToolCallMethods } from '@librechat/data-schemas';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { logger as Logger } from '@librechat/data-schemas';
import type {
  CheckpointDeletion,
  openCheckpointDeletion as openDeletion,
} from '../agents/checkpoints/deletion';
import type { GenerationJobManager as GenerationManager } from '../stream/GenerationJobManager';
import type { deleteConvoSharedLinksWithCleanup as deleteLinks } from '../shared-links/service';
import type { SubagentThreadTaskStore } from '../agents/subagentThreads';

type ConversationFilter = Parameters<ConversationMethods['deleteConvos']>[1];
type DeletionResult = Awaited<ReturnType<ConversationMethods['deleteConvos']>>;
type CancellationPlan = Awaited<
  ReturnType<SubagentThreadTaskStore['planCancellationForConversations']>
>;
export interface ConversationDeletionService {
  canRecoverAgentConversationDeletion: (
    userId: string,
    conversationId: string,
    tenantId?: string,
    checkpointer?: TCheckpointerConfig,
  ) => Promise<boolean>;
  deleteConversations: (
    userId: string,
    filter: ConversationFilter,
    tenantId?: string,
    checkpointer?: TCheckpointerConfig,
    options?: { allowMissingRoot?: boolean },
  ) => Promise<DeletionResult>;
  withAgentOwnerDeletionFence: (
    userId: string,
    tenantId: string | undefined,
    deletion: () => Promise<DeletionResult>,
    recoverPersistence: () => Promise<DeletionResult>,
    checkpointer?: TCheckpointerConfig,
  ) => Promise<{ result: DeletionResult; recoveryConversationIds: string[] }>;
  deleteOwnerConversationPersistence: (
    userId: string,
    filter: ConversationFilter,
    tenantId: string | undefined,
    checkpointer: TCheckpointerConfig | undefined,
  ) => Promise<DeletionResult>;
}
export interface ConversationDeletionDeps {
  db: Pick<ConversationMethods, 'deleteConvos'> &
    Pick<MessageMethods, 'deleteMessages'> &
    Pick<ToolCallMethods, 'deleteToolCalls'>;
  subagentThreadTaskStore: Pick<
    SubagentThreadTaskStore,
    'planCancellationForConversations' | 'cancelPlan' | 'withOwnerDeletionFence'
  >;
  GenerationJobManager: typeof GenerationManager;
  openCheckpointDeletion: typeof openDeletion;
  deleteConvoSharedLinksWithCleanup: typeof deleteLinks;
  isStopConfirmed: (result: Awaited<ReturnType<typeof GenerationManager.abortJob>>) => boolean;
  logger: typeof Logger;
}
export function createConversationDeletionService({
  db,
  subagentThreadTaskStore,
  GenerationJobManager,
  openCheckpointDeletion,
  deleteConvoSharedLinksWithCleanup,
  isStopConfirmed,
  logger,
}: ConversationDeletionDeps): ConversationDeletionService {
  const POST_DELETE_CANCEL_ATTEMPTS = 3;
  const POST_DELETE_CANCEL_BACKOFF_MS = 250;
  const GENERATION_LOOKUP_ATTEMPTS = 3;

  async function readGenerationForDeletion(conversationId: string) {
    let lastError;
    for (let attempt = 1; attempt <= GENERATION_LOOKUP_ATTEMPTS; attempt += 1) {
      try {
        return await GenerationJobManager.getCleanupJob(conversationId);
      } catch (error) {
        lastError = error;
        if (attempt < GENERATION_LOOKUP_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
        }
      }
    }
    throw lastError;
  }

  /** Replays a cancellation plan after deletion, retrying a transiently unreachable
   * owner rather than losing the only pass that can stop a late-admitted child. */
  async function retryPostDeleteCancellation(
    cancellationPlan: CancellationPlan,
    deletedConversationIds: string[],
  ) {
    for (let attempt = 1; attempt <= POST_DELETE_CANCEL_ATTEMPTS; attempt += 1) {
      try {
        await subagentThreadTaskStore.cancelPlan(cancellationPlan, deletedConversationIds);
        return;
      } catch (error) {
        if (attempt === POST_DELETE_CANCEL_ATTEMPTS) {
          logger.warn('Post-delete subagent cancellation failed', error);
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, POST_DELETE_CANCEL_BACKOFF_MS * attempt),
        );
      }
    }
  }

  /** Confirms every exact generation is stopped before its conversation wave is removed. */
  async function confirmAgentGenerationsDrained(
    userId: string,
    conversationIds: string[],
    leaseTaskIds: string[] = [],
    tenantId?: string,
    ownerWide = false,
  ) {
    const drainErrors = [];
    let conversationRunIds;
    try {
      conversationRunIds = ownerWide
        ? await GenerationJobManager.getCleanupBlockingJobIdsForUser(userId, tenantId)
        : await GenerationJobManager.getCleanupBlockingJobIdsForConversations(
            userId,
            conversationIds,
            tenantId,
          );
    } catch (error) {
      logger.warn('Conversation generation index lookup failed', error);
      throw new Error('Conversation generations could not be confirmed drained.');
    }
    const generationIds = [
      ...new Set([...conversationIds, ...leaseTaskIds, ...conversationRunIds]),
    ];
    await Promise.all(
      generationIds.map(async (conversationId) => {
        let job;
        try {
          job = await readGenerationForDeletion(conversationId);
        } catch (error) {
          logger.warn('Deleted child generation lookup failed', error);
          drainErrors.push(error);
          return;
        }
        if (job == null || job.metadata?.userId !== userId) {
          return;
        }
        const jobTenantId = job.metadata?.tenantId;
        if ((jobTenantId ?? undefined) !== tenantId) return;
        const needsDrain =
          job.status === 'running' ||
          job.status === 'requires_action' ||
          job.metadata?.providerDrained === false ||
          job.metadata?.terminalPersistencePending === true ||
          job.metadata?.terminalHostActionPending === true;
        if (!needsDrain) return;
        try {
          const abortResult = await GenerationJobManager.abortJob(conversationId, {
            expectedCreatedAt: job.createdAt,
            awaitProviderDrain: true,
          });
          if (!isStopConfirmed(abortResult)) {
            throw new Error(
              `Could not confirm generation stop for ${conversationId}: ${abortResult?.failureReason ?? 'unknown'}`,
            );
          }
          await waitForGenerationPersistence(conversationId, job.createdAt, (id) =>
            GenerationJobManager.getCleanupJob(id),
          );
        } catch (error) {
          logger.warn('Deleted child generation drain failed', error);
          drainErrors.push(error);
        }
      }),
    );
    if (drainErrors.length > 0) {
      throw new Error('One or more deleted child generations could not be confirmed drained.');
    }
  }

  /** Repeats generation discovery after the conversation wave is gone, then always
   * removes remnants for that immutable deletion set. A remote run may settle and
   * leave the cleanup index between persisting and this lookup; absence from the
   * index is therefore not evidence that the second persistence sweep is unnecessary. */
  async function drainDeletedAgentGenerations(
    userId: string,
    conversationIds: string[],
    leaseTaskIds: string[] = [],
    tenantId: string | undefined,
    deletion: CheckpointDeletion | undefined,
  ) {
    await confirmAgentGenerationsDrained(userId, conversationIds, leaseTaskIds, tenantId);
    await db.deleteConvos(
      userId,
      { conversationId: { $in: conversationIds } },
      {
        allowEmpty: true,
        tenantId: tenantId ?? null,
        beforeDelete: async (ids) => {
          await deletion?.remember(ids);
          await confirmAgentGenerationsDrained(userId, ids, [], tenantId);
          await deletion?.remember(ids);
        },
      },
    );
    await db.deleteMessages({
      user: userId,
      conversationId: { $in: conversationIds },
      ...(tenantId == null ? { tenantId: { $exists: false } } : { tenantId }),
    });
  }

  /** Orders every owner-scoped agent execution against a delete-all persistence
   * snapshot. The recovery callback repeats the non-subagent drain if the durable
   * fence ever lapses and must be reacquired after deletion has started. */
  async function withAgentOwnerDeletionFence(
    userId: string,
    tenantId: string | undefined,
    deletion: () => Promise<DeletionResult>,
    recoverPersistence: () => Promise<DeletionResult>,
  ) {
    const drainRemoteRuns = () => confirmAgentGenerationsDrained(userId, [], [], tenantId, true);
    let recoveryConversationIds: string[] = [];
    const result = await subagentThreadTaskStore.withOwnerDeletionFence(
      userId,
      tenantId,
      async () => {
        await drainRemoteRuns();
        return deletion();
      },
      async () => {
        await drainRemoteRuns();
        /** Runs only after the fence was restored. No new provider may enter while
         * persistence created during the gap is removed idempotently. */
        const recovery = await recoverPersistence();
        recoveryConversationIds = recovery.conversationIds ?? [];
      },
    );
    return { result, recoveryConversationIds };
  }

  async function deleteOwnerConversationPersistence(
    userId: string,
    filter: ConversationFilter,
    tenantId: string | undefined,
    checkpointer: TCheckpointerConfig | undefined,
  ) {
    const deletion = await openCheckpointDeletion(userId, tenantId, undefined, checkpointer);
    const result = await db.deleteConvos(userId, filter, {
      allowEmpty: true,
      tenantId: tenantId ?? null,
      beforeDelete: async (ids) => {
        await deletion.remember(ids);
        await confirmAgentGenerationsDrained(userId, ids, [], tenantId);
        await deletion.remember(ids);
      },
    });
    const targets = [
      ...new Set([...deletion.conversationIds(), ...(result.conversationIds ?? [])]),
    ];
    if (targets.length > 0) {
      await drainDeletedAgentGenerations(userId, targets, [], tenantId, deletion);
    }

    await db.deleteMessages({
      user: userId,
      ...(tenantId == null ? { tenantId: { $exists: false } } : { tenantId }),
    });
    await deletion.cleanup();
    await deletion.acknowledge();
    return {
      ...result,
      conversationIds: [...new Set([...targets, ...deletion.conversationIds()])],
    };
  }

  async function deleteConversations(
    userId: string,
    filter: ConversationFilter,
    tenantId?: string,
    checkpointer?: TCheckpointerConfig,
    options?: { allowMissingRoot?: boolean },
  ) {
    let cancellationPlan;
    let checkpointDeletion: CheckpointDeletion | undefined;
    let dbResponse;
    let recoveryConversationIds: string[] = [];
    if (filter.conversationId) {
      checkpointDeletion = await openCheckpointDeletion(
        userId,
        tenantId,
        filter.conversationId,
        checkpointer,
      );
      cancellationPlan = await subagentThreadTaskStore.planCancellationForConversations(
        userId,
        [...new Set([filter.conversationId, ...checkpointDeletion.conversationIds()])],
        tenantId,
      );
      await subagentThreadTaskStore.cancelPlan(cancellationPlan);
      dbResponse = await db.deleteConvos(userId, filter, {
        tenantId: tenantId ?? null,
        allowEmpty:
          options?.allowMissingRoot === true || checkpointDeletion.conversationIds().length > 0,
        beforeDelete: async (ids) => {
          await checkpointDeletion?.remember(ids);
          await confirmAgentGenerationsDrained(userId, ids, [], tenantId);
          await checkpointDeletion?.remember(ids);
        },
      });
    } else {
      /** An empty filter deletes every conversation this owner has, so it runs behind
       * the same admission fence as `DELETE /all` rather than a bare drain. */
      const fencedDeletion = await withAgentOwnerDeletionFence(
        userId,
        tenantId,
        () => deleteOwnerConversationPersistence(userId, filter, tenantId, checkpointer),
        () => deleteOwnerConversationPersistence(userId, filter, tenantId, checkpointer),
      );
      dbResponse = fencedDeletion.result;
      recoveryConversationIds = fencedDeletion.recoveryConversationIds;
    }
    let deletedConversationIds = [
      ...new Set([
        ...(dbResponse.conversationIds ?? (filter.conversationId ? [filter.conversationId] : [])),
        ...(options?.allowMissingRoot === true && typeof filter.conversationId === 'string'
          ? [filter.conversationId]
          : []),
        ...recoveryConversationIds,
        ...(checkpointDeletion?.conversationIds() ?? []),
      ]),
    ];
    /** Root deletion closes new child admission. Replay the plan to catch a task
     * admitted after the first pass but before that fence, extended with the cascade
     * this deletion reported. */
    if (cancellationPlan != null && deletedConversationIds.length > 0) {
      /** Retain deletion intent if a late child cannot be stopped; payload cleanup
       * follows only after all writers and persistence remnants are drained. */
      await retryPostDeleteCancellation(cancellationPlan, deletedConversationIds);
      await drainDeletedAgentGenerations(
        userId,
        deletedConversationIds,
        cancellationPlan.leases
          .filter(
            (lease) =>
              deletedConversationIds.includes(lease.parentConversationId) ||
              deletedConversationIds.includes(lease.conversationId),
          )
          .map((lease) => lease.taskId),
        tenantId,
        checkpointDeletion,
      );
    } else if (deletedConversationIds.length > 0) {
      await drainDeletedAgentGenerations(
        userId,
        deletedConversationIds,
        [],
        tenantId,
        checkpointDeletion,
      );
    }
    deletedConversationIds = [
      ...new Set([...deletedConversationIds, ...(checkpointDeletion?.conversationIds() ?? [])]),
    ];
    await checkpointDeletion?.cleanup();
    if (filter.conversationId) {
      await Promise.all(
        deletedConversationIds.map((id) => db.deleteToolCalls(userId, id, tenantId ?? null)),
      );
      await Promise.all(
        deletedConversationIds.map((id) =>
          deleteConvoSharedLinksWithCleanup(userId, id, tenantId ?? null),
        ),
      );
    }
    await checkpointDeletion?.acknowledge();
    return { ...dbResponse, conversationIds: deletedConversationIds };
  }

  async function canRecoverAgentConversationDeletion(
    userId: string,
    conversationId: string,
    tenantId?: string,
    checkpointer?: TCheckpointerConfig,
  ): Promise<boolean> {
    const deletion = await openCheckpointDeletion(userId, tenantId, conversationId, checkpointer);
    if (deletion.conversationIds().length > 0) return true;

    const cancellationPlan = await subagentThreadTaskStore.planCancellationForConversations(
      userId,
      [conversationId],
      tenantId,
    );
    if (
      cancellationPlan.leases.some(
        (lease) =>
          lease.conversationId === conversationId || lease.parentConversationId === conversationId,
      )
    ) {
      return true;
    }

    const generationIds = await GenerationJobManager.getCleanupBlockingJobIdsForConversations(
      userId,
      [conversationId],
      tenantId,
    );
    for (const generationId of generationIds) {
      const job = await readGenerationForDeletion(generationId);
      if (
        job?.metadata.userId === userId &&
        job.metadata.conversationId === conversationId &&
        (job.metadata?.tenantId ?? undefined) === tenantId
      ) {
        return true;
      }
    }
    return false;
  }

  return {
    canRecoverAgentConversationDeletion,
    deleteConversations,
    withAgentOwnerDeletionFence,
    deleteOwnerConversationPersistence,
  };
}
