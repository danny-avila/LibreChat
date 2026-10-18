import {
  hashToken,
  runInTenant,
  getRandomValues,
  OrganizationStatus,
} from '@librechat/data-schemas';
import {
  SystemRoles,
  OrganizationErrorCode,
  OrganizationInviteKind,
  OrganizationInviteStatus,
  OrganizationMemberStatus,
} from 'librechat-data-provider';
import type {
  TOrganizationsConfig,
  TOrganizationErrorCode,
  TOrganizationInvite,
  TOrganizationInviteKind,
  TOrganizationInvitePreview,
  TPendingOrganizationInvite,
  TCreateOrganizationInviteRequest,
  TCreateOrganizationInviteResponse,
} from 'librechat-data-provider';
import type { IUser, AllMethods, OrganizationInviteRecord } from '@librechat/data-schemas';
import type { TOrganizationStatus } from '@librechat/data-schemas';
import type { OrganizationAccount, OrganizationActor } from './service';
import type { RecordAuditEntry } from '~/admin/audit';
import type { OrganizationResult } from './types';
import { createOrganizationAuditor } from './audit';
import { toOrganizationInvite } from './dto';

export type InviteServiceDb = Pick<
  AllMethods,
  | 'createOrganizationInvite'
  | 'findOrganizationInviteByTokenHash'
  | 'findOrganizationInvite'
  | 'listOrganizationInvites'
  | 'revokeOrganizationInvite'
  | 'rotateOrganizationInviteToken'
  | 'redeemOrganizationInvite'
  | 'releaseOrganizationInviteUse'
  | 'listPendingInvitesForEmail'
  | 'findOrganization'
  | 'findOrganizationsByTenantIds'
  | 'findOrganizationMember'
  | 'findMembership'
  | 'createMembership'
  | 'getRoleByName'
>;

export interface InviteServiceDeps {
  db: InviteServiceDb;
  getConfig: () => TOrganizationsConfig;
  /** Sends a templated email; the caller supplies its transport. */
  sendEmail: (data: {
    email: string;
    subject: string;
    payload: Record<string, string>;
    template: string;
  }) => Promise<unknown>;
  isEmailConfigured: () => boolean;
  /** The client origin invite links point at. */
  clientDomain: string;
  appName: string;
  /** Records invites sent and revoked, and members who join, on the organization's chain. */
  recordAuditEntry?: RecordAuditEntry;
  /** An organization's status (cached): nobody joins one that is suspended or being deleted. */
  getOrganizationStatus?: (tenantId: string) => Promise<TOrganizationStatus | null>;
}

const INVITE_TOKEN_BYTES = 32;
const HOUR_MS = 60 * 60 * 1000;
const MAX_LINK_USES = 10_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail<T>(code: TOrganizationErrorCode, status: number): OrganizationResult<T> {
  return { ok: false, error: { code, status } };
}

function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : undefined;
}

function describeExpiry(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 day' : `${days} days`;
  }
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/** Why an invite cannot be redeemed now, or `undefined` when it can. */
function inviteUnusableReason(
  invite: OrganizationInviteRecord | null,
): { code: TOrganizationErrorCode; status: number } | undefined {
  if (!invite || invite.status === OrganizationInviteStatus.REVOKED) {
    return { code: OrganizationErrorCode.INVITE_NOT_FOUND, status: 404 };
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return { code: OrganizationErrorCode.INVITE_EXPIRED, status: 410 };
  }
  if (invite.remainingUses <= 0 || invite.status === OrganizationInviteStatus.ACCEPTED) {
    return { code: OrganizationErrorCode.INVITE_EXHAUSTED, status: 410 };
  }
  return undefined;
}

export interface AcceptedInvite {
  tenantId: string;
  member: IUser;
  /** `existing` when the account was already an active member; no use was spent. */
  outcome: 'created' | 'reactivated' | 'existing';
}

type InviteResult = OrganizationResult<TCreateOrganizationInviteResponse>;

