import { Schema, Document, Types } from 'mongoose';

export interface IMongoImpersonationToken extends Document {
  jti: string;
  actorId: Types.ObjectId;
  actorEmail: string;
  targetUserId: Types.ObjectId;
  targetEmail: string;
  reason: string;
  expiresAt: Date;
  consumedAt?: Date | null;
  consumedFromIp?: string | null;
  consumedFromUserAgent?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const impersonationTokenSchema = new Schema<IMongoImpersonationToken>(
  {
    jti: { type: String, required: true, unique: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorEmail: { type: String, required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetEmail: { type: String, required: true },
    reason: { type: String, required: true, maxlength: 500 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    consumedFromIp: { type: String, default: null },
    consumedFromUserAgent: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

// Auto-purge consumed/expired rows 24h after expiry. Keeps the audit trail
// in adminAuditLogs as the durable record; this collection is just for the
// short replay-protection window.
impersonationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export default impersonationTokenSchema;
