import { Schema, Document, Types } from 'mongoose';

export interface IMongoEntitlementSnapshot {
  isActive: boolean;
  productIdentifier?: string | null;
  store?: string | null;
  expiresAt?: Date | null;
  purchaseDate?: Date | null;
  gracePeriodExpiresAt?: Date | null;
  unsubscribeDetectedAt?: Date | null;
  billingIssuesDetectedAt?: Date | null;
}

export interface IMongoSubscriptionProfile extends Document {
  userId: Types.ObjectId;
  appUserId: string;
  entitlementId: string;
  isPro: boolean;
  currentPlan?: string | null;
  productId?: string | null;
  store?: string | null;
  expiresAt?: Date | null;
  managementUrl?: string | null;
  entitlements?: Record<string, IMongoEntitlementSnapshot>;
  quota: {
    period: string;
    usedMessages: number;
    limit: number;
  };
  manualOverride?: {
    enabled: boolean;
    mode?: 'grant' | 'revoke' | null;
    source?: string | null;
    updatedAt?: Date | null;
  };
  lastSyncedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const entitlementSnapshotSchema = new Schema<IMongoEntitlementSnapshot>(
  {
    isActive: {
      type: Boolean,
      required: true,
      default: false,
    },
    productIdentifier: {
      type: String,
      default: null,
    },
    store: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    purchaseDate: {
      type: Date,
      default: null,
    },
    gracePeriodExpiresAt: {
      type: Date,
      default: null,
    },
    unsubscribeDetectedAt: {
      type: Date,
      default: null,
    },
    billingIssuesDetectedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const subscriptionProfileSchema = new Schema<IMongoSubscriptionProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    appUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    entitlementId: {
      type: String,
      required: true,
      index: true,
    },
    isPro: {
      type: Boolean,
      required: true,
      default: false,
    },
    currentPlan: {
      type: String,
      default: null,
    },
    productId: {
      type: String,
      default: null,
    },
    store: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    managementUrl: {
      type: String,
      default: null,
    },
    entitlements: {
      type: Map,
      of: entitlementSnapshotSchema,
      default: {},
    },
    quota: {
      type: new Schema(
        {
          period: {
            type: String,
            required: true,
          },
          usedMessages: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
          },
          limit: {
            type: Number,
            required: true,
            default: 3,
            min: 0,
          },
        },
        { _id: false },
      ),
      required: true,
      default: () => ({
        period: '',
        usedMessages: 0,
        limit: 3,
      }),
    },
    manualOverride: {
      type: new Schema(
        {
          enabled: {
            type: Boolean,
            required: true,
            default: false,
          },
          mode: {
            type: String,
            enum: ['grant', 'revoke', null],
            default: null,
          },
          source: {
            type: String,
            default: null,
          },
          updatedAt: {
            type: Date,
            default: null,
          },
        },
        { _id: false },
      ),
      required: true,
      default: () => ({
        enabled: false,
        mode: null,
        source: null,
        updatedAt: null,
      }),
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export default subscriptionProfileSchema;
