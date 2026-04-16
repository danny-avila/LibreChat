/** Extracts a string field from tool call args, handling object, JSON string, and partial-JSON fallback. */
export default function parseJsonField(
  args: string | Record<string, unknown> | undefined,
  field: string,
): string {
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
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const match = args?.match(re);
  if (!match) {
    return '';
  }
  return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}
