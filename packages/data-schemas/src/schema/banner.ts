import { Schema, Document } from 'mongoose';

export interface IBanner extends Document {
  // Existing fields
  bannerId: string;
  message: string;
  displayFrom: Date;
  displayTo?: Date;
  type: 'banner' | 'popup';
  isPublic: boolean;
  persistable: boolean;
  tenantId?: string;

  // New fields for multi-banner system (all optional for backward compatibility)
  audienceMode?: 'global' | 'role' | 'group' | 'user';
  targetRoleIds?: string[];
  targetGroupIds?: string[];
  targetUserIds?: string[];
  priority?: number;
  isActive?: boolean;
  order?: number;
  viewCount?: number;
  dismissCount?: number;
}

const bannerSchema = new Schema<IBanner>(
  {
    bannerId: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    displayFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    displayTo: {
      type: Date,
    },
    type: {
      type: String,
      enum: ['banner', 'popup'],
      default: 'banner',
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    persistable: {
      type: Boolean,
      default: false,
    },
    tenantId: {
      type: String,
      index: true,
    },

    // New fields for multi-banner system (all optional for backward compatibility)
    audienceMode: {
      type: String,
      enum: ['global', 'role', 'group', 'user'],
      default: 'global',
    },
    targetRoleIds: [
      {
        type: String,
      },
    ],
    targetGroupIds: [
      {
        type: String,
      },
    ],
    targetUserIds: [
      {
        type: String,
      },
    ],
    priority: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    dismissCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Indexes for performance
bannerSchema.index({ bannerId: 1 }, { unique: true });
bannerSchema.index({ displayFrom: 1, displayTo: 1, isActive: 1 });
bannerSchema.index({ audienceMode: 1, isActive: 1 });
bannerSchema.index({ targetRoleIds: 1 }, { sparse: true });
bannerSchema.index({ targetGroupIds: 1 }, { sparse: true });
bannerSchema.index({ targetUserIds: 1 }, { sparse: true });
bannerSchema.index({ tenantId: 1, isActive: 1 });
bannerSchema.index({ priority: -1, order: 1 });

export default bannerSchema;
