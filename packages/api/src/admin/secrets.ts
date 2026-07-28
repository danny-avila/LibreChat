import isPlainObject from 'lodash/isPlainObject';
import { encryptV3, decryptV3, logger } from '@librechat/data-schemas';

const LANGFUSE_SECTION = 'langfuse';
const LANGFUSE_SECRET_KEY = 'secretKey';
const LANGFUSE_DISPLAY_SECRET_KEY = 'displaySecretKey';
const LANGFUSE_SECRET_PATH = `${LANGFUSE_SECTION}.${LANGFUSE_SECRET_KEY}`;
const LANGFUSE_DISPLAY_SECRET_PATH = `${LANGFUSE_SECTION}.${LANGFUSE_DISPLAY_SECRET_KEY}`;
const ENCRYPTED_PREFIX = 'v3:';

export function getDisplaySecretKey(secret: string): string {
  return secret.slice(0, 6) + '...' + secret.slice(-4);
}

function normalizeSecretString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function isEncryptedConfigSecret(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith(ENCRYPTED_PREFIX);
}

function getPlainRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? (value as Record<string, unknown>) : null;
}

function getLangfuseSection(root: unknown, basePath = ''): Record<string, unknown> | null {
  const rootRecord = getPlainRecord(root);
  if (!rootRecord) {
    return null;
  }
  if (basePath === LANGFUSE_SECTION) {
    return rootRecord;
  }
  return getPlainRecord(rootRecord[LANGFUSE_SECTION]);
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
  if (fieldPath === LANGFUSE_SECRET_PATH) {
    return [LANGFUSE_SECRET_PATH, LANGFUSE_DISPLAY_SECRET_PATH];
  }
  return [fieldPath];
}

export function isConfigSecretDescendantPath(fieldPath: string): boolean {
  return (
    fieldPath.startsWith(`${LANGFUSE_SECRET_PATH}.`) ||
    fieldPath.startsWith(`${LANGFUSE_DISPLAY_SECRET_PATH}.`)
  );
}

export function isConfigSecretAncestorPath(fieldPath: string): boolean {
  return fieldPath === LANGFUSE_SECTION;
}

export function getConfigSecretInputError(fieldPath: string, value: unknown): string | null {
  if (fieldPath === LANGFUSE_DISPLAY_SECRET_PATH) {
    return `Cannot write protected display secret path: ${fieldPath}`;
  }
  if (fieldPath === LANGFUSE_SECRET_PATH && isEncryptedConfigSecret(value)) {
    return `Encrypted config secret values cannot be submitted: ${fieldPath}`;
  }
  const langfuseInput = fieldPath === LANGFUSE_SECTION ? getPlainRecord(value) : null;
  if (langfuseInput && isEncryptedConfigSecret(langfuseInput[LANGFUSE_SECRET_KEY])) {
    return `Encrypted config secret values cannot be submitted: ${LANGFUSE_SECRET_PATH}`;
  }
  return null;
}

function removeLangfuseArraySection(root: Record<string, unknown>): boolean {
  if (Array.isArray(root[LANGFUSE_SECTION])) {
    delete root[LANGFUSE_SECTION];
    return true;
  }
  return false;
}

function applyLangfuseSecretWrite(section: Record<string, unknown>): void {
  if (!(LANGFUSE_SECRET_KEY in section)) {
    delete section[LANGFUSE_DISPLAY_SECRET_KEY];
    return;
  }

  const value = section[LANGFUSE_SECRET_KEY];
  if (typeof value !== 'string' || value.length === 0 || value.startsWith(ENCRYPTED_PREFIX)) {
    section[LANGFUSE_SECRET_KEY] = '';
    section[LANGFUSE_DISPLAY_SECRET_KEY] = '';
    return;
  }

  section[LANGFUSE_SECRET_KEY] = encryptV3(value);
  section[LANGFUSE_DISPLAY_SECRET_KEY] = getDisplaySecretKey(value);
}

