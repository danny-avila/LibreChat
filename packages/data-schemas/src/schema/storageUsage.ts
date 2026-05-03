import { Schema } from 'mongoose';
import type * as t from '~/types';

/**
 * Holds per-user quota overrides only. Actual usage is computed live by
 * aggregating the `files` collection — that's the single source of truth.
 */
const storageUsageSchema = new Schema<t.IStorageUsage>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      required: true,
    },
    bytesLimit: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true },
);

export default storageUsageSchema;
