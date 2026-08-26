import type { Model, Types } from 'mongoose';
import type {
  AgentTriggerDeliveryClaim,
  AgentTriggerDeliveryFailure,
  AgentTriggerHandlingState,
  AgentTriggerDeliveryRecord,
  AgentTriggerDeliveryStatusRecord,
  AgentTriggerOrderingBlock,
  IAgentTriggerDelivery,
  IAgentTriggerDeliveryDocument,
  IAgentTriggerLaneSequence,
  IAgentTriggerLaneSequenceDocument,
  IAgentTriggerUserPurge,
  IAgentTriggerUserPurgeDocument,
} from '~/types/triggerDelivery';
import { createIndexesWithRetry } from '~/utils/retry';
import logger from '~/config/winston';

const DUPLICATE_KEY = 11000;
const LEASE_SKEW_MARGIN_MS = 30_000;
const SUCCESS_RETENTION_MS = 90 * 24 * 60 * 60_000;
const MAX_ERROR_CODE_LENGTH = 128;
const MAX_ERROR_MESSAGE_LENGTH = 2048;
const MAX_DEAD_LETTER_LIMIT = 200;
const DEFAULT_PURGE_RECOVERY_LIMIT = 25;
const MAX_PURGE_RECOVERY_LIMIT = 200;
const HISTORY_LIMIT = 64;
const MAX_BATCH_SIZE = 8;
const MAX_BATCH_BYTES = 512 * 1024;

type DuplicateKeyError = { code?: number };

export class AgentTriggerDeliveryConflictError extends Error {
  constructor(deliveryKey: string) {
    super(`Agent trigger delivery key ${deliveryKey} was reused with different content`);
    this.name = 'AgentTriggerDeliveryConflictError';
  }
}

export interface EnqueueAgentTriggerDeliveryInput {
  deliveryKey: string;
  fingerprint: string;
  orderingKey: string;
  envelope: unknown;
  user: string | Types.ObjectId;
  tenantId?: string;
  availableAt: Date;
  envelopeBytes?: number;
  coalesceKey?: string;
  coalesceFrom?: Date;
  coalesceUntil?: Date;
}

export interface AgentTriggerDeliveryFence {
  id: string;
  workerId: string;
  claimToken: string;
}

export interface SettleAgentTriggerHandlingOutcomeInput {
  deliveryKey: string;
  conversationId: string;
  generationCreatedAt: number;
  status: Exclude<AgentTriggerHandlingState['status'], 'started'>;
  settledAt: Date;
  error?: string;
  action?: AgentTriggerHandlingState['action'];
}

export interface AgentTriggerDeliveryMethods {
  ensureAgentTriggerDeliveryIndexes: () => Promise<void>;
  enqueueAgentTriggerDelivery: (
    input: EnqueueAgentTriggerDeliveryInput,
  ) => Promise<{ delivery: AgentTriggerDeliveryRecord; replayed: boolean }>;
  claimNextAgentTriggerDelivery: (input: {
    workerId: string;
    claimToken: string;
    now: Date;
    leaseUntil: Date;
  }) => Promise<AgentTriggerDeliveryClaim | null>;
  findEarlierAgentTriggerDelivery: (
    delivery: Pick<AgentTriggerDeliveryRecord, 'orderingKey' | 'laneSequence'>,
  ) => Promise<AgentTriggerOrderingBlock | null>;
  getAgentTriggerDeliveryBatch: (
    delivery: Pick<AgentTriggerDeliveryRecord, 'id' | 'batchMemberIds'>,
  ) => Promise<AgentTriggerDeliveryRecord[]>;
  releaseAgentTriggerDelivery: (
    input: AgentTriggerDeliveryFence & { availableAt: Date },
  ) => Promise<boolean>;
  beginAgentTriggerDeliveryAttempt: (
    input: AgentTriggerDeliveryFence & { now: Date },
  ) => Promise<number | null>;
  deferAgentTriggerDeliveryAttempt: (
    input: AgentTriggerDeliveryFence & { attempt: number; availableAt: Date },
  ) => Promise<boolean>;
  completeAgentTriggerDelivery: (
    input: AgentTriggerDeliveryFence & {
      attempt: number;
      result: unknown;
      settledAt: Date;
      handling?: AgentTriggerHandlingState;
    },
  ) => Promise<boolean>;
  settleAgentTriggerHandlingOutcome: (
    input: SettleAgentTriggerHandlingOutcomeInput,
  ) => Promise<boolean>;
  retryAgentTriggerDelivery: (
    input: AgentTriggerDeliveryFence & {
      attempt: number;
      error: AgentTriggerDeliveryFailure;
      availableAt: Date;
    },
  ) => Promise<boolean>;
  deadLetterAgentTriggerDelivery: (
    input: AgentTriggerDeliveryFence & {
      attempt: number;
      error: AgentTriggerDeliveryFailure;
      settledAt: Date;
    },
  ) => Promise<boolean>;
  getAgentTriggerDelivery: (deliveryKey: string) => Promise<AgentTriggerDeliveryRecord | null>;
  getAgentTriggerDeliveryStatus: (
    deliveryKey: string,
    user: string | Types.ObjectId,
    sourceKeyId: string,
    tenantId?: string,
  ) => Promise<AgentTriggerDeliveryStatusRecord | null>;
  getAgentTriggerDeadLetters: (limit?: number) => Promise<AgentTriggerDeliveryRecord[]>;
  requeueAgentTriggerDelivery: (
    id: string,
    availableAt: Date,
  ) => Promise<AgentTriggerDeliveryRecord | null>;
  countActiveAgentTriggerDeliveriesByUser: (
    user: string | Types.ObjectId,
    now: Date,
  ) => Promise<number>;
  recoverAgentTriggerLanePublications: (limit?: number) => Promise<number>;
  recoverAgentTriggerBatchReceipts: (limit?: number) => Promise<number>;
  reclaimInactiveAgentTriggerLanes: (limit?: number) => Promise<number>;
  prepareAgentTriggerUserPurge: (
    user: string | Types.ObjectId,
    fenceStartedAt: Date,
    tenantId?: string,
  ) => Promise<void>;
  cancelAgentTriggerUserPurge: (
    user: string | Types.ObjectId,
    fenceStartedAt: Date,
  ) => Promise<boolean>;
  recoverAgentTriggerUserPurges: (limit?: number) => Promise<number>;
  deleteAgentTriggerDeliveriesByUser: (user: string | Types.ObjectId) => Promise<void>;
}

function normalizeFailure(error: AgentTriggerDeliveryFailure): AgentTriggerDeliveryFailure {
  return {
    ...error,
    code: error.code.slice(0, MAX_ERROR_CODE_LENGTH),
    message: error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
  };
}