/**
 * Returns a new field map with Langfuse secret entries encrypted and their
 * displaySecretKey companion set. Empty values reset the secret and displaySecretKey.
 */
export function encryptConfigSecretFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...fields };

  if (Array.isArray(result[LANGFUSE_SECTION])) {
    delete result[LANGFUSE_SECTION];
  } else {
    const section = getPlainRecord(result[LANGFUSE_SECTION]);
    if (section) {
      result[LANGFUSE_SECTION] = encryptConfigSecrets(section, LANGFUSE_SECTION);
    }
  }

  if (!(LANGFUSE_SECRET_PATH in result) && LANGFUSE_DISPLAY_SECRET_PATH in result) {
    delete result[LANGFUSE_DISPLAY_SECRET_PATH];
  }

  if (LANGFUSE_SECRET_PATH in result) {
    const value = result[LANGFUSE_SECRET_PATH];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith(ENCRYPTED_PREFIX)) {
      result[LANGFUSE_SECRET_PATH] = '';
      result[LANGFUSE_DISPLAY_SECRET_PATH] = '';
    } else {
      result[LANGFUSE_SECRET_PATH] = encryptV3(value);
      result[LANGFUSE_DISPLAY_SECRET_PATH] = getDisplaySecretKey(value);
    }
  }

  return result;
}

/**
 * Returns a cloned config override object with Langfuse secret values encrypted
 * before full-document writes. Empty secrets reset their displaySecretKey.
 */
export function encryptConfigSecrets<T>(root: T, basePath = ''): T {
  if (root == null || typeof root !== 'object') {
    return root;
  }

  const result = structuredClone(root);
  if (basePath === '') {
    delete (result as Record<string, unknown>)[LANGFUSE_SECRET_PATH];
    delete (result as Record<string, unknown>)[LANGFUSE_DISPLAY_SECRET_PATH];
    removeLangfuseArraySection(result as Record<string, unknown>);
  }

  const section = getLangfuseSection(result, basePath);
  if (section) {
    applyLangfuseSecretWrite(section);
  }
  return result;
}

/**
 * Preserves an existing encrypted Langfuse secret when a whole Langfuse object is
 * replaced without a secret value. This lets redacted admin reads round-trip
 * safely: omitting a secret keeps it, while setting it to an empty value clears it.
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
  const section = getLangfuseSection(result, basePath);
  const existingSection = getLangfuseSection(existing);
  if (
    !section ||
    !existingSection ||
    LANGFUSE_SECRET_KEY in section ||
    !isEncryptedConfigSecret(existingSection[LANGFUSE_SECRET_KEY])
  ) {
    return result;
  }

  const existingSecret = normalizeSecretString(existingSection[LANGFUSE_SECRET_KEY]);
  if (!existingSecret) {
    return result;
  }
  section[LANGFUSE_SECRET_KEY] = existingSecret;
  if (typeof existingSection[LANGFUSE_DISPLAY_SECRET_KEY] === 'string') {
    section[LANGFUSE_DISPLAY_SECRET_KEY] = existingSection[LANGFUSE_DISPLAY_SECRET_KEY];
  }
  return result;
}

/**
 * Deletes Langfuse secret fields from `root` in place so admin reads never
 * return secret values (encrypted or otherwise). Display companions are preserved.
 * The caller passes a cloned object.
 */
export function redactConfigSecrets<T>(root: T): T {
  const rootRecord = getPlainRecord(root);
  if (!rootRecord) {
    return root;
  }
  delete rootRecord[LANGFUSE_SECRET_PATH];
  delete rootRecord[LANGFUSE_DISPLAY_SECRET_PATH];
  if (Array.isArray(rootRecord[LANGFUSE_SECTION])) {
    delete rootRecord[LANGFUSE_SECTION];
    return root;
  }
  const section = getPlainRecord(rootRecord[LANGFUSE_SECTION]);
  if (section) {
    delete section[LANGFUSE_SECRET_KEY];
  }
  return root;
}
