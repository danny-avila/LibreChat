import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Singleton document that stores admin overrides.
 * Only one document should exist. We enforce this in service layer.
 * Uses LibreChat's existing MongoDB connection.
 */
export interface IAdminConfig extends Document {
  overrides: Record<string, unknown>;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const adminConfigSchema = new Schema<IAdminConfig>(
  {
    overrides: {
      type: Schema.Types.Mixed,
      default: {},
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    collection: 'adminconfig',
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
  },
);

const AdminConfig: Model<IAdminConfig> =
  mongoose.models.AdminConfig || mongoose.model<IAdminConfig>('AdminConfig', adminConfigSchema);

export default AdminConfig; 