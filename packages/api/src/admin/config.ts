import { logger } from '@librechat/data-schemas';
import {
  PrincipalType,
  PrincipalModel,
  INTERFACE_PERMISSION_FIELDS,
  PERMISSION_SUB_KEYS,
} from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { AppConfig, ConfigSection, IConfig } from '@librechat/data-schemas';
import type { Types, ClientSession } from 'mongoose';
import type { Response } from 'express';
import type { CapabilityUser } from '~/middleware/capabilities';
import type { ServerRequest } from '~/types/http';

const UNSAFE_SEGMENTS = /(?:^|\.)(__[\w]*|constructor|prototype)(?:\.|$)/;
const MAX_PATCH_ENTRIES = 100;
const DEFAULT_PRIORITY = 10;

export function isValidFieldPath(path: string): boolean {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('.') &&
    !path.endsWith('.') &&
    !path.includes('..') &&
    !UNSAFE_SEGMENTS.test(path)
  );
}

export function getTopLevelSection(fieldPath: string): string {
  return fieldPath.split('.')[0];
}

/**
 * Returns true if `fieldPath` targets an interface permission field or permission sub-key.
 *
 * - `"interface.prompts"` → true (boolean permission field)
 * - `"interface.agents.use"` → true (permission sub-key)
 * - `"interface.mcpServers"` → true (entire composite field)
 * - `"interface.mcpServers.use"` → true (permission sub-key)
 * - `"interface.mcpServers.placeholder"` → false (UI-only sub-key)
 * - `"interface.peoplePicker.users"` → true (all peoplePicker sub-keys are permissions)
 * - `"interface.endpointsMenu"` → false (UI-only field)
 */
function isInterfacePermissionPath(fieldPath: string): boolean {
  const parts = fieldPath.split('.');
  if (parts[0] !== 'interface' || parts.length < 2) {
    return false;
  }
  if (!INTERFACE_PERMISSION_FIELDS.has(parts[1])) {
    return false;
  }
  // "interface.<permField>" with no sub-key → permission (blocks the whole field)
  if (parts.length === 2) {
    return true;
  }
  // "interface.<permField>.<subKey>" → only block if sub-key is a permission bit
  return PERMISSION_SUB_KEYS.has(parts[2]);
}

export interface AdminConfigDeps {
  listAllConfigs: (filter?: { isActive?: boolean }, session?: ClientSession) => Promise<IConfig[]>;
  findConfigByPrincipal: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    options?: { includeInactive?: boolean },
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  upsertConfig: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    overrides: Partial<TCustomConfig>,
    priority: number,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  patchConfigFields: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fields: Record<string, unknown>,
    priority: number,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  unsetConfigField: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    fieldPath: string,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  deleteConfig: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  toggleConfigActive: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    isActive: boolean,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  hasConfigCapability: (
    user: CapabilityUser,
    section: ConfigSection | null,
    verb?: 'manage' | 'read',
  ) => Promise<boolean>;
  getAppConfig?: (options?: {
    role?: string;
    userId?: string;
    tenantId?: string;
  }) => Promise<AppConfig>;
  /** Invalidate all config-related caches after a mutation. */
  invalidateConfigCaches?: (tenantId?: string) => Promise<void>;
}

// ── Validation helpers ───────────────────────────────────────────────

const CONFIG_PRINCIPAL_TYPES = new Set([
  PrincipalType.USER,
  PrincipalType.GROUP,
  PrincipalType.ROLE,
]);

function validatePrincipalType(value: string): value is PrincipalType {
  return CONFIG_PRINCIPAL_TYPES.has(value as PrincipalType);
}

function principalModel(type: PrincipalType): PrincipalModel {
  switch (type) {
    case PrincipalType.USER:
      return PrincipalModel.USER;
    case PrincipalType.GROUP:
      return PrincipalModel.GROUP;
    case PrincipalType.ROLE:
      return PrincipalModel.ROLE;
    case PrincipalType.PUBLIC:
      return PrincipalModel.ROLE;
    default: {
      const _exhaustive: never = type;
      logger.warn(`[adminConfig] Unmapped PrincipalType: ${String(_exhaustive)}`);
      return PrincipalModel.ROLE;
    }
  }
}

