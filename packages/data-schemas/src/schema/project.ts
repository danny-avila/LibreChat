import { Schema } from 'mongoose';
import type { IProject } from '~/types';

const projectSchema: Schema<IProject> = new Schema<IProject>(
  {
    name: {
      type: String,
      required: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    instructions: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      default: '',
    },
    icon: {
      type: String,
      default: '',
    },
    user: {
      type: String,
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

projectSchema.index({ user: 1, name: 1, tenantId: 1 });

export default projectSchema;
