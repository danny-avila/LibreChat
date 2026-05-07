import { Schema, Document, Types } from 'mongoose';

export type AdminAuditTargetType =
  | 'user'
  | 'subscription'
  | 'balance'
  | 'transaction'
  | 'message'
  | 'conversation'
  | 'audit'
  | 'system';

export type AdminAuditStatus = 'success' | 'failure';

export interface IMongoAdminAuditLog extends Document {
  actorId: Types.ObjectId;
  actorEmail: string;
  actorIp?: string | null;
  userAgent?: string | null;
  action: string;
  targetType: AdminAuditTargetType;
  targetId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  reason?: string | null;
  status: AdminAuditStatus;
  errorMessage?: string | null;
  createdAt?: Date;
}

/**
 * Parses an admin audit log retention env value into a non-negative integer day count.
 * Returns the supplied default when the value is undefined, empty, or unparseable.
 *
 * - Negative values fall back to the default.
 * - `0` is considered valid and means "no TTL" (retain forever).
 */
export function parseRetention(value: string | undefined | null, defaultDays: number): number {
  if (value === undefined || value === null || value === '') {
    return defaultDays;
  }
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultDays;
  }
  return parsed;
}

const MAX_FIELD_BYTES = 16 * 1024;

const targetTypes: AdminAuditTargetType[] = [
  'user',
  'subscription',
  'balance',
  'transaction',
  'message',
  'conversation',
  'audit',
  'system',
];

const adminAuditLogSchema: Schema<IMongoAdminAuditLog> = new Schema<IMongoAdminAuditLog>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorEmail: {
      type: String,
      required: true,
    },
    actorIp: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      required: true,
      enum: targetTypes,
      index: true,
    },
    targetId: {
      type: String,
      default: null,
      index: true,
    },
    before: {
      type: Schema.Types.Mixed,
      default: null,
    },
    after: {
      type: Schema.Types.Mixed,
      default: null,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['success', 'failure'],
      required: true,
      default: 'success',
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

adminAuditLogSchema.index({ actorId: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
adminAuditLogSchema.index({ action: 1, createdAt: -1 });

const retentionDays = parseRetention(process.env.ADMIN_AUDIT_LOG_RETENTION_DAYS, 365);
if (retentionDays > 0) {
  adminAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionDays * 86400 });
}

function byteLength(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

// Cap on free-text fields. Long error messages and reasons are truncated to
// keep the audit log indexable and prevent storage abuse. Truncation is
// preferred over rejection here so a noisy upstream error never blocks the
// row from being written.
const MAX_TEXT_FIELD_CHARS = 2048;

function truncateString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return value as null | undefined;
  }
  if (typeof value !== 'string') {
    return value as unknown as string;
  }
  if (value.length <= MAX_TEXT_FIELD_CHARS) {
    return value;
  }
  return value.slice(0, MAX_TEXT_FIELD_CHARS - 1) + '…';
}

adminAuditLogSchema.pre('validate', function (next) {
  const fields: Array<'before' | 'after' | 'meta'> = ['before', 'after', 'meta'];
  for (const field of fields) {
    const value = this.get(field);
    if (value === undefined || value === null) {
      continue;
    }
    if (byteLength(value) > MAX_FIELD_BYTES) {
      return next(
        new Error(
          `AdminAuditLog field "${field}" exceeds maximum size of ${MAX_FIELD_BYTES} bytes`,
        ),
      );
    }
  }

  const reason = this.get('reason');
  if (typeof reason === 'string') {
    this.set('reason', truncateString(reason));
  }
  const errorMessage = this.get('errorMessage');
  if (typeof errorMessage === 'string') {
    this.set('errorMessage', truncateString(errorMessage));
  }

  next();
});

export default adminAuditLogSchema;
