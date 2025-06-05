import { Schema, Document, Types } from 'mongoose';

export interface IAclEntry extends Document {
  principalType: 'user' | 'group' | 'public';
  principalId?: Types.ObjectId;
  principalModel?: 'User' | 'Group';
  resourceType: 'agent' | 'project' | 'file';
  resourceId: Types.ObjectId;
  permBits: number;
  roleId?: Types.ObjectId;
  inheritedFrom?: Types.ObjectId;
  grantedBy?: Types.ObjectId;
  grantedAt?: Date;
}

const AclEntrySchema = new Schema<IAclEntry>(
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
      enum: ['agent', 'project', 'file'],
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

AclEntrySchema.index({ principalId: 1, principalType: 1, resourceType: 1, resourceId: 1 });
AclEntrySchema.index({ resourceId: 1, principalType: 1, principalId: 1 });
AclEntrySchema.index({ principalId: 1, permBits: 1, resourceType: 1 });

export default AclEntrySchema;
