import type * as t from '~/admin/types';

/** Keys whose values are long free text or addresses: URLs, prompts, templates, patterns. */
const LONG_VALUE_KEY = /(url|uri|prompt|template|instructions|message|content|description|text)$/i;

/**
 * Control width token for a field without `FieldMeta.width` (VS-6): L for
 * URL- and prompt-like keys, S for numeric values. Otherwise undefined, and the
 * row sizes by control type (number inputs S, everything else M).
 */
export function inferControlWidth(
  path: string | undefined,
  value: t.ConfigValue | undefined,
): t.ControlWidth | undefined {
  const key = path?.slice(path.lastIndexOf('.') + 1) ?? '';
  if (LONG_VALUE_KEY.test(key)) return 'L';
  if (typeof value === 'number') return 'S';
  return undefined;
}
