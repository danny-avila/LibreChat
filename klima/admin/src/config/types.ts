import type { RefillIntervalUnit } from 'librechat-data-provider';
import type { JsonObject, JsonValue } from '../json';

/** The three principal kinds `CONFIG_PRINCIPAL_TYPES` accepts (packages/api/src/admin/config.ts). */
export type PrincipalKind = 'role' | 'group' | 'user';

/** Which principal the editor is pointed at. `id` is the role name, group `_id` or user `_id`. */
export interface PrincipalRef {
  kind: PrincipalKind;
  id: string;
  label: string;
}

/**
 * Plain mirror of the `IConfig` document the config routes return
 * (packages/data-schemas/src/types/config.ts). Kept local so the panel never takes a
 * Mongoose type — `_id` and the timestamps arrive as JSON strings, not ObjectId/Date.
 */
export interface ConfigDocument {
  _id: string;
  principalType: PrincipalKind;
  principalId: string;
  principalModel: string;
  priority: number;
  overrides: JsonObject;
  tombstones?: string[];
  isActive: boolean;
  configVersion: number;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** `GET /api/admin/config` → `res.status(200).json({ configs: safeConfigs })`. */
export interface AdminConfigListResponse {
  configs: ConfigDocument[];
}

/**
 * Every config write answers with `{ config }` — or with `{ message }` and no `config`
 * when the backend stripped the whole payload as non-actionable.
 */
export interface AdminConfigResponse {
  config?: ConfigDocument | null;
  message?: string;
}

/** `DELETE /api/admin/config/:principalType/:principalId` → `{ success: true }`. */
export interface AdminConfigDeleteResponse {
  success?: boolean;
}

/** The roles screen owns the role shapes; the principal picker and the override list read them. */
export type { AdminRolesResponse, AdminRole } from '../roles/types';

export interface AdminGroup {
  _id: string;
  name: string;
  description?: string;
  source?: string;
}

export interface AdminGroupsResponse {
  groups: AdminGroup[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * The editable half of `balanceSchema` (packages/data-provider/src/config.ts:2681).
 * `reservationTtlMs` is deliberately absent: it is an infrastructure knob, not a budget.
 * `startBalance` and `refillAmount` are token credits, never dollars.
 */
export interface BalanceOverride {
  enabled?: boolean;
  startBalance?: number;
  autoRefillEnabled?: boolean;
  refillIntervalValue?: number;
  refillIntervalUnit?: RefillIntervalUnit;
  refillAmount?: number;
}

export interface FieldEntry {
  fieldPath: string;
  value: JsonValue;
}

/** `PATCH /api/admin/config/:principalType/:principalId/fields` body. */
export interface PatchFieldsBody {
  entries: FieldEntry[];
  priority?: number;
}

/** `PUT /api/admin/config/:principalType/:principalId` body. */
export interface UpsertBody {
  overrides: JsonObject;
  priority?: number;
}

/** `PATCH /api/admin/config/:principalType/:principalId/active` body. */
export interface ToggleActiveBody {
  isActive: boolean;
}
