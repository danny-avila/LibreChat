import isPlainObject from 'lodash/isPlainObject';
import { encryptV3, decryptV3, logger } from '@librechat/data-schemas';
import { envVarRegex, extractEnvVariable } from 'librechat-data-provider';

const ENCRYPTED_PREFIX = 'v3:';
const ENCRYPTED_PAYLOAD_REGEX = /^v3:[0-9a-f]{32}:[0-9a-f]+$/;

interface ConfigSecretFieldInput {
  /** Dot-path of the secret value within config overrides */
  path: string;
  /** When true, `${ENV_VAR}` placeholder values are stored and returned as plain references instead of being encrypted */
  allowEnvPlaceholder?: boolean;
}

interface ConfigSecretField extends ConfigSecretFieldInput {
  /** Non-secret masked-preview companion, always the sibling `<field>Preview`. Written on encrypt, preserved by redaction. */
  previewPath: string;
}

/**
 * Registry of config fields that hold secret values. Writes through the admin
 * config API encrypt these at rest, reads redact them, and omitting them on a
 * subsequent write preserves the stored encrypted value. Each secret's
 * masked-preview companion is derived as `<path>Preview` — recognizing a new
 * sensitive field is a one-line path addition (plus the `<field>Preview`
 * companion in the config schema).
 */
const CONFIG_SECRET_FIELDS: readonly ConfigSecretField[] = (
  [
    { path: 'langfuse.secretKey' },
    { path: 'ocr.apiKey', allowEnvPlaceholder: true },
    { path: 'speech.tts.openai.apiKey', allowEnvPlaceholder: true },
    { path: 'speech.tts.azureOpenAI.apiKey', allowEnvPlaceholder: true },
    { path: 'speech.tts.elevenlabs.apiKey', allowEnvPlaceholder: true },
    { path: 'speech.tts.localai.apiKey', allowEnvPlaceholder: true },
    { path: 'speech.stt.openai.apiKey', allowEnvPlaceholder: true },
    { path: 'speech.stt.azureOpenAI.apiKey', allowEnvPlaceholder: true },
    { path: 'webSearch.serperApiKey', allowEnvPlaceholder: true },
    { path: 'webSearch.searxngApiKey', allowEnvPlaceholder: true },
    { path: 'webSearch.firecrawlApiKey', allowEnvPlaceholder: true },
    { path: 'webSearch.tavilyApiKey', allowEnvPlaceholder: true },
    { path: 'webSearch.jinaApiKey', allowEnvPlaceholder: true },
    { path: 'webSearch.cohereApiKey', allowEnvPlaceholder: true },
    { path: 'endpoints.assistants.apiKey', allowEnvPlaceholder: true },
    { path: 'endpoints.azureAssistants.apiKey', allowEnvPlaceholder: true },
  ] satisfies ConfigSecretFieldInput[]
).map((field) => ({ ...field, previewPath: `${field.path}Preview` }));

/**
 * Preview companions written under earlier naming conventions. Stripped from
 * writes and reads so stored documents self-clean; never written.
 */
const LEGACY_PREVIEW_PATHS: ReadonlyMap<string, string> = new Map([
  ['langfuse.secretKey', 'langfuse.displaySecretKey'],
]);

const SECRET_FIELDS_BY_PATH = new Map<string, ConfigSecretField>(
  CONFIG_SECRET_FIELDS.map((field) => [field.path, field]),
);

const PREVIEW_PATHS = new Set<string>([
  ...CONFIG_SECRET_FIELDS.map((field) => field.previewPath),
  ...LEGACY_PREVIEW_PATHS.values(),
]);

const ANCESTOR_PATHS = new Set<string>(
  CONFIG_SECRET_FIELDS.flatMap((field) => {
    const segments = field.path.split('.');
    return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('.'));
  }),
);

const SECRET_SECTIONS: readonly string[] = [
  ...new Set(CONFIG_SECRET_FIELDS.map((field) => field.path.split('.')[0])),
];

export function getSecretPreview(secret: string): string {
  if (secret.length <= 10) {
    return '*'.repeat(secret.length);
  }
  return secret.slice(0, 6) + '...' + secret.slice(-4);
}

/** Top-level config sections containing registered secret fields. */
export function getConfigSecretSections(): readonly string[] {
  return SECRET_SECTIONS;
}

function normalizeSecretString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function isEncryptedConfigSecret(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith(ENCRYPTED_PREFIX);
}

