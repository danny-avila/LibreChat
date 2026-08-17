import { Schema } from 'mongoose';

export const codeEnvRefSchema: Schema = new Schema(
  {
    kind: {
      type: String,
      enum: ['skill', 'agent', 'user'],
      required: true,
    },
    id: { type: String, required: true },
    storage_session_id: { type: String, required: true },
    file_id: { type: String, required: true },
    version: { type: Number },
    executionProfile: {
      type: String,
      enum: ['default', 'stateful'],
    },
  },
  { _id: false },
);

export const codeEnvRefMapSchema: Schema = new Schema(
  {
    default: { type: codeEnvRefSchema, default: undefined },
    stateful: { type: codeEnvRefSchema, default: undefined },
  },
  { _id: false },
);
