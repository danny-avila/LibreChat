import { encryptV3, decryptV3, logger } from '@librechat/data-schemas';

/**
 * Dot-path config fields whose values are secrets. They are encrypted at rest
 * before being written and are never returned by admin config reads. Add paths
 * here to extend per-field encryption to other config sections.
 */
const ENCRYPTED_CONFIG_FIELD_PATHS = new Set<string>(['langfuse.secretKey']);

/**
 * For each secret path, a sibling path holding a short non-secret display value.
 * This mirrors Langfuse's API key UI: keep the first six and last four
 * characters, and never return the full secret on reads.
 */
const DISPLAY_SECRET_PATHS: Record<string, string> = {
  'langfuse.secretKey': 'langfuse.displaySecretKey',
};
const SECRET_PATHS_BY_DISPLAY_SECRET: Record<string, string> = Object.fromEntries(
  Object.entries(DISPLAY_SECRET_PATHS).map(([secretPath, displaySecretPath]) => [
    displaySecretPath,
    secretPath,
  ]),
);

const ENCRYPTED_PREFIX = 'v3:';

export function getDisplaySecretKey(secret: string): string {
  return secret.slice(0, 6) + '...' + secret.slice(-4);
}

function normalizeSecretString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function decryptConfigSecret(value: unknown): string | undefined {
  const normalized = normalizeSecretString(value);
  if (!normalized || !normalized.startsWith(ENCRYPTED_PREFIX)) {
    return undefined;
  }
  try {
    return decryptV3(normalized);
  } catch (error) {
    logger.warn('[adminConfig] Failed to decrypt config secret', error);
    return undefined;
  }
}

export function getConfigSecretMutationPaths(fieldPath: string): string[] {
  const displaySecretPath = DISPLAY_SECRET_PATHS[fieldPath];
  if (displaySecretPath) {
    return [fieldPath, displaySecretPath];
  }
  const secretPath = SECRET_PATHS_BY_DISPLAY_SECRET[fieldPath];
  if (secretPath) {
    return [secretPath, fieldPath];
  }
  return [fieldPath];
}

export function isConfigSecretDescendantPath(fieldPath: string): boolean {
  const protectedPaths = [...ENCRYPTED_CONFIG_FIELD_PATHS, ...Object.values(DISPLAY_SECRET_PATHS)];
  return protectedPaths.some((path) => fieldPath.startsWith(`${path}.`));
}

export function isConfigSecretAncestorPath(fieldPath: string): boolean {
  return [...ENCRYPTED_CONFIG_FIELD_PATHS].some((path) => path.startsWith(`${fieldPath}.`));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function deleteLiteralDottedKey(root: unknown, path: string): void {
  if (!path.includes('.') || !isRecord(root)) {
    return;
  }
  delete root[path];
}

function deleteArrayAncestor(root: unknown, path: string): void {
  if (!isRecord(root)) {
    return;
  }
  const segments = path.split('.');
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const next = cursor[segment];
    if (Array.isArray(next)) {
      delete cursor[segment];
      return;
    }
    if (!isRecord(next)) {
      return;
    }
    cursor = next;
  }
}

function getNestedValue(root: unknown, path: string): unknown {
  const segments = path.split('.');
  let cursor = root;
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function setNestedValue(root: unknown, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = root as Record<string, unknown>;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const next = cursor[segment];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

function deleteNestedValue(root: unknown, path: string): void {
  const segments = path.split('.');
  let cursor = root as Record<string, unknown>;
  for (let i = 0; i < segments.length - 1; i++) {
    const next = cursor[segments[i]];
    if (next == null || typeof next !== 'object') {
      return;
    }
    cursor = next as Record<string, unknown>;
  }
  delete cursor[segments[segments.length - 1]];
}

function getRelativeSecretPath(secretPath: string, basePath = ''): string | null {
  if (basePath.length === 0) {
    return secretPath;
  }
  if (secretPath.startsWith(`${basePath}.`)) {
    return secretPath.slice(basePath.length + 1);
  }
  return null;
}

/**
 * Returns a new field map with secret-registered entries encrypted and their
 * displaySecretKey companions set. Empty values reset the secret and displaySecretKey.
 */
export function encryptConfigSecretFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...fields };
  for (const [fieldPath, fieldValue] of Object.entries(result)) {
    if (!isConfigSecretAncestorPath(fieldPath)) {
      continue;
    }
    if (Array.isArray(fieldValue)) {
      delete result[fieldPath];
      continue;
    }
    if (fieldValue != null && typeof fieldValue === 'object') {
      result[fieldPath] = encryptConfigSecrets(fieldValue, fieldPath);
    }
  }

  for (const path of ENCRYPTED_CONFIG_FIELD_PATHS) {
    const value = result[path];
    const displaySecretPath = DISPLAY_SECRET_PATHS[path];

    if (!(path in result) && displaySecretPath && displaySecretPath in result) {
      delete result[displaySecretPath];
    }

    if (value !== undefined && typeof value !== 'string') {
      result[path] = '';
      if (displaySecretPath) {
        result[displaySecretPath] = '';
      }
      continue;
    }
    if (typeof value !== 'string') {
      continue;
    }
    if (value.length === 0) {
      result[path] = '';
      if (displaySecretPath) {
        result[displaySecretPath] = '';
      }
      continue;
    }
    if (value.startsWith(ENCRYPTED_PREFIX)) {
      result[path] = '';
      if (displaySecretPath) {
        result[displaySecretPath] = '';
      }
      continue;
    }
    result[path] = encryptV3(value);
    if (displaySecretPath) {
      result[displaySecretPath] = getDisplaySecretKey(value);
    }
  }
  return result;
}

