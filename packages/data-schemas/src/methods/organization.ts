import { randomBytes } from 'crypto';
import {
  SystemRoles,
  OrganizationMemberStatus,
  ORGANIZATION_MEMBER_PROVIDER,
} from 'librechat-data-provider';
import type { TOrganizationMemberStatus } from 'librechat-data-provider';
import type { FilterQuery, Model, Types } from 'mongoose';
import type {
  IUser,
  IOrganization,
  BalanceConfig,
  MembershipRecord,
  CreateUserRequest,
  MembershipOutcome,
  OrganizationRecord,
  TOrganizationStatus,
  CreateMembershipParams,
  ListOrganizationMembersParams,
} from '~/types';
import { runAsSystem, runInTenant, runInAccounts } from '~/config/tenantContext';
import { buildUserSearchFilter } from '~/utils/search';

/** Prefix of every generated organization tenant id. */
export const ORGANIZATION_TENANT_PREFIX = 'org_';

/** Fields a member listing returns; never credentials or derived search tokens. */
const MEMBER_PROJECTION = 'name username email avatar role status identityId createdAt tenantId';

/**
 * Member records an organization can see and manage. The platform operator's access to an
 * organization (`operatorAccess`) is a member record too, but the organization never sees it.
 */
const VISIBLE_MEMBER: FilterQuery<IUser> = {
  identityId: { $exists: true },
  operatorAccess: { $ne: true },
};

/** A new, unguessable tenant id within the `tenantHeader` alphabet (`[-a-zA-Z0-9_.]`). */
export function generateOrganizationTenantId(): string {
  return `${ORGANIZATION_TENANT_PREFIX}${randomBytes(12).toString('hex')}`;
}

