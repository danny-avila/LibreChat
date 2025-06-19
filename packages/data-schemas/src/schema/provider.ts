import { Schema, Document, Types } from 'mongoose';

export interface IProvider extends Document {
  name: string; // e.g., "OpenAI", "Azure", "Anthropic", "Custom"
  baseURL?: string; // Base URL for the provider's API
  // Add any other provider-specific fields here if needed in the future
  createdAt: Date;
  updatedAt: Date;
}

const providerSchema: Schema<IProvider> = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    baseURL: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

export default providerSchema;
