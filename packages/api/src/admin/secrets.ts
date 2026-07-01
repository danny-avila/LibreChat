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

/**
 * Returns a new field map with secret-registered entries encrypted and their
 * fingerprint companions set. Empty or already-encrypted values are left as-is.
 */
export function encryptConfigSecretFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...fields };
  for (const path of ENCRYPTED_CONFIG_FIELD_PATHS) {
    const value = result[path];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith(ENCRYPTED_PREFIX)) {
      continue;
    }
    result[path] = encryptV3(value);
    const fingerprintPath = FINGERPRINT_PATHS[path];
    if (fingerprintPath) {
      result[fingerprintPath] = fingerprint(value);
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
