import { Schema } from 'mongoose';
import type { MediaSettlementRecord } from '~/types/mediaAccounting';

const mediaSettlementSchema: Schema<MediaSettlementRecord> = new Schema(
  {
    settlementId: { type: String, required: true },
    ownerId: { type: String, required: true },
    tenantId: { type: String, default: null },
    jobId: { type: String, required: true },
    balanceId: { type: String, required: true },
    estimatedCredits: { type: Number, required: true },
    maxCredits: { type: Number, required: true },
    holdFingerprint: { type: String, required: true },
    createdAt: { type: String, required: true },
    reviewAt: { type: String, required: true },
    state: {
      type: String,
      enum: ['holding', 'held', 'ready', 'applied', 'published'],
      required: true,
    },
    effect: {
      type: new Schema(
        {
          kind: { type: String, enum: ['charge', 'release', 'debt_collection'], required: true },
          credits: { type: Number, required: true },
          costUSD: Number,
          creditsPerUSD: Number,
          inputTokens: Number,
          outputTokens: Number,
          model: String,
        },
        { _id: false },
      ),
      default: undefined,
    },
    effectFingerprint: String,
    sequence: Number,
    result: {
      type: new Schema(
        {
          debitedCredits: Number,
          debtCredits: Number,
          releasedCredits: Number,
          remainingCredits: Number,
        },
        { _id: false },
      ),
      default: undefined,
    },
    balanceAcknowledged: { type: Boolean, default: false },
  },
  { versionKey: false, minimize: false },
);
mediaSettlementSchema.index({ tenantId: 1, ownerId: 1, jobId: 1 }, { unique: true });
mediaSettlementSchema.index({ settlementId: 1 }, { unique: true });
mediaSettlementSchema.index(
  { balanceId: 1, sequence: 1 },
  {
    unique: true,
    partialFilterExpression: { sequence: { $type: 'number' } },
  },
);
mediaSettlementSchema.index({ tenantId: 1, ownerId: 1, balanceAcknowledged: 1, settlementId: 1 });
mediaSettlementSchema.index({ balanceAcknowledged: 1, ownerId: 1, tenantId: 1 });

export default mediaSettlementSchema;
