import type { Document, Types } from 'mongoose';
import type { PrincipalType } from 'librechat-data-provider';
import type { AdminAuditLogEntry, AuditAction } from './admin';

/**
 * AuditLog is an append-only collection — no `updatedAt`, no mutations.
 * See `~/schema/auditLog` for the enforcement (immutable fields plus
 * pre-update / pre-delete / pre-save hooks).
 */
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
  /** Mongoose auto-managed via `timestamps: { createdAt: true, updatedAt: false }` */
  createdAt?: Date;
};

export type IAuditLog = AuditLog &
  Document & {
    _id: Types.ObjectId;
    createdAt: Date;
  };

export interface RecordAuditEntryInput {
  action: AuditAction;
  actorId: string | Types.ObjectId;
  actorName: string;
  targetPrincipalType: PrincipalType;
  targetPrincipalId: string | Types.ObjectId;
  targetName: string;
  capability: string;
  tenantId?: string;
}

export interface AuditLogFilters {
  search?: string;
  action?: AuditAction[];
  from?: Date;
  to?: Date;
  /** Case-insensitive substring match against the denormalized `actorName`. */
  actorQuery?: string;
  targetPrincipalType?: PrincipalType;
  /** Case-insensitive substring match against the denormalized `targetName`. */
  targetQuery?: string;
  capability?: string;
  offset?: number;
  limit?: number;
}

export interface AuditLogPage {
  entries: AdminAuditLogEntry[];
  total: number;
}
