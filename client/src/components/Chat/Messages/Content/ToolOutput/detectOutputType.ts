export enum OutputType {
  ERROR = 'error',
  TABLE = 'table',
  TEXT = 'text',
}

const ERROR_PATTERNS = [
  /\berror\b/i,
  /\btraceback\b/i,
  /\bexception\b/i,
  /^Error:/m,
  /\bfailed\b.*\b(to|with)\b/i,
];

function isUniformObjectArray(parsed: unknown): parsed is Record<string, unknown>[] {
  if (!Array.isArray(parsed) || parsed.length < 2) {
    return false;
  }
  const first = parsed[0];
  if (typeof first !== 'object' || first === null || Array.isArray(first)) {
    return false;
  }
  const keys = Object.keys(first).sort().join(',');
  for (let i = 1; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return false;
    }
    if (Object.keys(item).sort().join(',') !== keys) {
      return false;
    }
  }
  return true;
}

export interface DetectedOutput {
  type: OutputType;
  parsed?: unknown;
}

export function detectOutputType(text: string): DetectedOutput {
  if (!text || text.trim().length === 0) {
    return { type: OutputType.TEXT };
  }

  const trimmed = text.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isUniformObjectArray(parsed)) {
        return { type: OutputType.TABLE, parsed };
      }
    } catch {
      // Not valid JSON, continue
    }
  }

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { type: OutputType.ERROR };
    }
  }

  return { type: OutputType.TEXT };
}
