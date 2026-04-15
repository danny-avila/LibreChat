import type { ParsedInput, ParsedOutput, QueryMetrics, CostEntry } from './types';

export function parseInput(raw: string): ParsedInput {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const query = (parsed.query ?? parsed.sql) as string | undefined;
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key !== 'query' && key !== 'sql') {
        params[key] = String(value);
      }
    }
    return { query, params };
  } catch {
    return { params: {} };
  }
}

export function extractMetrics(obj: Record<string, unknown>): QueryMetrics | undefined {
  const stats = obj.statistics as Record<string, unknown> | undefined;
  const rows = obj.rows as number | undefined;
  if (!stats && rows === undefined) {
    return undefined;
  }
  return {
    elapsed: stats?.elapsed as number | undefined,
    rowsRead: stats?.rows_read as number | undefined,
    bytesRead: stats?.bytes_read as number | undefined,
    totalRows: rows as number | undefined,
  };
}

export function parseErrorMessage(message: string): string {
  const jsonMatch = message.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return message;
  }
  try {
    const inner = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const error = inner.error ?? inner.message ?? inner.detail;
    if (typeof error === 'string') {
      const statusCode = inner.status ?? message.match(/HTTP (\d+)/)?.[1];
      return statusCode ? `${statusCode}: ${error}` : error;
    }
  } catch {
    // fall through
  }
  return message;
}

export function unwrapData(obj: Record<string, unknown>): unknown {
  if (Array.isArray(obj.data) && obj.data.length > 0 && typeof obj.data[0] === 'object') {
    return obj.data;
  }
  const entries = Object.entries(obj);
  const arrays = entries.filter(
    ([, v]) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null,
  );
  const scalars = entries.filter(
    ([k, v]) => k !== 'status' && !Array.isArray(v) && (typeof v !== 'object' || v === null),
  );
  if (arrays.length === 1 && scalars.length <= 2) {
    return arrays[0][1];
  }
  return obj;
}

export function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'statistics' || key === 'rows') {
      continue;
    }
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

export function parseOutput(raw: string): ParsedOutput {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const formatted = JSON.stringify(parsed, null, 2);
    const errVal = parsed.error ?? parsed.Error;
    if (errVal && typeof errVal === 'string') {
      return { error: true, errorMessage: errVal, raw: formatted };
    }
    const result = (parsed.result ?? parsed) as Record<string, unknown>;
    if (result.status === 'error') {
      return {
        error: true,
        errorMessage: parseErrorMessage(String(result.message ?? '')),
        raw: formatted,
      };
    }
    const metrics = extractMetrics(result);
    if (typeof result.grandTotalCHC === 'number' && Array.isArray(result.costs)) {
      return {
        error: false,
        costData: {
          grandTotalCHC: result.grandTotalCHC,
          costs: result.costs as CostEntry[],
        },
        metrics,
        raw: formatted,
      };
    }
    const data = unwrapData(result);
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      return { error: false, rows: data as Record<string, unknown>[], metrics, raw: formatted };
    }
    if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
      const cleaned = { ...result };
      delete cleaned.status;
      delete cleaned.statistics;
      delete cleaned.rows;
      const keys = Object.keys(cleaned);
      const isFlat =
        keys.length > 0 &&
        keys.every((k) => {
          const v = cleaned[k];
          return v === null || typeof v !== 'object' || Array.isArray(v);
        });
      if (isFlat) {
        return {
          error: false,
          rows: [cleaned] as Record<string, unknown>[],
          metrics,
          raw: formatted,
        };
      }
      const kv = flattenObject(result);
      delete kv.status;
      return { error: false, keyValue: kv, metrics, raw: formatted };
    }
    return { error: false, metrics, raw: formatted };
  } catch {
    return { error: false, raw: formatJson(raw) };
  }
}

export function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function formatElapsed(seconds: number): string {
  if (seconds < 0.001) {
    return `${(seconds * 1_000_000).toFixed(0)}µs`;
  }
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(1)}ms`;
  }
  return `${seconds.toFixed(3)}s`;
}

export function formatBytes(bytes: number): string {
  const KB = 1000;
  const MB = KB * KB;
  const GB = MB * KB;
  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(2)} GB`;
  }
  if (bytes >= MB) {
    return `${(bytes / MB).toFixed(2)} MB`;
  }
  return `${(bytes / KB).toFixed(2)} KB`;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function getRowLabel(row: Record<string, unknown>): string {
  for (const key of ['name', 'title', 'label', 'id']) {
    if (typeof row[key] === 'string') {
      return row[key] as string;
    }
  }
  return 'Item';
}
