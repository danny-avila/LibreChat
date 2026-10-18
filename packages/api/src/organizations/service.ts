import { randomUUID } from 'crypto';
import {
  SystemRoles,
  OrganizationErrorCode,
  OrganizationMemberStatus,
} from 'librechat-data-provider';
import {
  logger,
  runInTenant,
  OrganizationStatus,
  ORGANIZATION_NAME_MAX_LENGTH,
  generateOrganizationTenantId,
} from '@librechat/data-schemas';
import type {
  TOrganizationsConfig,
  TOrganizationErrorCode,
  TOrganizationMembership,
} from 'librechat-data-provider';
import type { IUser, AllMethods, OrganizationRecord } from '@librechat/data-schemas';
import type { RecordAuditEntry } from '~/admin/audit';
import type { OrganizationResult } from './types';
import { createOrganizationAuditor } from './audit';
import { toOrganization } from './dto';

export type OrganizationServiceDb = Pick<
  AllMethods,
  | 'createOrganization'
  | 'findOrganization'
  | 'findOrganizationsByTenantIds'
  | 'renameOrganization'
  | 'deleteOrganization'
  | 'createMembership'
  | 'listMembershipsForIdentity'
  | 'listOrganizationMembers'
  | 'findOrganizationMember'
  | 'countActiveOrganizationAdmins'
  | 'updateOrganizationMember'
  | 'claimPendingOrganization'
  | 'restorePendingOrganization'
  | 'claimPendingInvite'
  | 'syncOrganizationAdminGrants'
  | 'getRoleByName'
  | 'deleteAllUserSessions'
  | 'acquireResourceLock'
  | 'releaseResourceLock'
  | 'findMembership'
  | 'ensureOperatorMembership'
>;

/** The login account an organization operation acts for. */
export interface OrganizationAccount {
  _id: { toString(): string };
  email?: string;
  name?: string;
  username?: string;
  avatar?: string;
  emailVerified?: boolean;
  /** The platform operator, who may enter any organization. */
  isPlatformOperator?: boolean;
}

/** The member performing an operation inside its current organization. */
export interface OrganizationActor {
  id: string;
  role?: string;
  tenantId: string;
  name?: string;
}

export interface OrganizationServiceDeps {
  db: OrganizationServiceDb;
  getConfig: () => TOrganizationsConfig;
  /** Applies the deployment's interface permissions to a new organization's roles. */
  provisionRolePermissions?: (tenantId: string) => Promise<void>;
  /** Redeems the link invite an account registered with; see the invite service. */
  redeemPendingInvite?: (account: OrganizationAccount, inviteId: string) => Promise<unknown>;
  /** Records lifecycle and membership changes on each organization's audit chain. */
  recordAuditEntry?: RecordAuditEntry;
}

const MIN_NAME_LENGTH = 2;
const CONTROL_CHARACTERS = /\p{Cc}/gu;
const MEMBER_PAGE_DEFAULT = 50;
const MEMBER_PAGE_MAX = 100;
const ADMIN_LOCK_TTL_MS = 10_000;
const ADMIN_LOCK_ATTEMPTS = 20;
const ADMIN_LOCK_RETRY_MS = 50;

/** A trimmed, single-spaced organization name, or `undefined` when it is not acceptable. */
export function parseOrganizationName(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const name = value.replace(CONTROL_CHARACTERS, '').replace(/\s+/g, ' ').trim();
  return name.length >= MIN_NAME_LENGTH && name.length <= ORGANIZATION_NAME_MAX_LENGTH
    ? name
    : undefined;
}

function fail<T>(code: TOrganizationErrorCode, status: number): OrganizationResult<T> {
  return { ok: false, error: { code, status } };
}

function isActive(membership: { status?: string }): boolean {
  return membership.status !== OrganizationMemberStatus.DEACTIVATED;
}

