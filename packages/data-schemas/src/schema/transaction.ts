import mongoose, { Schema, Document, Types } from 'mongoose';

// @ts-ignore
export interface ITransaction extends Document {
  user: Types.ObjectId;
  conversationId?: string;
  tokenType: 'prompt' | 'completion' | 'credits';
  model?: string;
  context?: string;
  valueKey?: string;
  rate?: number;
  rawAmount?: number;
  tokenValue?: number;
  inputTokens?: number;
  writeTokens?: number;
  readTokens?: number;
  messageId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
  mediaSettlementId?: string;
  mediaJobId?: string;
  mediaDebtCredits?: number;
  mediaCostUSD?: number;
  mediaCostSource?: 'provider' | 'estimate';
  mediaFingerprint?: string;
  mediaAccountingMode?: 'balance' | 'transactions';
  mediaOutputTokens?: number;
}

const transactionSchema: Schema<ITransaction> = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    conversationId: {
      type: String,
      ref: 'Conversation',
      index: true,
    },
    tokenType: {
      type: String,
      enum: ['prompt', 'completion', 'credits'],
      required: true,
    },
    model: {
      type: String,
      index: true,
    },
    context: {
      type: String,
    },
    valueKey: {
      type: String,
    },
    rate: Number,
    rawAmount: Number,
    tokenValue: Number,
    inputTokens: { type: Number },
    writeTokens: { type: Number },
    readTokens: { type: Number },
    messageId: { type: String },
    mediaSettlementId: String,
    mediaJobId: String,
    mediaDebtCredits: Number,
    mediaCostUSD: Number,
    mediaCostSource: { type: String, enum: ['provider', 'estimate'] },
    mediaFingerprint: String,
    mediaAccountingMode: { type: String, enum: ['balance', 'transactions'] },
    mediaOutputTokens: Number,
    tenantId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

transactionSchema.index(
  { tenantId: 1, mediaJobId: 1, user: 1 },
  { partialFilterExpression: { mediaJobId: { $exists: true } } },
);

export default transactionSchema;
