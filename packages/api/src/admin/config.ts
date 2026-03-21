import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { ConfigSection } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { Types, ClientSession } from 'mongoose';
import type { IConfig } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types/http';

// ── Dot-path helpers (no lodash dependency) ──────────────────────────

const UNSAFE_SEGMENTS = /(?:^|\.)(__|constructor|prototype)(?:\.|$)/;

function isValidFieldPath(path: string): boolean {
  return typeof path === 'string' && path.length > 0 && !UNSAFE_SEGMENTS.test(path);
}

function getTopLevelSection(fieldPath: string): string {
  return fieldPath.split('.')[0];
}

function deepGet(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function deepSet(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

function deepUnset(obj: Record<string, unknown>, path: string): void {
  const keys = path.split('.');
  if (keys.length === 1) {
    delete obj[keys[0]];
    return;
  }
  const parents: Array<{ obj: Record<string, unknown>; key: string }> = [];
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] == null || typeof current[key] !== 'object') {
      return;
    }
    parents.push({ obj: current, key });
    current = current[key] as Record<string, unknown>;
  }
  delete current[keys[keys.length - 1]];
  // Clean up empty parent objects
  for (let i = parents.length - 1; i >= 0; i--) {
    const { obj: parentObj, key } = parents[i];
    if (Object.keys(parentObj[key] as Record<string, unknown>).length === 0) {
      delete parentObj[key];
    } else {
      break;
    }
  }
}

// ── Types ────────────────────────────────────────────────────────────

interface CapabilityUser {
  id: string;
  role: string;
  tenantId?: string;
}

export interface AdminConfigDeps {
  findConfigByPrincipal: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  getApplicableConfigs: (
    principals?: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    session?: ClientSession,
  ) => Promise<IConfig[]>;
  upsertConfig: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    overrides: Record<string, unknown>,
    priority: number,
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
    section: ConfigSection,
    verb?: 'manage' | 'read',
  ) => Promise<boolean>;
}

// ── Validation helpers ───────────────────────────────────────────────

const VALID_PRINCIPAL_TYPES = new Set(Object.values(PrincipalType));

function validatePrincipalType(value: string): value is PrincipalType {
  return VALID_PRINCIPAL_TYPES.has(value as PrincipalType);
}

function principalModel(type: PrincipalType): PrincipalModel {
  switch (type) {
    case PrincipalType.USER:
      return PrincipalModel.USER;
    case PrincipalType.GROUP:
      return PrincipalModel.GROUP;
    case PrincipalType.ROLE:
      return PrincipalModel.ROLE;
    default:
      return PrincipalModel.ROLE;
  }
}

function getCapabilityUser(req: ServerRequest): CapabilityUser | null {
  if (!req.user) {
    return null;
  }
  return {
    id: req.user.id ?? req.user._id?.toString() ?? '',
    role: req.user.role ?? '',
    tenantId: (req.user as unknown as CapabilityUser).tenantId,
  };
}

// ── Handler factory ──────────────────────────────────────────────────

