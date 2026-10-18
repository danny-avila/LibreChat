import { OrganizationInviteKind, OrganizationInviteStatus } from 'librechat-data-provider';
import type { Model, Types } from 'mongoose';
import type {
  IOrganizationInvite,
  OrganizationInviteRecord,
  CreateOrganizationInviteParams,
} from '~/types';
import { runAsSystem, runInTenant } from '~/config/tenantContext';

/** Most pending invites one organization lists at once. */
const MAX_LISTED_INVITES = 200;

function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

type InviteRef = { inviteId: Types.ObjectId | string; tenantId: string };

export interface OrganizationInviteMethods {
  createOrganizationInvite: (
    params: CreateOrganizationInviteParams,
  ) => Promise<OrganizationInviteRecord>;
  findOrganizationInviteByTokenHash: (
    tokenHash: string,
  ) => Promise<OrganizationInviteRecord | null>;
  findOrganizationInvite: (
    inviteId: Types.ObjectId | string,
    tenantId?: string,
  ) => Promise<OrganizationInviteRecord | null>;
  listOrganizationInvites: () => Promise<OrganizationInviteRecord[]>;
  revokeOrganizationInvite: (inviteId: string) => Promise<OrganizationInviteRecord | null>;
  rotateOrganizationInviteToken: (params: {
    inviteId: string;
    tokenHash: string;
    expiresAt: Date;
    invitedBy: Types.ObjectId | string;
  }) => Promise<OrganizationInviteRecord | null>;
  redeemOrganizationInvite: (
    params: InviteRef & { acceptedBy: Types.ObjectId | string },
  ) => Promise<OrganizationInviteRecord | null>;
  releaseOrganizationInviteUse: (params: InviteRef) => Promise<void>;
  listPendingInvitesForEmail: (email: string) => Promise<OrganizationInviteRecord[]>;
}

