import type { Document, Types } from 'mongoose';
import type { PrincipalType } from 'librechat-data-provider';
import type { SystemCapability } from '~/systemCapabilities';

export type SystemGrant = {
  /** The type of principal — matches PrincipalType enum values */
  principalType: PrincipalType;
  /** ObjectId string for user/group, role name string for role */
  principalId: string | Types.ObjectId;
  /** The capability being granted */
  capability: SystemCapability;
  /** Absent = platform-operator, present = tenant-scoped */
  tenantId?: string;
  /** ID of the user who granted this capability */
  grantedBy?: Types.ObjectId;
  /** When this capability was granted */
  grantedAt?: Date;
  /** Reserved for future TTL enforcement — time-bounded / temporary grants. */
  expiresAt?: Date;
};

export type ISystemGrant = SystemGrant &
  Document & {
    _id: Types.ObjectId;
  };
