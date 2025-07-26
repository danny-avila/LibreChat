import { Schema } from 'mongoose';
import type { IAccessRole } from '~/types';

const accessRoleSchema = new Schema<IAccessRole>(
  {
    accessRoleId: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: String,
    resourceType: {
      type: String,
      enum: ['agent', 'project', 'file', 'prompt', 'promptGroup'],
      required: true,
      default: 'agent',
    },
    permBits: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

export default accessRoleSchema;