export interface OrganizationMethodDeps {
  /** Inserts a user record and credits its start balance; from the user methods. */
  createUser: (
    data: CreateUserRequest,
    balanceConfig?: BalanceConfig,
    disableTTL?: boolean,
    returnUser?: boolean,
  ) => Promise<Types.ObjectId | Partial<IUser>>;
  invalidateAuthUserDocCache: (userId: string) => Promise<boolean>;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

type ProfileFields = Partial<Pick<IUser, 'email' | 'name' | 'username' | 'avatar'>>;

export interface OrganizationMethods {
  createOrganization: (params: {
    tenantId: string;
    name: string;
    createdBy: Types.ObjectId | string;
  }) => Promise<OrganizationRecord>;
  findOrganization: (tenantId: string) => Promise<OrganizationRecord | null>;
  findOrganizationsByTenantIds: (tenantIds: string[]) => Promise<OrganizationRecord[]>;
  renameOrganization: (tenantId: string, name: string) => Promise<OrganizationRecord | null>;
  setOrganizationStatus: (
    tenantId: string,
    status: TOrganizationStatus,
  ) => Promise<OrganizationRecord | null>;
  listOrganizationTenantIds: () => Promise<string[]>;
  deleteOrganization: (tenantId: string) => Promise<void>;
  listMembershipsForIdentity: (identityId: Types.ObjectId | string) => Promise<MembershipRecord[]>;
  findMembership: (identityId: Types.ObjectId | string, tenantId: string) => Promise<IUser | null>;
  createMembership: (
    params: CreateMembershipParams,
    balanceConfig?: BalanceConfig,
  ) => Promise<{ member: IUser; outcome: MembershipOutcome }>;
  deleteMembership: (memberId: string, tenantId: string) => Promise<void>;
  listOrganizationMembers: (params: ListOrganizationMembersParams) => Promise<IUser[]>;
  findOrganizationMember: (memberId: string) => Promise<IUser | null>;
  countActiveOrganizationAdmins: (excludeMemberId?: string) => Promise<number>;
  updateOrganizationMember: (
    memberId: string,
    update: { role?: string; status?: TOrganizationMemberStatus },
  ) => Promise<IUser | null>;
  syncAccountProfileToMembers: (
    identityId: Types.ObjectId | string,
    profile: ProfileFields,
  ) => Promise<number>;
  setLastActiveTenant: (identityId: Types.ObjectId | string, tenantId: string) => Promise<void>;
  claimPendingOrganization: (
    identityId: Types.ObjectId | string,
  ) => Promise<{ name: string } | null>;
  restorePendingOrganization: (
    identityId: Types.ObjectId | string,
    pending: { name: string },
  ) => Promise<void>;
  claimPendingInvite: (identityId: Types.ObjectId | string) => Promise<Types.ObjectId | null>;
  ensureOperatorMembership: (
    params: Pick<CreateMembershipParams, 'tenantId' | 'account'>,
    balanceConfig?: BalanceConfig,
  ) => Promise<IUser>;
  claimPlatformOperator: (accountId: Types.ObjectId | string) => Promise<boolean>;
  findPlatformOperator: () => Promise<IUser | null>;
  transferPlatformOperator: (accountId: Types.ObjectId | string) => Promise<boolean>;
}

export function createOrganizationMethods(
  mongoose: typeof import('mongoose'),
  deps: OrganizationMethodDeps,
): OrganizationMethods {
  const Organization = (): Model<IOrganization> => mongoose.models.Organization;
  const User = (): Model<IUser> => mongoose.models.User;

  /** Creates the organization record inside its own tenant. */
  async function createOrganization(params: {
    tenantId: string;
    name: string;
    createdBy: Types.ObjectId | string;
  }): Promise<OrganizationRecord> {
    return runInTenant(params.tenantId, async () => {
      const organization = await Organization().create({
        tenantId: params.tenantId,
        name: params.name,
        createdBy: params.createdBy,
      });
      return organization.toObject() as OrganizationRecord;
    });
  }

  /** The organization a tenant belongs to, or `null` when no such organization exists. */
  async function findOrganization(tenantId: string): Promise<OrganizationRecord | null> {
    return runInTenant(tenantId, async () =>
      Organization().findOne({ tenantId }).lean<OrganizationRecord>(),
    );
  }

  /** The organizations behind a set of tenants, read across tenants in one query. */
  async function findOrganizationsByTenantIds(tenantIds: string[]): Promise<OrganizationRecord[]> {
    if (tenantIds.length === 0) {
      return [];
    }
    return runAsSystem(async () =>
      Organization()
        .find({ tenantId: { $in: tenantIds } })
        .lean<OrganizationRecord[]>(),
    );
  }

  async function renameOrganization(
    tenantId: string,
    name: string,
  ): Promise<OrganizationRecord | null> {
    return runInTenant(tenantId, async () =>
      Organization()
        .findOneAndUpdate({ tenantId }, { $set: { name } }, { new: true, runValidators: true })
        .lean<OrganizationRecord>(),
    );
  }

  /** Sets an organization's lifecycle status; `null` when the tenant names no organization. */
  async function setOrganizationStatus(
    tenantId: string,
    status: TOrganizationStatus,
  ): Promise<OrganizationRecord | null> {
    return runInTenant(tenantId, async () =>
      Organization()
        .findOneAndUpdate({ tenantId }, { $set: { status } }, { new: true, runValidators: true })
        .lean<OrganizationRecord>(),
    );
  }

  /** Every organization's tenant id, for deployment-wide reconciles at startup. */
  async function listOrganizationTenantIds(): Promise<string[]> {
    const values = await runAsSystem(async () => Organization().distinct('tenantId'));
    return values.filter((value): value is string => typeof value === 'string');
  }

  /** Removes an organization record; used to undo a creation that could not finish. */
  async function deleteOrganization(tenantId: string): Promise<void> {
    await runInTenant(tenantId, async () => {
      await Organization().deleteOne({ tenantId });
    });
  }

  /** Every membership an account holds, in any status, read across tenants. */
  async function listMembershipsForIdentity(
    identityId: Types.ObjectId | string,
  ): Promise<MembershipRecord[]> {
    return runAsSystem(async () =>
      User()
        .find({ identityId }, 'tenantId identityId role status operatorAccess')
        .lean<MembershipRecord[]>(),
    );
  }

  /** The account's member record in one organization, or `null` when it has none. */
  async function findMembership(
    identityId: Types.ObjectId | string,
    tenantId: string,
  ): Promise<IUser | null> {
    return runInTenant(tenantId, async () => User().findOne({ identityId }).lean<IUser>());
  }

  /**
   * Gives an account a member record in an organization. An active membership is returned
   * as is, a deactivated one is reactivated with `role` (its data was kept), and otherwise a
   * new member is created from the account's profile. Concurrent calls for the same account
   * and organization converge on one record through the `{identityId, tenantId}` index.
   */
  async function createMembership(
    params: CreateMembershipParams,
    balanceConfig?: BalanceConfig,
  ): Promise<{ member: IUser; outcome: MembershipOutcome }> {
    const { tenantId, account, role } = params;
    return runInTenant(tenantId, async () => {
      const existing = await User().findOne({ identityId: account._id }).lean<IUser>();
      if (existing) {
        return reactivateIfNeeded(existing, role);
      }
      try {
        const member = (await deps.createUser(
          {
            email: account.email,
            name: account.name,
            username: account.username,
            avatar: account.avatar,
            emailVerified: true,
            provider: ORGANIZATION_MEMBER_PROVIDER,
            role,
            identityId: new mongoose.Types.ObjectId(account._id.toString()),
            status: OrganizationMemberStatus.ACTIVE,
          },
          balanceConfig,
          true,
          true,
        )) as IUser;
        return { member, outcome: 'created' };
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        const raced = await User().findOne({ identityId: account._id }).lean<IUser>();
        if (!raced) {
          throw error;
        }
        return reactivateIfNeeded(raced, role);
      }
    });
  }

  async function reactivateIfNeeded(
    member: IUser,
    role: string,
  ): Promise<{ member: IUser; outcome: MembershipOutcome }> {
    if (member.status !== OrganizationMemberStatus.DEACTIVATED) {
      return { member, outcome: 'existing' };
    }
    const reactivated = await User()
      .findOneAndUpdate(
        { _id: member._id, status: OrganizationMemberStatus.DEACTIVATED },
        { $set: { status: OrganizationMemberStatus.ACTIVE, role } },
        { new: true },
      )
      .lean<IUser>();
    await deps.invalidateAuthUserDocCache(member._id.toString());
    if (reactivated) {
      return { member: reactivated, outcome: 'reactivated' };
    }
    /* Another request reactivated it first. */
    const current = await User().findById(member._id).lean<IUser>();
    return { member: current ?? member, outcome: 'existing' };
  }

  /** Deletes a member record outright; used to undo a membership that could not finish. */
  async function deleteMembership(memberId: string, tenantId: string): Promise<void> {
    await runInTenant(tenantId, async () => {
      await User().deleteOne({ _id: memberId, identityId: { $exists: true } });
    });
    await deps.invalidateAuthUserDocCache(memberId);
  }

  /** A page of the current organization's members, ordered by creation. */
  async function listOrganizationMembers(params: ListOrganizationMembersParams): Promise<IUser[]> {
    const filter: FilterQuery<IUser> = { ...VISIBLE_MEMBER };
    if (params.after) {
      filter._id = { $gt: params.after };
    }
    const search = params.search ? buildUserSearchFilter(params.search) : null;
    const query = search ? { $and: [filter, search] } : filter;
    return User()
      .find(query, MEMBER_PROJECTION)
      .sort({ _id: 1 })
      .limit(params.limit)
      .lean<IUser[]>();
  }

  /** One member of the current organization, or `null` when the id names none. */
  async function findOrganizationMember(memberId: string): Promise<IUser | null> {
    if (!mongoose.isValidObjectId(memberId)) {
      return null;
    }
    return User()
      .findOne({ _id: memberId, ...VISIBLE_MEMBER }, MEMBER_PROJECTION)
      .lean<IUser>();
  }

  /** Active admins of the current organization, optionally ignoring one member. */
  async function countActiveOrganizationAdmins(excludeMemberId?: string): Promise<number> {
    const filter: FilterQuery<IUser> = {
      ...VISIBLE_MEMBER,
      role: SystemRoles.ADMIN,
      status: { $ne: OrganizationMemberStatus.DEACTIVATED },
    };
    if (excludeMemberId) {
      filter._id = { $ne: excludeMemberId };
    }
    return User().countDocuments(filter);
  }

  /** Changes a member of the current organization; `null` when the id names no member. */
  async function updateOrganizationMember(
    memberId: string,
    update: { role?: string; status?: TOrganizationMemberStatus },
  ): Promise<IUser | null> {
    if (!mongoose.isValidObjectId(memberId)) {
      return null;
    }
    const updated = await User()
      .findOneAndUpdate(
        { _id: memberId, ...VISIBLE_MEMBER },
        { $set: update },
        { new: true, runValidators: true, projection: MEMBER_PROJECTION },
      )
      .lean<IUser>();
    await deps.invalidateAuthUserDocCache(memberId);
    return updated;
  }

  /**
   * Copies an account's profile onto every member record it owns, across organizations, so
   * people search and the principal fallback see the current name and address.
   */
  async function syncAccountProfileToMembers(
    identityId: Types.ObjectId | string,
    profile: ProfileFields,
  ): Promise<number> {
    if (Object.keys(profile).length === 0) {
      return 0;
    }
    const memberships = await listMembershipsForIdentity(identityId);
    await Promise.all(
      memberships.map((membership) =>
        runInTenant(membership.tenantId, async () => {
          /* `save` rather than `updateOne` so the search-token plugin re-derives tokens. */
          const member = await User().findById(membership._id);
          if (!member) {
            return;
          }
          member.set(profile);
          await member.save();
        }),
      ),
    );
    await Promise.all(
      memberships.map((membership) => deps.invalidateAuthUserDocCache(membership._id.toString())),
    );
    return memberships.length;
  }

  /** Points an account's next sign-in at an organization. */
  async function setLastActiveTenant(
    identityId: Types.ObjectId | string,
    tenantId: string,
  ): Promise<void> {
    await runAsSystem(async () => {
      await User().updateOne({ _id: identityId }, { $set: { lastActiveTenantId: tenantId } });
    });
    await deps.invalidateAuthUserDocCache(identityId.toString());
  }

  /**
   * Atomically takes the organization an account asked for at registration, so concurrent
   * first sign-ins create it once. Returns `null` when nothing is pending (or another sign-in
   * claimed it).
   */
  async function claimPendingOrganization(
    identityId: Types.ObjectId | string,
  ): Promise<{ name: string } | null> {
    const previous = await runAsSystem(async () =>
      User()
        .findOneAndUpdate(
          { _id: identityId, pendingOrganization: { $exists: true } },
          { $unset: { pendingOrganization: 1 } },
          { new: false, projection: 'pendingOrganization' },
        )
        .lean<IUser>(),
    );
    return previous?.pendingOrganization ?? null;
  }

  /** Puts a claimed registration request back after its organization could not be created. */
  async function restorePendingOrganization(
    identityId: Types.ObjectId | string,
    pending: { name: string },
  ): Promise<void> {
    await runAsSystem(async () => {
      await User().updateOne(
        { _id: identityId, pendingOrganization: { $exists: false } },
        { $set: { pendingOrganization: pending } },
      );
    });
  }

  /** Atomically takes the link invite an account registered with; `null` when none. */
  async function claimPendingInvite(
    identityId: Types.ObjectId | string,
  ): Promise<Types.ObjectId | null> {
    const previous = await runAsSystem(async () =>
      User()
        .findOneAndUpdate(
          { _id: identityId, pendingInviteId: { $exists: true } },
          { $unset: { pendingInviteId: 1 } },
          { new: false, projection: 'pendingInviteId' },
        )
        .lean<IUser>(),
    );
    return previous?.pendingInviteId ?? null;
  }

  /**
   * The operator's access to an organization: its member record there, with ADMIN rights and
   * hidden from the organization. A real, active membership is used as it is; a deactivated one
   * comes back as hidden operator access rather than as a visible member again.
   */
  async function ensureOperatorMembership(
    params: Pick<CreateMembershipParams, 'tenantId' | 'account'>,
    balanceConfig?: BalanceConfig,
  ): Promise<IUser> {
    const { tenantId, account } = params;
    const restore = async (member: IUser): Promise<IUser> => {
      if (member.status !== OrganizationMemberStatus.DEACTIVATED) {
        return member;
      }
      const restored = await User()
        .findOneAndUpdate(
          { _id: member._id },
          {
            $set: {
              status: OrganizationMemberStatus.ACTIVE,
              operatorAccess: true,
              role: SystemRoles.ADMIN,
            },
          },
          { new: true },
        )
        .lean<IUser>();
      await deps.invalidateAuthUserDocCache(member._id.toString());
      return restored ?? member;
    };
    return runInTenant(tenantId, async () => {
      const existing = await User().findOne({ identityId: account._id }).lean<IUser>();
      if (existing) {
        return restore(existing);
      }
      try {
        return (await deps.createUser(
          {
            email: account.email,
            name: account.name,
            username: account.username,
            avatar: account.avatar,
            emailVerified: true,
            provider: ORGANIZATION_MEMBER_PROVIDER,
            role: SystemRoles.ADMIN,
            identityId: new mongoose.Types.ObjectId(account._id.toString()),
            status: OrganizationMemberStatus.ACTIVE,
            operatorAccess: true,
          },
          balanceConfig,
          true,
          true,
        )) as IUser;
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        const raced = await User().findOne({ identityId: account._id }).lean<IUser>();
        if (!raced) {
          throw error;
        }
        return restore(raced);
      }
    });
  }

  /**
   * Makes an account the platform operator. `false` when another account already is: the
   * partial unique index on `isPlatformOperator` lets only one claim succeed.
   */
  async function claimPlatformOperator(accountId: Types.ObjectId | string): Promise<boolean> {
    try {
      const result = await runInAccounts(async () =>
        User().updateOne({ _id: accountId }, { $set: { isPlatformOperator: true } }),
      );
      await deps.invalidateAuthUserDocCache(accountId.toString());
      return result.matchedCount === 1;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return false;
      }
      throw error;
    }
  }

