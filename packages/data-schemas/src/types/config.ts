import type { Document, Types } from 'mongoose';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { AppConfig } from './app';

/**
 * Configuration for a principal (user, group, or role)
 */
export type Config = {
  /** The type of principal (user, group, role) */
  principalType: PrincipalType;
  /** The ID of the principal (ObjectId for users/groups, string for roles) */
  principalId: Types.ObjectId | string;
  /** The model name for the principal */
  principalModel: PrincipalModel;
  /** Priority level for determining merge order (higher = more specific) */
  priority: number;
  /** Configuration overrides matching AppConfig structure */
  overrides: Partial<AppConfig>;
  /** Whether this config override is currently active */
  isActive: boolean;
  /** Version number for cache invalidation */
  configVersion: number;
  /** When this config was created */
  createdAt?: Date;
  /** When this config was last updated */
  updatedAt?: Date;
};

export type IConfig = Config &
  Document & {
    _id: Types.ObjectId;
  };
