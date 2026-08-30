import { Schema } from 'mongoose';
import type { IAgentQueuedTurnSequenceDocument } from '~/types/queuedTurn';

const queuedTurnSequenceSchema: Schema<IAgentQueuedTurnSequenceDocument> = new Schema(
  {
    _id: { type: String, required: true },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: { type: String, index: true },
    conversationId: { type: String, required: true, maxlength: 256 },
    value: { type: Number, required: true, min: 1 },
  },
  { timestamps: true },
);

export default queuedTurnSequenceSchema;