export interface InviteService {
  createInvite: (
    actor: OrganizationActor,
    request: Partial<TCreateOrganizationInviteRequest>,
  ) => Promise<InviteResult>;
  listInvites: () => Promise<TOrganizationInvite[]>;
  revokeInvite: (actor: OrganizationActor, inviteId: string) => Promise<OrganizationResult<true>>;
  resendInvite: (actor: OrganizationActor, inviteId: string) => Promise<InviteResult>;
  previewInvite: (rawToken: unknown) => Promise<OrganizationResult<TOrganizationInvitePreview>>;
  acceptInvite: (
    account: OrganizationAccount,
    rawToken: unknown,
  ) => Promise<OrganizationResult<AcceptedInvite>>;
  acceptPendingInvite: (
    account: OrganizationAccount,
    inviteId: string,
  ) => Promise<OrganizationResult<AcceptedInvite>>;
  redeemPendingInvite: (
    account: OrganizationAccount,
    inviteId: string,
  ) => Promise<OrganizationResult<AcceptedInvite>>;
  listPendingInvites: (account: OrganizationAccount) => Promise<TPendingOrganizationInvite[]>;
  checkRegistrationInvite: (
    rawToken: unknown,
    email: string,
  ) => Promise<
    OrganizationResult<{ invite: OrganizationInviteRecord; kind: TOrganizationInviteKind }>
  >;
  /** Spends a use of an already-validated invite and creates the membership. */
  redeemInvite: (
    account: OrganizationAccount,
    invite: OrganizationInviteRecord,
  ) => Promise<OrganizationResult<AcceptedInvite>>;
}

