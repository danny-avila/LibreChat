import {
  INTERFACE_PERMISSION_FIELDS,
  PERMISSION_SUB_KEYS,
  RUNTIME_CONFIG_INTERFACE_FIELDS,
} from 'librechat-data-provider';
import type { TInterfaceConfig } from 'librechat-data-provider';
import type * as t from '~/admin/types';

export { INTERFACE_PERMISSION_FIELDS, PERMISSION_SUB_KEYS, RUNTIME_CONFIG_INTERFACE_FIELDS };

/** Returns true if a dot-path should be blocked from config override writes.
 *
 *  Depth-2 paths (`interface.mcpServers`) return `true` because writing a bare
 *  composite field would include permission sub-keys — callers should write
 *  individual sub-key paths instead (e.g. `interface.mcpServers.placeholder`).
 *  Use `stripInterfacePermissionFields` when handling full interface objects.
 *
 *  - `interface.prompts` → true (boolean permission field, fully blocked)
 *  - `interface.mcpServers` → true (bare composite path, blocked)
 *  - `interface.mcpServers.use` → true (permission sub-key, blocked)
 *  - `interface.mcpServers.placeholder` → false (UI sub-key, allowed)
 *  - `interface.peoplePicker.users` → true (permission sub-key, blocked)
 *  - `interface.schedules` → false (runtime enable toggle, see `RUNTIME_CONFIG_INTERFACE_FIELDS`)
 *  - `interface.schedules.use` → true (permission sub-key, blocked)
 *  - `interface.endpointsMenu` → false (pure UI field) */
export function isInterfacePermissionPath(fieldPath: string): boolean {
  const segments = fieldPath.split('.');
  if (segments[0] !== 'interface' || segments.length < 2) return false;
  if (!INTERFACE_PERMISSION_FIELDS.has(segments[1])) return false;
  // Bare field path (e.g. `interface.prompts` or `interface.mcpServers`) —
  // blocked because writing the whole field could include permission bits,
  // except dual-purpose runtime fields whose bare value is a feature toggle.
  if (segments.length === 2) return !RUNTIME_CONFIG_INTERFACE_FIELDS.has(segments[1]);
  // Sub-key path — only block if the sub-key is a permission bit
  return PERMISSION_SUB_KEYS.has(segments[2]);
}

/** Strips permission fields and permission sub-keys from an interface config
 *  object. Boolean permission fields are removed entirely; composite permission
 *  fields have their permission sub-keys stripped while UI sub-keys pass through.
 *
 *  Runtime fields (`RUNTIME_CONFIG_INTERFACE_FIELDS`) mirror LibreChat's override
 *  sanitizer: the boolean form is a feature toggle and is preserved, and an object
 *  with `use: false` collapses to `false` so stripping `use` cannot re-enable it. */
export function stripInterfacePermissionFields(
  obj: Partial<TInterfaceConfig>,
): Partial<TInterfaceConfig> {
  const result: Partial<TInterfaceConfig> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!INTERFACE_PERMISSION_FIELDS.has(key)) {
      (result as Record<string, unknown>)[key] = value;
      continue;
    }
    const isRuntimeField = RUNTIME_CONFIG_INTERFACE_FIELDS.has(key);
    if (isRuntimeField && typeof value === 'boolean') {
      (result as Record<string, unknown>)[key] = value;
      continue;
    }
    if (isRuntimeField && (value as Record<string, unknown> | null)?.use === false) {
      (result as Record<string, unknown>)[key] = false;
      continue;
    }
    // Composite field — strip permission sub-keys, keep UI sub-keys
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const filtered: Record<string, unknown> = {};
      let hasKeys = false;
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        if (!PERMISSION_SUB_KEYS.has(subKey)) {
          filtered[subKey] = subValue;
          hasKeys = true;
        }
      }
      if (hasKeys) (result as Record<string, unknown>)[key] = filtered;
    }
    // Boolean / non-object permission fields are fully dropped (no else needed)
  }
  return result;
}

/** Filters a schema tree's interface children, removing boolean permission fields
 *  entirely and stripping permission sub-key children from composite fields.
 *  Returns only fields/sub-fields that are editable in config overrides. */
export function filterInterfacePermissionChildren(children: t.SchemaField[]): t.SchemaField[] {
  return children.reduce<t.SchemaField[]>((acc, child) => {
    if (!INTERFACE_PERMISSION_FIELDS.has(child.key)) {
      acc.push(child);
    } else if (child.children) {
      const uiChildren = child.children.filter((c) => !PERMISSION_SUB_KEYS.has(c.key));
      if (uiChildren.length > 0) {
        acc.push({ ...child, children: uiChildren });
      }
    }
    return acc;
  }, []);
}