function isEnvPlaceholder(value: string): boolean {
  return envVarRegex.test(value.trim());
}

function getPlainRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? (value as Record<string, unknown>) : null;
}

function lastSegment(path: string): string {
  return path.split('.').slice(-1)[0];
}

/**
 * Returns the segments of `path` relative to `basePath`, or null when
 * `basePath` is not an ancestor of `path`. An empty `basePath` yields the
 * full segment list.
 */
function relativeSegments(path: string, basePath: string): string[] | null {
  if (basePath === '') {
    return path.split('.');
  }
  if (!path.startsWith(`${basePath}.`)) {
    return null;
  }
  return path.slice(basePath.length + 1).split('.');
}

/** Walks `root` along all but the last segment, returning the parent record of the final key. */
function walkToParent(root: unknown, segments: string[]): Record<string, unknown> | null {
  let cursor = getPlainRecord(root);
  for (let i = 0; cursor != null && i < segments.length - 1; i++) {
    cursor = getPlainRecord(cursor[segments[i]]);
  }
  return cursor;
}

/**
 * Deletes any array value found along a registered secret's ancestor chain
 * (relative to `basePath`), at any depth, not just the top level. `walkToParent`
 * silently stops and returns null at an array, which would otherwise let a
 * secret smuggled inside an unexpected array-of-objects shape (e.g.
 * `speech.tts.openai` submitted as an array) bypass both encryption and
 * redaction entirely instead of being stripped like a top-level array is.
 */
function pruneSecretAncestorArrays(root: Record<string, unknown>, basePath: string): void {
  for (const field of CONFIG_SECRET_FIELDS) {
    const segments = relativeSegments(field.path, basePath);
    if (!segments) {
      continue;
    }
    let cursor: Record<string, unknown> | null = root;
    for (let i = 0; cursor != null && i < segments.length - 1; i++) {
      const value = cursor[segments[i]];
      if (Array.isArray(value)) {
        delete cursor[segments[i]];
        cursor = null;
        continue;
      }
      cursor = getPlainRecord(value);
    }
  }
}

