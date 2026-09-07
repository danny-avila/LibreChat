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
import { checkpointOwnerNamespacePrefix } from '../../stream/checkpoints';

type HistoricalReference = Omit<AgentEventCheckpointReference, 'checkpointId'> & {
  checkpointId?: string;
};

/** Keep SDK references logical while binding their physical storage to the authenticated owner. */
export function createOwnedActorCheckpoints(user: string, tenantId?: string) {
  const prefix = checkpointOwnerNamespacePrefix(user, tenantId);
  const namespace = (logical: string): string => `${prefix}${logical}`;

  async function resolveNamespace(
    reference: HistoricalReference,
    cfg?: TCheckpointerConfig,
  ): Promise<string | undefined> {
    if (!reference.checkpointId) {
      throw new Error('Historical actor checkpoint reference is missing its checkpoint id');
    }
    const owned = namespace(reference.checkpointNs);
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
    // Only pre-rollout references can have payloads in the original SDK namespace.
    if (tuple?.checkpoint.id === reference.checkpointId) {
      return owned;
    }
    const legacy = await saver.getTuple({
      configurable: {
        thread_id: reference.threadId,
        checkpoint_ns: '',
        checkpoint_id: reference.checkpointId,
        [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: reference.checkpointNs,
      },
    });
    return legacy?.checkpoint.id === reference.checkpointId ? reference.checkpointNs : undefined;
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
    const result = await forkAgentEventCheckpoint(
      { ...source, checkpointNs },
      namespace(logical),
      invocationId,
      cfg,
      overlay,
    );
    return result ? { ...result, checkpointNs: logical } : null;
  };

  async function capture(
    threadId: string,
    logical: string,
    invocationId: string,
    cfg?: TCheckpointerConfig,
    storageNamespace: string | null = namespace(logical),
  ): Promise<AgentEventCheckpointReference | null> {
    if (storageNamespace == null) {
      return null;
    }
    const result = await captureAgentEventCheckpoint(threadId, storageNamespace, invocationId, cfg);
    return result ? { ...result, checkpointNs: logical } : null;
  }

  async function removeOwned(
    reference: Pick<AgentEventCheckpointReference, 'threadId' | 'checkpointNs'>,
    cfg?: TCheckpointerConfig,
  ): Promise<void> {
    await deleteAgentCheckpoint(reference.threadId, cfg, undefined, {
      throwOnError: true,
      checkpointNamespace: namespace(reference.checkpointNs),
    });
  }

  async function remove(reference: HistoricalReference, cfg?: TCheckpointerConfig): Promise<void> {
    const checkpointNs = await resolveNamespace(reference, cfg);
    if (checkpointNs == null) {
      return;
    }
    if (!reference.checkpointId) {
      throw new Error('Historical actor checkpoint reference is missing its checkpoint id');
    }
    await deleteAgentEventCheckpointReference(
      { ...reference, checkpointId: reference.checkpointId, checkpointNs },
      cfg,
    );
  }

  return { namespace, resolveNamespace, fork, capture, remove, removeOwned };
}
