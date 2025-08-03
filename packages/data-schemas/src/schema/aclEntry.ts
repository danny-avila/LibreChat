import { Schema } from 'mongoose';
import { PrincipalType, PrincipalModel, ResourceType } from 'librechat-data-provider';
import type { IAclEntry } from '~/types';

const aclEntrySchema = new Schema<IAclEntry>(
  {
    principalType: {
      type: String,
      enum: Object.values(PrincipalType),
      required: true,
    },
    principalId: {
      type: Schema.Types.Mixed, // Can be ObjectId for users/groups or String for roles
      refPath: 'principalModel',
      required: function (this: IAclEntry) {
        return this.principalType !== PrincipalType.PUBLIC;
      },
      index: true,
    },
    principalModel: {
      type: String,
      enum: Object.values(PrincipalModel),
      required: function (this: IAclEntry) {
        return this.principalType !== PrincipalType.PUBLIC;
      },
    },
    resourceType: {
      type: String,
      enum: Object.values(ResourceType),
      required: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    permBits: {
      type: Number,
      default: 1,
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'AccessRole',
    },
    inheritedFrom: {
      type: Schema.Types.ObjectId,
      sparse: true,
      index: true,
    },
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    grantedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

aclEntrySchema.index({ principalId: 1, principalType: 1, resourceType: 1, resourceId: 1 });
aclEntrySchema.index({ resourceId: 1, principalType: 1, principalId: 1 });
aclEntrySchema.index({ principalId: 1, permBits: 1, resourceType: 1 });

export default aclEntrySchema;
