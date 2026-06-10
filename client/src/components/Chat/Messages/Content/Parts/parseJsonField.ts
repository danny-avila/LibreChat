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

/** Matches `"field":"value"`, tolerating a missing closing quote and a dangling escape at the end of partially streamed args. */
function fieldRegex(field: string, flags?: string): RegExp {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`"${escaped}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)(?:"|\\\\?$)`, flags);
}

function unescapeJsonString(value: string): string {
  return value.replace(/\\(.)/g, (_, c: string) => {
    if (c === 'n') {
      return '\n';
    }
    if (c === '"' || c === '\\') {
      return c;
    }
    return `\\${c}`;
  });
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
  const match = args?.match(fieldRegex(field));
  if (!match) {
    return '';
  }
  return unescapeJsonString(match[1]);
}

/** Extracts every occurrence of a string field from partially streamed JSON args, in document order. */
export function parseJsonFieldOccurrences(args: ToolCallArgs, field: string): string[] {
  if (typeof args !== 'string' || args.length === 0) {
    return [];
  }
  return Array.from(args.matchAll(fieldRegex(field, 'g')), (match) => unescapeJsonString(match[1]));
}
