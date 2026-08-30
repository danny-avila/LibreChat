import { Types } from 'mongoose';
import { createHash } from 'crypto';
import { ResourceType } from 'librechat-data-provider';
import type { Model } from 'mongoose';
import type { CodeEnvironmentDocument } from '~/types';
import type { IAclEntry } from '~/types';

const CODE_ENVIRONMENT_TOMBSTONES = 'code_environment_tombstones';

type CodeEnvironmentTombstone = {
  _id: string;
  deletedAt: Date;
};

function tombstones(mongoose: typeof import('mongoose')) {
  const db = mongoose.connection.db;
  if (db == null) {
    throw new Error('MongoDB is not connected');
  }
  return db.collection<CodeEnvironmentTombstone>(CODE_ENVIRONMENT_TOMBSTONES);
}

function ownerSlotId(ownerId: Types.ObjectId, slot: number): Types.ObjectId {
  const hex = createHash('sha256')
    .update(`librechat-code-environment-slot\0${ownerId.toHexString()}\0${slot}`)
    .digest('hex')
    .slice(0, 24);
  return new Types.ObjectId(hex);
}

export type CodeEnvironmentReferenceReservation = {
  environmentId: string;
  reservationId: string;
};

export class CodeEnvironmentReferenceError extends Error {
  constructor(environmentId: string) {
    super(`Code environment is being removed: ${environmentId}`);
    this.name = 'CodeEnvironmentReferenceError';
  }
}

export async function reserveCodeEnvironmentReference(
  mongoose: typeof import('mongoose'),
  environmentId: string | undefined,
): Promise<CodeEnvironmentReferenceReservation | undefined> {
  if (environmentId == null || environmentId.length === 0) return undefined;
  const CodeEnvironment = mongoose.models.CodeEnvironment as
    | Model<CodeEnvironmentDocument>
    | undefined;
  if (CodeEnvironment == null) return undefined;
  const reservationId = new Types.ObjectId().toHexString();
  const reserved = await CodeEnvironment.findOneAndUpdate(
    { environmentId, deletionStartedAt: { $exists: false } },
    { $addToSet: { pendingAgentReferences: reservationId } },
    { new: true },
  ).lean<CodeEnvironmentDocument>();
  if (reserved != null) return { environmentId, reservationId };

  const [persisted, tombstone] = await Promise.all([
    CodeEnvironment.exists({ environmentId }),
    tombstones(mongoose).findOne({ _id: environmentId }),
  ]);
  if (persisted != null || tombstone != null) {
    throw new CodeEnvironmentReferenceError(environmentId);
  }
  // Deployment-owned configuration does not have a registry row.
  return undefined;
}

export async function releaseCodeEnvironmentReference(
  mongoose: typeof import('mongoose'),
  reservation: CodeEnvironmentReferenceReservation | undefined,
): Promise<void> {
  if (reservation == null) return;
  const CodeEnvironment = mongoose.models.CodeEnvironment as
    | Model<CodeEnvironmentDocument>
    | undefined;
  if (CodeEnvironment == null) return;
  await CodeEnvironment.updateOne(
    { environmentId: reservation.environmentId },
    { $pull: { pendingAgentReferences: reservation.reservationId } },
  );
}

type CreateCodeEnvironmentInput = Pick<
  CodeEnvironmentDocument,
  'environmentId' | 'name' | 'type' | 'baseURL' | 'controlPlaneId' | 'createdBy'
> &
  Pick<
    Partial<CodeEnvironmentDocument>,
    'workerId' | 'controlPlaneId' | 'revocationTokenEnv' | 'workerPrincipal'
  >;