function membershipAccount(account: OrganizationAccount) {
  return {
    _id: account._id.toString(),
    email: account.email ?? '',
    name: account.name,
    username: account.username,
    avatar: account.avatar,
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface OrganizationService {
  createOrganizationWithAdmin: (
    account: OrganizationAccount,
    name: string,
  ) => Promise<{ organization: OrganizationRecord; member: IUser }>;
  materializePendingAccess: (account: OrganizationAccount) => Promise<void>;
  listAccountOrganizations: (
    accountId: string,
    currentTenantId?: string,
  ) => Promise<TOrganizationMembership[]>;
  createOrganizationForAccount: (
    account: OrganizationAccount,
    rawName: unknown,
  ) => Promise<OrganizationResult<{ organization: OrganizationRecord; member: IUser }>>;
  listMembers: (params: { limit?: number; after?: string; search?: string }) => Promise<IUser[]>;
  changeMemberRole: (
    actor: OrganizationActor,
    memberId: string,
    rawRole: unknown,
  ) => Promise<OrganizationResult<IUser>>;
  deactivateMember: (
    actor: OrganizationActor,
    memberId: string,
  ) => Promise<OrganizationResult<IUser>>;
  leaveOrganization: (actor: OrganizationActor) => Promise<OrganizationResult<IUser>>;
  renameCurrentOrganization: (
    actor: OrganizationActor,
    rawName: unknown,
  ) => Promise<OrganizationResult<OrganizationRecord>>;
  getOrganization: (tenantId: string) => Promise<OrganizationRecord | null>;
  enterAsOperator: (
    account: OrganizationAccount,
    tenantId: string,
  ) => Promise<OrganizationResult<{ tenantId: string }>>;
}

export function createOrganizationService(deps: OrganizationServiceDeps): OrganizationService {
  const { db } = deps;
  const audit = createOrganizationAuditor(deps.recordAuditEntry);

  function memberTarget(member: IUser) {
    return { type: 'user', id: member._id.toString(), name: member.name || member.username };
  }

  /**
   * Creates an organization with `account` as its first ADMIN: the organization record, its
   * own copies of the ADMIN and USER roles, the ADMIN role's capabilities inside it, and the
   * member. A failure undoes what was created (no transaction: the deployment may run on an
   * engine without them) and rethrows.
   */
  async function createOrganizationWithAdmin(
    account: OrganizationAccount,
    name: string,
  ): Promise<{ organization: OrganizationRecord; member: IUser }> {
    const tenantId = generateOrganizationTenantId();
    const organization = await db.createOrganization({
      tenantId,
      name,
      createdBy: account._id.toString(),
    });
    try {
      await runInTenant(tenantId, async () => {
        await db.getRoleByName(SystemRoles.ADMIN);
        await db.getRoleByName(SystemRoles.USER);
      });
      await deps.provisionRolePermissions?.(tenantId);
      await db.syncOrganizationAdminGrants(tenantId, deps.getConfig().adminCapabilities);
      const { member } = await db.createMembership({
        tenantId,
        account: membershipAccount(account),
        role: SystemRoles.ADMIN,
      });
      await audit({
        tenantId,
        action: 'organization.created',
        actor: { id: member._id.toString(), name: account.name },
        target: { type: 'organization', id: tenantId, name },
      });
      return { organization, member };
    } catch (error) {
      await Promise.allSettled([
        db.syncOrganizationAdminGrants(tenantId, []),
        db.deleteOrganization(tenantId),
      ]);
      throw error;
    }
  }

  /**
   * Creates what an account asked for at registration, once: its organization, then the
   * membership its link invite grants. A failed organization is put back for the next sign-in.
   */
  async function materializePendingAccess(account: OrganizationAccount): Promise<void> {
    const accountId = account._id.toString();
    const pending = await db.claimPendingOrganization(accountId);
    if (pending) {
      try {
        await createOrganizationWithAdmin(account, pending.name);
      } catch (error) {
        await db.restorePendingOrganization(accountId, pending);
        throw error;
      }
    }
    const inviteId = await db.claimPendingInvite(accountId);
    if (inviteId && deps.redeemPendingInvite) {
      try {
        await deps.redeemPendingInvite(account, inviteId.toString());
      } catch (error) {
        /* A link that expired or ran out while the email was unverified is simply spent. */
        logger.warn('[organizations] Could not redeem the invite used at registration', {
          accountId,
          error: (error as Error)?.message,
        });
      }
    }
  }

  /** The account's active memberships, by organization name, flagging the current one. */
  async function listAccountOrganizations(
    accountId: string,
    currentTenantId?: string,
  ): Promise<TOrganizationMembership[]> {
    /* The operator's visits are not the account's organizations: only the one it is in now. */
    const memberships = (await db.listMembershipsForIdentity(accountId)).filter(
      (membership) =>
        isActive(membership) &&
        (membership.operatorAccess !== true || membership.tenantId === currentTenantId),
    );
    const organizations = await db.findOrganizationsByTenantIds(
      memberships.map((membership) => membership.tenantId),
    );
    const byTenant = new Map(organizations.map((org) => [org.tenantId, org]));
    return memberships
      .flatMap((membership): TOrganizationMembership[] => {
        const organization = byTenant.get(membership.tenantId);
        return organization
          ? [
              {
                organization: toOrganization(organization),
                role: membership.role ?? '',
                status: membership.status ?? OrganizationMemberStatus.ACTIVE,
                current: membership.tenantId === currentTenantId,
                ...(membership.operatorAccess === true ? { visiting: true } : {}),
              },
            ]
          : [];
      })
      .sort((a, b) => a.organization.name.localeCompare(b.organization.name));
  }

  /** An account creating a further organization (or its first, from onboarding). */
  async function createOrganizationForAccount(
    account: OrganizationAccount,
    rawName: unknown,
  ): Promise<OrganizationResult<{ organization: OrganizationRecord; member: IUser }>> {
    const config = deps.getConfig();
    if (!config.enabled) {
      return fail(OrganizationErrorCode.ORGANIZATIONS_DISABLED, 404);
    }
    if (account.emailVerified === false) {
      return fail(OrganizationErrorCode.EMAIL_NOT_VERIFIED, 403);
    }
    const name = parseOrganizationName(rawName);
    if (!name) {
      return fail(OrganizationErrorCode.ORG_NAME_INVALID, 400);
    }
    const active = (await db.listMembershipsForIdentity(account._id.toString())).filter(
      (membership) => isActive(membership) && membership.operatorAccess !== true,
    );
    if (active.length > 0 && !config.allowCreate) {
      return fail(OrganizationErrorCode.ORG_CREATE_DISABLED, 403);
    }
    if (active.length >= config.maxPerAccount) {
      return fail(OrganizationErrorCode.ORG_LIMIT_REACHED, 403);
    }
    return { ok: true, value: await createOrganizationWithAdmin(account, name) };
  }

  /**
   * Runs a change that could leave an organization without an admin, serialized per
   * organization so two admins demoting each other cannot both succeed.
   */
  async function withAdminGuard<T>(tenantId: string, change: () => Promise<T>): Promise<T> {
    const key = `organization-admins:${tenantId}`;
    const ownerId = randomUUID();
    for (let attempt = 0; attempt < ADMIN_LOCK_ATTEMPTS; attempt++) {
      if (await db.acquireResourceLock({ key, ownerId, ttlMs: ADMIN_LOCK_TTL_MS })) {
        try {
          return await change();
        } finally {
          await db.releaseResourceLock({ key, ownerId }).catch((error: unknown) => {
            logger.warn('[organizations] Could not release the admin lock', error);
          });
        }
      }
      await wait(ADMIN_LOCK_RETRY_MS);
    }
    throw new Error('[organizations] Timed out waiting for the organization admin lock');
  }

  /** Whether removing `memberId` from the admins would leave the organization with none. */
  async function isLastAdmin(memberId: string): Promise<boolean> {
    return (await db.countActiveOrganizationAdmins(memberId)) === 0;
  }

  async function listMembers(params: { limit?: number; after?: string; search?: string }) {
    const limit = Math.min(MEMBER_PAGE_MAX, Math.max(1, params.limit ?? MEMBER_PAGE_DEFAULT));
    return db.listOrganizationMembers({
      limit,
      after: params.after,
      search: params.search?.slice(0, 256),
    });
  }

  async function changeMemberRole(
    actor: OrganizationActor,
    memberId: string,
    rawRole: unknown,
  ): Promise<OrganizationResult<IUser>> {
    const role = typeof rawRole === 'string' ? rawRole.trim() : '';
    if (!role) {
      return fail(OrganizationErrorCode.ROLE_NOT_FOUND, 400);
    }
    const target = await db.findOrganizationMember(memberId);
    if (!target) {
      return fail(OrganizationErrorCode.MEMBER_NOT_FOUND, 404);
    }
    if (target.role === role) {
      return { ok: true, value: target };
    }
    /* Only an admin can make another admin: the role carries the organization's capabilities. */
    if (role === SystemRoles.ADMIN && actor.role !== SystemRoles.ADMIN) {
      return fail(OrganizationErrorCode.ROLE_NOT_ASSIGNABLE, 403);
    }
    if (!(await db.getRoleByName(role, '_id name'))) {
      return fail(OrganizationErrorCode.ROLE_NOT_FOUND, 400);
    }

    const update = async (): Promise<OrganizationResult<IUser>> => {
      const updated = await db.updateOrganizationMember(memberId, { role });
      if (!updated) {
        return fail(OrganizationErrorCode.MEMBER_NOT_FOUND, 404);
      }
      await audit({
        tenantId: actor.tenantId,
        action: 'organization.member_role_changed',
        actor,
        target: memberTarget(updated),
        metadata: { from: target.role ?? null, to: role },
      });
      return { ok: true, value: updated };
    };
    if (target.role !== SystemRoles.ADMIN) {
      return update();
    }
    return withAdminGuard(actor.tenantId, async () =>
      (await isLastAdmin(memberId)) ? fail(OrganizationErrorCode.LAST_ADMIN, 409) : update(),
    );
  }

  /**
   * Removes a member's access: the record and its data stay, it can no longer sign in to or
   * act within the organization, and its sessions here end now. An invite reactivates it.
   */
  async function deactivateMember(
    actor: OrganizationActor,
    memberId: string,
  ): Promise<OrganizationResult<IUser>> {
    const target = await db.findOrganizationMember(memberId);
    if (!target) {
      return fail(OrganizationErrorCode.MEMBER_NOT_FOUND, 404);
    }
    if (target.status === OrganizationMemberStatus.DEACTIVATED) {
      return { ok: true, value: target };
    }

    const deactivate = async (): Promise<OrganizationResult<IUser>> => {
      const updated = await db.updateOrganizationMember(memberId, {
        status: OrganizationMemberStatus.DEACTIVATED,
      });
      if (!updated) {
        return fail(OrganizationErrorCode.MEMBER_NOT_FOUND, 404);
      }
      await db.deleteAllUserSessions({ userId: memberId });
      await audit({
        tenantId: actor.tenantId,
        action:
          memberId === actor.id ? 'organization.member_left' : 'organization.member_deactivated',
        actor,
        target: memberTarget(updated),
      });
      return { ok: true, value: updated };
    };
    if (target.role !== SystemRoles.ADMIN) {
      return deactivate();
    }
    return withAdminGuard(actor.tenantId, async () =>
      (await isLastAdmin(memberId)) ? fail(OrganizationErrorCode.LAST_ADMIN, 409) : deactivate(),
    );
  }

  /** The signed-in member leaving its current organization. */
  function leaveOrganization(actor: OrganizationActor): Promise<OrganizationResult<IUser>> {
    return deactivateMember(actor, actor.id);
  }

  async function renameCurrentOrganization(
    actor: OrganizationActor,
    rawName: unknown,
  ): Promise<OrganizationResult<OrganizationRecord>> {
    const name = parseOrganizationName(rawName);
    if (!name) {
      return fail(OrganizationErrorCode.ORG_NAME_INVALID, 400);
    }
    const renamed = await db.renameOrganization(actor.tenantId, name);
    if (!renamed) {
      return fail(OrganizationErrorCode.NOT_A_MEMBER, 404);
    }
    await audit({
      tenantId: actor.tenantId,
      action: 'organization.renamed',
      actor,
      target: { type: 'organization', id: actor.tenantId, name },
    });
    return { ok: true, value: renamed };
  }

  /**
   * The platform operator entering an organization: as itself where it is a member, otherwise
   * through hidden ADMIN access the organization never sees. The visit is recorded on the
   * platform chain only.
   */
  async function enterAsOperator(
    account: OrganizationAccount,
    tenantId: string,
  ): Promise<OrganizationResult<{ tenantId: string }>> {
    if (account.isPlatformOperator !== true) {
      return fail(OrganizationErrorCode.NOT_A_MEMBER, 403);
    }
    const organization = await db.findOrganization(tenantId);
    if (!organization || organization.status === OrganizationStatus.DELETING) {
      return fail(OrganizationErrorCode.NOT_A_MEMBER, 404);
    }
    const accountId = account._id.toString();
    const existing = await db.findMembership(accountId, tenantId);
    if (existing && isActive(existing) && existing.operatorAccess !== true) {
      return { ok: true, value: { tenantId } };
    }
    await db.ensureOperatorMembership({ tenantId, account: membershipAccount(account) });
    await audit({
      tenantId: undefined,
      action: 'organization.operator_entered',
      actor: { id: accountId, name: account.name || account.email },
      target: { type: 'organization', id: tenantId, name: organization.name },
      metadata: { organization: tenantId },
    });
    return { ok: true, value: { tenantId } };
  }

  return {
    enterAsOperator,
    createOrganizationWithAdmin,
    materializePendingAccess,
    listAccountOrganizations,
    createOrganizationForAccount,
    listMembers,
    changeMemberRole,
    deactivateMember,
    leaveOrganization,
    renameCurrentOrganization,
    getOrganization: db.findOrganization,
  };
}