  /** The platform operator's login account, or `null` when no account holds the role. */
  async function findPlatformOperator(): Promise<IUser | null> {
    return runInAccounts(async () => User().findOne({ isPlatformOperator: true }).lean<IUser>());
  }

  /** Hands the operator role to another login account; `false` when that account does not exist. */
  async function transferPlatformOperator(accountId: Types.ObjectId | string): Promise<boolean> {
    return runInAccounts(async () => {
      const target = await User().findById(accountId, '_id').lean<IUser>();
      if (!target) {
        return false;
      }
      const previous = await User().find({ isPlatformOperator: true }, '_id').lean<IUser[]>();
      await User().updateMany(
        { isPlatformOperator: true, _id: { $ne: target._id } },
        { $unset: { isPlatformOperator: 1 } },
      );
      await User().updateOne({ _id: target._id }, { $set: { isPlatformOperator: true } });
      await Promise.all(
        [...previous.map((account) => account._id), target._id].map((id) =>
          deps.invalidateAuthUserDocCache(id.toString()),
        ),
      );
      return true;
    });
  }

  return {
    ensureOperatorMembership,
    claimPlatformOperator,
    findPlatformOperator,
    transferPlatformOperator,
    createOrganization,
    findOrganization,
    findOrganizationsByTenantIds,
    renameOrganization,
    setOrganizationStatus,
    listOrganizationTenantIds,
    deleteOrganization,
    listMembershipsForIdentity,
    findMembership,
    createMembership,
    deleteMembership,
    listOrganizationMembers,
    findOrganizationMember,
    countActiveOrganizationAdmins,
    updateOrganizationMember,
    syncAccountProfileToMembers,
    setLastActiveTenant,
    claimPendingOrganization,
    restorePendingOrganization,
    claimPendingInvite,
  };
}
