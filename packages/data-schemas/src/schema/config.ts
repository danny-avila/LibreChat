import { Schema } from 'mongoose';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { IConfig } from '~/types';

const configSchema = new Schema<IConfig>(
  {
    principalType: {
      type: String,
      enum: Object.values(PrincipalType),
      required: true,
      index: true,
    },
    principalId: {
      type: Schema.Types.Mixed, // ObjectId for users/groups, String for roles
      refPath: 'principalModel',
      required: true,
      index: true,
    },
    principalModel: {
      type: String,
      enum: Object.values(PrincipalModel),
      required: true,
    },
    priority: {
      type: Number,
      required: true,
      index: true,
    },
    overrides: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    configVersion: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true },
);

// Composite index for efficient querying
configSchema.index({ principalType: 1, principalId: 1, isActive: 1 });
configSchema.index({ priority: 1, isActive: 1 });

// Auto-increment version on overrides change
configSchema.pre('save', function (next) {
  if (this.isModified('overrides')) {
    this.configVersion += 1;
  }
  next();
});

export default configSchema;
