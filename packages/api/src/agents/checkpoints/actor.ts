import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { AgentEventCheckpointReference } from '../checkpointer';
import {
  captureAgentEventCheckpoint,
  deleteAgentCheckpoint,
  forkAgentEventCheckpoint,
  getAgentCheckpointer,
  LIBRECHAT_CHECKPOINT_NAMESPACE_KEY,
} from '../checkpointer';
import { checkpointOwnerNamespacePrefix } from '../../stream/checkpoints';

/** Keep SDK references logical while binding their physical storage to the authenticated owner. */
export function createOwnedActorCheckpoints(user: string, tenantId?: string) {
  const prefix = checkpointOwnerNamespacePrefix(user, tenantId);
  const namespace = (logical: string): string => `${prefix}${logical}`;

  async function resolveNamespace(
    reference: Pick<AgentEventCheckpointReference, 'threadId' | 'checkpointNs'>,
    cfg?: TCheckpointerConfig,
  ): Promise<string> {
    const owned = namespace(reference.checkpointNs);
    const saver = await getAgentCheckpointer(cfg);
    if (!saver) {
      throw new Error('Event actor checkpoints require a durable checkpointer');
    }
    const tuple = await saver.getTuple({
      configurable: {
        thread_id: reference.threadId,
        checkpoint_ns: '',
        [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: owned,
      },
    });
    // Only pre-rollout references can have payloads in the original SDK namespace.
    if (tuple) {
      return owned;
    }
    const legacy = await saver.getTuple({
      configurable: {
        thread_id: reference.threadId,
        checkpoint_ns: '',
        [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: reference.checkpointNs,
      },
    });
    return legacy ? reference.checkpointNs : owned;
  }

  const fork: typeof forkAgentEventCheckpoint = async (
    source,
    logical,
    invocationId,
    cfg,
    overlay,
  ) => {
    const checkpointNs = await resolveNamespace(source, cfg);
    const result = await forkAgentEventCheckpoint(
      { ...source, checkpointNs },
      namespace(logical),
      invocationId,
      cfg,
      overlay,
    );
    return result ? { ...result, checkpointNs: logical } : null;
  };

  const capture: typeof captureAgentEventCheckpoint = async (
    threadId,
    logical,
    invocationId,
    cfg,
  ) => {
    const result =
      (await captureAgentEventCheckpoint(threadId, namespace(logical), invocationId, cfg)) ??
      (await captureAgentEventCheckpoint(threadId, logical, invocationId, cfg));
    return result ? { ...result, checkpointNs: logical } : null;
  };

  async function remove(
    reference: Pick<AgentEventCheckpointReference, 'threadId' | 'checkpointNs'>,
    cfg?: TCheckpointerConfig,
  ): Promise<void> {
    // A trusted host reference may predate owner-prefixed storage. Delete the exact scopes only.
    for (const checkpointNamespace of [namespace(reference.checkpointNs), reference.checkpointNs]) {
      await deleteAgentCheckpoint(reference.threadId, cfg, undefined, {
        throwOnError: true,
        checkpointNamespace,
      });
    }
  }

  return { namespace, resolveNamespace, fork, capture, remove };
}
