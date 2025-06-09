import { Schema } from 'mongoose';
import type { IGroup } from '~/types';

const groupSchema = new Schema<IGroup>(
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
    memberIds: [
      {
        type: String,
      },
    ],
    source: {
      type: String,
      enum: ['local', 'entra'],
      default: 'local',
    },
    /** External ID (e.g., Entra ID) */
    idOnTheSource: {
      type: String,
      sparse: true,
      index: true,
      required: function (this: IGroup) {
        return this.source !== 'local';
      },
    },
  },
  { timestamps: true },
);

// Create indexes for efficient lookups
groupSchema.index({ idOnTheSource: 1, source: 1 }, { unique: true, sparse: true });
groupSchema.index({ memberIds: 1 });

export default groupSchema;
