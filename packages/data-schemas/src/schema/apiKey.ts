import { Schema, Document, Types } from 'mongoose';

export interface IApiKey extends Document {
  providerId: Types.ObjectId; // Reference to the Provider
  userId?: Types.ObjectId; // Optional: if the key is user-specific
  customName: string; // User-defined name for the key (e.g., "My OpenAI Key 1", "OpenRouter")
  value: string; // The API key itself (should be stored securely if possible, consider encryption)
  // Add any other API key-specific fields here
  createdAt: Date;
  updatedAt: Date;
}

const apiKeySchema: Schema<IApiKey> = new Schema(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'Provider',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Or true if keys are always user-specific
    },
    customName: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      required: true,
      // Consider adding select: false if you want to explicitly query for it
    },
  },
  { timestamps: true },
);

apiKeySchema.index({ providerId: 1 });
apiKeySchema.index({ userId: 1 });
apiKeySchema.index({ customName: 1 });

export default apiKeySchema;
