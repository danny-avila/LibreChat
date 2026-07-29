import isPlainObject from 'lodash/isPlainObject';
import { encryptV3, decryptV3, logger } from '@librechat/data-schemas';
import { envVarRegex, extractEnvVariable } from 'librechat-data-provider';

const ENCRYPTED_PREFIX = 'v3:';

interface ConfigSecretField {
  /** Dot-path of the secret value within config overrides */
  path: string;
  /** Non-secret display companion, written on encrypt and preserved by redaction. Must be a sibling of `path`. */
  displayPath?: string;
  /** When true, `${ENV_VAR}` placeholder values are stored and returned as plain references instead of being encrypted */
  allowEnvPlaceholder?: boolean;
}

/**
 * Registry of config fields that hold secret values. Writes through the admin
 * config API encrypt these at rest, reads redact them, and omitting them on a
 * subsequent write preserves the stored encrypted value.
 */
const CONFIG_SECRET_FIELDS: readonly ConfigSecretField[] = [
  { path: 'langfuse.secretKey', displayPath: 'langfuse.displaySecretKey' },
  { path: 'ocr.apiKey', displayPath: 'ocr.displayApiKey', allowEnvPlaceholder: true },
  {
    path: 'speech.tts.openai.apiKey',
    displayPath: 'speech.tts.openai.displayApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'speech.tts.azureOpenAI.apiKey',
    displayPath: 'speech.tts.azureOpenAI.displayApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'speech.tts.elevenlabs.apiKey',
    displayPath: 'speech.tts.elevenlabs.displayApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'speech.tts.localai.apiKey',
    displayPath: 'speech.tts.localai.displayApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'speech.stt.openai.apiKey',
    displayPath: 'speech.stt.openai.displayApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'speech.stt.azureOpenAI.apiKey',
    displayPath: 'speech.stt.azureOpenAI.displayApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'webSearch.serperApiKey',
    displayPath: 'webSearch.displaySerperApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'webSearch.searxngApiKey',
    displayPath: 'webSearch.displaySearxngApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'webSearch.firecrawlApiKey',
    displayPath: 'webSearch.displayFirecrawlApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'webSearch.tavilyApiKey',
    displayPath: 'webSearch.displayTavilyApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'webSearch.jinaApiKey',
    displayPath: 'webSearch.displayJinaApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'webSearch.cohereApiKey',
    displayPath: 'webSearch.displayCohereApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'endpoints.assistants.apiKey',
    displayPath: 'endpoints.assistants.displayApiKey',
    allowEnvPlaceholder: true,
  },
  {
    path: 'endpoints.azureAssistants.apiKey',
    displayPath: 'endpoints.azureAssistants.displayApiKey',
    allowEnvPlaceholder: true,
  },
];

const SECRET_FIELDS_BY_PATH = new Map<string, ConfigSecretField>(
  CONFIG_SECRET_FIELDS.map((field) => [field.path, field]),
);

const DISPLAY_PATHS = new Set<string>(
  CONFIG_SECRET_FIELDS.flatMap((field) => (field.displayPath ? [field.displayPath] : [])),
);

const ANCESTOR_PATHS = new Set<string>(
  CONFIG_SECRET_FIELDS.flatMap((field) => {
    const segments = field.path.split('.');
    return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('.'));
  }),
);

const SECRET_SECTIONS: readonly string[] = [
  ...new Set(CONFIG_SECRET_FIELDS.map((field) => field.path.split('.')[0])),
];

