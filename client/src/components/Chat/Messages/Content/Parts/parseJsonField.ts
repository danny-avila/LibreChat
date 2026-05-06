type ToolCallArgs = string | Record<string, unknown> | undefined;

export function areToolCallArgsComplete(args: ToolCallArgs): boolean {
  if (typeof args === 'object' && args !== null) {
    return true;
  }
  if (typeof args !== 'string' || args.trim().length === 0) {
    return false;
  }
  try {
    const parsed = JSON.parse(args);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/** Extracts a string field from tool call args, handling object, JSON string, and partial-JSON fallback. */
export default function parseJsonField(args: ToolCallArgs, field: string): string {
  if (typeof args === 'object' && args !== null) {
    return String(args[field] ?? '');
  }
  try {
    const parsed = JSON.parse(args || '{}');
    if (typeof parsed === 'object' && parsed !== null) {
      return String(parsed[field] ?? '');
    }
  } catch {
    // partial JSON during streaming; fall through to regex
  }
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`"${escaped}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const match = args?.match(re);
  if (!match) {
    return '';
  }
  return match[1].replace(/\\(.)/g, (_, c: string) => {
    if (c === 'n') {
      return '\n';
    }
    if (c === '"' || c === '\\') {
      return c;
    }
    return `\\${c}`;
  });
}
