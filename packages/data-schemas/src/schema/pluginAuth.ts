import { Schema, Document } from 'mongoose';

export interface IPluginAuth extends Document {
  authField: string;
  value: string;
  userId: string;
  pluginKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const pluginAuthSchema: Schema<IPluginAuth> = new Schema(
  {
    authField: {
      type: String,
      required: true,
    },
    value: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    pluginKey: {
      type: String,
    },
  },
  { timestamps: true },
);

export default pluginAuthSchema;
