import crypto from 'node:crypto';
import { encryptV3 } from '@librechat/data-schemas';

/**
 * Dot-path config fields whose values are secrets. They are encrypted at rest
 * before being written and are never returned by admin config reads. Add paths
 * here to extend per-field encryption to other config sections.
 */
export const ENCRYPTED_CONFIG_FIELD_PATHS = new Set<string>(['langfuse.secretKey']);

/**
 * For each secret path, a sibling path holding a short non-secret fingerprint so
 * reads can show whether (and which) key is configured without exposing it.
 */
const FINGERPRINT_PATHS: Record<string, string> = {
  'langfuse.secretKey': 'langfuse.secretKeyFingerprint',
};

const FINGERPRINT_LENGTH = 12;
const ENCRYPTED_PREFIX = 'v3:';

function fingerprint(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, FINGERPRINT_LENGTH);
}

export function getConfigSecretFingerprintPath(fieldPath: string): string | undefined {
  return FINGERPRINT_PATHS[fieldPath];
}

export function isConfigSecretDescendantPath(fieldPath: string): boolean {
  const protectedPaths = [...ENCRYPTED_CONFIG_FIELD_PATHS, ...Object.values(FINGERPRINT_PATHS)];
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
  if (secretPath === basePath) {
    return '';
  }
  if (secretPath.startsWith(`${basePath}.`)) {
    return secretPath.slice(basePath.length + 1);
  }
  return null;
}

/**
 * Returns a new field map with secret-registered entries encrypted and their
 * fingerprint companions set. Empty values reset the secret and fingerprint.
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
    const fingerprintPath = FINGERPRINT_PATHS[path];

    if (!(path in result) && fingerprintPath && fingerprintPath in result) {
      delete result[fingerprintPath];
    }

    if (value !== undefined && typeof value !== 'string') {
      result[path] = '';
      if (fingerprintPath) {
        result[fingerprintPath] = '';
      }
      continue;
    }
    if (typeof value !== 'string') {
      continue;
    }
    if (value.length === 0) {
      result[path] = '';
      if (fingerprintPath) {
        result[fingerprintPath] = '';
      }
      continue;
    }
    if (value.startsWith(ENCRYPTED_PREFIX)) {
      result[path] = '';
      if (fingerprintPath) {
        result[fingerprintPath] = '';
      }
      continue;
    }
    result[path] = encryptV3(value);
    if (fingerprintPath) {
      result[fingerprintPath] = fingerprint(value);
    }
  }
  return result;
}

/**
 * Returns a cloned config override object with registered nested secret values
 * encrypted before full-document writes. Empty secrets reset their fingerprint.
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
    const fingerprintPath = FINGERPRINT_PATHS[path];
    const relativeFingerprintPath = fingerprintPath
      ? getRelativeSecretPath(fingerprintPath, basePath)
      : null;
    deleteLiteralDottedKey(result, relativePath);
    if (relativeFingerprintPath) {
      deleteLiteralDottedKey(result, relativeFingerprintPath);
    }
    deleteArrayAncestor(result, relativePath);
    const value = getNestedValue(result, relativePath);
    if (value === undefined) {
      if (relativeFingerprintPath) {
        deleteNestedValue(result, relativeFingerprintPath);
      }
      continue;
    }
    if (value !== undefined && typeof value !== 'string') {
      setNestedValue(result, relativePath, '');
      if (relativeFingerprintPath) {
        setNestedValue(result, relativeFingerprintPath, '');
      }
      continue;
    }
    if (typeof value !== 'string') {
      continue;
    }
    if (value.length === 0) {
      setNestedValue(result, relativePath, '');
      if (relativeFingerprintPath) {
        setNestedValue(result, relativeFingerprintPath, '');
      }
      continue;
    }
    if (value.startsWith(ENCRYPTED_PREFIX)) {
      setNestedValue(result, relativePath, '');
      if (relativeFingerprintPath) {
        setNestedValue(result, relativeFingerprintPath, '');
      }
      continue;
    }
    setNestedValue(result, relativePath, encryptV3(value));
    if (relativeFingerprintPath) {
      setNestedValue(result, relativeFingerprintPath, fingerprint(value));
    }
  }
  return result;
}

/**
 * Deletes secret-registered fields from `root` in place so admin reads never
 * return secret values (encrypted or otherwise). Fingerprint companions are
 * preserved. The caller passes a cloned object.
 */
export function redactConfigSecrets<T>(root: T): T {
  if (root == null || typeof root !== 'object') {
    return root;
  }
  for (const path of ENCRYPTED_CONFIG_FIELD_PATHS) {
    deleteLiteralDottedKey(root, path);
    const fingerprintPath = FINGERPRINT_PATHS[path];
    if (fingerprintPath) {
      deleteLiteralDottedKey(root, fingerprintPath);
    }
    deleteArrayAncestor(root, path);

    const segments = path.split('.');
    let cursor = root as Record<string, unknown>;
    let reachable = true;
    for (let i = 0; i < segments.length - 1; i++) {
      const next = cursor[segments[i]];
      if (next == null || typeof next !== 'object') {
        reachable = false;
        break;
      }
      cursor = next as Record<string, unknown>;
    }
    const leaf = segments[segments.length - 1];
    if (reachable && leaf in cursor) {
      delete cursor[leaf];
    }
  }
  return root;
}
