import type { ClientSession, Model, Types } from 'mongoose';
import type { INangoConnection, NangoConnectionStatus, UpsertNangoConnectionInput } from '~/types';

export function createNangoConnectionMethods(mongoose: typeof import('mongoose')) {
  function getModel(): Model<INangoConnection> {
    return mongoose.models.NangoConnection as Model<INangoConnection>;
  }

  async function findNangoConnectionByUserAndProvider(
    userId: string,
    providerKey: string,
    session?: ClientSession,
  ): Promise<INangoConnection | null> {
    if (!mongoose.isValidObjectId(userId)) {
      return null;
    }
    return await getModel()
      .findOne({ userId: new mongoose.Types.ObjectId(userId), providerKey })
      .session(session ?? null)
      .lean<INangoConnection>();
  }

  async function listNangoConnectionsByUserId(
    userId: string,
    session?: ClientSession,
  ): Promise<INangoConnection[]> {
    if (!mongoose.isValidObjectId(userId)) {
      return [];
    }
    return await getModel()
      .find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ connectedAt: -1 })
      .session(session ?? null)
      .lean<INangoConnection[]>();
  }

  async function listNangoConnectionsByTenantId(
    tenantId: string,
    options?: { providerKey?: string; limit?: number; offset?: number },
    session?: ClientSession,
  ): Promise<INangoConnection[]> {
    const normalized = tenantId.trim();
    if (!normalized) {
      return [];
    }
    const filter: { tenantId: string; providerKey?: string } = { tenantId: normalized };
    if (options?.providerKey) {
      filter.providerKey = options.providerKey;
    }
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    return await getModel()
      .find(filter)
      .sort({ connectedAt: -1 })
      .skip(offset)
      .limit(limit)
      .session(session ?? null)
      .lean<INangoConnection[]>();
  }

  async function upsertNangoConnection(
    input: UpsertNangoConnectionInput,
    session?: ClientSession,
  ): Promise<INangoConnection | null> {
    if (!mongoose.isValidObjectId(input.userId)) {
      return null;
    }
    const userObjectId = new mongoose.Types.ObjectId(input.userId) as Types.ObjectId;
    const status: NangoConnectionStatus = input.status ?? 'connected';
    return await getModel()
      .findOneAndUpdate(
        { userId: userObjectId, providerKey: input.providerKey },
        {
          $set: {
            tenantId: input.tenantId?.trim() || undefined,
            nangoIntegrationId: input.nangoIntegrationId,
            connectionId: input.connectionId,
            status,
          },
          $setOnInsert: {
            userId: userObjectId,
            providerKey: input.providerKey,
            connectedAt: new Date(),
          },
        },
        { upsert: true, new: true, session: session ?? null },
      )
      .lean<INangoConnection>();
  }

  async function deleteNangoConnectionByUserAndProvider(
    userId: string,
    providerKey: string,
    session?: ClientSession,
  ): Promise<boolean> {
    if (!mongoose.isValidObjectId(userId)) {
      return false;
    }
    const result = await getModel()
      .deleteOne({ userId: new mongoose.Types.ObjectId(userId), providerKey })
      .session(session ?? null);
    return result.deletedCount > 0;
  }

  return {
    findNangoConnectionByUserAndProvider,
    listNangoConnectionsByUserId,
    listNangoConnectionsByTenantId,
    upsertNangoConnection,
    deleteNangoConnectionByUserAndProvider,
  };
}

export type NangoConnectionMethods = ReturnType<typeof createNangoConnectionMethods>;