export function createCodeEnvironmentMethods(mongoose: typeof import('mongoose')): {
  createCodeEnvironment: (input: CreateCodeEnvironmentInput) => Promise<CodeEnvironmentDocument>;
  createCodeEnvironmentWithinOwnerLimit: (
    input: CreateCodeEnvironmentInput,
    maxOwned: number,
  ) => Promise<CodeEnvironmentDocument | null>;
  findCodeEnvironmentsByIds: (
    ids: Array<string | Types.ObjectId>,
  ) => Promise<CodeEnvironmentDocument[]>;
  findCodeEnvironmentByEnvironmentId: (
    environmentId: string,
  ) => Promise<CodeEnvironmentDocument | null>;
  listCodeEnvironmentIds: () => Promise<string[]>;
  findCodeEnvironmentsByCreator: (
    userId: string | Types.ObjectId,
  ) => Promise<CodeEnvironmentDocument[]>;
  deleteCodeEnvironmentById: (
    id: string | Types.ObjectId,
  ) => Promise<CodeEnvironmentDocument | null>;
  discardCodeEnvironmentById: (id: string | Types.ObjectId) => Promise<void>;
  beginCodeEnvironmentRemoval: (
    id: string | Types.ObjectId,
  ) => Promise<CodeEnvironmentDocument | null>;
  cancelCodeEnvironmentRemoval: (id: string | Types.ObjectId) => Promise<void>;
  deleteUserCodeEnvironments: (userId: string | Types.ObjectId) => Promise<number>;
} {
  const model = () => mongoose.models.CodeEnvironment as Model<CodeEnvironmentDocument>;

  async function createCodeEnvironment(
    input: CreateCodeEnvironmentInput,
  ): Promise<CodeEnvironmentDocument> {
    if ((await tombstones(mongoose).findOne({ _id: input.environmentId })) != null) {
      throw new Error(`Code environment id was previously retired: ${input.environmentId}`);
    }
    return (await model().create(input)).toObject() as CodeEnvironmentDocument;
  }

  async function createCodeEnvironmentWithinOwnerLimit(
    input: CreateCodeEnvironmentInput,
    maxOwned: number,
  ): Promise<CodeEnvironmentDocument | null> {
    if ((await tombstones(mongoose).findOne({ _id: input.environmentId })) != null) {
      throw new Error(`Code environment id was previously retired: ${input.environmentId}`);
    }
    const existing = await model()
      .find({ createdBy: input.createdBy })
      .select('ownerSlot')
      .lean<Array<Pick<CodeEnvironmentDocument, 'ownerSlot'>>>();
    if (existing.length >= maxOwned) return null;
    const reserved = new Set(
      existing
        .map(({ ownerSlot }) => ownerSlot)
        .filter(
          (slot): slot is number =>
            typeof slot === 'number' && Number.isSafeInteger(slot) && slot >= 0 && slot < maxOwned,
        ),
    );
    for (let ownerSlot = 0; reserved.size < existing.length && ownerSlot < maxOwned; ownerSlot++) {
      reserved.add(ownerSlot);
    }
    for (let ownerSlot = 0; ownerSlot < maxOwned; ownerSlot++) {
      if (reserved.has(ownerSlot)) continue;
      try {
        return (
          await model().create({
            ...input,
            _id: ownerSlotId(input.createdBy, ownerSlot),
            ownerSlot,
          })
        ).toObject() as CodeEnvironmentDocument;
      } catch (error) {
        const duplicateOwnerSlot =
          typeof error === 'object' &&
          error != null &&
          'code' in error &&
          error.code === 11000 &&
          'keyPattern' in error &&
          typeof error.keyPattern === 'object' &&
          error.keyPattern != null &&
          ('_id' in error.keyPattern || 'ownerSlot' in error.keyPattern);
        if (!duplicateOwnerSlot) {
          throw error;
        }
      }
    }
    return null;
  }

  async function findCodeEnvironmentsByIds(
    ids: Array<string | Types.ObjectId>,
  ): Promise<CodeEnvironmentDocument[]> {
    if (ids.length === 0) return [];
    return await model()
      .find({ _id: { $in: ids } })
      .sort({ createdAt: 1, _id: 1 })
      .lean<CodeEnvironmentDocument[]>();
  }

  async function findCodeEnvironmentByEnvironmentId(
    environmentId: string,
  ): Promise<CodeEnvironmentDocument | null> {
    return await model().findOne({ environmentId }).lean<CodeEnvironmentDocument>();
  }

  async function listCodeEnvironmentIds(): Promise<string[]> {
    return await model().distinct('environmentId');
  }

  async function findCodeEnvironmentsByCreator(
    userId: string | Types.ObjectId,
  ): Promise<CodeEnvironmentDocument[]> {
    const creatorId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    return await model()
      .find({ createdBy: creatorId })
      .sort({ createdAt: 1, _id: 1 })
      .lean<CodeEnvironmentDocument[]>();
  }

  async function deleteCodeEnvironmentById(
    id: string | Types.ObjectId,
  ): Promise<CodeEnvironmentDocument | null> {
    const environment = await model().findById(id).lean<CodeEnvironmentDocument>();
    if (environment == null) return null;
    await tombstones(mongoose).updateOne(
      { _id: environment.environmentId },
      { $setOnInsert: { deletedAt: new Date() } },
      { upsert: true },
    );
    return await model().findByIdAndDelete(id).lean<CodeEnvironmentDocument>();
  }

  async function discardCodeEnvironmentById(id: string | Types.ObjectId): Promise<void> {
    await model().deleteOne({ _id: id });
  }

  async function beginCodeEnvironmentRemoval(
    id: string | Types.ObjectId,
  ): Promise<CodeEnvironmentDocument | null> {
    return await model()
      .findOneAndUpdate(
        {
          _id: id,
          deletionStartedAt: { $exists: false },
          $or: [
            { pendingAgentReferences: { $exists: false } },
            { pendingAgentReferences: { $size: 0 } },
          ],
        },
        { $set: { deletionStartedAt: new Date() } },
        { new: true },
      )
      .lean<CodeEnvironmentDocument>();
  }

  async function cancelCodeEnvironmentRemoval(id: string | Types.ObjectId): Promise<void> {
    await model().updateOne({ _id: id }, { $unset: { deletionStartedAt: 1 } });
  }

  /** Delete unreferenced creator-owned records and grants after user removal.
   * Failed worker revocations and environments selected by surviving agents
   * remain durable for reconciliation instead of becoming dangling refs. */
  async function deleteUserCodeEnvironments(userId: string | Types.ObjectId): Promise<number> {
    const creatorId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const environments = await model()
      .find({
        createdBy: creatorId,
        revocationPendingAt: { $exists: false },
        deletionStartedAt: { $exists: false },
        $or: [
          { pendingAgentReferences: { $exists: false } },
          { pendingAgentReferences: { $size: 0 } },
        ],
      })
      .select('_id environmentId')
      .lean<Array<Pick<CodeEnvironmentDocument, '_id' | 'environmentId'>>>();
    if (environments.length === 0) return 0;

    const Agent = mongoose.models.Agent;
    const referenced = new Set<string>(
      Agent == null
        ? []
        : await Agent.distinct('code_environment_id', {
            code_environment_id: { $in: environments.map(({ environmentId }) => environmentId) },
          }),
    );
    const deletable = environments.filter(({ environmentId }) => !referenced.has(environmentId));
    if (deletable.length === 0) return 0;

    const resourceIds = deletable.map((environment) => environment._id);
    await Promise.all(
      deletable.map(({ environmentId }) =>
        tombstones(mongoose).updateOne(
          { _id: environmentId },
          { $setOnInsert: { deletedAt: new Date() } },
          { upsert: true },
        ),
      ),
    );
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    await AclEntry.deleteMany({
      resourceType: ResourceType.CODE_ENVIRONMENT,
      resourceId: { $in: resourceIds },
    });
    const result = await model().deleteMany({ _id: { $in: resourceIds } });
    return result.deletedCount ?? 0;
  }

  return {
    createCodeEnvironment,
    createCodeEnvironmentWithinOwnerLimit,
    findCodeEnvironmentsByIds,
    findCodeEnvironmentByEnvironmentId,
    listCodeEnvironmentIds,
    findCodeEnvironmentsByCreator,
    deleteCodeEnvironmentById,
    discardCodeEnvironmentById,
    beginCodeEnvironmentRemoval,
    cancelCodeEnvironmentRemoval,
    deleteUserCodeEnvironments,
  };
}

export type CodeEnvironmentMethods = ReturnType<typeof createCodeEnvironmentMethods>;