export function createOrganizationInviteMethods(
  mongoose: typeof import('mongoose'),
): OrganizationInviteMethods {
  const Invite = (): Model<IOrganizationInvite> => mongoose.models.OrganizationInvite;

  /**
   * Creates an invite inside its organization's tenant. An email invite replaces the pending
   * one already addressed to the same email (rotating its token, role and expiry), so an
   * address never holds two live invites to one organization.
   */
  async function createOrganizationInvite(
    params: CreateOrganizationInviteParams,
  ): Promise<OrganizationInviteRecord> {
    return runInTenant(params.tenantId, async () => {
      if (params.kind !== OrganizationInviteKind.EMAIL) {
        const invite = await Invite().create({
          tenantId: params.tenantId,
          kind: params.kind,
          tokenHash: params.tokenHash,
          role: params.role,
          invitedBy: params.invitedBy,
          expiresAt: params.expiresAt,
          maxUses: params.maxUses,
          remainingUses: params.maxUses,
          useCount: 0,
        });
        return invite.toObject() as OrganizationInviteRecord;
      }

      const upsertEmailInvite = () =>
        Invite()
          .findOneAndUpdate(
            {
              kind: OrganizationInviteKind.EMAIL,
              email: params.email,
              status: OrganizationInviteStatus.PENDING,
            },
            {
              $set: {
                tokenHash: params.tokenHash,
                role: params.role,
                invitedBy: params.invitedBy,
                expiresAt: params.expiresAt,
                maxUses: 1,
                remainingUses: 1,
              },
              /* `kind`, `email`, `status` and `tenantId` come from the filter's equalities. */
              $setOnInsert: { useCount: 0 },
            },
            { upsert: true, new: true, runValidators: true },
          )
          .lean<OrganizationInviteRecord>();

      try {
        return (await upsertEmailInvite()) as OrganizationInviteRecord;
      } catch (error) {
        /* A concurrent invite to the same address inserted first; update that one instead. */
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        return (await upsertEmailInvite()) as OrganizationInviteRecord;
      }
    });
  }

  /** Looks an invite up by token hash across organizations; `null` when no invite has it. */
  async function findOrganizationInviteByTokenHash(
    tokenHash: string,
  ): Promise<OrganizationInviteRecord | null> {
    return runAsSystem(async () =>
      Invite().findOne({ tokenHash }).lean<OrganizationInviteRecord>(),
    );
  }

  /**
   * An invite by id; `null` when there is none. With `tenantId` the read is confined to that
   * organization; without it, it is by exact id across organizations (the link invite an
   * account registered with records no organization).
   */
  async function findOrganizationInvite(
    inviteId: Types.ObjectId | string,
    tenantId?: string,
  ): Promise<OrganizationInviteRecord | null> {
    if (!mongoose.isValidObjectId(inviteId)) {
      return null;
    }
    const read = async () => Invite().findOne({ _id: inviteId }).lean<OrganizationInviteRecord>();
    return tenantId ? runInTenant(tenantId, read) : runAsSystem(read);
  }

  /** The current organization's live invites, newest first. */
  async function listOrganizationInvites(): Promise<OrganizationInviteRecord[]> {
    return Invite()
      .find({ status: OrganizationInviteStatus.PENDING, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(MAX_LISTED_INVITES)
      .lean<OrganizationInviteRecord[]>();
  }

  /** Revokes a pending invite of the current organization; `null` when none matched. */
  async function revokeOrganizationInvite(
    inviteId: string,
  ): Promise<OrganizationInviteRecord | null> {
    if (!mongoose.isValidObjectId(inviteId)) {
      return null;
    }
    return Invite()
      .findOneAndUpdate(
        { _id: inviteId, status: OrganizationInviteStatus.PENDING },
        { $set: { status: OrganizationInviteStatus.REVOKED, revokedAt: new Date() } },
        { new: true },
      )
      .lean<OrganizationInviteRecord>();
  }

  /**
   * Gives a pending invite of the current organization a new token and expiry, which also
   * voids the previous link. `null` when no pending invite matched.
   */
  async function rotateOrganizationInviteToken(params: {
    inviteId: string;
    tokenHash: string;
    expiresAt: Date;
    invitedBy: Types.ObjectId | string;
  }): Promise<OrganizationInviteRecord | null> {
    if (!mongoose.isValidObjectId(params.inviteId)) {
      return null;
    }
    return Invite()
      .findOneAndUpdate(
        { _id: params.inviteId, status: OrganizationInviteStatus.PENDING },
        {
          $set: {
            tokenHash: params.tokenHash,
            expiresAt: params.expiresAt,
            invitedBy: params.invitedBy,
          },
        },
        { new: true },
      )
      .lean<OrganizationInviteRecord>();
  }

  /**
   * Spends one use of an invite: one conditional `$inc` decides, so concurrent redemptions
   * can never exceed the limit. Returns the updated invite, or `null` when it is revoked,
   * expired or used up. An invite whose last use this was is marked accepted.
   */
  async function redeemOrganizationInvite(params: {
    inviteId: Types.ObjectId | string;
    tenantId: string;
    acceptedBy: Types.ObjectId | string;
  }): Promise<OrganizationInviteRecord | null> {
    return runInTenant(params.tenantId, async () => {
      const now = new Date();
      const redeemed = await Invite()
        .findOneAndUpdate(
          {
            _id: params.inviteId,
            status: OrganizationInviteStatus.PENDING,
            expiresAt: { $gt: now },
            remainingUses: { $gt: 0 },
          },
          {
            $inc: { remainingUses: -1, useCount: 1 },
            $set: { acceptedAt: now, acceptedBy: params.acceptedBy },
          },
          { new: true },
        )
        .lean<OrganizationInviteRecord>();
      if (!redeemed || redeemed.remainingUses > 0) {
        return redeemed;
      }
      await Invite().updateOne(
        { _id: redeemed._id, remainingUses: 0, status: OrganizationInviteStatus.PENDING },
        { $set: { status: OrganizationInviteStatus.ACCEPTED } },
      );
      return { ...redeemed, status: OrganizationInviteStatus.ACCEPTED };
    });
  }

  /** Returns a use spent by a redemption whose membership could not be created. */
  async function releaseOrganizationInviteUse(params: {
    inviteId: Types.ObjectId | string;
    tenantId: string;
  }): Promise<void> {
    await runInTenant(params.tenantId, async () => {
      await Invite().updateOne(
        {
          _id: params.inviteId,
          status: { $in: [OrganizationInviteStatus.PENDING, OrganizationInviteStatus.ACCEPTED] },
        },
        {
          $inc: { remainingUses: 1, useCount: -1 },
          $set: { status: OrganizationInviteStatus.PENDING },
        },
      );
    });
  }

  /** Live email invites addressed to an email, across organizations. */
  async function listPendingInvitesForEmail(email: string): Promise<OrganizationInviteRecord[]> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    return runAsSystem(async () =>
      Invite()
        .find({
          email: normalized,
          kind: OrganizationInviteKind.EMAIL,
          status: OrganizationInviteStatus.PENDING,
          expiresAt: { $gt: new Date() },
        })
        .sort({ createdAt: -1 })
        .limit(MAX_LISTED_INVITES)
        .lean<OrganizationInviteRecord[]>(),
    );
  }

  return {
    createOrganizationInvite,
    findOrganizationInviteByTokenHash,
    findOrganizationInvite,
    listOrganizationInvites,
    revokeOrganizationInvite,
    rotateOrganizationInviteToken,
    redeemOrganizationInvite,
    releaseOrganizationInviteUse,
    listPendingInvitesForEmail,
  };
}
