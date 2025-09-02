/**
 * Gets a nested property value from an object using dot notation
 */
export function getNested(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o && k in o ? o[k] : undefined), obj);
}

/**
 * Creates a values map from settings groups and overrides object
 */
export function createValuesMap(overrides: Record<string, unknown> | undefined, settingGroups: any[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const group of settingGroups) {
    for (const setting of group.settings) {
      const value = getNested(overrides, setting.key);
      map[setting.key] = value !== undefined ? value : setting.defaultValue;
    }
  }
  return map;
}

/**
 * Formats a numeric value with thousands separators for readability
 */
export function formatNumber(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    return String(value);
  }
  return num.toLocaleString('en-US');
} 