function toRecord(delivery: IAgentTriggerDelivery): AgentTriggerDeliveryRecord {
  if (delivery._id == null || delivery.createdAt == null) {
    throw new Error('Persisted agent trigger delivery is missing its identity or creation time');
  }
  return {
    id: String(delivery._id),
    deliveryKey: delivery.deliveryKey,
    fingerprint: delivery.fingerprint,
    orderingKey: delivery.orderingKey,
    laneSequence: delivery.laneSequence,
    envelope: delivery.envelope,
    user: delivery.user,
    status: delivery.status,
    attempts: delivery.attempts,
    availableAt: delivery.availableAt,
    createdAt: delivery.createdAt,
    ...(delivery.tenantId != null && { tenantId: delivery.tenantId }),
    ...(delivery.leaseBy != null && { leaseBy: delivery.leaseBy }),
    ...(delivery.leaseUntil != null && { leaseUntil: delivery.leaseUntil }),
    ...(delivery.claimToken != null && { claimToken: delivery.claimToken }),
    ...(delivery.lastError != null && { lastError: delivery.lastError }),
    ...(delivery.result !== undefined && { result: delivery.result }),
    ...(delivery.history != null && { history: delivery.history }),
    ...(delivery.settledAt != null && { settledAt: delivery.settledAt }),
    ...(delivery.expiresAt != null && { expiresAt: delivery.expiresAt }),
    ...(delivery.requeueCount != null && { requeueCount: delivery.requeueCount }),
    ...(delivery.updatedAt != null && { updatedAt: delivery.updatedAt }),
    ...(delivery.envelopeBytes != null && { envelopeBytes: delivery.envelopeBytes }),
    ...(delivery.coalesceKey != null && { coalesceKey: delivery.coalesceKey }),
    ...(delivery.coalesceFrom != null && { coalesceFrom: delivery.coalesceFrom }),
    ...(delivery.coalesceUntil != null && { coalesceUntil: delivery.coalesceUntil }),
    ...(delivery.batchSize != null && { batchSize: delivery.batchSize }),
    ...(delivery.batchBytes != null && { batchBytes: delivery.batchBytes }),
    ...(delivery.batchMemberIds != null && { batchMemberIds: delivery.batchMemberIds }),
    ...(delivery.batchRootId != null && { batchRootId: delivery.batchRootId }),
    ...(delivery.batchMembersSettledAt != null && {
      batchMembersSettledAt: delivery.batchMembersSettledAt,
    }),
    ...(delivery.handling != null && { handling: delivery.handling }),
  };
}

function requireClaim(delivery: IAgentTriggerDelivery | null): AgentTriggerDeliveryClaim | null {
  if (delivery == null) {
    return null;
  }
  const record = toRecord(delivery);
  if (
    record.status !== 'leased' ||
    record.claimToken == null ||
    record.leaseBy == null ||
    record.leaseUntil == null
  ) {
    throw new Error('Claimed agent trigger delivery is missing its lease fence');
  }
  return record as AgentTriggerDeliveryClaim;
}

