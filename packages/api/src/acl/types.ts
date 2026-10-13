import type { PrincipalType } from 'librechat-data-provider';
import type { IAclEntry } from '@librechat/data-schemas';
import type { Types } from 'mongoose';

export type InsightsPermissionPrincipal = {
  type: PrincipalType;
  id?: string | Types.ObjectId | null;
  name?: string;
};

export type InsightsWrittenEntry = {
  permBits: number;
  roleId: Types.ObjectId;
  grantedBy: string | Types.ObjectId;
  grantedAt: Date;
};

export type InsightsPermissionChange = {
  action: 'assigned' | 'removed';
  previousEntry: IAclEntry | null;
  writtenEntry: InsightsWrittenEntry | null;
  principal: InsightsPermissionPrincipal;
};
