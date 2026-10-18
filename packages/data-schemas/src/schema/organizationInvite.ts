import { Schema } from 'mongoose';
import {
  SystemRoles,
  OrganizationInviteKind,
  OrganizationInviteStatus,
} from 'librechat-data-provider';
import type { IOrganizationInvite } from '~/types';

const organizationInviteSchema: Schema<IOrganizationInvite> = new Schema<IOrganizationInvite>(
  {
    tenantId: {
      type: String,
      required: true,
    },
    kind: {
      type: String,
      enum: Object.values(OrganizationInviteKind),
      required: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      default: SystemRoles.USER,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(OrganizationInviteStatus),
      default: OrganizationInviteStatus.PENDING,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    maxUses: {
      type: Number,
      required: true,
      min: 1,
    },
    /** A counter rather than a `useCount < maxUses` comparison, so redemption is one atomic
     *  conditional `$inc` that every supported engine runs without `$expr`. */
    remainingUses: {
      type: Number,
      required: true,
      min: 0,
    },
    useCount: {
      type: Number,
      default: 0,
    },
    acceptedAt: {
      type: Date,
    },
    acceptedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    revokedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

/* Expired invites remove themselves; their history lives in the audit log. */
organizationInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/* Redemption looks an invite up by its token alone, before the organization is known. */
organizationInviteSchema.index({ tokenHash: 1 }, { unique: true });
/* At most one pending invite per address per organization: inviting again rotates it. */
organizationInviteSchema.index(
  { tenantId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      kind: OrganizationInviteKind.EMAIL,
      status: OrganizationInviteStatus.PENDING,
    },
  },
);
organizationInviteSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
/* The pending invites addressed to a signed-in account, across organizations. */
organizationInviteSchema.index({ email: 1, status: 1 });

export default organizationInviteSchema;