export function createAgentTriggerDeliveryMethods(
  mongoose: typeof import('mongoose'),
): AgentTriggerDeliveryMethods {
  const Delivery = () =>
    mongoose.models.AgentTriggerDelivery as Model<IAgentTriggerDeliveryDocument>;
  const LaneSequence = () =>
    mongoose.models.AgentTriggerLaneSequence as Model<IAgentTriggerLaneSequenceDocument>;
  const UserPurge = () =>
    mongoose.models.AgentTriggerUserPurge as Model<IAgentTriggerUserPurgeDocument>;

  async function ensureAgentTriggerDeliveryIndexes(): Promise<void> {
    await Promise.all([
      createIndexesWithRetry(Delivery()),
      createIndexesWithRetry(LaneSequence()),
      createIndexesWithRetry(UserPurge()),
    ]);
  }

  async function abandonLanePublisher(lane: IAgentTriggerLaneSequence): Promise<boolean> {
    const publisherDeliveryId = lane.publisherDeliveryId;
    if (publisherDeliveryId == null) {
      return false;
    }
    if (!Number.isSafeInteger(lane.value) || lane.value <= 0) {
      throw new Error('Agent trigger lane publisher has an invalid sequence');
    }
    const publisherFence = {
      _id: lane._id,
      value: lane.value,
      publisherDeliveryId,
    };
    if (lane.value === 1) {
      const deleted = await LaneSequence().deleteOne(publisherFence);
      return deleted.deletedCount === 1;
    }
    const released = await LaneSequence().updateOne(publisherFence, {
      $inc: { value: -1 },
      $set: { cleanupRequestedAt: new Date() },
      $unset: { publisherDeliveryId: 1, publisherStartedAt: 1 },
    });
    return released.modifiedCount === 1;
  }

  async function recoverLanePublisher(lane: IAgentTriggerLaneSequence): Promise<boolean> {
    const publisherDeliveryId = lane.publisherDeliveryId;
    if (publisherDeliveryId == null) {
      return false;
    }
    if (!Number.isSafeInteger(lane.value) || lane.value <= 0) {
      throw new Error('Agent trigger lane publisher has an invalid sequence');
    }

    const staged = await Delivery().findById(publisherDeliveryId).lean<IAgentTriggerDelivery>();
    let batchRoot: IAgentTriggerDelivery | null = null;
    if (
      staged?._id != null &&
      staged.coalesceKey != null &&
      (staged.batchMemberIds?.length ?? 0) === 0
    ) {
      batchRoot = await Delivery()
        .findOne({
          orderingKey: lane._id,
          batchMemberIds: staged._id,
        })
        .lean<IAgentTriggerDelivery>();
      if (
        batchRoot == null &&
        lane.tailDeliveryId != null &&
        staged.coalesceFrom != null &&
        staged.coalesceUntil != null &&
        staged.coalesceUntil.getTime() > Date.now() &&
        staged.envelopeBytes != null &&
        staged.envelopeBytes <= MAX_BATCH_BYTES
      ) {
        batchRoot = await Delivery()
          .findOneAndUpdate(
            {
              _id: { $ne: staged._id },
              $or: [{ _id: lane.tailDeliveryId }, { batchMemberIds: lane.tailDeliveryId }],
              orderingKey: lane._id,
              coalesceKey: staged.coalesceKey,
              status: 'pending',
              coalesceFrom: { $lte: staged.coalesceUntil },
              coalesceUntil: {
                $gt: new Date(),
                $gte: staged.coalesceFrom,
              },
              batchMemberIds: { $ne: staged._id },
              batchSize: { $lt: MAX_BATCH_SIZE },
              batchBytes: { $lte: MAX_BATCH_BYTES - staged.envelopeBytes },
            },
            {
              $inc: { batchSize: 1, batchBytes: staged.envelopeBytes },
              $max: { coalesceFrom: staged.coalesceFrom },
              $min: {
                coalesceUntil: staged.coalesceUntil,
                availableAt: staged.coalesceUntil,
              },
              $push: { batchMemberIds: staged._id },
            },
            { new: true, sort: { laneSequence: -1, _id: -1 } },
          )
          .lean<IAgentTriggerDelivery>();
        if (batchRoot == null) {
          batchRoot = await Delivery()
            .findOne({ orderingKey: lane._id, batchMemberIds: staged._id })
            .lean<IAgentTriggerDelivery>();
        }
      }
    }
    const published = await Delivery().updateOne(
      { _id: publisherDeliveryId, orderingKey: lane._id, status: 'staging' },
      {
        $set: {
          status: batchRoot == null ? 'pending' : 'batched',
          laneSequence: lane.value,
          ...(batchRoot?._id != null && {
            batchRootId: batchRoot._id,
            batchRootRequeueCount: batchRoot.requeueCount ?? 0,
          }),
        },
        $unset: { stagingRecoveryAt: 1 },
      },
    );
    let publicationCommitted = published.modifiedCount === 1;
    if (published.modifiedCount === 0) {
      let current = await Delivery()
        .findById(publisherDeliveryId)
        .select('orderingKey laneSequence status batchRootId')
        .lean<
          Pick<IAgentTriggerDelivery, 'orderingKey' | 'laneSequence' | 'status' | 'batchRootId'>
        >();
      if (
        batchRoot?._id != null &&
        current != null &&
        current.orderingKey === lane._id &&
        current.status !== 'staging' &&
        current.laneSequence !== lane.value
      ) {
        await Delivery().updateOne(
          { _id: publisherDeliveryId, orderingKey: lane._id, status: current.status },
          {
            $set: {
              laneSequence: lane.value,
              batchRootId: batchRoot._id,
              batchRootRequeueCount: batchRoot.requeueCount ?? 0,
            },
          },
        );
        current = await Delivery()
          .findById(publisherDeliveryId)
          .select('orderingKey laneSequence status batchRootId')
          .lean<
            Pick<IAgentTriggerDelivery, 'orderingKey' | 'laneSequence' | 'status' | 'batchRootId'>
          >();
      }
      publicationCommitted =
        current != null &&
        current.orderingKey === lane._id &&
        current.status !== 'staging' &&
        current.laneSequence === lane.value;
      if (current?.orderingKey === lane._id && current.status === 'staging') {
        throw new Error('Failed to publish the reserved agent trigger delivery');
      }
    }

    const publisherFence = {
      _id: lane._id,
      value: lane.value,
      publisherDeliveryId,
    };
    if (publicationCommitted) {
      const released = await LaneSequence().updateOne(publisherFence, {
        $set: { tailDeliveryId: publisherDeliveryId },
        $unset: { publisherDeliveryId: 1, publisherStartedAt: 1 },
      });
      return published.modifiedCount === 1 || released.modifiedCount === 1;
    }

    // The selected row was published by a competing replica before this
    // reservation was acquired (or was removed by account cleanup). No later
    // reservation can exist while this fence is held, so the unused sequence
    // can be rolled back without creating a gap or regressing the lane tail.
    return abandonLanePublisher(lane);
  }

  async function publishStagedDelivery(
    delivery: IAgentTriggerDelivery,
  ): Promise<IAgentTriggerDelivery> {
    if (delivery._id == null) {
      throw new Error('Staged agent trigger delivery is missing its identity');
    }
    const deliveryId = delivery._id;
    const orderingKey = delivery.orderingKey;

    for (;;) {
      const current = await Delivery().findById(deliveryId).lean<IAgentTriggerDelivery>();
      if (current == null) {
        throw new Error('Staged agent trigger delivery disappeared before publication');
      }
      if (current.status !== 'staging') {
        return current;
      }
      if ((await UserPurge().exists({ _id: current.user })) != null) {
        return current;
      }

      const lane = await LaneSequence().findById(orderingKey).lean<IAgentTriggerLaneSequence>();
      if (lane?.publisherDeliveryId != null) {
        if ((await UserPurge().exists({ _id: lane.user })) != null) {
          return current;
        }
        await recoverLanePublisher(lane);
        continue;
      }

      // The durable staging row exists before sequence allocation. Publishing
      // the oldest visible row first lets any replica repair a writer that
      // stopped in that gap without allowing a later enqueue to overtake it.
      const next = await Delivery()
        .findOne({ orderingKey, status: 'staging' })
        // updatedAt is the current staging admission time: initial enqueue
        // sets it on insert, while explicit requeue refreshes it so an old
        // dead letter is admitted behind staging work that already exists.
        .sort({ updatedAt: 1, _id: 1 })
        .lean<IAgentTriggerDelivery>();
      if (next?._id == null) {
        continue;
      }

      let acquired: IAgentTriggerLaneSequence | null = null;
      try {
        acquired = await LaneSequence()
          .findOneAndUpdate(
            { _id: orderingKey, publisherDeliveryId: { $exists: false } },
            {
              $inc: { value: 1 },
              $set: {
                publisherDeliveryId: next._id,
                publisherStartedAt: new Date(),
              },
              $unset: { cleanupRequestedAt: 1 },
              $setOnInsert: {
                user: next.user,
                ...(next.tenantId != null && { tenantId: next.tenantId }),
              },
            },
            { new: true, upsert: true, setDefaultsOnInsert: true },
          )
          .lean<IAgentTriggerLaneSequence>();
      } catch (error) {
        if ((error as DuplicateKeyError)?.code !== DUPLICATE_KEY) {
          throw error;
        }
      }
      if (acquired == null) {
        continue;
      }

      // Account deletion creates this durable marker before it can delete
      // rows or lanes. Recheck after acquisition to close the cross-collection
      // race in which the marker appears between the first check and upsert.
      if ((await UserPurge().exists({ _id: next.user })) != null) {
        await abandonLanePublisher(acquired);
        return current;
      }

      await recoverLanePublisher(acquired);
    }
  }

  async function enqueueAgentTriggerDelivery(
    input: EnqueueAgentTriggerDeliveryInput,
  ): Promise<{ delivery: AgentTriggerDeliveryRecord; replayed: boolean }> {
    let staged: IAgentTriggerDelivery;
    let replayed = false;
    try {
      const created = await Delivery().create({
        ...input,
        ...(input.coalesceKey == null
          ? {}
          : {
              batchSize: 1,
              batchBytes: input.envelopeBytes,
              batchMemberIds: [],
            }),
        laneSequence: 0,
        status: 'staging',
        attempts: 0,
        requeueCount: 0,
        stagingRecoveryAt: new Date(),
      });
      staged = created.toObject();
    } catch (error) {
      if ((error as DuplicateKeyError)?.code !== DUPLICATE_KEY) {
        throw error;
      }
      const existing = await Delivery()
        .findOne({ deliveryKey: input.deliveryKey })
        .lean<IAgentTriggerDelivery>();
      if (existing == null) {
        throw error;
      }
      if (existing.fingerprint !== input.fingerprint) {
        throw new AgentTriggerDeliveryConflictError(input.deliveryKey);
      }
      if (existing.status !== 'staging') {
        return { delivery: toRecord(existing), replayed: true };
      }
      staged = existing;
      replayed = true;
    }

    const published = await publishStagedDelivery(staged);
    return { delivery: toRecord(published), replayed };
  }

  /** Repairs abandoned reservations and staging rows left by crashed writers. */
  async function recoverAgentTriggerLanePublications(
    limit = DEFAULT_PURGE_RECOVERY_LIMIT,
  ): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError('Agent trigger lane recovery limit must be a positive integer');
    }
    const boundedLimit = Math.min(limit, MAX_PURGE_RECOVERY_LIMIT);
    const lanes = await LaneSequence()
      .find({
        publisherDeliveryId: { $exists: true },
        publisherStartedAt: { $exists: true },
      })
      .sort({ publisherStartedAt: 1, _id: 1 })
      .limit(boundedLimit)
      .lean<IAgentTriggerLaneSequence[]>();
    let recovered = 0;
    const recoveryCursor = new Date();
    for (const lane of lanes) {
      if ((await UserPurge().exists({ _id: lane.user })) != null) {
        if (lane.publisherDeliveryId != null && lane.publisherStartedAt != null) {
          await LaneSequence().updateOne(
            {
              _id: lane._id,
              value: lane.value,
              publisherDeliveryId: lane.publisherDeliveryId,
              publisherStartedAt: lane.publisherStartedAt,
            },
            { $set: { publisherStartedAt: recoveryCursor } },
            { timestamps: false },
          );
        }
        continue;
      }
      if (await recoverLanePublisher(lane)) {
        recovered += 1;
      }
    }

    let remaining = boundedLimit - recovered;
    if (remaining <= 0) {
      return recovered;
    }
    /** Pre-cursor replicas can leave staging rows outside the sparse recovery
     * index. Backfill them in bounded batches before using the indexed scan. */
    const legacyStaged = await Delivery()
      .find({ status: 'staging', stagingRecoveryAt: { $exists: false } })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(remaining)
      .lean<IAgentTriggerDelivery[]>();
    const legacyCursor = new Date();
    for (const delivery of legacyStaged) {
      if (delivery._id != null) {
        await Delivery().updateOne(
          { _id: delivery._id, status: 'staging', stagingRecoveryAt: { $exists: false } },
          { $set: { stagingRecoveryAt: legacyCursor } },
          { timestamps: false },
        );
      }
    }
    remaining -= legacyStaged.length;
    const legacyIds = legacyStaged.flatMap((delivery) =>
      delivery._id != null ? [delivery._id] : [],
    );
    const indexedStaged =
      remaining > 0
        ? await Delivery()
            .find({
              status: 'staging',
              stagingRecoveryAt: { $exists: true },
              ...(legacyIds.length > 0 && { _id: { $nin: legacyIds } }),
            })
            .sort({ stagingRecoveryAt: 1, _id: 1 })
            .limit(remaining)
            .lean<IAgentTriggerDelivery[]>()
        : [];
    const staged = [
      ...legacyStaged.map((delivery) => ({ ...delivery, stagingRecoveryAt: legacyCursor })),
      ...indexedStaged,
    ];
    const stagingRecoveryCursor = new Date();
    const rotateStagingRecovery = async (delivery: IAgentTriggerDelivery): Promise<void> => {
      if (delivery._id == null || delivery.stagingRecoveryAt == null) {
        return;
      }
      await Delivery().updateOne(
        {
          _id: delivery._id,
          status: 'staging',
          stagingRecoveryAt: delivery.stagingRecoveryAt,
        },
        { $set: { stagingRecoveryAt: stagingRecoveryCursor } },
        { timestamps: false },
      );
    };
    for (const delivery of staged) {
      try {
        const published = await publishStagedDelivery(delivery);
        if (published.status !== 'staging') {
          recovered += 1;
        } else {
          await rotateStagingRecovery(delivery);
        }
      } catch (error) {
        // Account deletion can remove a staged row while a replica is helping
        // it. Suppress only that confirmed race; operational failures remain
        // visible to the maintenance loop.
        if (delivery._id != null && (await Delivery().exists({ _id: delivery._id })) == null) {
          continue;
        }
        await rotateStagingRecovery(delivery);
        throw error;
      }
    }
    return recovered;
  }

  async function reclaimLaneIfInactive(orderingKey: string): Promise<boolean> {
    const lane = await LaneSequence().findById(orderingKey).lean<IAgentTriggerLaneSequence>();
    if (lane?.cleanupRequestedAt == null) {
      return false;
    }
    const stillRetained = await Delivery().exists({
      orderingKey,
      status: { $in: ['staging', 'batched', 'pending', 'leased', 'dead'] },
    });
    if (stillRetained != null) {
      await LaneSequence().updateOne(
        { _id: orderingKey, cleanupRequestedAt: lane.cleanupRequestedAt },
        { $unset: { cleanupRequestedAt: 1 } },
      );
      return false;
    }
    const deleted = await LaneSequence().deleteOne({
      _id: orderingKey,
      ...(lane.tailDeliveryId == null
        ? { tailDeliveryId: { $exists: false } }
        : { tailDeliveryId: lane.tailDeliveryId }),
      cleanupRequestedAt: lane.cleanupRequestedAt,
      publisherDeliveryId: { $exists: false },
    });
    return deleted.deletedCount === 1;
  }

  async function fulfillLaneCleanupRequest(
    delivery: Pick<IAgentTriggerDelivery, '_id' | 'orderingKey' | 'laneCleanupPendingAt'>,
  ): Promise<boolean> {
    if (delivery._id == null || delivery.laneCleanupPendingAt == null) {
      return false;
    }
    await LaneSequence().updateOne(
      { _id: delivery.orderingKey },
      { $set: { cleanupRequestedAt: delivery.laneCleanupPendingAt } },
    );
    await Delivery().updateOne(
      {
        _id: delivery._id,
        status: 'succeeded',
        laneCleanupPendingAt: delivery.laneCleanupPendingAt,
      },
      { $unset: { laneCleanupPendingAt: 1 } },
      { timestamps: false },
    );
    return reclaimLaneIfInactive(delivery.orderingKey);
  }

  /** Bounds high-cardinality ordering metadata after the final retained job settles. */
  async function reclaimInactiveAgentTriggerLanes(
    limit = DEFAULT_PURGE_RECOVERY_LIMIT,
  ): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError('Agent trigger lane reclamation limit must be a positive integer');
    }
    const boundedLimit = Math.min(limit, MAX_PURGE_RECOVERY_LIMIT);
    const pendingCleanup = await Delivery()
      .find({ status: 'succeeded', laneCleanupPendingAt: { $exists: true } })
      .sort({ laneCleanupPendingAt: 1, _id: 1 })
      .limit(boundedLimit)
      .select('_id orderingKey laneCleanupPendingAt')
      .lean<Array<Pick<IAgentTriggerDelivery, '_id' | 'orderingKey' | 'laneCleanupPendingAt'>>>();
    let reclaimed = 0;
    for (const delivery of pendingCleanup) {
      if (await fulfillLaneCleanupRequest(delivery)) {
        reclaimed += 1;
      }
    }

    const remaining = boundedLimit - pendingCleanup.length;
    if (remaining <= 0) {
      return reclaimed;
    }
    const lanes = await LaneSequence()
      .find({ cleanupRequestedAt: { $exists: true } })
      .sort({ cleanupRequestedAt: 1, _id: 1 })
      .limit(remaining)
      .select('_id')
      .lean<Array<Pick<IAgentTriggerLaneSequence, '_id'>>>();
    for (const lane of lanes) {
      if (await reclaimLaneIfInactive(lane._id)) {
        reclaimed += 1;
      }
    }
    return reclaimed;
  }

  async function claimNextAgentTriggerDelivery(input: {
    workerId: string;
    claimToken: string;
    now: Date;
    leaseUntil: Date;
  }): Promise<AgentTriggerDeliveryClaim | null> {
    const expiredBefore = new Date(input.now.getTime() - LEASE_SKEW_MARGIN_MS);
    const claimed = await Delivery()
      .findOneAndUpdate(
        {
          $or: [
            { status: 'pending', availableAt: { $lte: input.now } },
            { status: 'leased', leaseUntil: { $lte: expiredBefore } },
          ],
        },
        {
          $set: {
            status: 'leased',
            leaseBy: input.workerId,
            leaseUntil: input.leaseUntil,
            claimToken: input.claimToken,
          },
          $unset: { settledAt: 1, expiresAt: 1 },
        },
        { new: true, sort: { availableAt: 1, createdAt: 1, _id: 1 } },
      )
      .lean<IAgentTriggerDelivery>();
    return requireClaim(claimed);
  }

  async function findEarlierAgentTriggerDelivery(
    delivery: Pick<AgentTriggerDeliveryRecord, 'orderingKey' | 'laneSequence'>,
  ): Promise<AgentTriggerOrderingBlock | null> {
    const earlier = await Delivery()
      .findOne({
        orderingKey: delivery.orderingKey,
        status: { $in: ['pending', 'leased'] },
        laneSequence: { $lt: delivery.laneSequence },
      })
      .sort({ laneSequence: 1 })
      .select('availableAt leaseUntil')
      .lean<Pick<IAgentTriggerDelivery, 'availableAt' | 'leaseUntil'>>();
    if (earlier == null) {
      return null;
    }
    return {
      availableAt: earlier.availableAt,
      ...(earlier.leaseUntil != null && { leaseUntil: earlier.leaseUntil }),
    };
  }

  async function getAgentTriggerDeliveryBatch(
    delivery: Pick<AgentTriggerDeliveryRecord, 'id' | 'batchMemberIds'>,
  ): Promise<AgentTriggerDeliveryRecord[]> {
    const memberIds = delivery.batchMemberIds ?? [];
    if (memberIds.length === 0) {
      return [];
    }
    const members = await Delivery()
      .find({ _id: { $in: memberIds } })
      .lean<IAgentTriggerDelivery[]>();
    const byId = new Map(members.map((member) => [String(member._id), member]));
    return memberIds.map((id) => {
      const member = byId.get(String(id));
      if (member == null) {
        throw new Error('Agent trigger batch member is missing');
      }
      if (member.batchRootId != null && String(member.batchRootId) !== delivery.id) {
        throw new Error('Agent trigger batch member belongs to another root');
      }
      return toRecord(member);
    });
  }

  async function propagateBatchHandling(
    root: Pick<IAgentTriggerDelivery, '_id' | 'orderingKey' | 'batchMemberIds' | 'handling'>,
  ): Promise<void> {
    if (root._id == null || root.handling == null || !root.batchMemberIds?.length) {
      return;
    }
    const status = root.handling.status;
    await Delivery().updateMany(
      {
        _id: { $in: root.batchMemberIds },
        orderingKey: root.orderingKey,
        $or:
          status === 'started'
            ? [{ 'handling.status': 'started' }, { 'handling.status': { $exists: false } }]
            : [
                { 'handling.status': { $in: ['started', status] } },
                { 'handling.status': { $exists: false } },
              ],
      },
      { $set: { handling: root.handling } },
    );
  }

  async function settleBatchMembers(
    root: Pick<
      IAgentTriggerDelivery,
      | '_id'
      | 'orderingKey'
      | 'batchMemberIds'
      | 'batchMembersSettledAt'
      | 'requeueCount'
      | 'handling'
    >,
    input: {
      attempt: number;
      workerId: string;
      status: 'succeeded' | 'dead';
      settledAt: Date;
      result?: unknown;
      error?: AgentTriggerDeliveryFailure;
    },
  ): Promise<void> {
    if (root._id == null || root.batchMembersSettledAt != null) {
      return;
    }
    const memberIds = root.batchMemberIds ?? [];
    if (memberIds.length > 0) {
      const error = input.error == null ? undefined : normalizeFailure(input.error);
      const batchRootRequeueCount = root.requeueCount ?? 0;
      const settlement =
        input.status === 'succeeded'
          ? {
              status: input.status,
              attempts: input.attempt,
              result: input.result,
              settledAt: input.settledAt,
              expiresAt: new Date(input.settledAt.getTime() + SUCCESS_RETENTION_MS),
              batchRootId: root._id,
              ...(root.handling != null && { handling: root.handling }),
            }
          : {
              status: input.status,
              attempts: input.attempt,
              settledAt: input.settledAt,
              lastError: error,
              batchRootId: root._id,
            };
      await Delivery().updateMany(
        {
          _id: { $in: memberIds },
          orderingKey: root.orderingKey,
          status: { $in: ['staging', 'batched'] },
          ...(batchRootRequeueCount === 0
            ? {
                $or: [{ batchRootRequeueCount: 0 }, { batchRootRequeueCount: { $exists: false } }],
              }
            : { batchRootRequeueCount }),
        },
        {
          $set: settlement,
          $unset: {
            leaseBy: 1,
            leaseUntil: 1,
            claimToken: 1,
            ...(input.status === 'succeeded' ? { lastError: 1 } : { result: 1, expiresAt: 1 }),
          },
          $push: {
            history: {
              $each: [
                {
                  attempt: input.attempt,
                  outcome: input.status === 'succeeded' ? 'succeeded' : 'dead',
                  at: input.settledAt,
                  workerId: input.workerId,
                  ...(error == null ? {} : { error }),
                },
              ],
              $slice: -HISTORY_LIMIT,
            },
          },
        },
      );
      const settledCount = await Delivery().countDocuments({
        _id: { $in: memberIds },
        orderingKey: root.orderingKey,
        status: input.status,
      });
      if (settledCount !== memberIds.length) {
        throw new Error('Not every agent trigger batch receipt could be settled');
      }
      if (input.status === 'succeeded' && root.handling != null) {
        const authoritative = await Delivery()
          .findById(root._id)
          .select('_id orderingKey batchMemberIds handling')
          .lean<
            Pick<IAgentTriggerDelivery, '_id' | 'orderingKey' | 'batchMemberIds' | 'handling'>
          >();
        if (authoritative != null) {
          await propagateBatchHandling(authoritative);
        }
      }
    }
    await Delivery().updateOne(
      { _id: root._id, status: input.status, batchMembersSettledAt: { $exists: false } },
      { $set: { batchMembersSettledAt: input.settledAt } },
      { timestamps: false },
    );
  }

  async function recoverAgentTriggerBatchReceipts(
    limit = DEFAULT_PURGE_RECOVERY_LIMIT,
  ): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError('Agent trigger batch recovery limit must be a positive integer');
    }
    const roots = await Delivery()
      .find({
        status: { $in: ['succeeded', 'dead'] },
        batchMemberIds: { $exists: true, $ne: [] },
        batchMembersSettledAt: { $exists: false },
      })
      .sort({ settledAt: 1, _id: 1 })
      .limit(Math.min(limit, MAX_PURGE_RECOVERY_LIMIT))
      .lean<IAgentTriggerDelivery[]>();
    let recovered = 0;
    for (const root of roots) {
      if (root.settledAt == null || (root.status !== 'succeeded' && root.status !== 'dead')) {
        continue;
      }
      const error = root.status === 'dead' ? root.lastError : undefined;
      await settleBatchMembers(root, {
        attempt: Math.max(root.attempts, 1),
        workerId: 'batch-recovery',
        status: root.status,
        settledAt: root.settledAt,
        ...(root.status === 'succeeded' ? { result: root.result } : {}),
        ...(error == null ? {} : { error }),
      });
      if (root.status === 'succeeded') {
        await fulfillLaneCleanupRequest(root);
      }
      recovered += 1;
    }
    return recovered;
  }

  const fence = (input: AgentTriggerDeliveryFence) => ({
    _id: input.id,
    status: 'leased',
    leaseBy: input.workerId,
    claimToken: input.claimToken,
  });

  async function releaseAgentTriggerDelivery(
    input: AgentTriggerDeliveryFence & { availableAt: Date },
  ): Promise<boolean> {
    const result = await Delivery().updateOne(fence(input), {
      $set: { status: 'pending', availableAt: input.availableAt },
      $unset: { leaseBy: 1, leaseUntil: 1, claimToken: 1 },
    });
    return result.modifiedCount === 1;
  }

  async function beginAgentTriggerDeliveryAttempt(
    input: AgentTriggerDeliveryFence & { now: Date },
  ): Promise<number | null> {
    const updated = await Delivery()
      .findOneAndUpdate(
        { ...fence(input), leaseUntil: { $gt: input.now } },
        { $inc: { attempts: 1 } },
        { new: true },
      )
      .select('attempts')
      .lean<Pick<IAgentTriggerDelivery, 'attempts'>>();
    return updated?.attempts ?? null;
  }

  /** Releases a pre-dispatch deferral and restores the attempt consumed by beginAttempt. */
  async function deferAgentTriggerDeliveryAttempt(
    input: AgentTriggerDeliveryFence & { attempt: number; availableAt: Date },
  ): Promise<boolean> {
    if (!Number.isSafeInteger(input.attempt) || input.attempt <= 0) {
      throw new TypeError('attempt must be a positive integer');
    }
    const result = await Delivery().updateOne(
      { ...fence(input), attempts: input.attempt },
      {
        $inc: { attempts: -1 },
        $set: { status: 'pending', availableAt: input.availableAt },
        $unset: { leaseBy: 1, leaseUntil: 1, claimToken: 1 },
      },
    );
    return result.modifiedCount === 1;
  }

  async function completeAgentTriggerDelivery(
    input: AgentTriggerDeliveryFence & {
      attempt: number;
      result: unknown;
      settledAt: Date;
      handling?: AgentTriggerHandlingState;
    },
  ): Promise<boolean> {
    const completed = await Delivery()
      .findOneAndUpdate(
        fence(input),
        {
          $set: {
            status: 'succeeded',
            result: input.result,
            settledAt: input.settledAt,
            expiresAt: new Date(input.settledAt.getTime() + SUCCESS_RETENTION_MS),
            laneCleanupPendingAt: input.settledAt,
            ...(input.handling != null && { handling: input.handling }),
          },
          $unset: { leaseBy: 1, leaseUntil: 1, claimToken: 1, lastError: 1 },
          $push: {
            history: {
              $each: [
                {
                  attempt: input.attempt,
                  outcome: 'succeeded',
                  at: input.settledAt,
                  workerId: input.workerId,
                },
              ],
              $slice: -HISTORY_LIMIT,
            },
          },
        },
        { new: true },
      )
      .select(
        '_id orderingKey laneCleanupPendingAt batchMemberIds batchMembersSettledAt requeueCount handling',
      )
      .lean<
        Pick<
          IAgentTriggerDelivery,
          | '_id'
          | 'orderingKey'
          | 'laneCleanupPendingAt'
          | 'batchMemberIds'
          | 'batchMembersSettledAt'
          | 'requeueCount'
          | 'handling'
        >
      >();
    if (completed?._id == null) {
      return false;
    }

    try {
      await settleBatchMembers(completed, {
        attempt: input.attempt,
        workerId: input.workerId,
        status: 'succeeded',
        settledAt: input.settledAt,
        result: input.result,
      });
      await fulfillLaneCleanupRequest(completed);
    } catch (error) {
      // Root success is authoritative. Maintenance retries both constituent
      // receipt settlement and the existing durable lane-cleanup marker.
      logger.warn('[agent-triggers] failed to finalize a completed trigger batch', {
        orderingKey: completed.orderingKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  async function settleAgentTriggerHandlingOutcome(
    input: SettleAgentTriggerHandlingOutcomeInput,
  ): Promise<boolean> {
    const error = input.error?.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    const terminalHandling = {
      'handling.status': input.status,
      'handling.settledAt': input.settledAt,
      ...(error != null && { 'handling.error': error }),
      ...(input.action != null && { 'handling.action': input.action }),
    };
    const terminal = await Delivery()
      .findOneAndUpdate(
        {
          deliveryKey: input.deliveryKey,
          'handling.status': 'started',
          'handling.conversationId': input.conversationId,
          'handling.generationCreatedAt': input.generationCreatedAt,
        },
        {
          $set: terminalHandling,
          $unset: {
            ...(error == null && { 'handling.error': 1 }),
            ...(input.action == null && { 'handling.action': 1 }),
          },
        },
        { new: true },
      )
      .select('_id orderingKey batchMemberIds handling')
      .lean<Pick<IAgentTriggerDelivery, '_id' | 'orderingKey' | 'batchMemberIds' | 'handling'>>();

    let authoritative = terminal;
    if (authoritative == null) {
      const existing = await Delivery()
        .findOne({
          deliveryKey: input.deliveryKey,
          'handling.conversationId': input.conversationId,
          'handling.generationCreatedAt': input.generationCreatedAt,
        })
        .select('_id orderingKey batchMemberIds handling')
        .lean<Pick<IAgentTriggerDelivery, '_id' | 'orderingKey' | 'batchMemberIds' | 'handling'>>();
      const replayed =
        existing?.handling?.status === input.status &&
        existing.handling.error === error &&
        existing.handling.action?.toolName === input.action?.toolName &&
        existing.handling.action?.toolCallId === input.action?.toolCallId;
      if (!replayed) {
        return false;
      }
      authoritative = existing;
    }

    await propagateBatchHandling(authoritative);
    return true;
  }

  async function retryAgentTriggerDelivery(
    input: AgentTriggerDeliveryFence & {
      attempt: number;
      error: AgentTriggerDeliveryFailure;
      availableAt: Date;
    },
  ): Promise<boolean> {
    const error = normalizeFailure(input.error);
    const result = await Delivery().updateOne(fence(input), {
      $set: { status: 'pending', availableAt: input.availableAt, lastError: error },
      $unset: { leaseBy: 1, leaseUntil: 1, claimToken: 1, settledAt: 1, expiresAt: 1 },
      $push: {
        history: {
          $each: [
            {
              attempt: input.attempt,
              outcome: 'retry',
              at: error.attemptedAt,
              workerId: input.workerId,
              error,
            },
          ],
          $slice: -HISTORY_LIMIT,
        },
      },
    });
    return result.modifiedCount === 1;
  }

  async function deadLetterAgentTriggerDelivery(
    input: AgentTriggerDeliveryFence & {
      attempt: number;
      error: AgentTriggerDeliveryFailure;
      settledAt: Date;
    },
  ): Promise<boolean> {
    const error = normalizeFailure(input.error);
    const dead = await Delivery()
      .findOneAndUpdate(
        fence(input),
        {
          $set: { status: 'dead', settledAt: input.settledAt, lastError: error },
          $unset: { leaseBy: 1, leaseUntil: 1, claimToken: 1, expiresAt: 1 },
          $push: {
            history: {
              $each: [
                {
                  attempt: input.attempt,
                  outcome: 'dead',
                  at: input.settledAt,
                  workerId: input.workerId,
                  error,
                },
              ],
              $slice: -HISTORY_LIMIT,
            },
          },
        },
        { new: true },
      )
      .select('_id orderingKey batchMemberIds batchMembersSettledAt requeueCount')
      .lean<
        Pick<
          IAgentTriggerDelivery,
          '_id' | 'orderingKey' | 'batchMemberIds' | 'batchMembersSettledAt' | 'requeueCount'
        >
      >();
    if (dead?._id == null) {
      return false;
    }
    try {
      await settleBatchMembers(dead, {
        attempt: input.attempt,
        workerId: input.workerId,
        status: 'dead',
        settledAt: input.settledAt,
        error,
      });
    } catch (settlementError) {
      logger.warn('[agent-triggers] failed to settle batch dead-letter receipts', {
        deliveryId: String(dead._id),
        error: settlementError instanceof Error ? settlementError.message : String(settlementError),
      });
    }
    return true;
  }

  async function getAgentTriggerDelivery(
    deliveryKey: string,
  ): Promise<AgentTriggerDeliveryRecord | null> {
    const delivery = await Delivery().findOne({ deliveryKey }).lean<IAgentTriggerDelivery>();
    return delivery == null ? null : toRecord(delivery);
  }

  async function getAgentTriggerDeliveryStatus(
    deliveryKey: string,
    user: string | Types.ObjectId,
    sourceKeyId: string,
    tenantId?: string,
  ): Promise<AgentTriggerDeliveryStatusRecord | null> {
    const tenantScope =
      tenantId == null ? { tenantId: null } : { $or: [{ tenantId: null }, { tenantId }] };
    let delivery = await Delivery()
      .findOne({
        deliveryKey,
        user,
        'envelope.event.source.id': sourceKeyId,
        'envelope.event.source.type': 'remote_api_key',
        ...tenantScope,
      })
      .select(
        '-_id deliveryKey status attempts availableAt createdAt settledAt result lastError handling',
      )
      .lean<AgentTriggerDeliveryStatusRecord>();
    if (delivery != null && delivery.status === 'batched') {
      const member = await Delivery()
        .findOne({ deliveryKey, user, ...tenantScope })
        .select('batchRootId')
        .lean<Pick<IAgentTriggerDelivery, 'batchRootId'>>();
      if (member?.batchRootId == null) {
        return null;
      }
      const root = await Delivery()
        .findOne({
          _id: member.batchRootId,
          user,
          'envelope.event.source.id': sourceKeyId,
          'envelope.event.source.type': 'remote_api_key',
          ...tenantScope,
        })
        .select('-_id status attempts availableAt settledAt result lastError handling')
        .lean<
          Pick<
            AgentTriggerDeliveryStatusRecord,
            | 'status'
            | 'attempts'
            | 'availableAt'
            | 'settledAt'
            | 'result'
            | 'lastError'
            | 'handling'
          >
        >();
      if (root == null) {
        return null;
      }
      delivery = { ...delivery, ...root, deliveryKey };
    }
    return delivery;
  }

  async function getAgentTriggerDeadLetters(limit = 50): Promise<AgentTriggerDeliveryRecord[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError('Agent trigger dead-letter limit must be a positive integer');
    }
    const boundedLimit = Math.min(limit, MAX_DEAD_LETTER_LIMIT);
    const deliveries = await Delivery()
      .find({ status: 'dead', batchRootId: { $exists: false } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(boundedLimit)
      .lean<IAgentTriggerDelivery[]>();
    return deliveries.map(toRecord);
  }

  async function requeueAgentTriggerDelivery(
    id: string,
    availableAt: Date,
  ): Promise<AgentTriggerDeliveryRecord | null> {
    const candidate = await Delivery()
      .findOne({ _id: id, status: 'dead', batchRootId: { $exists: false } })
      .lean<IAgentTriggerDelivery>();
    if (candidate?._id == null) {
      return null;
    }
    const previousRequeueCount = candidate.requeueCount ?? 0;
    const requeueCount = previousRequeueCount + 1;
    const memberIds = candidate.batchMemberIds ?? [];
    if (memberIds.length > 0) {
      await Delivery().updateMany(
        {
          _id: { $in: memberIds },
          orderingKey: candidate.orderingKey,
          batchRootId: candidate._id,
          status: { $in: ['staging', 'batched', 'succeeded', 'dead'] },
          ...(previousRequeueCount === 0
            ? {
                $or: [{ batchRootRequeueCount: 0 }, { batchRootRequeueCount: { $exists: false } }],
              }
            : { batchRootRequeueCount: previousRequeueCount }),
        },
        {
          $set: {
            status: 'batched',
            attempts: 0,
            batchRootId: candidate._id,
            batchRootRequeueCount: requeueCount,
          },
          $unset: {
            lastError: 1,
            result: 1,
            settledAt: 1,
            expiresAt: 1,
          },
        },
      );
      const preparedCount = await Delivery().countDocuments({
        _id: { $in: memberIds },
        orderingKey: candidate.orderingKey,
        status: 'batched',
        batchRootId: candidate._id,
        batchRootRequeueCount: requeueCount,
      });
      if (preparedCount !== memberIds.length) {
        throw new Error('Not every agent trigger batch receipt could be prepared for requeue');
      }
    }

    const staged = await Delivery()
      .findOneAndUpdate(
        {
          _id: candidate._id,
          status: 'dead',
          batchRootId: { $exists: false },
          requeueCount: previousRequeueCount,
        },
        {
          $set: {
            status: 'staging',
            laneSequence: 0,
            attempts: 0,
            availableAt,
            stagingRecoveryAt: new Date(),
          },
          $unset: {
            leaseBy: 1,
            leaseUntil: 1,
            claimToken: 1,
            lastError: 1,
            result: 1,
            settledAt: 1,
            expiresAt: 1,
            laneCleanupPendingAt: 1,
            batchMembersSettledAt: 1,
          },
          $inc: { requeueCount: 1 },
        },
        { new: true },
      )
      .lean<IAgentTriggerDelivery>();
    if (staged == null) {
      return null;
    }

    // Requeue is a new lane admission. Retaining the dead letter's original
    // sequence could let it overlap a newer delivery that is already running.
    return toRecord(await publishStagedDelivery(staged));
  }

  async function countActiveAgentTriggerDeliveriesByUser(
    user: string | Types.ObjectId,
    now: Date,
  ): Promise<number> {
    return Delivery().countDocuments({ user, status: 'leased', leaseUntil: { $gt: now } });
  }

  function requireValidFence(fenceStartedAt: Date): void {
    if (!(fenceStartedAt instanceof Date) || !Number.isFinite(fenceStartedAt.getTime())) {
      throw new TypeError('fenceStartedAt must be a valid Date');
    }
  }

  /** Arms independently retryable cleanup before the user deletion can commit. */
  async function prepareAgentTriggerUserPurge(
    user: string | Types.ObjectId,
    fenceStartedAt: Date,
    tenantId?: string,
  ): Promise<void> {
    requireValidFence(fenceStartedAt);
    const ownsFence = await mongoose.models.User.exists({
      _id: user,
      agentTriggerDeletionStartedAt: fenceStartedAt,
    });
    if (ownsFence == null) {
      throw new Error('Cannot prepare trigger purge without owning the user deletion fence');
    }
    await UserPurge().updateOne(
      { _id: user },
      {
        $set: {
          fenceStartedAt,
          ...(tenantId != null && { tenantId }),
        },
      },
      { upsert: true },
    );
  }

  /** Disarms only the pre-commit deletion attempt that owns this marker. */
  async function cancelAgentTriggerUserPurge(
    user: string | Types.ObjectId,
    fenceStartedAt: Date,
  ): Promise<boolean> {
    requireValidFence(fenceStartedAt);
    const ownsLiveFence = await mongoose.models.User.exists({
      _id: user,
      agentTriggerDeletionStartedAt: fenceStartedAt,
    });
    if (ownsLiveFence == null) {
      return false;
    }
    const result = await UserPurge().deleteOne({ _id: user, fenceStartedAt });
    return result.deletedCount === 1;
  }

  /** Recovers cleanup markers whose users are gone; active-user markers are never destructive. */
  async function recoverAgentTriggerUserPurges(
    limit = DEFAULT_PURGE_RECOVERY_LIMIT,
  ): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError('Agent trigger purge recovery limit must be a positive integer');
    }
    const markers = await UserPurge()
      .find({})
      .sort({ updatedAt: 1, _id: 1 })
      .limit(Math.min(limit, MAX_PURGE_RECOVERY_LIMIT))
      .lean<IAgentTriggerUserPurge[]>();
    let recovered = 0;
    for (const marker of markers) {
      const user = await mongoose.models.User.findById(marker._id)
        .select('agentTriggerDeletionStartedAt')
        .lean<{ agentTriggerDeletionStartedAt?: Date }>();
      if (user != null) {
        if (user.agentTriggerDeletionStartedAt?.getTime() === marker.fenceStartedAt.getTime()) {
          // Move a still-owned pre-commit marker behind this bounded scan so
          // it cannot starve later markers whose users are already gone.
          await UserPurge().updateOne(
            { _id: marker._id, fenceStartedAt: marker.fenceStartedAt },
            { $currentDate: { updatedAt: true } },
          );
          continue;
        }
        await UserPurge().deleteOne({ _id: marker._id, fenceStartedAt: marker.fenceStartedAt });
        continue;
      }
      await Promise.all([
        Delivery().deleteMany({ user: marker._id }),
        LaneSequence().deleteMany({ user: marker._id }),
      ]);
      const result = await UserPurge().deleteOne({
        _id: marker._id,
        fenceStartedAt: marker.fenceStartedAt,
      });
      recovered += result.deletedCount;
    }
    return recovered;
  }

  async function deleteAgentTriggerDeliveriesByUser(user: string | Types.ObjectId): Promise<void> {
    await Promise.all([Delivery().deleteMany({ user }), LaneSequence().deleteMany({ user })]);
    await UserPurge().deleteOne({ _id: user });
  }

  return {
    ensureAgentTriggerDeliveryIndexes,
    enqueueAgentTriggerDelivery,
    claimNextAgentTriggerDelivery,
    findEarlierAgentTriggerDelivery,
    getAgentTriggerDeliveryBatch,
    releaseAgentTriggerDelivery,
    beginAgentTriggerDeliveryAttempt,
    deferAgentTriggerDeliveryAttempt,
    completeAgentTriggerDelivery,
    settleAgentTriggerHandlingOutcome,
    retryAgentTriggerDelivery,
    deadLetterAgentTriggerDelivery,
    getAgentTriggerDelivery,
    getAgentTriggerDeliveryStatus,
    getAgentTriggerDeadLetters,
    requeueAgentTriggerDelivery,
    countActiveAgentTriggerDeliveriesByUser,
    recoverAgentTriggerLanePublications,
    recoverAgentTriggerBatchReceipts,
    reclaimInactiveAgentTriggerLanes,
    prepareAgentTriggerUserPurge,
    cancelAgentTriggerUserPurge,
    recoverAgentTriggerUserPurges,
    deleteAgentTriggerDeliveriesByUser,
  };
}
