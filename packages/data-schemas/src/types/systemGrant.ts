import type { Document, Types } from 'mongoose';
import type { SystemCapability } from 'librechat-data-provider';

export type SystemGrant = {
  /** The type of principal ('user' | 'group' | 'role') */
  principalType: string;
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
};

export type ISystemGrant = SystemGrant &
  Document & {
    _id: Types.ObjectId;
  };
