import { Schema } from 'mongoose';
import type { IAgentTriggerLaneSequenceDocument } from '~/types/triggerDelivery';

const triggerLaneSequenceSchema: Schema<IAgentTriggerLaneSequenceDocument> = new Schema(
  {
    _id: { type: String, required: true },
    value: { type: Number, required: true, min: 1 },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenantId: { type: String, index: true },
    tailDeliveryId: { type: Schema.Types.ObjectId, ref: 'AgentTriggerDelivery' },
    publisherDeliveryId: { type: Schema.Types.ObjectId, ref: 'AgentTriggerDelivery' },
    publisherStartedAt: { type: Date },
    cleanupRequestedAt: { type: Date, index: true },
  },
  { timestamps: true },
);

export default triggerLaneSequenceSchema;
