import type { Model, Types } from 'mongoose';
import type {
  AgentTriggerDeliveryClaim,
  AgentTriggerDeliveryFailure,
  AgentTriggerDeliveryRecord,
  AgentTriggerOrderingBlock,
  IAgentTriggerDelivery,
  IAgentTriggerDeliveryDocument,
} from '~/types/triggerDelivery';
import { createIndexesWithRetry } from '~/utils/retry';

const DUPLICATE_KEY = 11000;
const LEASE_SKEW_MARGIN_MS = 30_000;
const SUCCESS_RETENTION_MS = 90 * 24 * 60 * 60_000;
const MAX_ERROR_CODE_LENGTH = 128;
const MAX_ERROR_MESSAGE_LENGTH = 2048;
const MAX_DEAD_LETTER_LIMIT = 200;
const HISTORY_LIMIT = 64;

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
}

export interface AgentTriggerDeliveryFence {
  id: string;
  workerId: string;
  claimToken: string;
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
    delivery: Pick<AgentTriggerDeliveryRecord, 'id' | 'orderingKey' | 'createdAt'>,
  ) => Promise<AgentTriggerOrderingBlock | null>;
  releaseAgentTriggerDelivery: (
    input: AgentTriggerDeliveryFence & { availableAt: Date },
  ) => Promise<boolean>;
  beginAgentTriggerDeliveryAttempt: (
    input: AgentTriggerDeliveryFence & { now: Date },
  ) => Promise<number | null>;
  completeAgentTriggerDelivery: (
    input: AgentTriggerDeliveryFence & {
      attempt: number;
      result: unknown;
      settledAt: Date;
    },
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
  getAgentTriggerDeadLetters: (limit?: number) => Promise<AgentTriggerDeliveryRecord[]>;
  requeueAgentTriggerDelivery: (
    id: string,
    availableAt: Date,
  ) => Promise<AgentTriggerDeliveryRecord | null>;
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

  async function ensureAgentTriggerDeliveryIndexes(): Promise<void> {
    await createIndexesWithRetry(Delivery());
  }

  async function enqueueAgentTriggerDelivery(
    input: EnqueueAgentTriggerDeliveryInput,
  ): Promise<{ delivery: AgentTriggerDeliveryRecord; replayed: boolean }> {
    try {
      const created = await Delivery().create({
        ...input,
        status: 'pending',
        attempts: 0,
        requeueCount: 0,
      });
      return { delivery: toRecord(created.toObject()), replayed: false };
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
      return { delivery: toRecord(existing), replayed: true };
    }
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
    delivery: Pick<AgentTriggerDeliveryRecord, 'id' | 'orderingKey' | 'createdAt'>,
  ): Promise<AgentTriggerOrderingBlock | null> {
    const earlier = await Delivery()
      .findOne({
        orderingKey: delivery.orderingKey,
        status: { $in: ['pending', 'leased'] },
        $or: [
          { createdAt: { $lt: delivery.createdAt } },
          {
            createdAt: delivery.createdAt,
            _id: { $lt: new mongoose.Types.ObjectId(delivery.id) },
          },
        ],
      })
      .sort({ createdAt: 1, _id: 1 })
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

  async function completeAgentTriggerDelivery(
    input: AgentTriggerDeliveryFence & {
      attempt: number;
      result: unknown;
      settledAt: Date;
    },
  ): Promise<boolean> {
    const result = await Delivery().updateOne(fence(input), {
      $set: {
        status: 'succeeded',
        result: input.result,
        settledAt: input.settledAt,
        expiresAt: new Date(input.settledAt.getTime() + SUCCESS_RETENTION_MS),
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
    });
    return result.modifiedCount === 1;
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
    const result = await Delivery().updateOne(fence(input), {
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
    });
    return result.modifiedCount === 1;
  }

  async function getAgentTriggerDelivery(
    deliveryKey: string,
  ): Promise<AgentTriggerDeliveryRecord | null> {
    const delivery = await Delivery().findOne({ deliveryKey }).lean<IAgentTriggerDelivery>();
    return delivery == null ? null : toRecord(delivery);
  }

  async function getAgentTriggerDeadLetters(limit = 50): Promise<AgentTriggerDeliveryRecord[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError('Agent trigger dead-letter limit must be a positive integer');
    }
    const boundedLimit = Math.min(limit, MAX_DEAD_LETTER_LIMIT);
    const deliveries = await Delivery()
      .find({ status: 'dead' })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(boundedLimit)
      .lean<IAgentTriggerDelivery[]>();
    return deliveries.map(toRecord);
  }

  async function requeueAgentTriggerDelivery(
    id: string,
    availableAt: Date,
  ): Promise<AgentTriggerDeliveryRecord | null> {
    const delivery = await Delivery()
      .findOneAndUpdate(
        { _id: id, status: 'dead' },
        {
          $set: { status: 'pending', attempts: 0, availableAt },
          $unset: {
            leaseBy: 1,
            leaseUntil: 1,
            claimToken: 1,
            lastError: 1,
            result: 1,
            settledAt: 1,
            expiresAt: 1,
          },
          $inc: { requeueCount: 1 },
        },
        { new: true },
      )
      .lean<IAgentTriggerDelivery>();
    return delivery == null ? null : toRecord(delivery);
  }

  async function deleteAgentTriggerDeliveriesByUser(user: string | Types.ObjectId): Promise<void> {
    await Delivery().deleteMany({ user });
  }

  return {
    ensureAgentTriggerDeliveryIndexes,
    enqueueAgentTriggerDelivery,
    claimNextAgentTriggerDelivery,
    findEarlierAgentTriggerDelivery,
    releaseAgentTriggerDelivery,
    beginAgentTriggerDeliveryAttempt,
    completeAgentTriggerDelivery,
    retryAgentTriggerDelivery,
    deadLetterAgentTriggerDelivery,
    getAgentTriggerDelivery,
    getAgentTriggerDeadLetters,
    requeueAgentTriggerDelivery,
    deleteAgentTriggerDeliveriesByUser,
  };
}
