import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { AgentEventCheckpointReference } from '../checkpointer';
import {
  captureAgentEventCheckpoint,
  deleteAgentCheckpoint,
  deleteAgentEventCheckpointReference,
  forkAgentEventCheckpoint,
  getAgentCheckpointer,
  LIBRECHAT_CHECKPOINT_NAMESPACE_KEY,
} from '../checkpointer';
import {
  registerActorCheckpointScope,
  getActorCheckpointScope,
  acknowledgeActorCheckpointScope,
} from './ownership';
import { checkpointOwnerNamespacePrefix } from '../../stream/checkpoints';
import { acknowledgeActorPruning, drainActorPruning } from './pruning';

type HistoricalReference = Omit<AgentEventCheckpointReference, 'checkpointId'> & {
  checkpointId?: string;
};

/** Preserve the SDK wire/storage format and bind fresh scopes durably before writes. */
export function createOwnedActorCheckpoints(user: string, tenantId?: string) {
  const prefix = checkpointOwnerNamespacePrefix(user, tenantId);

  async function resolveNamespace(
    reference: HistoricalReference,
    cfg?: TCheckpointerConfig,
  ): Promise<string | undefined> {
    if (!reference.checkpointId) {
      throw new Error('Historical actor checkpoint reference is missing its checkpoint id');
    }
    const scope = await getActorCheckpointScope(reference.threadId, reference.checkpointNs, cfg);
    if (scope != null && scope.owner !== prefix) {
      return undefined;
    }
    const owned = reference.checkpointNs;
    const saver = await getAgentCheckpointer(cfg);
    if (!saver) {
      throw new Error('Event actor checkpoints require a durable checkpointer');
    }
    const tuple = await saver.getTuple({
      configurable: {
        thread_id: reference.threadId,
        checkpoint_ns: '',
        checkpoint_id: reference.checkpointId,
        [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: owned,
      },
    });
    return tuple?.checkpoint.id === reference.checkpointId ? owned : undefined;
  }

  const fork: typeof forkAgentEventCheckpoint = async (
    source,
    logical,
    invocationId,
    cfg,
    overlay,
  ) => {
    const checkpointNs = await resolveNamespace(source, cfg);
    if (checkpointNs == null) {
      return null;
    }
    await registerActorCheckpointScope(user, tenantId, source.threadId, logical, cfg);
    const result = await forkAgentEventCheckpoint(
      { ...source, checkpointNs },
      logical,
      invocationId,
      cfg,
      overlay,
    );
    if (result == null) {
      const scope = await getActorCheckpointScope(source.threadId, logical, cfg);
      if (scope?.owner === prefix) {
        await acknowledgeActorCheckpointScope(scope, cfg);
      }
    }
    return result ? { ...result, checkpointNs: logical } : null;
  };

  async function capture(
    threadId: string,
    logical: string,
    invocationId: string,
    cfg?: TCheckpointerConfig,
    storageNamespace?: string | null,
  ): Promise<AgentEventCheckpointReference | null> {
    if (storageNamespace === null) {
      return null;
    }
    const scope = await getActorCheckpointScope(threadId, logical, cfg);
    if (
      (scope != null && scope.owner !== prefix) ||
      (storageNamespace === undefined && scope == null)
    ) {
      return null;
    }
    const result = await captureAgentEventCheckpoint(
      threadId,
      storageNamespace ?? logical,
      invocationId,
      cfg,
    );
    return result ? { ...result, checkpointNs: logical } : null;
  }

  async function removeOwned(
    reference: Pick<AgentEventCheckpointReference, 'threadId' | 'checkpointNs'>,
    cfg?: TCheckpointerConfig,
  ): Promise<void> {
    const scope = await getActorCheckpointScope(reference.threadId, reference.checkpointNs, cfg);
    if (scope == null) {
      return;
    }
    if (scope.owner !== prefix) {
      throw new Error('Fresh actor checkpoint scope is not registered to this owner');
    }
    await deleteAgentCheckpoint(reference.threadId, cfg, undefined, {
      throwOnError: true,
      checkpointNamespace: reference.checkpointNs,
    });
    await acknowledgeActorCheckpointScope(scope, cfg);
  }

  async function remove(reference: HistoricalReference, cfg?: TCheckpointerConfig): Promise<void> {
    const scope = await getActorCheckpointScope(reference.threadId, reference.checkpointNs, cfg);
    if (scope != null) {
      if (scope.owner !== prefix) {
        throw new Error('Actor checkpoint scope belongs to another owner');
      }
      await removeOwned(reference, cfg);
      return;
    }
    if (!reference.checkpointId) {
      throw new Error('Historical actor checkpoint reference is missing its checkpoint id');
    }
    await deleteAgentEventCheckpointReference(
      { ...reference, checkpointId: reference.checkpointId },
      cfg,
    );
  }

  return {
    resolveNamespace,
    fork,
    capture,
    remove,
    removeOwned,
    register: (threadId: string, logical: string, cfg?: TCheckpointerConfig) =>
      registerActorCheckpointScope(user, tenantId, threadId, logical, cfg),
    drain: (threadId: string, cfg?: TCheckpointerConfig) =>
      drainActorPruning(user, tenantId, threadId, (reference) => remove(reference, cfg)),
    acknowledgePruning: (reference: AgentEventCheckpointReference) =>
      acknowledgeActorPruning(user, tenantId, reference.threadId, reference),
  };
}