export function createAdminConfigHandlers(deps: AdminConfigDeps) {
  const {
    findConfigByPrincipal,
    getApplicableConfigs,
    upsertConfig,
    deleteConfig,
    toggleConfigActive,
    hasConfigCapability,
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

      // Listing requires broad read:configs
      if (!(await hasConfigCapability(user, '' as ConfigSection, 'read'))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const configs = await getApplicableConfigs();
      return res.status(200).json({ configs });
    } catch (error) {
      logger.error('[adminConfig] listConfigs error:', error);
      return res.status(500).json({ error: 'Failed to list configs' });
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

      const config = await findConfigByPrincipal(principalType, principalId);
      if (!config) {
        return res.status(404).json({ error: 'Config not found' });
      }

      // Check read access for each top-level section in overrides
      const overrides = (config.overrides ?? {}) as Record<string, unknown>;
      for (const section of Object.keys(overrides)) {
        if (!(await hasConfigCapability(user, section as ConfigSection, 'read'))) {
          return res.status(403).json({
            error: `Insufficient permissions for config section: ${section}`,
          });
        }
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
        overrides?: Record<string, unknown>;
        priority?: number;
      };

      if (!overrides || typeof overrides !== 'object') {
        return res.status(400).json({ error: 'overrides object is required' });
      }

      if (priority != null && (typeof priority !== 'number' || priority < 0)) {
        return res.status(400).json({ error: 'priority must be a non-negative number' });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check manage access for each top-level section
      for (const section of Object.keys(overrides)) {
        if (!(await hasConfigCapability(user, section as ConfigSection, 'manage'))) {
          return res.status(403).json({
            error: `Insufficient permissions for config section: ${section}`,
          });
        }
      }

      const config = await upsertConfig(
        principalType,
        principalId,
        principalModel(principalType),
        overrides,
        priority ?? 10,
      );

      return res.status(200).json({ config });
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

      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: 'entries array is required and must not be empty' });
      }

      // Validate all field paths
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

      // Check manage access for each entry's section
      const sections = [...new Set(entries.map((e) => getTopLevelSection(e.fieldPath)))];
      for (const section of sections) {
        if (!(await hasConfigCapability(user, section as ConfigSection, 'manage'))) {
          return res.status(403).json({
            error: `Insufficient permissions for config section: ${section}`,
          });
        }
      }

      // Fetch existing config to merge into
      const existing = await findConfigByPrincipal(principalType, principalId);
      const overrides: Record<string, unknown> = existing
        ? JSON.parse(JSON.stringify(existing.overrides ?? {}))
        : {};

      // Apply field updates
      for (const entry of entries) {
        deepSet(overrides, entry.fieldPath, entry.value);
      }

      const config = await upsertConfig(
        principalType,
        principalId,
        principalModel(principalType),
        overrides,
        priority ?? existing?.priority ?? 10,
      );

      return res.status(200).json({ config });
    } catch (error) {
      logger.error('[adminConfig] patchConfigField error:', error);
      return res.status(500).json({ error: 'Failed to patch config fields' });
    }
  }

  /**
   * DELETE /:principalType/:principalId/fields — Remove a field from overrides.
   * Field path is sent in the request body as { fieldPath: "dotted.path" }.
   */
  async function deleteConfigField(req: ServerRequest, res: Response) {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };
      const { fieldPath } = req.body as { fieldPath?: string };

      if (!fieldPath || typeof fieldPath !== 'string') {
        return res.status(400).json({ error: 'fieldPath is required in request body' });
      }

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
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

      const existing = await findConfigByPrincipal(principalType, principalId);
      if (!existing) {
        return res.status(404).json({ error: 'Config not found' });
      }

      const overrides: Record<string, unknown> = JSON.parse(
        JSON.stringify(existing.overrides ?? {}),
      );

      if (deepGet(overrides, fieldPath) === undefined) {
        return res.status(404).json({ error: `Field not found: ${fieldPath}` });
      }

      deepUnset(overrides, fieldPath);

      const config = await upsertConfig(
        principalType,
        principalId,
        principalModel(principalType),
        overrides,
        existing.priority,
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

      // Deleting an entire override requires broad manage:configs
      if (!(await hasConfigCapability(user, '' as ConfigSection, 'manage'))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const config = await deleteConfig(principalType, principalId);
      if (!config) {
        return res.status(404).json({ error: 'Config not found' });
      }

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

      // Toggling requires broad manage:configs
      if (!(await hasConfigCapability(user, '' as ConfigSection, 'manage'))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const config = await toggleConfigActive(principalType, principalId, isActive);
      if (!config) {
        return res.status(404).json({ error: 'Config not found' });
      }

      return res.status(200).json({ config });
    } catch (error) {
      logger.error('[adminConfig] toggleConfig error:', error);
      return res.status(500).json({ error: 'Failed to toggle config' });
    }
  }

  return {
    listConfigs,
    getConfig,
    upsertConfigOverrides,
    patchConfigField,
    deleteConfigField,
    deleteConfigOverrides,
    toggleConfig,
  };
}