function getCapabilityUser(req: ServerRequest): CapabilityUser | null {
  if (!req.user) {
    return null;
  }
  return {
    id: req.user.id ?? req.user._id?.toString() ?? '',
    role: req.user.role ?? '',
    tenantId: (req.user as { tenantId?: string }).tenantId,
  };
}

// ── Handler factory ──────────────────────────────────────────────────

export function createAdminConfigHandlers(deps: AdminConfigDeps) {
  const {
    listAllConfigs,
    findConfigByPrincipal,
    upsertConfig,
    patchConfigFields,
    unsetConfigField,
    deleteConfig,
    toggleConfigActive,
    hasConfigCapability,
    getAppConfig,
    invalidateConfigCaches,
  } = deps;

  /**
   * GET / — List all active config overrides.
   */
  async function listConfigs(req: ServerRequest, res: Response) {
    try {
      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!(await hasConfigCapability(user, null, 'read'))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const configs = await listAllConfigs();
      return res.status(200).json({ configs });
    } catch (error) {
      logger.error('[adminConfig] listConfigs error:', error);
      return res.status(500).json({ error: 'Failed to list configs' });
    }
  }

  /**
   * GET /base — Return the raw AppConfig (YAML + DB base merged).
   * This is the full config structure admins can edit, NOT the startup payload.
   */
  async function getBaseConfig(req: ServerRequest, res: Response) {
    try {
      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!(await hasConfigCapability(user, null, 'read'))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      if (!getAppConfig) {
        return res.status(501).json({ error: 'Base config endpoint not configured' });
      }

      const appConfig = await getAppConfig({
        tenantId: user.tenantId,
      });
      return res.status(200).json({ config: appConfig });
    } catch (error) {
      logger.error('[adminConfig] getBaseConfig error:', error);
      return res.status(500).json({ error: 'Failed to get base config' });
    }
  }

  /**
   * GET /:principalType/:principalId — Get config for a specific principal.
   */
  async function getConfig(req: ServerRequest, res: Response) {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!(await hasConfigCapability(user, null, 'read'))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const config = await findConfigByPrincipal(principalType, principalId, {
        includeInactive: true,
      });
      if (!config) {
        return res.status(404).json({ error: 'Config not found' });
      }

      return res.status(200).json({ config });
    } catch (error) {
      logger.error('[adminConfig] getConfig error:', error);
      return res.status(500).json({ error: 'Failed to get config' });
    }
  }

  /**
   * PUT /:principalType/:principalId — Replace entire overrides for a principal.
   */
  async function upsertConfigOverrides(req: ServerRequest, res: Response) {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const { overrides, priority } = req.body as {
        overrides?: Partial<TCustomConfig>;
        priority?: number;
      };

      if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
        return res.status(400).json({ error: 'overrides must be a plain object' });
      }

      if (priority != null && (typeof priority !== 'number' || priority < 0)) {
        return res.status(400).json({ error: 'priority must be a non-negative number' });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!(await hasConfigCapability(user, null, 'manage'))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      let filteredOverrides = overrides;
      const iface = (overrides as Record<string, unknown>).interface;
      if (iface != null && typeof iface === 'object' && !Array.isArray(iface)) {
        const filteredIface: Record<string, unknown> = {};
        for (const [field, val] of Object.entries(iface as Record<string, unknown>)) {
          if (!INTERFACE_PERMISSION_FIELDS.has(field)) {
            filteredIface[field] = val;
          } else if (val != null && typeof val === 'object' && !Array.isArray(val)) {
            // Composite permission field (e.g. mcpServers): strip permission
            // sub-keys but preserve UI-only sub-keys like placeholder/trustCheckbox.
            const uiOnly: Record<string, unknown> = {};
            for (const [sub, subVal] of Object.entries(val as Record<string, unknown>)) {
              if (!PERMISSION_SUB_KEYS.has(sub)) {
                uiOnly[sub] = subVal;
              } else {
                logger.warn(
                  `[adminConfig] Stripping interface permission sub-field "${field}.${sub}" — use role permissions instead`,
                );
              }
            }
            if (Object.keys(uiOnly).length > 0) {
              filteredIface[field] = uiOnly;
            }
          } else {
            logger.warn(
              `[adminConfig] Stripping interface permission field "${field}" — use role permissions instead`,
            );
          }
        }
        filteredOverrides = { ...(overrides as Record<string, unknown>) } as Partial<TCustomConfig>;
        if (Object.keys(filteredIface).length > 0) {
          (filteredOverrides as Record<string, unknown>).interface = filteredIface;
        } else {
          delete (filteredOverrides as Record<string, unknown>).interface;
        }
      }

      const overrideSections = Object.keys(filteredOverrides);

      if (overrideSections.length === 0 && priority == null) {
        return res.status(200).json({ message: 'No actionable override sections provided' });
      }

      if (overrideSections.length > 0) {
        const allowed = await Promise.all(
          overrideSections.map((s) => hasConfigCapability(user, s as ConfigSection, 'manage')),
        );
        const denied = overrideSections.find((_, i) => !allowed[i]);
        if (denied) {
          return res.status(403).json({
            error: `Insufficient permissions for config section: ${denied}`,
          });
        }
      }

      const config = await upsertConfig(
        principalType,
        principalId,
        principalModel(principalType),
        filteredOverrides,
        priority ?? DEFAULT_PRIORITY,
      );

      invalidateConfigCaches?.(user.tenantId)?.catch((err) =>
        logger.error('[adminConfig] Cache invalidation failed after upsert:', err),
      );
      return res.status(config?.configVersion === 1 ? 201 : 200).json({ config });
    } catch (error) {
      logger.error('[adminConfig] upsertConfigOverrides error:', error);
      return res.status(500).json({ error: 'Failed to upsert config' });
    }
  }

  /**
   * PATCH /:principalType/:principalId/fields — Set individual fields via dot-paths.
   */
  async function patchConfigField(req: ServerRequest, res: Response) {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const { entries, priority } = req.body as {
        entries?: Array<{ fieldPath: string; value: unknown }>;
        priority?: number;
      };

      if (priority != null && (typeof priority !== 'number' || priority < 0)) {
        return res.status(400).json({ error: 'priority must be a non-negative number' });
      }

      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: 'entries array is required and must not be empty' });
      }

      if (entries.length > MAX_PATCH_ENTRIES) {
        return res
          .status(400)
          .json({ error: `entries array exceeds maximum of ${MAX_PATCH_ENTRIES}` });
      }

      for (const entry of entries) {
        if (!isValidFieldPath(entry.fieldPath)) {
          return res
            .status(400)
            .json({ error: `Invalid or unsafe field path: ${entry.fieldPath}` });
        }
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const validEntries = entries.filter((entry) => {
        if (isInterfacePermissionPath(entry.fieldPath)) {
          logger.warn(
            `[adminConfig] Stripping interface permission field "${entry.fieldPath}" — use role permissions instead`,
          );
          return false;
        }
        return true;
      });

      if (validEntries.length === 0) {
        if (!(await hasConfigCapability(user, null, 'manage'))) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
        return res.status(200).json({ message: 'No actionable field entries provided' });
      }

      if (!(await hasConfigCapability(user, null, 'manage'))) {
        const sections = [...new Set(validEntries.map((e) => getTopLevelSection(e.fieldPath)))];
        const allowed = await Promise.all(
          sections.map((s) => hasConfigCapability(user, s as ConfigSection, 'manage')),
        );
        const denied = sections.find((_, i) => !allowed[i]);
        if (denied) {
          return res.status(403).json({
            error: `Insufficient permissions for config section: ${denied}`,
          });
        }
      }

      const seen = new Set<string>();
      const fields: Record<string, unknown> = {};
      for (const entry of validEntries) {
        if (seen.has(entry.fieldPath)) {
          return res.status(400).json({ error: `Duplicate fieldPath: ${entry.fieldPath}` });
        }
        seen.add(entry.fieldPath);
        fields[entry.fieldPath] = entry.value;
      }

      const existing =
        priority == null
          ? await findConfigByPrincipal(principalType, principalId, { includeInactive: true })
          : null;

      const config = await patchConfigFields(
        principalType,
        principalId,
        principalModel(principalType),
        fields,
        priority ?? existing?.priority ?? DEFAULT_PRIORITY,
      );

      invalidateConfigCaches?.(user.tenantId)?.catch((err) =>
        logger.error('[adminConfig] Cache invalidation failed after patch:', err),
      );
      return res.status(200).json({ config });
    } catch (error) {
      logger.error('[adminConfig] patchConfigField error:', error);
      return res.status(500).json({ error: 'Failed to patch config fields' });
    }
  }

  /**
   * DELETE /:principalType/:principalId/fields?fieldPath=dotted.path
   */
  async function deleteConfigField(req: ServerRequest, res: Response) {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };
      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const fieldPath = req.query.fieldPath as string | undefined;

      if (!fieldPath || typeof fieldPath !== 'string') {
        return res.status(400).json({ error: 'fieldPath query parameter is required' });
      }

      if (!isValidFieldPath(fieldPath)) {
        return res.status(400).json({ error: `Invalid or unsafe field path: ${fieldPath}` });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const section = getTopLevelSection(fieldPath);

      if (!(await hasConfigCapability(user, section as ConfigSection, 'manage'))) {
        return res.status(403).json({
          error: `Insufficient permissions for config section: ${section}`,
        });
      }

      if (isInterfacePermissionPath(fieldPath)) {
        logger.warn(
          `[adminConfig] Ignoring delete for interface permission field "${fieldPath}" — use role permissions instead`,
        );
        return res.status(200).json({ message: 'No actionable field path provided' });
      }

      const config = await unsetConfigField(principalType, principalId, fieldPath);
      if (!config) {
        return res.status(404).json({ error: 'Config not found' });
      }

      invalidateConfigCaches?.(user.tenantId)?.catch((err) =>
        logger.error('[adminConfig] Cache invalidation failed after field delete:', err),
      );
      return res.status(200).json({ config });
    } catch (error) {
      logger.error('[adminConfig] deleteConfigField error:', error);
      return res.status(500).json({ error: 'Failed to delete config field' });
    }
  }

  /**
   * DELETE /:principalType/:principalId — Delete an entire config override.
   */
  async function deleteConfigOverrides(req: ServerRequest, res: Response) {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!(await hasConfigCapability(user, null, 'manage'))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const config = await deleteConfig(principalType, principalId);
      if (!config) {
        return res.status(404).json({ error: 'Config not found' });
      }

      invalidateConfigCaches?.(user.tenantId)?.catch((err) =>
        logger.error('[adminConfig] Cache invalidation failed after config delete:', err),
      );
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[adminConfig] deleteConfigOverrides error:', error);
      return res.status(500).json({ error: 'Failed to delete config' });
    }
  }

  /**
   * PATCH /:principalType/:principalId/active — Toggle isActive.
   */
  async function toggleConfig(req: ServerRequest, res: Response) {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const { isActive } = req.body as { isActive?: boolean };
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive boolean is required' });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!(await hasConfigCapability(user, null, 'manage'))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const config = await toggleConfigActive(principalType, principalId, isActive);
      if (!config) {
        return res.status(404).json({ error: 'Config not found' });
      }

      invalidateConfigCaches?.(user.tenantId)?.catch((err) =>
        logger.error('[adminConfig] Cache invalidation failed after toggle:', err),
      );
      return res.status(200).json({ config });
    } catch (error) {
      logger.error('[adminConfig] toggleConfig error:', error);
      return res.status(500).json({ error: 'Failed to toggle config' });
    }
  }

  return {
    listConfigs,
    getBaseConfig,
    getConfig,
    upsertConfigOverrides,
    patchConfigField,
    deleteConfigField,
    deleteConfigOverrides,
    toggleConfig,
  };
}
