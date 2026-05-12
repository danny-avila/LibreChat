import type { Document, Types } from 'mongoose';
import type { PrincipalType } from 'librechat-data-provider';

export type AuditAction = 'grant_assigned' | 'grant_removed';

export type AuditLog = {
  action: AuditAction;
  actorId: Types.ObjectId;
  actorName: string;
  targetPrincipalType: PrincipalType;
  /** ObjectId for USER/GROUP, role name string for ROLE */
  targetPrincipalId: string | Types.ObjectId;
  targetName: string;
  capability: string;
  /** Absent = platform-operator audit; present = tenant-scoped audit */
  tenantId?: string;
  /** Mongoose auto-managed via { timestamps: true } */
  createdAt?: Date;
  updatedAt?: Date;
};

export type IAuditLog = AuditLog &
  Document & {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
  };
