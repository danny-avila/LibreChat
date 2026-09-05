import {
  BASE_ONLY_CONFIG_SECTIONS,
  INTERFACE_PERMISSION_FIELDS,
  RUNTIME_CONFIG_INTERFACE_FIELDS,
  PERMISSION_SUB_KEYS,
} from 'librechat-data-provider';
import logger from '~/config/winston';

const BASE_ONLY_OVERRIDE_SECTIONS = new Set<string>(BASE_ONLY_CONFIG_SECTIONS);
const INTERNAL_CONFIG_ALIASES = new Set(['interfaceConfig', 'mcpConfig', 'turnstileConfig']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalizeOverridePath(path: string): string {
  if (path === 'interfaceConfig') {
    return 'interface';
  }
  if (path.startsWith('interfaceConfig.')) {
    return `interface.${path.slice('interfaceConfig.'.length)}`;
  }
  return path;
}

/** Nested allowlist of UI-only keys under a composite interface permission field. */
export type InterfacePermissionUiNode =
  | true
  | { readonly [key: string]: InterfacePermissionUiNode };

/**
 * UI-only paths allowed under each interface permission field, including nesting.
 * Fields omitted here (booleans and permission-only objects) reject every descendant.
 */
export const INTERFACE_PERMISSION_UI_SHAPES: Readonly<Record<string, InterfacePermissionUiNode>> = {
  mcpServers: {
    placeholder: true,
    trustCheckbox: {
      label: true,
      subLabel: true,
    },
  },
  marketplace: {
    verification: true,
  },
  skills: {
    defaultActiveOnShare: true,
  },
  sharedLinks: {
    snapshotFiles: true,
  },
};

function isUiShapeMap(
  node: InterfacePermissionUiNode,
): node is { readonly [key: string]: InterfacePermissionUiNode } {
  return node !== true;
}

/** Shape leaves that accept exactly one string sub-key (a language code for localized strings). */
const LOCALIZED_UI_LEAVES = new Set(['label', 'subLabel']);

function isAllowedInterfacePermissionUiPath(field: string, descendant: readonly string[]): boolean {
  if (descendant.length === 0) {
    return false;
  }
  let node: InterfacePermissionUiNode | undefined = INTERFACE_PERMISSION_UI_SHAPES[field];
  if (node == null) {
    return false;
  }
  let lastKey = '';
  let inLocalizedLeaf = false;
  for (const segment of descendant) {
    if (inLocalizedLeaf) {
      // Already consumed one language-key segment; no further depth is valid.
      return false;
    }
    if (!isUiShapeMap(node)) {
      // Reached a primitive leaf; localized record leaves accept exactly one more key.
      if (!LOCALIZED_UI_LEAVES.has(lastKey)) {
        return false;
      }
      inLocalizedLeaf = true;
      continue;
    }
    lastKey = segment;
    node = node[segment];
    if (node == null) {
      return false;
    }
  }
  return true;
}

function pickAllowedUiSubtree(
  value: Record<string, unknown>,
  shape: { readonly [key: string]: InterfacePermissionUiNode },
  fieldPath: string,
): Record<string, unknown> | undefined {
  const uiOnly: Record<string, unknown> = {};
  for (const [sub, subVal] of Object.entries(value)) {
    const childPath = `${fieldPath}.${sub}`;
    if (PERMISSION_SUB_KEYS.has(sub)) {
      logger.warn(
        `[adminConfig] Stripping interface permission sub-field "${childPath}" — use role permissions instead`,
      );
      continue;
    }
    const childShape = shape[sub];
    if (childShape == null) {
      logger.warn(`[adminConfig] Stripping unknown interface permission descendant "${childPath}"`);
      continue;
    }
    if (childShape === true) {
      if (LOCALIZED_UI_LEAVES.has(sub)) {
        if (!isPlainObject(subVal) && !Array.isArray(subVal)) {
          uiOnly[sub] = subVal;
        } else if (isPlainObject(subVal)) {
          const localized: Record<string, unknown> = {};
          for (const [langKey, langVal] of Object.entries(subVal)) {
            if (!isPlainObject(langVal) && !Array.isArray(langVal)) {
              localized[langKey] = langVal;
            }
          }
          if (Object.keys(localized).length > 0) {
            uiOnly[sub] = localized;
          }
        }
      } else if (!isPlainObject(subVal) && !Array.isArray(subVal)) {
        uiOnly[sub] = subVal;
      }
      continue;
    }
    if (!isPlainObject(subVal)) {
      logger.warn(`[adminConfig] Stripping unknown interface permission descendant "${childPath}"`);
      continue;
    }
    const nested = pickAllowedUiSubtree(subVal, childShape, childPath);
    if (nested != null) {
      uiOnly[sub] = nested;
    }
  }
  return Object.keys(uiOnly).length > 0 ? uiOnly : undefined;
}

function isInterfacePermissionPath(fieldPath: string): boolean {
  const parts = fieldPath.split('.');
  if (parts[0] !== 'interface' || parts.length < 2) {
    return false;
  }
  if (!INTERFACE_PERMISSION_FIELDS.has(parts[1])) {
    return false;
  }
  if (parts.length === 2) {
    return !RUNTIME_CONFIG_INTERFACE_FIELDS.has(parts[1]);
  }
  if (PERMISSION_SUB_KEYS.has(parts[2])) {
    return true;
  }
  if (RUNTIME_CONFIG_INTERFACE_FIELDS.has(parts[1])) {
    return false;
  }
  return !isAllowedInterfacePermissionUiPath(parts[1], parts.slice(2));
}

export function isForbiddenAdminConfigPath(fieldPath: string): boolean {
  const canonicalPath = canonicalizeOverridePath(fieldPath);
  const topLevel = canonicalPath.split('.')[0];
  if (INTERNAL_CONFIG_ALIASES.has(fieldPath.split('.')[0])) {
    return true;
  }
  if (BASE_ONLY_OVERRIDE_SECTIONS.has(topLevel)) {
    return true;
  }
  if (canonicalPath === 'interface') {
    return true;
  }
  return isInterfacePermissionPath(canonicalPath);
}

/**
 * Strips interface permission fields and base-only sections that must not be
 * persisted as config overrides (PUT, atomic replace, and restore).
 */
export function sanitizeAdminConfigOverrides(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const filteredOverrides = { ...overrides };
  for (const alias of INTERNAL_CONFIG_ALIASES) {
    if (alias in filteredOverrides) {
      delete filteredOverrides[alias];
      logger.warn(
        `[adminConfig] Stripping internal config alias "${alias}" — use canonical YAML keys instead`,
      );
    }
  }
  for (const section of BASE_ONLY_OVERRIDE_SECTIONS) {
    if (section in filteredOverrides) {
      delete filteredOverrides[section];
      logger.warn(
        `[adminConfig] Stripping base-only config section "${section}" - configure it in librechat.yaml instead`,
      );
    }
  }
  const hasInterface = Object.prototype.hasOwnProperty.call(filteredOverrides, 'interface');
  if (!hasInterface) {
    return filteredOverrides;
  }
  const iface = filteredOverrides.interface;
  if (!isPlainObject(iface)) {
    delete filteredOverrides.interface;
    logger.warn(
      '[adminConfig] Stripping non-object "interface" override — use an object with UI-only keys',
    );
    return filteredOverrides;
  }

  const filteredIface: Record<string, unknown> = {};
  for (const [field, val] of Object.entries(iface)) {
    if (!INTERFACE_PERMISSION_FIELDS.has(field)) {
      filteredIface[field] = val;
      continue;
    }
    if (RUNTIME_CONFIG_INTERFACE_FIELDS.has(field)) {
      if (!isPlainObject(val)) {
        filteredIface[field] = val;
        continue;
      }
      const runtimeOnly: Record<string, unknown> = {};
      if (val.use === false) {
        runtimeOnly.use = false;
      }
      for (const [sub, subVal] of Object.entries(val)) {
        if (!PERMISSION_SUB_KEYS.has(sub)) {
          runtimeOnly[sub] = subVal;
        }
      }
      if (Object.keys(runtimeOnly).length > 0) {
        filteredIface[field] = runtimeOnly;
      }
      continue;
    }
    const shape = INTERFACE_PERMISSION_UI_SHAPES[field];
    if (shape == null || !isUiShapeMap(shape) || !isPlainObject(val)) {
      logger.warn(
        `[adminConfig] Stripping interface permission field "${field}" — use role permissions instead`,
      );
      continue;
    }
    const uiOnly = pickAllowedUiSubtree(val, shape, field);
    if (uiOnly != null) {
      filteredIface[field] = uiOnly;
    }
  }
  if (Object.keys(filteredIface).length > 0) {
    filteredOverrides.interface = filteredIface;
  } else {
    delete filteredOverrides.interface;
  }
  return filteredOverrides;
}

export function sanitizeAdminConfigTombstones(paths: unknown): string[] {
  if (!Array.isArray(paths) || paths.length === 0) {
    return [];
  }
  const kept: string[] = [];
  for (const path of paths) {
    if (typeof path !== 'string') {
      logger.warn('[adminConfig] Discarding non-string tombstone path entry');
      continue;
    }
    if (!isForbiddenAdminConfigPath(path)) {
      kept.push(path);
      continue;
    }
    logger.warn(
      `[adminConfig] Stripping forbidden tombstone path "${path}" — use role permissions instead`,
    );
  }
  return kept;
}