export function createInviteService(deps: InviteServiceDeps): InviteService {
  const { db } = deps;
  const audit = createOrganizationAuditor(deps.recordAuditEntry);

  /** Why an invite's organization takes nobody now, or `undefined` when it is active. */
  async function closedReason(
    tenantId: string,
  ): Promise<{ code: TOrganizationErrorCode; status: number } | undefined> {
    if (!deps.getOrganizationStatus) {
      return undefined;
    }
    const status = await deps.getOrganizationStatus(tenantId);
    if (status === OrganizationStatus.ACTIVE) {
      return undefined;
    }
    return status === OrganizationStatus.SUSPENDED
      ? { code: OrganizationErrorCode.ORGANIZATION_SUSPENDED, status: 403 }
      : { code: OrganizationErrorCode.INVITE_NOT_FOUND, status: 404 };
  }

  async function mintToken(): Promise<{ token: string; tokenHash: string }> {
    const token = await getRandomValues(INVITE_TOKEN_BYTES);
    return { token, tokenHash: await hashToken(token) };
  }

  function inviteUrl(token: string): string {
    return `${deps.clientDomain.replace(/\/+$/, '')}/invite/${encodeURIComponent(token)}`;
  }

  async function findByToken(rawToken: unknown): Promise<OrganizationInviteRecord | null> {
    if (typeof rawToken !== 'string' || !/^[a-f0-9]{16,256}$/i.test(rawToken)) {
      return null;
    }
    return db.findOrganizationInviteByTokenHash(await hashToken(rawToken));
  }

  async function inviterName(invite: OrganizationInviteRecord): Promise<string | undefined> {
    const inviter = await runInTenant(invite.tenantId, () =>
      db.findOrganizationMember(invite.invitedBy.toString()),
    );
    return inviter?.name || inviter?.username || undefined;
  }

  async function sendInviteEmail(
    invite: OrganizationInviteRecord,
    url: string,
    actorName: string | undefined,
  ): Promise<boolean> {
    if (!invite.email || !deps.isEmailConfigured()) {
      return false;
    }
    const organization = await db.findOrganization(invite.tenantId);
    const hours = deps.getConfig().invites.emailExpiryHours;
    await deps.sendEmail({
      email: invite.email,
      subject: `You're invited to join ${organization?.name ?? 'an organization'} on ${deps.appName}`,
      payload: {
        appName: deps.appName,
        organizationName: organization?.name ?? '',
        inviterName: actorName || 'A teammate',
        inviteLink: url,
        expiresIn: describeExpiry(hours),
        year: String(new Date().getFullYear()),
      },
      template: 'organizationInvite.handlebars',
    });
    return true;
  }

  /** An admin inviting someone to the current organization, by email or with a link. */
  async function createInvite(
    actor: OrganizationActor,
    request: Partial<TCreateOrganizationInviteRequest>,
  ): Promise<OrganizationResult<TCreateOrganizationInviteResponse>> {
    const config = deps.getConfig();
    const kind = request.kind;
    if (kind !== OrganizationInviteKind.EMAIL && kind !== OrganizationInviteKind.LINK) {
      return fail(OrganizationErrorCode.INVITE_INVALID, 400);
    }
    if (kind === OrganizationInviteKind.LINK && !config.invites.allowLinkInvites) {
      return fail(OrganizationErrorCode.LINK_INVITES_DISABLED, 403);
    }
    const email = kind === OrganizationInviteKind.EMAIL ? normalizeEmail(request.email) : undefined;
    if (kind === OrganizationInviteKind.EMAIL && !email) {
      return fail(OrganizationErrorCode.INVITE_INVALID, 400);
    }
    const role =
      typeof request.role === 'string' && request.role.trim()
        ? request.role.trim()
        : SystemRoles.USER;
    if (role === SystemRoles.ADMIN && actor.role !== SystemRoles.ADMIN) {
      return fail(OrganizationErrorCode.ROLE_NOT_ASSIGNABLE, 403);
    }
    if (!(await db.getRoleByName(role, '_id name'))) {
      return fail(OrganizationErrorCode.ROLE_NOT_FOUND, 400);
    }

    const hours =
      kind === OrganizationInviteKind.EMAIL
        ? config.invites.emailExpiryHours
        : config.invites.linkExpiryHours;
    const requestedUses =
      typeof request.maxUses === 'number' && Number.isFinite(request.maxUses)
        ? request.maxUses
        : config.invites.defaultMaxLinkUses;
    const maxUses =
      kind === OrganizationInviteKind.EMAIL
        ? 1
        : Math.min(MAX_LINK_USES, Math.max(1, Math.floor(requestedUses)));
    const { token, tokenHash } = await mintToken();
    const invite = await db.createOrganizationInvite({
      tenantId: actor.tenantId,
      kind,
      email,
      tokenHash,
      role,
      invitedBy: actor.id,
      expiresAt: new Date(Date.now() + hours * HOUR_MS),
      maxUses,
    });
    await audit({
      tenantId: actor.tenantId,
      action: 'organization.invite_created',
      actor,
      target: { type: 'invite', id: invite._id.toString(), name: email },
      metadata: { kind, role, maxUses },
    });
    const url = inviteUrl(token);
    const emailSent = await sendInviteEmail(invite, url, actor.name);
    return {
      ok: true,
      value: {
        invite: toOrganizationInvite(invite, { id: actor.id, name: actor.name }),
        url,
        emailSent,
      },
    };
  }

  /** The current organization's live invites, with who sent each. */
  async function listInvites() {
    const invites = await db.listOrganizationInvites();
    const inviterIds = [...new Set(invites.map((invite) => invite.invitedBy.toString()))];
    const inviters = await Promise.all(inviterIds.map((id) => db.findOrganizationMember(id)));
    const names = new Map(
      inviters
        .filter((inviter): inviter is IUser => inviter != null)
        .map((inviter) => [inviter._id.toString(), inviter.name || inviter.username]),
    );
    return invites.map((invite) =>
      toOrganizationInvite(invite, {
        id: invite.invitedBy.toString(),
        name: names.get(invite.invitedBy.toString()),
      }),
    );
  }

  async function revokeInvite(
    actor: OrganizationActor,
    inviteId: string,
  ): Promise<OrganizationResult<true>> {
    const revoked = await db.revokeOrganizationInvite(inviteId);
    if (!revoked) {
      return fail(OrganizationErrorCode.INVITE_NOT_FOUND, 404);
    }
    await audit({
      tenantId: actor.tenantId,
      action: 'organization.invite_revoked',
      actor,
      target: { type: 'invite', id: inviteId },
    });
    return { ok: true, value: true };
  }

  /** Re-sends an invite with a fresh link and expiry; the previous link stops working. */
  async function resendInvite(
    actor: OrganizationActor,
    inviteId: string,
  ): Promise<OrganizationResult<TCreateOrganizationInviteResponse>> {
    const existing = await db.findOrganizationInvite(inviteId, actor.tenantId);
    if (!existing || existing.status !== OrganizationInviteStatus.PENDING) {
      return fail(OrganizationErrorCode.INVITE_NOT_FOUND, 404);
    }
    const config = deps.getConfig();
    const hours =
      existing.kind === OrganizationInviteKind.EMAIL
        ? config.invites.emailExpiryHours
        : config.invites.linkExpiryHours;
    const { token, tokenHash } = await mintToken();
    const rotated = await db.rotateOrganizationInviteToken({
      inviteId,
      tokenHash,
      expiresAt: new Date(Date.now() + hours * HOUR_MS),
      invitedBy: actor.id,
    });
    if (!rotated) {
      return fail(OrganizationErrorCode.INVITE_NOT_FOUND, 404);
    }
    const url = inviteUrl(token);
    const emailSent = await sendInviteEmail(rotated, url, actor.name);
    return {
      ok: true,
      value: {
        invite: toOrganizationInvite(rotated, { id: actor.id, name: actor.name }),
        url,
        emailSent,
      },
    };
  }

  /**
   * What anyone holding an invite link may see before signing in: the organization, who
   * invited them, and (for an email invite) the address it is bound to. Nothing about whether
   * that address already has an account.
   */
  async function previewInvite(
    rawToken: unknown,
  ): Promise<OrganizationResult<TOrganizationInvitePreview>> {
    const invite = await findByToken(rawToken);
    const reason =
      inviteUnusableReason(invite) ?? (invite ? await closedReason(invite.tenantId) : undefined);
    if (reason || !invite) {
      return fail(reason?.code ?? OrganizationErrorCode.INVITE_NOT_FOUND, reason?.status ?? 404);
    }
    const [organization, name] = await Promise.all([
      db.findOrganization(invite.tenantId),
      inviterName(invite),
    ]);
    if (!organization) {
      return fail(OrganizationErrorCode.INVITE_NOT_FOUND, 404);
    }
    return {
      ok: true,
      value: {
        organization: { id: organization.tenantId, name: organization.name },
        kind: invite.kind,
        inviterName: name,
        ...(invite.kind === OrganizationInviteKind.EMAIL ? { email: invite.email } : {}),
      },
    };
  }

  /** Spends one use of a valid invite and gives the account its membership. */
  async function redeem(
    account: OrganizationAccount,
    invite: OrganizationInviteRecord,
  ): Promise<OrganizationResult<AcceptedInvite>> {
    const accountId = account._id.toString();
    const closed = await closedReason(invite.tenantId);
    if (closed) {
      return fail(closed.code, closed.status);
    }
    const existing = await db.findMembership(accountId, invite.tenantId);
    if (existing && existing.status !== OrganizationMemberStatus.DEACTIVATED) {
      return {
        ok: true,
        value: { tenantId: invite.tenantId, member: existing, outcome: 'existing' },
      };
    }

    const redeemed = await db.redeemOrganizationInvite({
      inviteId: invite._id,
      tenantId: invite.tenantId,
      acceptedBy: accountId,
    });
    if (!redeemed) {
      const current = await db.findOrganizationInvite(invite._id, invite.tenantId);
      const reason = inviteUnusableReason(current) ?? {
        code: OrganizationErrorCode.INVITE_EXHAUSTED,
        status: 410,
      };
      return fail(reason.code, reason.status);
    }
    try {
      const { member, outcome } = await db.createMembership({
        tenantId: invite.tenantId,
        account: {
          _id: accountId,
          email: account.email ?? '',
          name: account.name,
          username: account.username,
          avatar: account.avatar,
        },
        role: invite.role,
      });
      if (outcome !== 'existing') {
        const party = { id: member._id.toString(), name: member.name || member.username };
        await audit({
          tenantId: invite.tenantId,
          action: 'organization.member_joined',
          actor: party,
          target: { type: 'user', ...party },
          metadata: {
            inviteId: invite._id.toString(),
            kind: invite.kind,
            role: invite.role,
            rejoined: outcome === 'reactivated',
          },
        });
      }
      return { ok: true, value: { tenantId: invite.tenantId, member, outcome } };
    } catch (error) {
      await db.releaseOrganizationInviteUse({ inviteId: invite._id, tenantId: invite.tenantId });
      throw error;
    }
  }

  /** A signed-in account accepting an invite link. */
  async function acceptInvite(
    account: OrganizationAccount,
    rawToken: unknown,
  ): Promise<OrganizationResult<AcceptedInvite>> {
    const invite = await findByToken(rawToken);
    const reason = inviteUnusableReason(invite);
    if (reason || !invite) {
      return fail(reason?.code ?? OrganizationErrorCode.INVITE_NOT_FOUND, reason?.status ?? 404);
    }
    if (invite.kind === OrganizationInviteKind.EMAIL) {
      if (normalizeEmail(account.email) !== invite.email) {
        return fail(OrganizationErrorCode.INVITE_EMAIL_MISMATCH, 403);
      }
    } else if (account.emailVerified === false) {
      return fail(OrganizationErrorCode.EMAIL_NOT_VERIFIED, 403);
    }
    return redeem(account, invite);
  }

  /** Redeems the link invite an account registered with, now that its email is verified. */
  async function redeemPendingInvite(
    account: OrganizationAccount,
    inviteId: string,
  ): Promise<OrganizationResult<AcceptedInvite>> {
    const invite = await db.findOrganizationInvite(inviteId);
    const reason = inviteUnusableReason(invite);
    if (reason || !invite) {
      return fail(reason?.code ?? OrganizationErrorCode.INVITE_NOT_FOUND, reason?.status ?? 404);
    }
    return redeem(account, invite);
  }

  /** Live email invites addressed to the signed-in account's verified address. */
  async function listPendingInvites(
    account: OrganizationAccount,
  ): Promise<TPendingOrganizationInvite[]> {
    if (account.emailVerified === false || !account.email) {
      return [];
    }
    const invites = await db.listPendingInvitesForEmail(account.email);
    if (invites.length === 0) {
      return [];
    }
    const organizations = await db.findOrganizationsByTenantIds([
      ...new Set(invites.map((invite) => invite.tenantId)),
    ]);
    const byTenant = new Map(organizations.map((org) => [org.tenantId, org]));
    const names = await Promise.all(invites.map(inviterName));
    return invites.flatMap((invite, index): TPendingOrganizationInvite[] => {
      const organization = byTenant.get(invite.tenantId);
      return organization
        ? [
            {
              id: invite._id.toString(),
              organization: { id: organization.tenantId, name: organization.name },
              inviterName: names[index],
              role: invite.role,
              expiresAt: invite.expiresAt.toISOString(),
            },
          ]
        : [];
    });
  }

  /** Accepts one of the account's pending email invites by id (from the switcher). */
  async function acceptPendingInvite(
    account: OrganizationAccount,
    inviteId: string,
  ): Promise<OrganizationResult<AcceptedInvite>> {
    const invite = await db.findOrganizationInvite(inviteId);
    const reason = inviteUnusableReason(invite);
    if (reason || !invite) {
      return fail(reason?.code ?? OrganizationErrorCode.INVITE_NOT_FOUND, reason?.status ?? 404);
    }
    if (
      invite.kind !== OrganizationInviteKind.EMAIL ||
      account.emailVerified === false ||
      normalizeEmail(account.email) !== invite.email
    ) {
      return fail(OrganizationErrorCode.INVITE_NOT_FOUND, 404);
    }
    return redeem(account, invite);
  }

  /**
   * Checks an invite presented at registration. An email invite must name the registering
   * address and proves that mailbox; a link invite is redeemed after verification.
   */
  async function checkRegistrationInvite(
    rawToken: unknown,
    email: string,
  ): Promise<
    OrganizationResult<{ invite: OrganizationInviteRecord; kind: TOrganizationInviteKind }>
  > {
    const invite = await findByToken(rawToken);
    const reason = inviteUnusableReason(invite);
    if (reason || !invite) {
      return fail(reason?.code ?? OrganizationErrorCode.INVITE_NOT_FOUND, reason?.status ?? 404);
    }
    if (invite.kind === OrganizationInviteKind.EMAIL && normalizeEmail(email) !== invite.email) {
      return fail(OrganizationErrorCode.INVITE_EMAIL_MISMATCH, 403);
    }
    return { ok: true, value: { invite, kind: invite.kind } };
  }

  return {
    createInvite,
    listInvites,
    revokeInvite,
    resendInvite,
    previewInvite,
    acceptInvite,
    acceptPendingInvite,
    redeemPendingInvite,
    listPendingInvites,
    checkRegistrationInvite,
    redeemInvite: redeem,
  };
}
