import { Types } from 'mongoose';
import { ResourceType } from 'librechat-data-provider';
import type { Model } from 'mongoose';
import type { CodeEnvironmentDocument } from '~/types';
import type { IAclEntry } from '~/types';

type CreateCodeEnvironmentInput = Pick<
  CodeEnvironmentDocument,
  'environmentId' | 'name' | 'type' | 'baseURL' | 'controlPlaneId' | 'createdBy'
> &
  Pick<Partial<CodeEnvironmentDocument>, 'workerId'>;

export function createCodeEnvironmentMethods(mongoose: typeof import('mongoose')): {
  createCodeEnvironment: (input: CreateCodeEnvironmentInput) => Promise<CodeEnvironmentDocument>;
  findCodeEnvironmentsByIds: (
    ids: Array<string | Types.ObjectId>,
  ) => Promise<CodeEnvironmentDocument[]>;
  findCodeEnvironmentByEnvironmentId: (
    environmentId: string,
  ) => Promise<CodeEnvironmentDocument | null>;
  listCodeEnvironmentIds: () => Promise<string[]>;
  deleteCodeEnvironmentById: (
    id: string | Types.ObjectId,
  ) => Promise<CodeEnvironmentDocument | null>;
  deleteUserCodeEnvironments: (userId: string | Types.ObjectId) => Promise<number>;
} {
  const model = () => mongoose.models.CodeEnvironment as Model<CodeEnvironmentDocument>;

  async function createCodeEnvironment(
    input: CreateCodeEnvironmentInput,
  ): Promise<CodeEnvironmentDocument> {
    return (await model().create(input)).toObject() as CodeEnvironmentDocument;
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

  async function deleteCodeEnvironmentById(
    id: string | Types.ObjectId,
  ): Promise<CodeEnvironmentDocument | null> {
    return await model().findByIdAndDelete(id).lean<CodeEnvironmentDocument>();
  }

  /** User-attached environments represent processes enrolled by their creator.
   * Delete the registry records and every grant when that user is removed;
   * sharing an environment does not transfer its lifecycle ownership. */
  async function deleteUserCodeEnvironments(userId: string | Types.ObjectId): Promise<number> {
    const creatorId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const environments = await model().find({ createdBy: creatorId }).select('_id').lean();
    if (environments.length === 0) return 0;

    const resourceIds = environments.map((environment) => environment._id);
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
    findCodeEnvironmentsByIds,
    findCodeEnvironmentByEnvironmentId,
    listCodeEnvironmentIds,
    deleteCodeEnvironmentById,
    deleteUserCodeEnvironments,
  };
}

export type CodeEnvironmentMethods = ReturnType<typeof createCodeEnvironmentMethods>;
