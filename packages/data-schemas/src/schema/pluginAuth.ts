import { Schema } from 'mongoose';
import type { IPluginAuth } from '~/types';

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
