import type { Document } from 'mongoose';

export interface IPluginAuth extends Document {
  authField: string;
  value: string;
  userId: string;
  pluginKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PluginAuthQuery {
  userId: string;
  authField?: string;
  pluginKey?: string;
}

export interface FindPluginAuthParams {
  userId: string;
  authField: string;
}

export interface FindPluginAuthsByKeysParams {
  userId: string;
  pluginKeys: string[];
}

export interface UpdatePluginAuthParams {
  userId: string;
  authField: string;
  pluginKey: string;
  value: string;
}

export interface DeletePluginAuthParams {
  userId: string;
  authField?: string;
  pluginKey?: string;
  all?: boolean;
}
