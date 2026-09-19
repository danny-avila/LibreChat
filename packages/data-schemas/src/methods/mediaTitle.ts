import type { MediaTitleMethods } from '~/types/mediaTitle';
import type { MediaStoredJob } from '~/types/media';
import { createMediaJobModel, createMediaThreadModel } from '~/models/media';
import { tenantStorage, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import { MediaPersistenceError } from './media';

/** A durable one-shot claim prevents duplicate paid title calls after concurrent submit or restart. */
export function createMediaTitleMethods(mongoose: typeof import('mongoose')): MediaTitleMethods {
  const Job = createMediaJobModel(mongoose);
  const Thread = createMediaThreadModel(mongoose);

  const claimMediaThreadTitle: MediaTitleMethods['claimMediaThreadTitle'] = async ({
    scope,
    jobId,
    threadId,
    expectedTitle,
  }) => {
    const current = tenantStorage.getStore()?.tenantId;
    if (
      !scope.ownerId ||
      scope.tenantId === '' ||
      scope.tenantId === SYSTEM_TENANT_ID ||
      (current && current !== SYSTEM_TENANT_ID && current !== scope.tenantId)
    ) {
      throw new MediaPersistenceError('not_found', 'Media title owner scope is unavailable');
    }
    const owner = { ownerId: scope.ownerId, tenantId: scope.tenantId ?? null };
    const job = await Job.findOne({
      ...owner,
      jobId,
      threadId,
      newThread: true,
      executionOwner: 'media',
      phase: 'queued',
      'receipt.phase': 'accepted',
      'request.temporary': { $ne: true },
      cancelRequestedAt: null,
    })
      .select('threadEpoch execution accounting')
      .lean<MediaStoredJob>();
    if (!job || (job.execution.accountingMode === 'balance' && job.accounting?.phase !== 'held')) {
      return false;
    }
    const result = await Thread.updateOne(
      {
        ...owner,
        threadId,
        originRequestId: jobId,
        epoch: job.threadEpoch,
        title: expectedTitle,
        status: 'active',
        titleClaim: null,
      },
      { $set: { titleClaim: { jobId, claimedAt: new Date().toISOString() } } },
      { writeConcern: { w: 'majority', j: true } },
    );
    return result.modifiedCount === 1;
  };
  return { claimMediaThreadTitle };
}