/**
 * Returns a cloned config override object with registered nested secret values
 * encrypted before full-document writes. Empty secrets reset their displaySecretKey.
 */
export function encryptConfigSecrets<T>(root: T, basePath = ''): T {
  if (root == null || typeof root !== 'object') {
    return root;
  }

  const result = structuredClone(root);
  for (const path of ENCRYPTED_CONFIG_FIELD_PATHS) {
    const relativePath = getRelativeSecretPath(path, basePath);
    if (relativePath == null || relativePath.length === 0) {
      continue;
    }
    const displaySecretPath = DISPLAY_SECRET_PATHS[path];
    const relativeDisplaySecretPath = displaySecretPath
      ? getRelativeSecretPath(displaySecretPath, basePath)
      : null;
    deleteLiteralDottedKey(result, relativePath);
    if (relativeDisplaySecretPath) {
      deleteLiteralDottedKey(result, relativeDisplaySecretPath);
    }
    deleteArrayAncestor(result, relativePath);
    const value = getNestedValue(result, relativePath);
    if (value === undefined) {
      if (relativeDisplaySecretPath) {
        deleteNestedValue(result, relativeDisplaySecretPath);
      }
      continue;
    }
    if (value !== undefined && typeof value !== 'string') {
      setNestedValue(result, relativePath, '');
      if (relativeDisplaySecretPath) {
        setNestedValue(result, relativeDisplaySecretPath, '');
      }
      continue;
    }
    if (typeof value !== 'string') {
      continue;
    }
    if (value.length === 0) {
      setNestedValue(result, relativePath, '');
      if (relativeDisplaySecretPath) {
        setNestedValue(result, relativeDisplaySecretPath, '');
      }
      continue;
    }
    if (value.startsWith(ENCRYPTED_PREFIX)) {
      setNestedValue(result, relativePath, '');
      if (relativeDisplaySecretPath) {
        setNestedValue(result, relativeDisplaySecretPath, '');
      }
      continue;
    }
    setNestedValue(result, relativePath, encryptV3(value));
    if (relativeDisplaySecretPath) {
      setNestedValue(result, relativeDisplaySecretPath, getDisplaySecretKey(value));
    }
  }
  return result;
}

/**
 * Preserves an existing encrypted secret when a whole secret ancestor object is
 * replaced without a secret value. This lets redacted admin reads round-trip
 * safely: omitting a secret keeps it, while setting it to an empty value clears
 * it.
 */
export function preserveConfigSecrets<T>(next: T, existing?: unknown, basePath = ''): T {
  if (
    next == null ||
    typeof next !== 'object' ||
    existing == null ||
    typeof existing !== 'object'
  ) {
    return next;
  }

  const result = structuredClone(next);
  for (const path of ENCRYPTED_CONFIG_FIELD_PATHS) {
    const relativePath = getRelativeSecretPath(path, basePath);
    if (relativePath == null || relativePath.length === 0) {
      continue;
    }

    const segments = relativePath.split('.');
    const leaf = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join('.');
    const parent = parentPath ? getNestedValue(result, parentPath) : result;
    if (!isRecord(parent) || leaf in parent) {
      continue;
    }

    const existingValue = normalizeSecretString(getNestedValue(existing, path));
    if (!existingValue || !existingValue.startsWith(ENCRYPTED_PREFIX)) {
      continue;
    }

    const displaySecretPath = DISPLAY_SECRET_PATHS[path];
    const relativeDisplaySecretPath = displaySecretPath
      ? getRelativeSecretPath(displaySecretPath, basePath)
      : null;
    setNestedValue(result, relativePath, existingValue);
    if (relativeDisplaySecretPath) {
      const existingDisplaySecret = getNestedValue(existing, displaySecretPath);
      if (typeof existingDisplaySecret === 'string') {
        setNestedValue(result, relativeDisplaySecretPath, existingDisplaySecret);
      }
    }
  }
  return result;
}

/**
 * Deletes secret-registered fields from `root` in place so admin reads never
 * return secret values (encrypted or otherwise). Display companions are
 * preserved. The caller passes a cloned object.
 */
export function redactConfigSecrets<T>(root: T): T {
  if (root == null || typeof root !== 'object') {
    return root;
  }
  for (const path of ENCRYPTED_CONFIG_FIELD_PATHS) {
    deleteLiteralDottedKey(root, path);
    const displaySecretPath = DISPLAY_SECRET_PATHS[path];
    if (displaySecretPath) {
      deleteLiteralDottedKey(root, displaySecretPath);
    }
    deleteArrayAncestor(root, path);
    deleteNestedValue(root, path);
  }
  return root;
}
