import { Schema } from 'mongoose';
import type { IUserProject } from '~/types/userProject';

const userProjectSchema: Schema<IUserProject> = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

userProjectSchema.index({ userId: 1, name: 1 }, { unique: true });

export default userProjectSchema;
