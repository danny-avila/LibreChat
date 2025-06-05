import { Schema, Document, Types } from 'mongoose';

export interface IGroup extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  email?: string;
  avatar?: string;
  memberIds: string[];
  source: 'local' | 'entra';
  idOnTheSource?: string;
}

const GroupSchema = new Schema<IGroup>(
  {
    name: {
      type: String,
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: false,
    },
    email: {
      type: String,
      required: false,
      index: true,
    },
    avatar: {
      type: String,
      required: false,
    },
    memberIds: [{
      type: String,
    }],
    source: {
      type: String,
      enum: ['local', 'entra'],
      default: 'local',
    },
    // External ID (e.g., Entra ID)
    idOnTheSource: {
      type: String,
      sparse: true,
      index: true,
      required: function(this: IGroup) {
        return this.source !== 'local';
      }
    },
  }, 
  { timestamps: true }
);

// Create indexes for efficient lookups
GroupSchema.index({ idOnTheSource: 1, source: 1 }, { unique: true, sparse: true });
GroupSchema.index({ memberIds: 1 });

export default GroupSchema;