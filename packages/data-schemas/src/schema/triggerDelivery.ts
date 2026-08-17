import { Schema } from 'mongoose';
import type { IAgentTriggerDeliveryDocument } from '~/types/triggerDelivery';

const failureSchema = new Schema(
  {
    code: { type: String, required: true, maxlength: 128 },
    message: { type: String, required: true, maxlength: 2048 },
    certainty: { type: String, enum: ['definite', 'ambiguous'], required: true },
    retryable: { type: Boolean, required: true },
    attemptedAt: { type: Date, required: true },
    status: { type: Number },
  },
  { _id: false },
);

const historySchema = new Schema(
  {
    attempt: { type: Number, required: true, min: 1 },
    outcome: { type: String, enum: ['succeeded', 'retry', 'dead'], required: true },
    at: { type: Date, required: true },
    workerId: { type: String, required: true },
    error: { type: failureSchema },
  },
  { _id: false },
);

const triggerDeliverySchema: Schema<IAgentTriggerDeliveryDocument> = new Schema(
  {
    deliveryKey: { type: String, required: true, maxlength: 128 },
    fingerprint: { type: String, required: true, maxlength: 128 },
    orderingKey: { type: String, required: true, maxlength: 128 },
    // Zero is reserved for a staging row that is visible before sequence allocation.
    laneSequence: { type: Number, required: true, min: 0 },
    envelope: { type: Schema.Types.Mixed, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenantId: { type: String, index: true },
    status: {
      type: String,
      enum: ['staging', 'pending', 'leased', 'succeeded', 'dead'],
      required: true,
      default: 'pending',
    },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    availableAt: { type: Date, required: true },
    leaseBy: { type: String },
    leaseUntil: { type: Date },
    claimToken: { type: String },
    lastError: { type: failureSchema },
    result: { type: Schema.Types.Mixed },
    history: { type: [historySchema], default: undefined },
    settledAt: { type: Date },
    expiresAt: { type: Date },
    requeueCount: { type: Number, default: 0, min: 0 },
    stagingRecoveryAt: { type: Date },
    laneCleanupPendingAt: { type: Date },
  },
  { timestamps: true },
);

triggerDeliverySchema.index({ deliveryKey: 1 }, { unique: true });
triggerDeliverySchema.index({ status: 1, availableAt: 1, createdAt: 1 });
triggerDeliverySchema.index({ status: 1, leaseUntil: 1, createdAt: 1 });
triggerDeliverySchema.index({ orderingKey: 1, status: 1, laneSequence: 1 });
triggerDeliverySchema.index({ status: 1, updatedAt: -1 });
triggerDeliverySchema.index({ stagingRecoveryAt: 1 }, { sparse: true });
triggerDeliverySchema.index({ laneCleanupPendingAt: 1 }, { sparse: true });
// Only successful rows receive expiresAt. Dead letters remain available until
// an operator explicitly requeues or removes them.
triggerDeliverySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default triggerDeliverySchema;
