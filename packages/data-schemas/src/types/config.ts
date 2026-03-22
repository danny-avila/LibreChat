import type { Document, Types } from 'mongoose';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';

/**
 * Configuration override for a principal (user, group, or role).
 * Stores partial overrides at the TCustomConfig (YAML) level,
 * which are merged with the base config before processing through AppService.
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
  /** Configuration overrides matching librechat.yaml structure */
  overrides: Partial<TCustomConfig>;
  /** Whether this config override is currently active */
  isActive: boolean;
  /** Version number for cache invalidation, auto-increments on overrides change */
  configVersion: number;
  /** Tenant identifier for multi-tenancy isolation */
  tenantId?: string;
  /** When this config was created */
  createdAt?: Date;
  /** When this config was last updated */
  updatedAt?: Date;
};

export type IConfig = Config &
  Document & {
    _id: Types.ObjectId;
  };

/* ── JSON-serializable API response types ───────────────────────────── */

/** Config document as returned by the API (no Mongoose internals). */
export type AdminConfig = {
  _id: string;
  principalType: PrincipalType;
  principalId: string;
  principalModel: PrincipalModel;
  priority: number;
  overrides: Partial<TCustomConfig>;
  isActive: boolean;
  configVersion: number;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminConfigListResponse = {
  configs: AdminConfig[];
};

export type AdminConfigResponse = {
  config: AdminConfig;
};

export type AdminConfigDeleteResponse = {
  success: boolean;
};
