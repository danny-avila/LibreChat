import { Schema } from 'mongoose';
import type { IAclEntry } from '~/types';

const aclEntrySchema = new Schema<IAclEntry>(
  {
    principalType: {
      type: String,
      enum: ['user', 'group', 'public'],
      required: true,
    },
    principalId: {
      type: Schema.Types.ObjectId,
      refPath: 'principalModel',
      required: function (this: IAclEntry) {
        return this.principalType !== 'public';
      },
      index: true,
    },
    principalModel: {
      type: String,
      enum: ['User', 'Group'],
      required: function (this: IAclEntry) {
        return this.principalType !== 'public';
      },
    },
    resourceType: {
      type: String,
      enum: ['agent', 'project', 'file', 'prompt', 'promptGroup'],
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
