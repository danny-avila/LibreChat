import { Schema, Document, Types } from 'mongoose';

export interface IModel extends Document {
  providerId: Types.ObjectId; // Reference to the Provider
  modelId: string; // The actual model ID string (e.g., "gpt-3.5-turbo")
  name?: string; // User-friendly display name (if different from modelId)
  type?: 'text' | 'image' | 'audio' | 'multimodal'; // Type of model
  ownedBy?: string; // Who owns/provides the model (e.g., "openai", "anthropic") - from fetched data
  // Add any other model-specific fields from the /v1/models endpoint
  // e.g., context_length, tokenizer, etc.
  fetchedAt: Date; // When this model information was last fetched
  createdAt: Date;
  updatedAt: Date;
}

const modelSchema: Schema<IModel> = new Schema(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'Provider',
      required: true,
    },
    modelId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'audio', 'multimodal'],
    },
    ownedBy: {
      type: String,
      trim: true,
    },
    fetchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

modelSchema.index({ providerId: 1 });
modelSchema.index({ modelId: 1 });
modelSchema.index({ providerId: 1, modelId: 1 }, { unique: true }); // Ensure a model is unique per provider

export default modelSchema;
