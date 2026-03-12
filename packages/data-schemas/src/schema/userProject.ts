import mongoose, { Schema } from 'mongoose';
import type { IUserProject } from '~/types';

const projectMemoryEntrySchema = new Schema(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false },
);

const userProjectSchema: Schema<IUserProject> = new Schema(
  {
    projectId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 200,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    instructions: {
      type: String,
      maxlength: 50000,
    },
    color: {
      type: String,
      maxlength: 20,
    },
    icon: {
      type: String,
      maxlength: 50,
    },
    fileIds: {
      type: [String],
      default: [],
    },
    memory: {
      type: [projectMemoryEntrySchema],
      default: [],
    },
    defaultModel: {
      type: String,
    },
    defaultEndpoint: {
      type: String,
    },
  },
  { timestamps: true },
);

userProjectSchema.index({ user: 1, name: 1 });
userProjectSchema.index({ user: 1, updatedAt: -1 });

export default userProjectSchema;
