import type { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import type { CreateTenantInput, ITenant, TenantStatus, UpdateTenantInput } from '~/types';
import { isValidTenantId, normalizeTenantId } from '~/utils/tenantId';

export function createTenantMethods(mongoose: typeof import('mongoose')) {
  async function findTenantByObjectId(
    id: string,
    session?: ClientSession,
  ): Promise<ITenant | null> {
    const Tenant = mongoose.models.Tenant as Model<ITenant>;
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return await Tenant.findById(id)
      .session(session ?? null)
      .lean<ITenant>();
  }

  async function findTenantById(
    tenantId: string,
    session?: ClientSession,
  ): Promise<ITenant | null> {
    const Tenant = mongoose.models.Tenant as Model<ITenant>;
    const normalized = normalizeTenantId(tenantId);
    return await Tenant.findOne({ tenantId: normalized })
      .session(session ?? null)
      .lean<ITenant>();
  }

  async function tenantExists(tenantId: string, session?: ClientSession): Promise<boolean> {
    const Tenant = mongoose.models.Tenant as Model<ITenant>;
    const normalized = normalizeTenantId(tenantId);
    const doc = await Tenant.exists({ tenantId: normalized }).session(session ?? null);
    return doc != null;
  }

  async function listTenants(options?: {
    status?: TenantStatus;
    search?: string;
    limit?: number;
    offset?: number;
    session?: ClientSession;
  }): Promise<ITenant[]> {
    const Tenant = mongoose.models.Tenant as Model<ITenant>;
    const filter: FilterQuery<ITenant> = {};
    if (options?.status) {
      filter.status = options.status;
    }
    if (options?.search) {
      const escaped = options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      filter.$or = [{ tenantId: pattern }, { name: pattern }, { description: pattern }];
    }
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    return await Tenant.find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .session(options?.session ?? null)
      .lean<ITenant[]>();
  }

  async function countTenants(
    filter?: { status?: TenantStatus; search?: string },
    session?: ClientSession,
  ): Promise<number> {
    const Tenant = mongoose.models.Tenant as Model<ITenant>;
    const query: FilterQuery<ITenant> = {};
    if (filter?.status) {
      query.status = filter.status;
    }
    if (filter?.search) {
      const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      query.$or = [{ tenantId: pattern }, { name: pattern }, { description: pattern }];
    }
    return await Tenant.countDocuments(query).session(session ?? null);
  }

  async function createTenant(input: CreateTenantInput, session?: ClientSession): Promise<ITenant> {
    const Tenant = mongoose.models.Tenant as Model<ITenant>;
    const tenantId =
      input.tenantId != null && input.tenantId.trim() !== ''
        ? normalizeTenantId(input.tenantId)
        : new mongoose.Types.ObjectId().toString();
    if (!isValidTenantId(tenantId)) {
      throw new Error('Invalid tenant ID');
    }
    const name = input.name.trim();
    if (!name) {
      throw new Error('Tenant name is required');
    }
    const description = input.description?.trim() ?? '';
    const doc = await Tenant.create(
      [
        {
          tenantId,
          name,
          description,
          status: 'active',
          ...(input.createdBy != null && { createdBy: input.createdBy }),
        },
      ],
      { session },
    );
    return doc[0].toObject() as ITenant;
  }

  function buildTenantUpdate(
    data: UpdateTenantInput,
  ): Partial<Pick<ITenant, 'name' | 'description' | 'status'>> {
    const update: Partial<Pick<ITenant, 'name' | 'description' | 'status'>> = {};
    if (data.name != null) {
      const name = data.name.trim();
      if (!name) {
        throw new Error('Tenant name cannot be empty');
      }
      update.name = name;
    }
    if (data.description != null) {
      update.description = data.description.trim();
    }
    if (data.status != null) {
      update.status = data.status;
    }
    return update;
  }

  async function updateTenantByObjectId(
    id: string,
    data: UpdateTenantInput,
    session?: ClientSession,
  ): Promise<ITenant | null> {
    const Tenant = mongoose.models.Tenant as Model<ITenant>;
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    const update = buildTenantUpdate(data);
    if (!Object.keys(update).length) {
      return await findTenantByObjectId(id, session);
    }
    return await Tenant.findByIdAndUpdate(id, { $set: update }, { new: true })
      .session(session ?? null)
      .lean<ITenant>();
  }

  async function updateTenantById(
    tenantId: string,
    data: UpdateTenantInput,
    session?: ClientSession,
  ): Promise<ITenant | null> {
    const Tenant = mongoose.models.Tenant as Model<ITenant>;
    const normalized = normalizeTenantId(tenantId);
    const update = buildTenantUpdate(data);
    if (!Object.keys(update).length) {
      return await findTenantById(normalized, session);
    }
    return await Tenant.findOneAndUpdate({ tenantId: normalized }, { $set: update }, { new: true })
      .session(session ?? null)
      .lean<ITenant>();
  }

  async function deleteTenantByObjectId(id: string, session?: ClientSession): Promise<boolean> {
    const Tenant = mongoose.models.Tenant as Model<ITenant>;
    if (!mongoose.isValidObjectId(id)) {
      return false;
    }
    const result = await Tenant.deleteOne({ _id: id }).session(session ?? null);
    return result.deletedCount > 0;
  }

  async function deleteTenantById(tenantId: string, session?: ClientSession): Promise<boolean> {
    const Tenant = mongoose.models.Tenant as Model<ITenant>;
    const normalized = normalizeTenantId(tenantId);
    const result = await Tenant.deleteOne({ tenantId: normalized }).session(session ?? null);
    return result.deletedCount > 0;
  }

  async function countUsersByTenantId(tenantId: string, session?: ClientSession): Promise<number> {
    const User = mongoose.models.User as Model<{ tenantId?: string }>;
    const normalized = normalizeTenantId(tenantId);
    return await User.countDocuments({ tenantId: normalized }).session(session ?? null);
  }

  return {
    findTenantByObjectId,
    findTenantById,
    tenantExists,
    listTenants,
    countTenants,
    createTenant,
    updateTenantByObjectId,
    updateTenantById,
    deleteTenantByObjectId,
    deleteTenantById,
    countUsersByTenantId,
  };
}

export type TenantMethods = ReturnType<typeof createTenantMethods>;
