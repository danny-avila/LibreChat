export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type JsonObjectResult = { ok: true; value: JsonObject } | { ok: false; message: string };

export const parseJson = <T>(body: string): T | null => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
};

/** Keeps the parser's own message, which names the offending line and column. */
export const parseJsonObject = (body: string): JsonObjectResult => {
  if (!body.trim()) {
    return { ok: false, message: 'The editor is empty. Use {} for an override with no sections.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'That is not valid JSON.',
    };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'Overrides must be a JSON object, not an array or a bare value.' };
  }
  return { ok: true, value: parsed as JsonObject };
};
