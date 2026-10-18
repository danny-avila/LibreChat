import { SystemRoles, OrganizationMemberStatus } from 'librechat-data-provider';
import type { FilterQuery, Model, Types } from 'mongoose';
import type { IUser, IOrganization, OrganizationRecord } from '~/types';
import { runAsSystem, runInTenant, runInAccounts } from '~/config/tenantContext';
import { isTenantIsolatedSchema } from '~/models/plugins/tenantIsolation';
import { buildUserSearchFilter } from '~/utils/search';
import { escapeRegExp } from '~/utils/string';

/**
 * Reads and writes only the platform operator makes, across organizations. Each one names the
 * tenants it touches explicitly: a page of organizations, one organization, or the accounts
 * tenant. None is reachable from an organization member's request.
 */

const ACCOUNT_LIST_FIELDS = 'name email username emailVerified isPlatformOperator createdAt';
const PERSON_FIELDS = 'name email';

/** Members an organization counts: visible to it (never the operator's access) and active. */
const COUNTED_MEMBER: FilterQuery<IUser> = {
  identityId: { $exists: true },
  operatorAccess: { $ne: true },
  status: { $ne: OrganizationMemberStatus.DEACTIVATED },
};

export interface ListOrganizationsParams {
  search?: string;
  status?: string;
  limit: number;
  /** The `_id` of the last organization on the previous page (newest first). */
  after?: string;
}

export interface ListAccountsParams {
  search?: string;
  limit: number;
  after?: string;
}

export interface OrganizationMemberCounts {
  members: number;
  admins: number;
}

export interface TenantPurgeResult {
  /** Records removed, by model. */
  deleted: Record<string, number>;
  /** Models whose records could not be removed; the caller retries the purge. */
  failed: string[];
}

export interface PlatformMethods {
  listOrganizations: (params: ListOrganizationsParams) => Promise<OrganizationRecord[]>;
  countOrganizationMembers: (
    tenantIds: string[],
  ) => Promise<Record<string, OrganizationMemberCounts>>;
  listOrganizationAdmins: (tenantId: string) => Promise<IUser[]>;
  listTenantMemberIds: (tenantId: string) => Promise<string[]>;
  listAccounts: (params: ListAccountsParams) => Promise<IUser[]>;
  findAccount: (accountId: string) => Promise<IUser | null>;
  findAccountsByIds: (accountIds: Array<string | Types.ObjectId>) => Promise<IUser[]>;
  purgeTenantRecords: (tenantId: string, keepModels?: string[]) => Promise<TenantPurgeResult>;
  deleteTenantSessions: (tenantId: string) => Promise<number>;
}

