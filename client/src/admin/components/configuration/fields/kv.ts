import type * as t from '~/admin/types';

export function inferKVType(v: t.ConfigValue): t.KVValueType {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'object' && v !== null) return 'json';
  return 'string';
}

export function toKVPair(k: string, v: t.ConfigValue): t.KeyValuePair {
  const valueType = inferKVType(v);
  if (valueType === 'json') return { key: k, value: JSON.stringify(v, null, 2), valueType };
  return { key: k, value: typeof v === 'string' ? v : String(v ?? ''), valueType };
}