export function getDisplaySecretKey(secret: string): string {
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

/** True when a dotted key equals, contains, or is contained by a registered secret or display path. */
function isConfigSecretRelatedPath(fieldPath: string): boolean {
  if (SECRET_FIELDS_BY_PATH.has(fieldPath) || DISPLAY_PATHS.has(fieldPath)) {
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
export function resolveConfigSecret(value?: string): string | undefined {
  if (value == null || value === '') {
    return value;
  }
  if (isEncryptedConfigSecret(value)) {
    return decryptConfigSecret(value);
  }
  return extractEnvVariable(value);
}

export function getConfigSecretMutationPaths(fieldPath: string): string[] {
  const field = SECRET_FIELDS_BY_PATH.get(fieldPath);
  if (field?.displayPath) {
    return [field.path, field.displayPath];
  }
  return [fieldPath];
}

export function isConfigSecretDescendantPath(fieldPath: string): boolean {
  for (const field of CONFIG_SECRET_FIELDS) {
    if (fieldPath.startsWith(`${field.path}.`)) {
      return true;
    }
    if (field.displayPath && fieldPath.startsWith(`${field.displayPath}.`)) {
      return true;
    }
  }
  return false;
}

export function isConfigSecretAncestorPath(fieldPath: string): boolean {
  return ANCESTOR_PATHS.has(fieldPath);
}

export function getConfigSecretInputError(fieldPath: string, value: unknown): string | null {
  if (DISPLAY_PATHS.has(fieldPath)) {
    return `Cannot write protected display secret path: ${fieldPath}`;
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

/**
 * Encrypts a secret value in place within its parent record. Empty and
 * non-string values reset the secret (and display companion). Env placeholder
 * values are kept as plain references for fields that allow them.
 */
function writeSecretIntoSection(section: Record<string, unknown>, field: ConfigSecretField): void {
  const key = lastSegment(field.path);
  const displayKey = field.displayPath ? lastSegment(field.displayPath) : undefined;
  if (!(key in section)) {
    if (displayKey) {
      delete section[displayKey];
    }
    return;
  }

  const rawValue = section[key];
  if (typeof rawValue !== 'string' || rawValue.startsWith(ENCRYPTED_PREFIX)) {
    section[key] = '';
    if (displayKey) {
      section[displayKey] = '';
    }
    return;
  }
  const value = normalizeSecretString(rawValue);
  if (!value) {
    section[key] = '';
    if (displayKey) {
      section[displayKey] = '';
    }
    return;
  }
  if (field.allowEnvPlaceholder && isEnvPlaceholder(value)) {
    section[key] = value;
    if (displayKey) {
      section[displayKey] = '';
    }
    return;
  }

  section[key] = encryptV3(value);
  if (displayKey) {
    section[displayKey] = getDisplaySecretKey(value);
  }
}

function writeDottedSecret(result: Record<string, unknown>, field: ConfigSecretField): void {
  const rawValue = result[field.path];
  if (typeof rawValue !== 'string' || rawValue.startsWith(ENCRYPTED_PREFIX)) {
    result[field.path] = '';
    if (field.displayPath) {
      result[field.displayPath] = '';
    }
    return;
  }
  const value = normalizeSecretString(rawValue);
  if (!value) {
    result[field.path] = '';
    if (field.displayPath) {
      result[field.displayPath] = '';
    }
    return;
  }
  if (field.allowEnvPlaceholder && isEnvPlaceholder(value)) {
    result[field.path] = value;
    if (field.displayPath) {
      result[field.displayPath] = '';
    }
    return;
  }
  result[field.path] = encryptV3(value);
  if (field.displayPath) {
    result[field.displayPath] = getDisplaySecretKey(value);
  }
}

/**
 * Returns a new field map with registered secret entries encrypted (and display
 * companions set where configured). Empty values reset the secret and its
 * display companion. Handles both dotted secret paths and object-valued
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
    if (field.displayPath && !(field.path in result) && field.displayPath in result) {
      delete result[field.displayPath];
    }
    if (field.path in result) {
      writeDottedSecret(result, field);
    }
  }

  return result;
}

/**
 * Returns a cloned config object with registered secret values encrypted
 * before writes. Empty secrets reset their display companions. `basePath`
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
    if (!existingSection || !isEncryptedConfigSecret(existingSection[key])) {
      continue;
    }
    const existingSecret = normalizeSecretString(existingSection[key]);
    if (!existingSecret) {
      continue;
    }
    section[key] = existingSecret;
    if (field.displayPath) {
      const displayKey = lastSegment(field.displayPath);
      if (typeof existingSection[displayKey] === 'string') {
        section[displayKey] = existingSection[displayKey];
      }
    }
  }
  return result;
}

/**
 * Deletes registered secret values from `root` in place so admin reads never
 * return them (encrypted or plaintext). Display companions and plain
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

  for (const field of CONFIG_SECRET_FIELDS) {
    const segments = field.path.split('.');
    const section = walkToParent(rootRecord, segments);
    if (!section) {
      continue;
    }
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