export function createPlatformMethods(mongoose: typeof import('mongoose')): PlatformMethods {
  const Organization = (): Model<IOrganization> => mongoose.models.Organization;
  const User = (): Model<IUser> => mongoose.models.User;

  /** A page of organizations, newest first, optionally by name and status. */
  async function listOrganizations(params: ListOrganizationsParams): Promise<OrganizationRecord[]> {
    const filter: FilterQuery<IOrganization> = {};
    if (params.search?.trim()) {
      filter.name = { $regex: escapeRegExp(params.search.trim().slice(0, 100)), $options: 'i' };
    }
    if (params.status) {
      filter.status = params.status;
    }
    if (params.after && mongoose.isValidObjectId(params.after)) {
      filter._id = { $lt: params.after };
    }
    return runAsSystem(async () =>
      Organization()
        .find(filter)
        .sort({ _id: -1 })
        .limit(params.limit)
        .lean<OrganizationRecord[]>(),
    );
  }

  /** Member and admin counts for a page of organizations, in one aggregate. */
  async function countOrganizationMembers(
    tenantIds: string[],
  ): Promise<Record<string, OrganizationMemberCounts>> {
    const counts: Record<string, OrganizationMemberCounts> = {};
    for (const tenantId of tenantIds) {
      counts[tenantId] = { members: 0, admins: 0 };
    }
    if (tenantIds.length === 0) {
      return counts;
    }
    const rows = await runAsSystem(async () =>
      User().aggregate<{ _id: string; members: number; admins: number }>([
        { $match: { ...COUNTED_MEMBER, tenantId: { $in: tenantIds } } },
        {
          $group: {
            _id: '$tenantId',
            members: { $sum: 1 },
            admins: { $sum: { $cond: [{ $eq: ['$role', SystemRoles.ADMIN] }, 1, 0] } },
          },
        },
      ]),
    );
    for (const row of rows) {
      counts[row._id] = { members: row.members, admins: row.admins };
    }
    return counts;
  }

  /** An organization's active admins, as it sees them. */
  async function listOrganizationAdmins(tenantId: string): Promise<IUser[]> {
    return runInTenant(tenantId, async () =>
      User()
        .find({ ...COUNTED_MEMBER, role: SystemRoles.ADMIN }, PERSON_FIELDS)
        .sort({ _id: 1 })
        .limit(50)
        .lean<IUser[]>(),
    );
  }

  /** Every member record in an organization, in any status, including the operator's access. */
  async function listTenantMemberIds(tenantId: string): Promise<string[]> {
    const members = await runInTenant(tenantId, async () =>
      User()
        .find({ identityId: { $exists: true } }, '_id')
        .lean<IUser[]>(),
    );
    return members.map((member) => member._id.toString());
  }

  /** A page of login accounts, newest first, optionally by name, email or username. */
  async function listAccounts(params: ListAccountsParams): Promise<IUser[]> {
    const conditions: FilterQuery<IUser>[] = [];
    const search = params.search?.trim() ? buildUserSearchFilter(params.search.trim()) : null;
    if (search) {
      conditions.push(search);
    }
    if (params.after && mongoose.isValidObjectId(params.after)) {
      conditions.push({ _id: { $lt: params.after } });
    }
    const filter = conditions.length > 1 ? { $and: conditions } : (conditions[0] ?? {});
    return runInAccounts(async () =>
      User()
        .find(filter, ACCOUNT_LIST_FIELDS)
        .sort({ _id: -1 })
        .limit(params.limit)
        .lean<IUser[]>(),
    );
  }

  async function findAccount(accountId: string): Promise<IUser | null> {
    if (!mongoose.isValidObjectId(accountId)) {
      return null;
    }
    return runInAccounts(async () => User().findById(accountId, ACCOUNT_LIST_FIELDS).lean<IUser>());
  }

  async function findAccountsByIds(accountIds: Array<string | Types.ObjectId>): Promise<IUser[]> {
    if (accountIds.length === 0) {
      return [];
    }
    return runInAccounts(async () =>
      User()
        .find({ _id: { $in: accountIds } }, PERSON_FIELDS)
        .lean<IUser[]>(),
    );
  }

  /**
   * Removes every record a tenant owns, model by model, for an organization's deletion. Only
   * models carrying tenant isolation are touched, each inside the tenant, so no other
   * organization's records can match. A model that fails is reported, not fatal: the deletion
   * retries until nothing is left.
   */
  async function purgeTenantRecords(
    tenantId: string,
    keepModels: string[] = [],
  ): Promise<TenantPurgeResult> {
    const result: TenantPurgeResult = { deleted: {}, failed: [] };
    for (const model of Object.values(mongoose.models)) {
      if (keepModels.includes(model.modelName) || !isTenantIsolatedSchema(model.schema)) {
        continue;
      }
      try {
        const removed = await runInTenant(tenantId, async () => model.deleteMany({}));
        if (removed.deletedCount) {
          result.deleted[model.modelName] = removed.deletedCount;
        }
      } catch {
        result.failed.push(model.modelName);
      }
    }
    return result;
  }

  /** Ends every session in an organization, so nobody keeps working in it once suspended. */
  async function deleteTenantSessions(tenantId: string): Promise<number> {
    const removed = await runInTenant(tenantId, async () => mongoose.models.Session.deleteMany({}));
    return removed.deletedCount ?? 0;
  }

  return {
    deleteTenantSessions,
    listOrganizations,
    countOrganizationMembers,
    listOrganizationAdmins,
    listTenantMemberIds,
    listAccounts,
    findAccount,
    findAccountsByIds,
    purgeTenantRecords,
  };
}