/** True when a dotted key equals, contains, or is contained by a registered secret or preview path. */
function isConfigSecretRelatedPath(fieldPath: string): boolean {
  if (SECRET_FIELDS_BY_PATH.has(fieldPath) || PREVIEW_PATHS.has(fieldPath)) {
    return true;
  }
  return ANCESTOR_PATHS.has(fieldPath) || isConfigSecretDescendantPath(fieldPath);
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

/**
 * Resolves a config credential for runtime use: decrypts encrypted values and
 * resolves `${ENV_VAR}` placeholders, passing plain literals through unchanged.
 */
/**
 * Whether a value has the exact shape `encryptV3` produces
 * (`v3:<32-hex-iv>:<hex-ciphertext>`). Runtime resolution uses this strict
 * check so a legitimate literal credential that merely starts with `v3:`
 * (e.g. from a YAML config never touched by the admin write path) resolves
 * as a literal instead of failing decryption.
 */
export function isEncryptedSecretPayload(value: string): boolean {
  return ENCRYPTED_PAYLOAD_REGEX.test(value.trim());
}

export function resolveConfigSecret(value?: string): string | undefined {
  if (value == null || value === '') {
    return value;
  }
  if (isEncryptedSecretPayload(value)) {
    return decryptConfigSecret(value);
  }
  return extractEnvVariable(value);
}

export function getConfigSecretMutationPaths(fieldPath: string): string[] {
  const field = SECRET_FIELDS_BY_PATH.get(fieldPath);
  if (field?.previewPath) {
    return [field.path, field.previewPath];
  }
  return [fieldPath];
}

export function isConfigSecretDescendantPath(fieldPath: string): boolean {
  for (const field of CONFIG_SECRET_FIELDS) {
    if (fieldPath.startsWith(`${field.path}.`)) {
      return true;
    }
    if (field.previewPath && fieldPath.startsWith(`${field.previewPath}.`)) {
      return true;
    }
  }
  return false;
}

export function isConfigSecretAncestorPath(fieldPath: string): boolean {
  return ANCESTOR_PATHS.has(fieldPath);
}

export function getConfigSecretInputError(fieldPath: string, value: unknown): string | null {
  if (PREVIEW_PATHS.has(fieldPath)) {
    return `Cannot write protected secret preview path: ${fieldPath}`;
  }
  if (SECRET_FIELDS_BY_PATH.has(fieldPath) && isEncryptedConfigSecret(value)) {
    return `Encrypted config secret values cannot be submitted: ${fieldPath}`;
  }
  if (!isConfigSecretAncestorPath(fieldPath)) {
    return null;
  }
  for (const field of CONFIG_SECRET_FIELDS) {
    const segments = relativeSegments(field.path, fieldPath);
    if (!segments) {
      continue;
    }
    const parent = walkToParent(value, segments);
    if (parent && isEncryptedConfigSecret(parent[segments[segments.length - 1]])) {
      return `Encrypted config secret values cannot be submitted: ${field.path}`;
    }
  }
  return null;
}

function deleteLegacyPreviewKey(section: Record<string, unknown>, field: ConfigSecretField): void {
  const legacyPath = LEGACY_PREVIEW_PATHS.get(field.path);
  if (legacyPath) {
    delete section[lastSegment(legacyPath)];
  }
}

/**
 * Translates a legacy preview companion to its `<field>Preview` name in place,
 * so reads of not-yet-migrated documents still indicate a configured secret.
 * The stored document migrates for real on its next write.
 */
function migrateLegacyPreviewKey(section: Record<string, unknown>, field: ConfigSecretField): void {
  const legacyPath = LEGACY_PREVIEW_PATHS.get(field.path);
  if (!legacyPath) {
    return;
  }
  const legacyValue = section[lastSegment(legacyPath)];
  const previewKey = lastSegment(field.previewPath);
  if (typeof legacyValue === 'string' && section[previewKey] === undefined) {
    section[previewKey] = legacyValue;
  }
  delete section[lastSegment(legacyPath)];
}

/**
 * Encrypts a secret value in place within its parent record. Empty and
 * non-string values reset the secret (and preview companion). Env placeholder
 * values are kept as plain references for fields that allow them.
 */
function writeSecretIntoSection(section: Record<string, unknown>, field: ConfigSecretField): void {
  const key = lastSegment(field.path);
  const previewKey = field.previewPath ? lastSegment(field.previewPath) : undefined;
  deleteLegacyPreviewKey(section, field);
  if (!(key in section)) {
    if (previewKey) {
      delete section[previewKey];
    }
    return;
  }

  const rawValue = section[key];
  if (typeof rawValue !== 'string' || rawValue.startsWith(ENCRYPTED_PREFIX)) {
    section[key] = '';
    if (previewKey) {
      section[previewKey] = '';
    }
    return;
  }
  const value = normalizeSecretString(rawValue);
  if (!value) {
    section[key] = '';
    if (previewKey) {
      section[previewKey] = '';
    }
    return;
  }
  if (field.allowEnvPlaceholder && isEnvPlaceholder(value)) {
    section[key] = value;
    if (previewKey) {
      section[previewKey] = '';
    }
    return;
  }

  section[key] = encryptV3(value);
  if (previewKey) {
    section[previewKey] = getSecretPreview(value);
  }
}

function writeDottedSecret(result: Record<string, unknown>, field: ConfigSecretField): void {
  const rawValue = result[field.path];
  if (typeof rawValue !== 'string' || rawValue.startsWith(ENCRYPTED_PREFIX)) {
    result[field.path] = '';
    if (field.previewPath) {
      result[field.previewPath] = '';
    }
    return;
  }
  const value = normalizeSecretString(rawValue);
  if (!value) {
    result[field.path] = '';
    if (field.previewPath) {
      result[field.previewPath] = '';
    }
    return;
  }
  if (field.allowEnvPlaceholder && isEnvPlaceholder(value)) {
    result[field.path] = value;
    if (field.previewPath) {
      result[field.previewPath] = '';
    }
    return;
  }
  result[field.path] = encryptV3(value);
  if (field.previewPath) {
    result[field.previewPath] = getSecretPreview(value);
  }
}

/**
 * Returns a new field map with registered secret entries encrypted (and preview
 * companions set where configured). Empty values reset the secret and its
 * preview companion. Handles both dotted secret paths and object-valued
 * ancestor entries.
 */
export function encryptConfigSecretFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...fields };

  for (const key of Object.keys(result)) {
    if (!isConfigSecretAncestorPath(key)) {
      continue;
    }
    if (Array.isArray(result[key])) {
      delete result[key];
    } else if (isPlainObject(result[key])) {
      result[key] = encryptConfigSecrets(result[key], key);
    }
  }

  for (const field of CONFIG_SECRET_FIELDS) {
    if (field.previewPath && !(field.path in result) && field.previewPath in result) {
      delete result[field.previewPath];
    }
    if (field.path in result) {
      writeDottedSecret(result, field);
    }
  }

  return result;
}

/**
 * Returns a cloned config object with registered secret values encrypted
 * before writes. Empty secrets reset their preview companions. `basePath`
 * locates `root` within the config tree ('' for whole-overrides writes).
 */
export function encryptConfigSecrets<T>(root: T, basePath = ''): T {
  if (root == null || typeof root !== 'object') {
    return root;
  }

  const result = structuredClone(root);
  const rootRecord = result as Record<string, unknown>;
  if (basePath === '') {
    for (const key of Object.keys(rootRecord)) {
      if (key.includes('.') && isConfigSecretRelatedPath(key)) {
        delete rootRecord[key];
      } else if (isConfigSecretAncestorPath(key) && Array.isArray(rootRecord[key])) {
        delete rootRecord[key];
      }
    }
  }
  pruneSecretAncestorArrays(rootRecord, basePath);

  for (const field of CONFIG_SECRET_FIELDS) {
    const segments = relativeSegments(field.path, basePath);
    if (!segments) {
      continue;
    }
    const section = walkToParent(result, segments);
    if (section) {
      writeSecretIntoSection(section, field);
    }
  }
  return result;
}

/**
 * Preserves existing encrypted secrets when an object write omits them. This
 * lets redacted admin reads round-trip safely: omitting a secret keeps it,
 * while setting it to an empty value clears it. `basePath` locates `next`
 * within the config tree; `existing` is always the full overrides object.
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
  for (const field of CONFIG_SECRET_FIELDS) {
    const segments = relativeSegments(field.path, basePath);
    if (!segments) {
      continue;
    }
    const section = walkToParent(result, segments);
    if (!section) {
      continue;
    }
    const key = segments[segments.length - 1];
    if (key in section) {
      continue;
    }

    const existingSection = walkToParent(existing, field.path.split('.'));
    if (!existingSection) {
      continue;
    }
    const existingSecret = normalizeSecretString(existingSection[key]);
    if (!existingSecret) {
      continue;
    }
    const isAlreadyEncrypted = isEncryptedConfigSecret(existingSecret);
    const isPlaceholder = field.allowEnvPlaceholder && isEnvPlaceholder(existingSecret);
    // A legacy plaintext secret stored before this field was registered has
    // no ciphertext to preserve verbatim — encrypt it now instead of
    // silently dropping it the first time an unrelated field is edited.
    section[key] = isAlreadyEncrypted || isPlaceholder ? existingSecret : encryptV3(existingSecret);
    if (field.previewPath) {
      const previewKey = lastSegment(field.previewPath);
      const legacyPath = LEGACY_PREVIEW_PATHS.get(field.path);
      const legacyPreview = legacyPath ? existingSection[lastSegment(legacyPath)] : undefined;
      const existingPreview = existingSection[previewKey] ?? legacyPreview;
      if (typeof existingPreview === 'string') {
        section[previewKey] = existingPreview;
      } else if (!isAlreadyEncrypted && !isPlaceholder) {
        section[previewKey] = getSecretPreview(existingSecret);
      }
    }
  }
  return result;
}

/**
 * Deletes registered secret values from `root` in place so admin reads never
 * return them (encrypted or plaintext). Preview companions and plain
 * `${ENV_VAR}` references (for fields that allow them) are preserved.
 * The caller passes a cloned object.
 */
export function redactConfigSecrets<T>(root: T): T {
  const rootRecord = getPlainRecord(root);
  if (!rootRecord) {
    return root;
  }

  for (const key of Object.keys(rootRecord)) {
    if (key.includes('.') && isConfigSecretRelatedPath(key)) {
      delete rootRecord[key];
    } else if (isConfigSecretAncestorPath(key) && Array.isArray(rootRecord[key])) {
      delete rootRecord[key];
    }
  }
  pruneSecretAncestorArrays(rootRecord, '');

  for (const field of CONFIG_SECRET_FIELDS) {
    const segments = field.path.split('.');
    const section = walkToParent(rootRecord, segments);
    if (!section) {
      continue;
    }
    migrateLegacyPreviewKey(section, field);
    const key = segments[segments.length - 1];
    if (!(key in section)) {
      continue;
    }
    const value = section[key];
    if (field.allowEnvPlaceholder && typeof value === 'string' && isEnvPlaceholder(value)) {
      continue;
    }
    delete section[key];
  }
  return root;
}
