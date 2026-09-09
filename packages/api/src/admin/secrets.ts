import isPlainObject from 'lodash/isPlainObject';
import { encryptV3, decryptV3, logger } from '@librechat/data-schemas';
import { envVarRegex, extractEnvVariable } from 'librechat-data-provider';
import { isUserProvided } from '~/utils/common';

const ENCRYPTED_PREFIX = 'v3:';
const ENCRYPTED_HEADER_TEMPLATE_PREFIX = 'v3:header-template:';
const ENCRYPTED_PAYLOAD_REGEX = /^v3:(?:header-template:)?[0-9a-f]{32}:[0-9a-f]+$/;

/** Header values are admin-authored templates, unlike scalar credentials.
 * Keep that provenance through encryption without exposing template literals
 * (which can contain credentials). Plain encryptV3 secrets stay literal. */
function encryptConfigHeader(value: string): string {
  if (isEnvPlaceholder(value)) {
    return value;
  }
  const encrypted = encryptV3(value);
  return value.includes('{{') || value.includes('${')
    ? ENCRYPTED_HEADER_TEMPLATE_PREFIX + encrypted.slice(ENCRYPTED_PREFIX.length)
    : encrypted;
}

export function isEncryptedHeaderTemplate(value: string): boolean {
  return (
    value.trim().startsWith(ENCRYPTED_HEADER_TEMPLATE_PREFIX) && isEncryptedSecretPayload(value)
  );
}

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
    { path: 'webSearch.keenableApiKey', allowEnvPlaceholder: true },
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

/**
 * A secret stored on every item of an array config field, which dot-path
 * registry entries cannot express.
 */
interface ArraySecretField {
  /** Dot-path of the array container within config overrides */
  arrayPath: string;
  secretKey: string;
  /** Masked-preview companion on each item, always the sibling `<secretKey>Preview`. */
  previewKey: string;
  /** Item field matched verbatim across writes for omit-to-keep round-trips. */
  identityKey: string;
  /** Reference values that must stay readable and never encrypt, e.g. `user_provided`, `${ENV_VAR}`. */
  isPassthroughValue: (value: string) => boolean;
}

/**
 * Registry of array-item secret locations, the sibling of
 * `CONFIG_SECRET_FIELDS` for secrets that live on entries of an array
 * (e.g. `endpoints.custom[*].apiKey`).
 */
const ARRAY_SECRET_FIELDS: readonly ArraySecretField[] = [
  {
    arrayPath: 'endpoints.custom',
    secretKey: 'apiKey',
    previewKey: 'apiKeyPreview',
    identityKey: 'name',
    isPassthroughValue: (value) => isUserProvided(value) || envVarRegex.test(value),
  },
  {
    arrayPath: 'endpoints.azureOpenAI.groups',
    secretKey: 'apiKey',
    previewKey: 'apiKeyPreview',
    identityKey: 'group',
    isPassthroughValue: (value) => isUserProvided(value) || envVarRegex.test(value),
  },
];

const SECRET_FIELDS_BY_PATH = new Map<string, ConfigSecretField>(
  CONFIG_SECRET_FIELDS.map((field) => [field.path, field]),
);

const PREVIEW_PATHS = new Set<string>([
  ...CONFIG_SECRET_FIELDS.map((field) => field.previewPath),
  ...LEGACY_PREVIEW_PATHS.values(),
]);

/**
 * Ancestors of every registered secret path, scalar (`CONFIG_SECRET_FIELDS`)
 * and array (`ARRAY_SECRET_FIELDS`) alike. Without the array half, a patch
 * to an intermediate ancestor that doesn't itself carry a scalar secret —
 * `endpoints.azureOpenAI` sits between `endpoints` and the array at
 * `endpoints.azureOpenAI.groups`, and has no scalar `CONFIG_SECRET_FIELDS`
 * entry of its own — is invisible to `isConfigSecretAncestorPath`. That path
 * gates both the ancestor-patch recursion in `encryptConfigSecretFields` and
 * `isConfigSecretPreservablePatch`, so a plaintext `apiKey` submitted inside
 * `groups[]` via that ancestor patch would be neither encrypted nor eligible
 * for omitted-secret preservation — it would persist as plaintext.
 */
const ANCESTOR_PATHS = new Set<string>([
  ...CONFIG_SECRET_FIELDS.flatMap((field) => {
    const segments = field.path.split('.');
    return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('.'));
  }),
  ...ARRAY_SECRET_FIELDS.flatMap((field) => {
    const segments = field.arrayPath.split('.');
    return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('.'));
  }),
]);

const SECRET_SECTIONS: readonly string[] = [
  ...new Set([
    ...CONFIG_SECRET_FIELDS.map((field) => field.path.split('.')[0]),
    ...ARRAY_SECRET_FIELDS.map((field) => field.arrayPath.split('.')[0]),
  ]),
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

/** Walks `root` along every segment, returning the value found there (or `undefined` if any intermediate step isn't a plain object). Unlike `walkToParent`, returns the value AT the path, not its parent. */
function getAtPath(root: unknown, segments: readonly string[]): unknown {
  let cursor: unknown = root;
  for (const segment of segments) {
    const record = getPlainRecord(cursor);
    if (!record) {
      return undefined;
    }
    cursor = record[segment];
  }
  return cursor;
}

/** Sets `value` at `segments` within `root`, creating intermediate plain objects as needed (overwriting any non-object found along the way). `value === undefined` deletes the final key instead of writing `undefined` into it. */
function setAtPath(
  root: Record<string, unknown>,
  segments: readonly string[],
  value: unknown,
): void {
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (getPlainRecord(cursor[segment]) == null) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  const key = segments[segments.length - 1];
  if (value === undefined) {
    delete cursor[key];
  } else {
    cursor[key] = value;
  }
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

/**
 * Config object keys that hold a *map* of scalar credential values (custom
 * request headers, OAuth discovery headers, ...) and are database-writable —
 * unlike `CONFIG_SECRET_MAP_FIELDS` below (yaml-only, so a fixed mask on read
 * is safe there), these recur under many built-in endpoint types, custom
 * endpoints, Azure groups, and dynamically admin-named MCP servers, so they
 * are matched by key name at any depth rather than one fixed path per
 * occurrence — the same approach the admin panel's own secret-field
 * detection already uses for these exact keys.
 */
const RECORD_SECRET_CONTAINER_KEYS = new Set(['headers', 'oauth_headers', 'additionalHeaders']);

const MCP_SERVER_HEADERS_PATH_RE = /^mcpServers\.[^.]+\.(?:headers|oauth_headers)$/;

/**
 * True only for the exact `mcpServers.<name>.headers`/`mcpServers.<name>.oauth_headers`
 * shape the rename/create `__previousIdentity` hint actually rides on.
 * `RECORD_SECRET_CONTAINER_KEYS` matches `headers`/`oauth_headers`/`additionalHeaders`
 * by key name at ANY depth — `endpoints.openAI.headers`,
 * `endpoints.azureOpenAI.groups[].additionalHeaders`, etc. all match too — so
 * without this check, exempting the hint key from encryption there would also
 * exempt a real header an admin happens to name `__previousIdentity` on one
 * of those unrelated paths, storing it in plaintext.
 */
function isMcpServerHeadersContainerPath(path: string): boolean {
  return MCP_SERVER_HEADERS_PATH_RE.test(path);
}

/**
 * Walks `node` (the value found at `basePath` within the overrides tree) and
 * calls `visit` with every record-secret container found at or beneath it,
 * along with its absolute dotted path. Handles both shapes callers pass:
 * `node` may already *be* the container (`basePath` itself ends in a
 * registered key, e.g. a dotted-entry write straight to
 * `endpoints.openAI.headers`), or `node` may merely *contain* one at some
 * depth (e.g. a whole-section write to `endpoints`). `langfuse.headers` is
 * excluded — it has its own yaml-only reject+mask treatment and must never
 * be written here.
 */
function walkRecordSecretContainers(
  node: unknown,
  basePath: string,
  visit: (map: Record<string, unknown>, path: string) => void,
): void {
  const lastKey = basePath.split('.').slice(-1)[0];
  if (basePath !== '' && RECORD_SECRET_CONTAINER_KEYS.has(lastKey)) {
    const map = getPlainRecord(node);
    if (map) {
      visit(map, basePath);
    }
    return;
  }
  walkRecordSecretContainerDescendants(node, basePath, visit);
}

/**
 * Scalar secret sub-paths within EACH entry of the dynamically admin-named
 * `mcpServers` record (remote/streamable-http servers only — process-backed
 * ones are yaml-only and rejected before reaching this code at all).
 * `CONFIG_SECRET_FIELDS` cannot express these: the parent key is an
 * admin-chosen server name, not a fixed schema path.
 */
const MCP_SERVER_SECRET_SUBPATHS: readonly string[] = ['oauth.client_secret', 'apiKey.key'];

/**
 * The four mcpServers sub-object keys that can carry a backend-restorable
 * secret: the two registered scalar leaves' containing objects
 * (`oauth`/`apiKey`, via `MCP_SERVER_SECRET_SUBPATHS`) plus the two
 * record-secret containers (`headers`/`oauth_headers`, via
 * `RECORD_SECRET_CONTAINER_KEYS`). A redacted read never sends any of these
 * back to the browser, so the admin panel moves them as whole sub-objects on
 * create/rename — never per-leaf — each stamped with a `__previousIdentity`
 * origin hint. Must match `MCP_SECRET_SUBOBJECT_KEYS` in the admin panel's
 * own `secrets.ts`.
 */
const MCP_SECRET_SUBOBJECT_KEYS: ReadonlySet<string> = new Set([
  'oauth',
  'apiKey',
  'headers',
  'oauth_headers',
]);

/**
 * Walks `node` (the value found at `basePath`) for `mcpServers` server
 * entries — whether `node` is the whole `mcpServers` record, a single
 * server's own config object, or an ancestor containing `mcpServers` at some
 * depth — and calls `visit` with the immediate parent object and key of each
 * registered scalar secret sub-path, plus its absolute dotted path.
 */
function walkMcpServerSecrets(
  node: unknown,
  basePath: string,
  visit: (parent: Record<string, unknown>, key: string, path: string) => void,
): void {
  const segments = basePath === '' ? [] : basePath.split('.');
  const lastKey = segments[segments.length - 1];
  const secondLastKey = segments[segments.length - 2];

  const visitServerEntry = (entry: Record<string, unknown>, entryPath: string): void => {
    for (const subPath of MCP_SERVER_SECRET_SUBPATHS) {
      const subSegments = subPath.split('.');
      const parent = walkToParent(entry, subSegments);
      const key = subSegments[subSegments.length - 1];
      if (parent) {
        visit(parent, key, `${entryPath}.${subPath}`);
      }
    }
  };

  if (lastKey === 'mcpServers') {
    const servers = getPlainRecord(node);
    if (!servers) {
      return;
    }
    for (const [serverName, serverValue] of Object.entries(servers)) {
      const entry = getPlainRecord(serverValue);
      if (entry) {
        visitServerEntry(entry, `${basePath}.${serverName}`);
      }
    }
    return;
  }
  if (secondLastKey === 'mcpServers') {
    const entry = getPlainRecord(node);
    if (entry) {
      visitServerEntry(entry, basePath);
    }
    return;
  }
  // basePath === 'mcpServers.<name>.<subPathParent>' (e.g. `...oauth`,
  // `...apiKey`): node IS the sub-object a registered secret leaf lives
  // directly under — the shape the admin panel actually submits when it
  // patches one oauth/apiKey sub-field (it always resubmits the whole
  // sub-object, never a leaf-level dotted path). Without this branch the two
  // checks above never match a three-segments-deep basePath, so this exact,
  // real submission shape bypassed encryption, preservation, and redaction
  // entirely.
  const thirdLastKey = segments[segments.length - 3];
  if (thirdLastKey === 'mcpServers') {
    const subObj = getPlainRecord(node);
    if (subObj) {
      for (const subPath of MCP_SERVER_SECRET_SUBPATHS) {
        const [parentKey, leafKey] = subPath.split('.');
        if (parentKey === lastKey) {
          visit(subObj, leafKey, `${basePath}.${leafKey}`);
        }
      }
    }
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      walkMcpServerSecrets(item, basePath ? `${basePath}.${index}` : String(index), visit),
    );
    return;
  }
  const record = getPlainRecord(node);
  if (!record) {
    return;
  }
  for (const [key, value] of Object.entries(record)) {
    walkMcpServerSecrets(value, basePath ? `${basePath}.${key}` : key, visit);
  }
}

function visitServerEntrySubObjects(
  entry: Record<string, unknown>,
  serverName: string,
  entryPath: string,
  visit: (
    subObj: Record<string, unknown>,
    serverName: string,
    subKey: string,
    path: string,
  ) => void,
): void {
  for (const subKey of MCP_SECRET_SUBOBJECT_KEYS) {
    const subObj = getPlainRecord(entry[subKey]);
    if (subObj) {
      visit(subObj, serverName, subKey, `${entryPath}.${subKey}`);
    }
  }
}

/**
 * Walks `node` (the value found at `basePath`) for mcpServers entries at any
 * depth `basePath` addresses — the whole `mcpServers` record, a single
 * server's entry object, or a single oauth/apiKey/headers/oauth_headers
 * sub-object directly (the exact shape the admin panel submits for a
 * create/rename) — and calls `visit` with each sub-object found, its server
 * name, sub-key, and absolute dotted path. Sibling of `walkMcpServerSecrets`,
 * which visits registered SCALAR leaves; this visits the containing
 * sub-object itself so callers can inspect/strip a `__previousIdentity` hint
 * and redirect restoration to a different (pre-rename) server name.
 */
function walkMcpServerSubObjects(
  node: unknown,
  basePath: string,
  visit: (
    subObj: Record<string, unknown>,
    serverName: string,
    subKey: string,
    path: string,
  ) => void,
): void {
  const segments = basePath === '' ? [] : basePath.split('.');
  const lastKey = segments[segments.length - 1];
  const secondLastKey = segments[segments.length - 2];
  const thirdLastKey = segments[segments.length - 3];

  if (lastKey === 'mcpServers') {
    const servers = getPlainRecord(node);
    if (!servers) {
      return;
    }
    for (const [serverName, serverValue] of Object.entries(servers)) {
      const entry = getPlainRecord(serverValue);
      if (entry) {
        visitServerEntrySubObjects(entry, serverName, `${basePath}.${serverName}`, visit);
      }
    }
    return;
  }
  if (secondLastKey === 'mcpServers') {
    const entry = getPlainRecord(node);
    if (entry) {
      visitServerEntrySubObjects(entry, lastKey, basePath, visit);
    }
    return;
  }
  if (thirdLastKey === 'mcpServers') {
    // basePath === 'mcpServers.<name>.<subKey>': node IS the sub-object
    // itself — the exact shape the admin panel submits for a create/rename
    // (a whole-object $set write, never a leaf-level dotted path).
    if (MCP_SECRET_SUBOBJECT_KEYS.has(lastKey)) {
      const subObj = getPlainRecord(node);
      if (subObj) {
        visit(subObj, secondLastKey, lastKey, basePath);
      }
    }
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      walkMcpServerSubObjects(item, basePath ? `${basePath}.${index}` : String(index), visit),
    );
    return;
  }
  const record = getPlainRecord(node);
  if (!record) {
    return;
  }
  for (const [key, value] of Object.entries(record)) {
    walkMcpServerSubObjects(value, basePath ? `${basePath}.${key}` : key, visit);
  }
}

function walkRecordSecretContainerDescendants(
  node: unknown,
  basePath: string,
  visit: (map: Record<string, unknown>, path: string) => void,
): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      walkRecordSecretContainerDescendants(
        item,
        basePath ? `${basePath}.${index}` : String(index),
        visit,
      ),
    );
    return;
  }
  const record = getPlainRecord(node);
  if (!record) {
    return;
  }
  for (const [key, value] of Object.entries(record)) {
    const path = basePath ? `${basePath}.${key}` : key;
    if (path === 'langfuse' || path.startsWith('langfuse.')) {
      continue;
    }
    if (RECORD_SECRET_CONTAINER_KEYS.has(key)) {
      const map = getPlainRecord(value);
      if (map) {
        visit(map, path);
      }
      continue;
    }
    walkRecordSecretContainerDescendants(value, path, visit);
  }
}

/**
 * Restores a record-secret container omitted entirely from a submitted patch
 * (e.g. `endpoints.openAI` submitted without a `headers` key at all) by
 * copying the existing container's contents into `result` wherever `existing`
 * has one at the same location — mirroring how a missing scalar
 * `CONFIG_SECRET_FIELDS` leaf is restored when its containing section is
 * still present.
 *
 * A container the submission DOES have — even `{}` or a partial map — is left
 * completely untouched: it is authoritative, matching the admin panel's own
 * convention (`src/utils/secrets.ts`'s `mergeUntouchedSecrets`, which
 * documents "credential-record containers that are present on the edited
 * object are authoritative — including `{}` or a partial map — so omitted
 * keys are treated as intentional deletes"). Restoring individual omitted
 * header names onto a container the admin DID submit — the previous
 * behavior — made deleting one credential from a partial map, or clearing a
 * map to `{}`, silently no-op: the stored ciphertext for every "missing" name
 * came right back.
 */
/**
 * Merges secret entries missing from `target` in from `originContainer`,
 * keyed by name. Never overwrites a key already present on `target` — the
 * shared restoration primitive for every record-secret container (`headers`,
 * `oauth_headers`, `additionalHeaders`), whether the container itself is
 * being rebuilt from scratch (`restoreOmittedRecordSecretContainers`, target
 * starts empty) or merged in place (the mcpServers rename/create path in
 * `resolveMcpSecretOrigins` below, target may already hold surviving entries
 * like env-placeholder header values).
 */
function restoreMissingRecordSecrets(
  target: Record<string, unknown>,
  originContainer: Record<string, unknown> | null,
): void {
  if (!originContainer) {
    return;
  }
  for (const [name, existingValue] of Object.entries(originContainer)) {
    if (name in target) {
      continue;
    }
    const existingSecret = normalizeSecretString(existingValue);
    if (!existingSecret) {
      continue;
    }
    target[name] = isEncryptedConfigSecret(existingSecret)
      ? existingSecret
      : encryptConfigHeader(existingSecret);
  }
}

function restoreOmittedRecordSecretContainers(
  result: Record<string, unknown>,
  existing: unknown,
  basePath: string,
): void {
  const existingAtBase =
    basePath === ''
      ? getPlainRecord(existing)
      : walkToParent(existing, [...basePath.split('.'), '__leaf__']);
  if (!existingAtBase) {
    return;
  }
  walkRecordSecretContainers(existingAtBase, basePath, (existingMap, path) => {
    const segments = relativeSegments(path, basePath);
    if (!segments) {
      return;
    }
    const section = walkToParent(result, segments);
    if (!section) {
      return;
    }
    const key = segments[segments.length - 1];
    if (key in section) {
      return;
    }
    const restored: Record<string, unknown> = {};
    restoreMissingRecordSecrets(restored, existingMap);
    section[key] = restored;
  });
}

/** True when a dotted key equals, contains, or is contained by a registered secret or preview path. */
function isConfigSecretRelatedPath(fieldPath: string): boolean {
  if (SECRET_FIELDS_BY_PATH.has(fieldPath) || PREVIEW_PATHS.has(fieldPath)) {
    return true;
  }
  if (
    ARRAY_SECRET_FIELDS.some(
      (field) => fieldPath === field.arrayPath || fieldPath.startsWith(`${field.arrayPath}.`),
    )
  ) {
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
    return decryptV3(
      isEncryptedHeaderTemplate(normalized)
        ? ENCRYPTED_PREFIX + normalized.slice(ENCRYPTED_HEADER_TEMPLATE_PREFIX.length)
        : normalized,
    );
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
 * Whether a value has the exact shape `encryptV3` produces, optionally tagged
 * as an admin-authored header template. Runtime resolution uses this strict
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

/**
 * Whether `value`, submitted at `fieldPath`, is or contains a record-secret
 * container (`headers`, `oauth_headers`, `additionalHeaders`) carrying an
 * already-encrypted-looking value — an admin never legitimately has real
 * ciphertext to submit for these, same as scalar and array secrets.
 * `langfuse.headers` is excluded — its own dedicated reject handles it.
 */
function getRecordSecretInputError(fieldPath: string, value: unknown): string | null {
  if (fieldPath === 'langfuse.headers' || fieldPath.startsWith('langfuse.headers.')) {
    return null;
  }
  const containers: Array<[Record<string, unknown>, string]> = [];
  walkRecordSecretContainers(value, fieldPath, (map, path) => {
    containers.push([map, path]);
  });
  for (const [map, path] of containers) {
    for (const headerValue of Object.values(map)) {
      if (typeof headerValue === 'string' && isEncryptedConfigSecret(headerValue)) {
        return `Encrypted config secret values cannot be submitted: ${path}`;
      }
    }
  }
  return null;
}

/**
 * Whether `value`, submitted at `fieldPath`, is or contains an mcpServers
 * entry's `oauth.client_secret` or `apiKey.key` carrying an
 * already-encrypted-looking value.
 */
function getMcpServerSecretInputError(fieldPath: string, value: unknown): string | null {
  let error: string | null = null;
  walkMcpServerSecrets(value, fieldPath, (parent, key, path) => {
    if (error) {
      return;
    }
    const submitted = parent[key];
    if (typeof submitted === 'string' && isEncryptedConfigSecret(submitted)) {
      error = `Encrypted config secret values cannot be submitted: ${path}`;
    }
  });
  return error;
}

/**
 * Whether `fieldPath` is a direct dotted write to a single leaf inside an
 * mcpServers `oauth`/`apiKey` secret sub-object (`mcpServers.<name>.oauth.client_secret`,
 * `mcpServers.<name>.apiKey.key`) rather than to the sub-object itself. The
 * dynamic server name makes this shape unrepresentable as a fixed
 * `CONFIG_SECRET_FIELDS` path, so — mirroring how `ARRAY_SECRET_FIELDS`
 * rejects writing a secret by array index instead of silently handling it —
 * this is rejected outright: the only shape ever encrypted/preserved/redacted
 * is the whole `oauth`/`apiKey` object.
 */
function getMcpServerSecretLeafPathError(fieldPath: string): string | null {
  const segments = fieldPath.split('.');
  if (segments.length !== 4 || segments[0] !== 'mcpServers') {
    return null;
  }
  const subPath = `${segments[2]}.${segments[3]}`;
  if (!MCP_SERVER_SECRET_SUBPATHS.includes(subPath)) {
    return null;
  }
  return `Cannot write mcpServers secret fields by dotted leaf path: ${fieldPath}. Write the mcpServers.${segments[1]}.${segments[2]} object instead`;
}

/**
 * Whether `fieldPath` is a direct dotted write to a single dynamic entry
 * inside a record-secret container (`endpoints.openAI.headers.Authorization`)
 * rather than to the container itself. Same rationale and precedent as
 * `getMcpServerSecretLeafPathError`. `langfuse.headers.*` is excluded — it has
 * its own dedicated reject (`isLangfuseHeadersFieldPath`) upstream.
 */
function getRecordSecretLeafPathError(fieldPath: string): string | null {
  const segments = fieldPath.split('.');
  if (segments.length < 2) {
    return null;
  }
  const containerKey = segments[segments.length - 2];
  if (!RECORD_SECRET_CONTAINER_KEYS.has(containerKey)) {
    return null;
  }
  const containerPath = segments.slice(0, -1).join('.');
  if (containerPath === 'langfuse.headers') {
    return null;
  }
  return `Cannot write ${containerKey} fields by dotted leaf path: ${fieldPath}. Write the ${containerPath} object instead`;
}

export function getConfigSecretInputError(fieldPath: string, value: unknown): string | null {
  if (PREVIEW_PATHS.has(fieldPath)) {
    return `Cannot write protected secret preview path: ${fieldPath}`;
  }
  if (SECRET_FIELDS_BY_PATH.has(fieldPath) && isEncryptedConfigSecret(value)) {
    return `Encrypted config secret values cannot be submitted: ${fieldPath}`;
  }
  const mcpLeafError = getMcpServerSecretLeafPathError(fieldPath);
  if (mcpLeafError) {
    return mcpLeafError;
  }
  const recordLeafError = getRecordSecretLeafPathError(fieldPath);
  if (recordLeafError) {
    return recordLeafError;
  }
  const arrayError = getArraySecretInputError(fieldPath, value);
  if (arrayError) {
    return arrayError;
  }
  const recordError = getRecordSecretInputError(fieldPath, value);
  if (recordError) {
    return recordError;
  }
  const mcpError = getMcpServerSecretInputError(fieldPath, value);
  if (mcpError) {
    return mcpError;
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
 * Locates a registered secret array within `root`, where `basePath` identifies
 * what `root` is: `''` for a whole overrides/config object, the array's parent
 * section, or the array path itself.
 */
function getSecretArray(root: unknown, field: ArraySecretField, basePath = ''): unknown[] | null {
  if (basePath === field.arrayPath) {
    return Array.isArray(root) ? root : null;
  }
  const segments = relativeSegments(field.arrayPath, basePath);
  if (!segments) {
    return null;
  }
  const container = walkToParent(root, segments);
  const array = container?.[segments[segments.length - 1]];
  return Array.isArray(array) ? array : null;
}

/**
 * Exact-string entry identity for preserve matching. Deliberately untrimmed:
 * the runtime config merge keys entries by their verbatim name, so `"Prod"`
 * and `" Prod "` are distinct endpoints with distinct credentials.
 */
function getEntryIdentity(
  entry: Record<string, unknown> | null,
  field: ArraySecretField,
): string | undefined {
  const value = entry?.[field.identityKey];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Hidden field an array entry may carry with its pre-edit identity value, so
 * renaming an endpoint or Azure group in the same submission doesn't strand
 * its encrypted apiKey and record-secret containers — exact-identity matching
 * alone can't find the old entry once the identity itself has changed. The
 * admin panel's `ArrayObjectField` attaches this whenever its `identityKey`
 * prop is set. It is read only here and always stripped from every entry
 * before `preserveArraySecrets` returns, so it never reaches validation or
 * persistence. Must match `PREVIOUS_IDENTITY_HINT_KEY` in the panel's
 * `secrets.ts`.
 *
 * Three wire states, all meaningful:
 * - key absent: no signal from this layer — falls back to bare-identity
 *   matching, exactly like the pre-hint behavior (old/non-upgraded client,
 *   or an untouched sibling entry the panel's own merge layer resubmitted
 *   as-is without ever routing through the hint-attaching code path).
 * - `null`: an explicit "this entry has no origin," stamped by the panel at
 *   entry creation. Without this, a brand-new entry with no hint at all
 *   would fall back to bare-identity matching and could inherit another
 *   entry's credentials merely by being given a name that entry's deletion
 *   freed up earlier in the same submission — the wire shape of "genuinely
 *   untouched" and "brand new, coincidentally same name" is otherwise
 *   identical, and the backend cannot tell them apart after the fact.
 * - a non-empty string: the entry's real identity before the rename that
 *   produced its current one.
 */
const PREVIOUS_IDENTITY_HINT_KEY = '__previousIdentity';

function getPreviousIdentityHint(entry: Record<string, unknown>): string | null | undefined {
  if (!(PREVIOUS_IDENTITY_HINT_KEY in entry)) {
    return undefined;
  }
  const value = entry[PREVIOUS_IDENTITY_HINT_KEY];
  if (value === null) {
    return null;
  }
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Resolves an entry's origin (the stored identity its credentials should
 * carry over from, if any) from its hint and current identity. An explicit
 * `null` hint — "this entry has no origin" — always resolves to `undefined`
 * (no match attempted), even though `identity` may itself be defined.
 */
function resolveOrigin(
  hint: string | null | undefined,
  identity: string | undefined,
): string | undefined {
  if (hint === null) {
    return undefined;
  }
  return hint ?? identity;
}

/**
 * Deletes a present non-array protected container (e.g. an object- or
 * null-valued `endpoints.custom`) so malformed input can never carry secrets
 * past the encryption and redaction traversals.
 */
function removeMalformedSecretContainers(root: unknown, basePath = ''): void {
  for (const field of ARRAY_SECRET_FIELDS) {
    const segments = relativeSegments(field.arrayPath, basePath);
    if (!segments) {
      continue;
    }
    const container = walkToParent(root, segments);
    const arrayKey = segments[segments.length - 1];
    if (container != null && arrayKey in container && !Array.isArray(container[arrayKey])) {
      delete container[arrayKey];
    }
  }
}

function applyArraySecretWrites(entries: unknown[], field: ArraySecretField): void {
  for (const item of entries) {
    const entry = getPlainRecord(item);
    if (!entry) {
      continue;
    }
    if (!(field.secretKey in entry)) {
      delete entry[field.previewKey];
      continue;
    }
    const rawValue = entry[field.secretKey];
    if (typeof rawValue !== 'string' || rawValue.startsWith(ENCRYPTED_PREFIX)) {
      entry[field.secretKey] = '';
      entry[field.previewKey] = '';
      continue;
    }
    const value = normalizeSecretString(rawValue);
    if (!value) {
      entry[field.secretKey] = '';
      entry[field.previewKey] = '';
      continue;
    }
    if (field.isPassthroughValue(value)) {
      entry[field.secretKey] = value;
      delete entry[field.previewKey];
      continue;
    }
    entry[field.secretKey] = encryptV3(value);
    entry[field.previewKey] = getSecretPreview(value);
  }
}

function preserveArraySecrets(result: unknown, existing: unknown, basePath: string): void {
  for (const field of ARRAY_SECRET_FIELDS) {
    const entries = getSecretArray(result, field, basePath);
    const existingEntries = getSecretArray(existing, field);
    if (!entries) {
      continue;
    }
    if (!existingEntries) {
      // Nothing to restore from, but the rename hint must still never persist.
      for (const item of entries) {
        const entry = getPlainRecord(item);
        if (entry) {
          delete entry[PREVIOUS_IDENTITY_HINT_KEY];
        }
      }
      continue;
    }

    const duplicateIdentities = new Set<string>();
    const existingByIdentity = new Map<string, Record<string, unknown>>();
    for (const item of existingEntries) {
      const entry = getPlainRecord(item);
      const identity = getEntryIdentity(entry, field);
      if (!entry || identity === undefined) {
        continue;
      }
      if (existingByIdentity.has(identity)) {
        duplicateIdentities.add(identity);
        continue;
      }
      existingByIdentity.set(identity, entry);
    }

    // Two submitted-side collision registries, answering different
    // questions:
    //  - `submittedIdentityCounts`: how many entries claim this DESTINATION
    //    (current) identity. Two entries landing on the same visible name is
    //    ambiguous regardless of where either came from — the same failure
    //    mode as one entry with a duplicated identity, just duplicated in
    //    the submission instead of storage.
    //  - `originCounts`: how many entries claim this ORIGIN (the stored
    //    entry whose credentials should carry over) — an entry's own
    //    identity when it has no hint (or a no-op hint equal to its own
    //    identity), or its hint when renamed. A stored entry's credentials
    //    can only ever flow to ONE submitted entry, so if two entries claim
    //    the same origin — whether both via hint, both bare identity, or one
    //    of each — NEITHER may use it: an unrenamed entry's bare claim looks
    //    identical on the wire whether it is a genuine continuation or a
    //    brand-new entry that happens to reuse a freed name (the two only
    //    differ in admin intent, which the submitted data can't carry), so a
    //    colliding hint from elsewhere in the same request can't be resolved
    //    in either direction without guessing.
    const submittedIdentityCounts = new Map<string, number>();
    const originCounts = new Map<string, number>();
    for (const item of entries) {
      const entry = getPlainRecord(item);
      if (!entry) {
        continue;
      }
      const identity = getEntryIdentity(entry, field);
      if (identity !== undefined) {
        submittedIdentityCounts.set(identity, (submittedIdentityCounts.get(identity) ?? 0) + 1);
      }
      const hint = getPreviousIdentityHint(entry);
      const origin = resolveOrigin(hint, identity);
      if (origin !== undefined) {
        originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1);
      }
    }

    for (const item of entries) {
      const entry = getPlainRecord(item);
      if (!entry) {
        continue;
      }
      const hint = getPreviousIdentityHint(entry);
      delete entry[PREVIOUS_IDENTITY_HINT_KEY];

      // A destination identity is required for restoration to be eligible at
      // all — an entry with no name has nothing a hint could legitimately be
      // attached to, and a hint pointing at real ciphertext plus an empty
      // destination would otherwise smuggle credentials onto an entry the
      // runtime config could never even address.
      const identity = getEntryIdentity(entry, field);
      const isAmbiguousDestination =
        identity !== undefined && (submittedIdentityCounts.get(identity) ?? 0) > 1;

      const proposedOrigin = resolveOrigin(hint, identity);
      const isAmbiguousOrigin =
        proposedOrigin !== undefined && (originCounts.get(proposedOrigin) ?? 0) > 1;

      const origin =
        identity !== undefined && !isAmbiguousDestination && !isAmbiguousOrigin
          ? proposedOrigin
          : undefined;

      const matchedExistingEntry =
        origin !== undefined && !duplicateIdentities.has(origin)
          ? existingByIdentity.get(origin)
          : undefined;
      // Record-secret containers (headers, oauth_headers, additionalHeaders)
      // nested inside this array entry can't be reached by the whole-tree
      // walkers above: `restoreOmittedRecordSecretContainers` locates them by
      // walking `existing` down to `basePath` with `walkToParent`, which stops
      // dead the moment it steps into an array (the array's own identity, not
      // an object key, decides which entry to compare against, and only this
      // identity-matched pair — resolved above by name/group, not by
      // position — can answer that). Passing this single matched entry pair
      // with basePath='' scopes the same container-restoration logic to just
      // this entry, sidestepping the array traversal entirely.
      if (matchedExistingEntry) {
        restoreOmittedRecordSecretContainers(entry, matchedExistingEntry, '');
      }

      if (field.secretKey in entry) {
        continue;
      }
      const existingSecret = normalizeSecretString(matchedExistingEntry?.[field.secretKey]);
      if (!matchedExistingEntry || !existingSecret) {
        continue;
      }
      if (isEncryptedConfigSecret(existingSecret)) {
        entry[field.secretKey] = existingSecret;
        if (typeof matchedExistingEntry[field.previewKey] === 'string') {
          entry[field.previewKey] = matchedExistingEntry[field.previewKey];
        }
        continue;
      }
      if (field.isPassthroughValue(existingSecret)) {
        continue;
      }
      entry[field.secretKey] = encryptV3(existingSecret);
      entry[field.previewKey] = getSecretPreview(existingSecret);
    }
  }
}

/**
 * Strips `__previousIdentity` from every oauth/apiKey/headers/oauth_headers
 * sub-object found in `result` (mutating in place, on EVERY code path — the
 * hint must never persist into storage), and resolves each one's
 * rename/create origin:
 *
 * - `headers`/`oauth_headers` are restored directly here, by merging missing
 *   secret entries in from the resolved origin's container. The admin panel
 *   always resubmits these as a whole-object write scoped to their own
 *   fieldPath (`mcpServers.<name>.headers`), present even when untouched —
 *   a shape `restoreOmittedRecordSecretContainers` cannot handle (it is
 *   built around a container being wholly OMITTED from an ancestor object,
 *   not around being the direct target of its own field patch), so this
 *   merges into the submitted object in place instead of routing through it.
 *   Unlike `oauth`/`apiKey`, an ABSENT hint never falls back to bare
 *   current-name matching here — see the inline comment at the
 *   `RECORD_SECRET_CONTAINER_KEYS` branch below.
 * - `oauth`/`apiKey` are only recorded into the returned redirect map when
 *   an explicit hint (a non-empty string, or `null`) is present. An absent
 *   hint is left out of the map entirely, so the existing, unmodified
 *   bare-current-name restoration in `preserveConfigSecrets`'s
 *   `walkMcpServerSecrets` pass keeps handling that case exactly as before.
 *
 * `resolveOrigin` (shared with the array-entry `__previousIdentity`
 * protocol) supplies the three-state semantics uniformly: hint absent →
 * bare current-name match (oauth/apiKey only); hint `null` → no origin,
 * restore nothing; hint a non-empty string → that name.
 *
 * `validatedOrigins`, when supplied, is the batch-level, ambiguity-checked
 * result of `resolveMcpSecretHintBatch` — this single call only ever sees
 * one fieldPath's slice of a save, so it cannot by itself detect a hint that
 * collides with another fieldPath in the same save (two destinations
 * claiming the same origin, an origin still present as itself elsewhere in
 * the batch, or a destination whose own sub-keys disagree on origin). When
 * provided, it is authoritative for every hint-carrying sub-object this call
 * finds; this call no longer decides those origins itself.
 */
function resolveMcpSecretOrigins(
  result: unknown,
  existingRoot: unknown,
  basePath: string,
  validatedOrigins?: ReadonlyMap<string, string | null>,
): Map<string, string | null> {
  const scalarRedirects = new Map<string, string | null>();
  walkMcpServerSubObjects(result, basePath, (subObj, serverName, subKey, path) => {
    const hadHintKey = PREVIOUS_IDENTITY_HINT_KEY in subObj;
    const localHint = hadHintKey ? getPreviousIdentityHint(subObj) : undefined;
    if (hadHintKey) {
      delete subObj[PREVIOUS_IDENTITY_HINT_KEY];
    }

    // When a batch-validated origin map is supplied, it is authoritative for
    // every sub-object that carried a hint key — this call only ever sees one
    // fieldPath's slice of a save, and batch validation is what catches an
    // ambiguous/colliding/forged hint across the OTHER fieldPaths in the same
    // save that this call structurally cannot see (see
    // `resolveMcpSecretHintBatch`). A hint that failed batch validation is
    // absent from the map — resolved to `null` (no origin) rather than
    // falling back to this call's own locally-read hint, since guessing is
    // exactly the ambiguity the batch pass exists to prevent. A sub-object
    // with no hint key at all (`hadHintKey === false`) has nothing for batch
    // validation to have judged either way, so it is untouched by the
    // presence of a validated map and keeps its ordinary (no-hint) meaning.
    let hint: string | null | undefined = localHint;
    if (validatedOrigins) {
      if (!hadHintKey) {
        hint = undefined;
      } else if (validatedOrigins.has(path)) {
        hint = validatedOrigins.get(path) ?? null;
      } else {
        hint = null;
      }
    }

    if (RECORD_SECRET_CONTAINER_KEYS.has(subKey)) {
      // Unlike oauth/apiKey below, an ABSENT hint here must never fall back
      // to bare current-name matching: headers/oauth_headers are multi-entry
      // maps where the admin panel always resubmits the whole container as
      // authoritative, so "omitted key" already means "the admin deleted
      // this one" (see `restoreOmittedRecordSecretContainers`'s doc comment).
      // Only an EXPLICIT hint (a string origin, or `null` for "no origin")
      // may trigger restoration here.
      if (hint === undefined) {
        return;
      }
      const origin = resolveOrigin(hint, serverName);
      if (origin === undefined) {
        return;
      }
      const originContainer = getPlainRecord(
        getAtPath(existingRoot, ['mcpServers', origin, subKey]),
      );
      restoreMissingRecordSecrets(subObj, originContainer);
      return;
    }

    if (hint === undefined) {
      return;
    }
    scalarRedirects.set(path, hint);
  });
  return scalarRedirects;
}

/** One `__previousIdentity` hint found while scanning a save batch, with enough context to validate it against every other hint in the same batch. */
interface McpSecretHintClaim {
  /** Absolute dotted path of the sub-object carrying the hint, e.g. `mcpServers.C.oauth`. Doubles as the map key `resolveMcpSecretHintBatch` returns. */
  path: string;
  /** The destination server name this hint's sub-object lives under, e.g. `C`. */
  serverName: string;
  /** The hint's own value: a non-empty string origin, or explicit `null` ("no origin"). Malformed/absent hints are never collected as claims. */
  hint: string | null;
}

/**
 * Scans one submitted field value for every mcpServers oauth/apiKey/headers/
 * oauth_headers sub-object that carries an explicit `__previousIdentity`
 * hint, returning one claim per sub-object found. Does not mutate `value` —
 * unlike `resolveMcpSecretOrigins`, this is a read-only reconnaissance pass
 * over the whole batch, run before any field is actually preserved.
 */
function collectMcpSecretHintClaims(value: unknown, fieldPath: string): McpSecretHintClaim[] {
  const claims: McpSecretHintClaim[] = [];
  walkMcpServerSubObjects(value, fieldPath, (subObj, serverName, _subKey, path) => {
    const hint = getPreviousIdentityHint(subObj);
    if (hint === undefined) {
      return;
    }
    claims.push({ path, serverName, hint });
  });
  return claims;
}

/**
 * The mcpServers server names submitted as themselves (i.e. as an unrenamed
 * destination) anywhere in a save batch — every fieldPath naming a server
 * directly (`mcpServers.<name>` or deeper), plus every key of a
 * whole-`mcpServers`-record field value. A hint claiming one of these names
 * as its origin is invalid: the name never actually vacated within this
 * batch, so restoring "from" it would be restoring from a server the same
 * save is simultaneously keeping alive under that identity (see rule (c) in
 * `validateMcpSecretHintClaims`).
 */
function collectMcpDestinationServerNames(fields: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  for (const [fieldPath, value] of Object.entries(fields)) {
    const segments = fieldPath.split('.');
    if (segments[0] !== 'mcpServers') {
      continue;
    }
    if (segments.length === 1) {
      const record = getPlainRecord(value);
      if (record) {
        for (const name of Object.keys(record)) {
          names.add(name);
        }
      }
      continue;
    }
    names.add(segments[1]);
  }
  return names;
}

/**
 * Every mcpServers name in the document this batch is being applied against
 * — needed because a hint's claimed origin can be "still alive" purely by
 * sitting untouched in the existing document, without appearing anywhere in
 * this batch's `fields` at all (the repro rule (c) exists for: destination C
 * hints origin A, and the save never mentions A in `fields` because nothing
 * about A is changing).
 */
function collectExistingMcpServerNames(existingOverrides: unknown): Set<string> {
  const record = getPlainRecord(existingOverrides);
  const mcpServers = record ? getPlainRecord(record.mcpServers) : null;
  return new Set(mcpServers ? Object.keys(mcpServers) : []);
}

/**
 * Whole-entry-level mcpServers removals declared via `resetPaths` in the same
 * atomic-mutate request — an existing name explicitly unset this way is no
 * longer "still alive," so it must NOT block a hint claiming it as origin.
 * A bare `mcpServers` reset removes every existing name at once. A reset at
 * or under `mcpServers.<name>.<...>` (a partial leaf reset) does not count —
 * the server itself survives, only one of its fields is being cleared.
 */
function collectMcpRemovedServerNames(resetPaths: readonly string[]): {
  removedAll: boolean;
  removedNames: ReadonlySet<string>;
} {
  const removedNames = new Set<string>();
  for (const path of resetPaths) {
    if (path === 'mcpServers') {
      return { removedAll: true, removedNames };
    }
    const segments = path.split('.');
    if (segments.length === 2 && segments[0] === 'mcpServers') {
      removedNames.add(segments[1]);
    }
  }
  return { removedAll: false, removedNames };
}

/**
 * Validates a batch's collected `__previousIdentity` claims against three
 * ambiguity rules, mirroring the array-entry protocol's `duplicateIdentities`
 * fail-closed philosophy — an ambiguous or forged claim restores nothing
 * rather than guessing which reading was intended:
 *
 * (a) Per-destination consistency — every claim for the SAME destination
 *     server must agree on the same origin. A destination whose sub-objects
 *     disagree (e.g. oauth hints "A", headers hints "B") gets NONE of its
 *     claims honored — there is no way to tell which one is real.
 * (b) Per-origin uniqueness — a stored server's credentials can flow to at
 *     most one destination. If more than one destination server claims the
 *     same origin in this batch, NEITHER may restore from it.
 * (c) Origin still alive — if the claimed origin name is itself submitted as
 *     an unrenamed destination anywhere in the same batch (`presentServerNames`),
 *     the claim is invalid: the origin never actually vacated, so this is a
 *     clone, not a move.
 *
 * Returns a map from claim `path` to its validated origin (`string | null`)
 * for every claim that survives all three rules; a claim that fails any rule
 * is simply absent from the returned map.
 */
function validateMcpSecretHintClaims(
  claims: readonly McpSecretHintClaim[],
  presentServerNames: ReadonlySet<string>,
): Map<string, string | null> {
  const byServer = new Map<string, McpSecretHintClaim[]>();
  for (const claim of claims) {
    const group = byServer.get(claim.serverName);
    if (group) {
      group.push(claim);
    } else {
      byServer.set(claim.serverName, [claim]);
    }
  }

  const consistentServers = new Set<string>();
  for (const [serverName, serverClaims] of byServer) {
    const distinctHints = new Set(serverClaims.map((claim) => claim.hint));
    if (distinctHints.size === 1) {
      consistentServers.add(serverName);
    }
  }

  const originClaimants = new Map<string, Set<string>>();
  for (const claim of claims) {
    if (claim.hint === null || !consistentServers.has(claim.serverName)) {
      continue;
    }
    const claimants = originClaimants.get(claim.hint);
    if (claimants) {
      claimants.add(claim.serverName);
    } else {
      originClaimants.set(claim.hint, new Set([claim.serverName]));
    }
  }

  const validated = new Map<string, string | null>();
  for (const claim of claims) {
    if (!consistentServers.has(claim.serverName)) {
      continue;
    }
    if (claim.hint === null) {
      validated.set(claim.path, null);
      continue;
    }
    if (presentServerNames.has(claim.hint)) {
      continue;
    }
    const claimants = originClaimants.get(claim.hint);
    if (claimants && claimants.size > 1) {
      continue;
    }
    validated.set(claim.path, claim.hint);
  }
  return validated;
}

/**
 * Batch-level entry point: scans every fieldPath in a save's `fields` map
 * (the same batch `preservePatchedConfigSecretFields` iterates) for mcpServers
 * `__previousIdentity` hints, validates them against each other for
 * cross-fieldPath ambiguity (see `validateMcpSecretHintClaims`), and returns
 * the surviving origins keyed by sub-object path for `preserveConfigSecrets`
 * to consult instead of resolving each hint in isolation.
 *
 * This exists because `preserveConfigSecrets` is called once PER fieldPath —
 * a single call's `resolveMcpSecretOrigins` pass only ever sees the one
 * sub-object it was given, so it cannot detect that a DIFFERENT fieldPath in
 * the same save claims the same origin, disagrees with a sibling sub-object
 * on the same destination, or claims an origin that's simultaneously present
 * as its own unrenamed destination elsewhere in the batch. Only the whole
 * batch, scanned before the per-field loop runs, has enough visibility to
 * catch that.
 *
 * Scoped to a single HTTP request's batch — a hint replayed across separate
 * requests (e.g. resubmitting an old, now-stale hint in a later save after
 * the collision that would have invalidated it is no longer in the same
 * batch) is not detected here. That is an accepted, out-of-scope gap for
 * this pass; closing it would need request-independent replay detection.
 *
 * `existingOverrides`/`resetPaths` extend "still alive" (rule (c)) beyond
 * names this batch's `fields` happens to mention: a name sitting untouched in
 * the existing document is just as alive as one explicitly resubmitted, and
 * must block a same-batch hint claiming it as a vacated origin. A name this
 * same request's `resetPaths` explicitly deletes is the one case that
 * legitimately vacates without being "submitted as a destination" — it is
 * subtracted back out rather than counted as still alive.
 */
export function resolveMcpSecretHintBatch(
  fields: Record<string, unknown>,
  existingOverrides?: unknown,
  resetPaths: readonly string[] = [],
): Map<string, string | null> {
  const claims = Object.entries(fields).flatMap(([fieldPath, value]) =>
    collectMcpSecretHintClaims(value, fieldPath),
  );
  if (claims.length === 0) {
    return new Map();
  }
  const presentServerNames = collectMcpDestinationServerNames(fields);
  const { removedAll, removedNames } = collectMcpRemovedServerNames(resetPaths);
  if (!removedAll) {
    for (const name of collectExistingMcpServerNames(existingOverrides)) {
      if (!removedNames.has(name)) {
        presentServerNames.add(name);
      }
    }
  }
  return validateMcpSecretHintClaims(claims, presentServerNames);
}

/**
 * `resolveMcpSecretHintBatch`'s counterpart for a whole-document overrides
 * replace (legacy upsert, atomic `overrides` replace) rather than a
 * fieldPath-keyed `fields` batch. There is no separate "destination names
 * submitted" vs. "existing names" distinction here — the document's own
 * `mcpServers` keys ARE the complete final name set this save produces, so
 * every one of them counts as present, and nothing needs to be sourced from
 * an existing document or a reset-paths list at all.
 */
export function resolveMcpSecretHintBatchForWholeDocument(
  overridesDocument: unknown,
): Map<string, string | null> {
  const claims = collectMcpSecretHintClaims(overridesDocument, '');
  if (claims.length === 0) {
    return new Map();
  }
  const presentServerNames = collectExistingMcpServerNames(overridesDocument);
  return validateMcpSecretHintClaims(claims, presentServerNames);
}

/**
 * Builds a copy of `existingRoot` with each redirected oauth/apiKey
 * sub-object location patched to reflect its resolved rename/create origin —
 * either the origin's actual sub-object content (string origin, e.g. a
 * rename) or removed entirely (`null` origin, e.g. a brand-new entry). The
 * unmodified, bare-current-name `walkMcpServerSecrets` restoration pass in
 * `preserveConfigSecrets` then "just works" against it for both cases,
 * without needing to know about hints itself. Everything outside the
 * redirected paths is identical to `existingRoot`, so this is safe to use
 * for MCP restoration only — the array-secret and scalar `CONFIG_SECRET_FIELDS`
 * restoration passes are unaffected either way and keep using the real
 * `existingRoot`.
 */
function applyMcpScalarRedirects(
  existingRoot: unknown,
  redirects: Map<string, string | null>,
): unknown {
  if (redirects.size === 0) {
    return existingRoot;
  }
  const shadow = getPlainRecord(structuredClone(existingRoot));
  if (!shadow) {
    return existingRoot;
  }
  for (const [path, origin] of redirects) {
    const segments = path.split('.');
    if (origin === null) {
      setAtPath(shadow, segments, undefined);
      continue;
    }
    const subKey = segments[segments.length - 1];
    const originValue = getAtPath(existingRoot, ['mcpServers', origin, subKey]);
    setAtPath(
      shadow,
      segments,
      originValue === undefined ? undefined : structuredClone(originValue),
    );
  }
  return shadow;
}

function shouldRedactArraySecretValue(value: unknown, field: ArraySecretField): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (isEncryptedConfigSecret(value)) {
    return true;
  }
  const normalized = normalizeSecretString(value);
  return normalized != null && !field.isPassthroughValue(normalized);
}

/** Numeric indices plus MongoDB positional operators (`$`, `$[]`, `$[id]`). */
function isArrayIndexSegment(segment: string): boolean {
  return /^\d+$/.test(segment) || segment.includes('$');
}

function getArraySecretPathError(fieldPath: string): string | null {
  for (const field of ARRAY_SECRET_FIELDS) {
    const prefix = `${field.arrayPath}.`;
    if (!fieldPath.startsWith(prefix)) {
      continue;
    }
    const segments = fieldPath.slice(prefix.length).split('.');
    if (!isArrayIndexSegment(segments[0])) {
      return `${field.arrayPath} is an array and has no named fields: ${fieldPath}. Write the ${field.arrayPath} array instead`;
    }
    if (segments.length === 1) {
      return `Cannot replace ${field.arrayPath} entries by array index: ${fieldPath}. Write the ${field.arrayPath} array instead`;
    }
    if (segments[1] === field.secretKey || segments[1] === field.previewKey) {
      return `Cannot write secret fields by array index: ${fieldPath}. Write the ${field.arrayPath} array instead`;
    }
  }
  return null;
}

function getArraySecretInputError(fieldPath: string, value: unknown): string | null {
  const pathError = getArraySecretPathError(fieldPath);
  if (pathError) {
    return pathError;
  }
  for (const field of ARRAY_SECRET_FIELDS) {
    const basePath =
      fieldPath === field.arrayPath || relativeSegments(field.arrayPath, fieldPath) != null
        ? fieldPath
        : null;
    if (basePath == null) {
      continue;
    }
    if (fieldPath === field.arrayPath) {
      if (value !== undefined && !Array.isArray(value)) {
        return `Protected secret container must be an array: ${field.arrayPath}`;
      }
    } else {
      const segments = relativeSegments(field.arrayPath, fieldPath) ?? [];
      const container = walkToParent(value, segments);
      const arrayKey = segments[segments.length - 1];
      if (container != null && arrayKey in container && !Array.isArray(container[arrayKey])) {
        return `Protected secret container must be an array: ${field.arrayPath}`;
      }
    }
    const entries = getSecretArray(value, field, fieldPath);
    if (
      entries?.some((entry) => isEncryptedConfigSecret(getPlainRecord(entry)?.[field.secretKey]))
    ) {
      return `Encrypted config secret values cannot be submitted: ${field.arrayPath}[].${field.secretKey}`;
    }
    // A duplicated identity is unrecoverable ambiguity for credential
    // preservation — preserveArraySecrets already fails closed and restores
    // nothing for any entry sharing one, but silently committing a mutation
    // that strips existing credentials is a bad failure mode for what's
    // usually just an admin mistake (e.g. handleCreate on the panel appends
    // without checking for a name collision). Reject before anything mutates
    // instead of after credentials are already gone.
    if (entries) {
      const seenIdentities = new Set<string>();
      for (const entry of entries) {
        const identity = getEntryIdentity(getPlainRecord(entry), field);
        if (identity === undefined) {
          continue;
        }
        if (seenIdentities.has(identity)) {
          return `Duplicate ${field.identityKey} in ${field.arrayPath}: "${identity}"`;
        }
        seenIdentities.add(identity);
      }
    }
  }
  return null;
}

/**
 * Whether `existingEntries` has a stored identity duplicated more than once
 * — a pre-existing data-quality issue (from before this array's identities
 * were required to be unique) that `preserveArraySecrets` already refuses to
 * restore through, by design: with two stored credentials sharing one name,
 * there's no way to know which one a bare identity match should inherit.
 */
function findDuplicatedStoredIdentities(
  existingEntries: unknown[],
  field: ArraySecretField,
): Set<string> {
  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const item of existingEntries) {
    const identity = getEntryIdentity(getPlainRecord(item), field);
    if (identity === undefined) {
      continue;
    }
    if (seen.has(identity)) {
      duplicates.add(identity);
    }
    seen.add(identity);
  }
  return duplicates;
}

/**
 * Rejects a submission whenever some entry's origin targets a stored
 * identity that is itself duplicated (two or more existing entries share it)
 * — reducing two entries with different credentials down to the one name
 * they share cannot be resolved to "which credential survives" from the
 * submitted data alone, and `preserveArraySecrets` fails closed (restores
 * neither) rather than guess. Silently committing that as a successful save
 * is a bad failure mode for what's normally just an admin's edit to one of
 * the ambiguous entries, so this rejects before anything mutates instead.
 * Deleting every entry sharing the ambiguous identity remains allowed — with
 * none of them targeting it anymore, there is nothing left to reject.
 */
export function getArrayExistingIdentityConflictError(
  fieldPath: string,
  value: unknown,
  existingOverrides: unknown,
): string | null {
  for (const field of ARRAY_SECRET_FIELDS) {
    const entries = getSecretArray(value, field, fieldPath);
    const existingEntries = getSecretArray(existingOverrides, field);
    if (!entries || !existingEntries) {
      continue;
    }
    const duplicatedStoredIdentities = findDuplicatedStoredIdentities(existingEntries, field);
    if (duplicatedStoredIdentities.size === 0) {
      continue;
    }
    for (const item of entries) {
      const entry = getPlainRecord(item);
      if (!entry) {
        continue;
      }
      const identity = getEntryIdentity(entry, field);
      const hint = getPreviousIdentityHint(entry);
      const origin = resolveOrigin(hint, identity);
      if (origin !== undefined && duplicatedStoredIdentities.has(origin)) {
        return (
          `Ambiguous existing ${field.identityKey} in ${field.arrayPath}: "${origin}" is ` +
          'duplicated in storage — delete every entry sharing it before submitting one, ' +
          'or rename the surviving entry first'
        );
      }
    }
  }
  return null;
}

/**
 * Returns a copy of a custom endpoint config with its stored `apiKey`
 * decrypted for runtime use; unencrypted configs return unchanged. Decryption
 * failures resolve to an empty string (never the ciphertext) so downstream
 * requests fail visibly instead of sending an encrypted blob as a credential.
 */
export function resolveCustomEndpointSecrets<T extends { apiKey?: string }>(endpointConfig: T): T {
  const apiKey = endpointConfig.apiKey;
  if (typeof apiKey !== 'string' || !isEncryptedSecretPayload(apiKey)) {
    return endpointConfig;
  }
  return { ...endpointConfig, apiKey: decryptConfigSecret(apiKey) ?? '' };
}

/**
 * Whether a patched value at `fieldPath` is shaped such that omitted secrets
 * should be preserved from the existing overrides: an object at a registered
 * ancestor path, or an array at a registered array-secret path.
 */
export function isConfigSecretPreservablePatch(fieldPath: string, value: unknown): boolean {
  if (isConfigSecretAncestorPath(fieldPath) && isPlainObject(value)) {
    return true;
  }
  if (ARRAY_SECRET_FIELDS.some((field) => field.arrayPath === fieldPath && Array.isArray(value))) {
    return true;
  }
  // isConfigSecretAncestorPath/ARRAY_SECRET_FIELDS only cover fixed-path
  // registrations — a dynamic container patch (mcpServers.<name>.oauth,
  // endpoints.openAI.headers, ...) needs the same "load the existing document
  // so omitted secrets can be restored" treatment, or every such patch wipes
  // out whatever secret it didn't resubmit.
  if (!isPlainObject(value)) {
    return false;
  }
  let hasSecretLocation = false;
  walkRecordSecretContainers(value, fieldPath, () => {
    hasSecretLocation = true;
  });
  if (!hasSecretLocation) {
    walkMcpServerSecrets(value, fieldPath, () => {
      hasSecretLocation = true;
    });
  }
  return hasSecretLocation;
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
    if (getArraySecretPathError(key) !== null) {
      delete result[key];
      continue;
    }
    if (
      getMcpServerSecretLeafPathError(key) !== null ||
      getRecordSecretLeafPathError(key) !== null
    ) {
      delete result[key];
      continue;
    }
    if (ARRAY_SECRET_FIELDS.some((field) => field.arrayPath === key)) {
      if (Array.isArray(result[key])) {
        result[key] = encryptConfigSecrets(result[key], key);
      } else {
        delete result[key];
      }
      continue;
    }
    if (isConfigSecretAncestorPath(key)) {
      if (Array.isArray(result[key])) {
        delete result[key];
      } else if (isPlainObject(result[key])) {
        result[key] = encryptConfigSecrets(result[key], key);
      }
      continue;
    }
    // isConfigSecretAncestorPath only covers scalar CONFIG_SECRET_FIELDS
    // ancestors — a dotted entry targeting (or containing) a record-secret
    // container (endpoints.openAI.headers, mcpServers.<name>.oauth_headers,
    // ...) or an mcpServers entry's own scalar secrets (oauth.client_secret,
    // apiKey.key) needs the same encrypt-at-write treatment, or the value
    // sits in Mongo, and every revision snapshot, in plaintext.
    if (isPlainObject(result[key])) {
      let needsEncryption = false;
      walkRecordSecretContainers(result[key], key, () => {
        needsEncryption = true;
      });
      if (!needsEncryption) {
        walkMcpServerSecrets(result[key], key, () => {
          needsEncryption = true;
        });
      }
      if (needsEncryption) {
        result[key] = encryptConfigSecrets(result[key], key);
      }
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
  removeMalformedSecretContainers(rootRecord, basePath);

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

  for (const field of ARRAY_SECRET_FIELDS) {
    const entries = getSecretArray(result, field, basePath);
    if (entries) {
      applyArraySecretWrites(entries, field);
    }
  }

  walkRecordSecretContainers(rootRecord, basePath, (map, path) => {
    const isMcpHintCarrier = isMcpServerHeadersContainerPath(path);
    for (const [headerName, value] of Object.entries(map)) {
      // The mcpServers rename/create `__previousIdentity` origin hint rides
      // inside this same container as a sibling key (see its doc comment) so
      // the admin panel can move a headers/oauth_headers map as one write
      // without a dedicated field for the hint. Only exempt it here for the
      // actual mcpServers headers/oauth_headers shape the hint is stamped
      // onto — `RECORD_SECRET_CONTAINER_KEYS` matches these same key names on
      // unrelated paths too (e.g. `endpoints.openAI.headers`), and those have
      // no hint protocol at all, so a real header literally named
      // `__previousIdentity` there must still be encrypted like any other.
      if (isMcpHintCarrier && headerName === PREVIOUS_IDENTITY_HINT_KEY) {
        continue;
      }
      if (typeof value !== 'string' || isEncryptedConfigSecret(value)) {
        // Not a string, or already looks like ciphertext — an admin never
        // legitimately has real ciphertext to submit; clear it rather than
        // store the caller-controlled value verbatim.
        delete map[headerName];
        continue;
      }
      const normalized = normalizeSecretString(value);
      if (!normalized || isEnvPlaceholder(normalized)) {
        continue;
      }
      map[headerName] = encryptConfigHeader(normalized);
    }
  });

  walkMcpServerSecrets(rootRecord, basePath, (parent, key) => {
    const rawValue = parent[key];
    if (typeof rawValue !== 'string' || isEncryptedConfigSecret(rawValue)) {
      delete parent[key];
      return;
    }
    const normalized = normalizeSecretString(rawValue);
    if (!normalized) {
      return;
    }
    parent[key] = encryptV3(normalized);
  });

  return result;
}

/**
 * Encrypts plaintext legacy secret values found in a document already at
 * rest, leaving already-encrypted values, env-var placeholders, and
 * passthrough values untouched. Unlike `encryptConfigSecrets` — which treats
 * an already-encrypted string as "the caller resubmitted the masked
 * placeholder unchanged" and blanks it — this never destroys a secret that's
 * already encrypted, so it's safe to run on a stored overrides document
 * before copying it into a revision snapshot or writing a restored revision
 * back onto the live config.
 */
export function encryptLegacyPlaintextConfigSecrets<T>(root: T, basePath = ''): T {
  if (root == null || typeof root !== 'object') {
    return root;
  }

  const result = structuredClone(root);
  const rootRecord = result as Record<string, unknown>;

  // `langfuse.headers` is a map of arbitrary proxy/gateway credential values —
  // the config-secret registry can only express a scalar path or an array-item
  // secret, not a map, so it can never be encrypted or masked here. Current
  // policy also forbids ever writing it again (it's YAML-only now), so a
  // legacy document that still carries it from before that policy can never
  // legitimately restore it either. Left in place, that plaintext would
  // otherwise be copied forward into every subsequent revision snapshot and
  // into any restore that writes it back onto the live document — dropping
  // it here, rather than encrypting it, is what actually stops that.
  const langfuseHeadersSegments = relativeSegments('langfuse.headers', basePath);
  if (langfuseHeadersSegments) {
    const langfuseSection = walkToParent(rootRecord, langfuseHeadersSegments);
    if (langfuseSection) {
      delete langfuseSection[lastSegment('langfuse.headers')];
    }
  }

  for (const field of CONFIG_SECRET_FIELDS) {
    const segments = relativeSegments(field.path, basePath);
    if (!segments) {
      continue;
    }
    const section = walkToParent(rootRecord, segments);
    if (!section) {
      continue;
    }
    const key = lastSegment(field.path);
    const value = normalizeSecretString(section[key]);
    if (!value || isEncryptedSecretPayload(value)) {
      continue;
    }
    if (field.allowEnvPlaceholder && isEnvPlaceholder(value)) {
      continue;
    }
    section[key] = encryptV3(value);
  }

  for (const field of ARRAY_SECRET_FIELDS) {
    const entries = getSecretArray(rootRecord, field, basePath);
    if (!entries) {
      continue;
    }
    for (const item of entries) {
      const entry = getPlainRecord(item);
      if (!entry) {
        continue;
      }
      const value = normalizeSecretString(entry[field.secretKey]);
      if (!value || isEncryptedSecretPayload(value)) {
        continue;
      }
      if (field.isPassthroughValue(value)) {
        continue;
      }
      entry[field.secretKey] = encryptV3(value);
    }
  }

  walkRecordSecretContainers(rootRecord, basePath, (map, path) => {
    const isMcpHintCarrier = isMcpServerHeadersContainerPath(path);
    for (const [headerName, value] of Object.entries(map)) {
      // Same rationale as `encryptConfigSecrets`: never encrypt the
      // mcpServers rename/create hint sibling key, on the off chance a
      // not-yet-stripped hint reaches this normalization pass (e.g. a
      // pre-fix document, or a revision snapshot taken before this hint was
      // ever cleaned up) — but only for the actual mcpServers headers/
      // oauth_headers shape; see `isMcpServerHeadersContainerPath`.
      if (isMcpHintCarrier && headerName === PREVIOUS_IDENTITY_HINT_KEY) {
        continue;
      }
      const normalized = normalizeSecretString(value);
      if (!normalized || isEncryptedSecretPayload(normalized) || isEnvPlaceholder(normalized)) {
        continue;
      }
      map[headerName] = encryptConfigHeader(normalized);
    }
  });

  walkMcpServerSecrets(rootRecord, basePath, (parent, key) => {
    const value = normalizeSecretString(parent[key]);
    if (!value || isEncryptedSecretPayload(value)) {
      return;
    }
    parent[key] = encryptV3(value);
  });

  return result;
}

/**
 * Preserves existing encrypted secrets when an object write omits them. This
 * lets redacted admin reads round-trip safely: omitting a secret keeps it,
 * while setting it to an empty value clears it. `basePath` locates `next`
 * within the config tree; `existing` is always the full overrides object.
 *
 * `validatedMcpOrigins`, when supplied, is the output of
 * `resolveMcpSecretHintBatch` run over the WHOLE save batch this single
 * `fieldPath`/`basePath` call is one piece of — see that function's doc
 * comment for why a single call cannot validate mcpServers rename/create
 * hints against each other by itself. Passed straight through to
 * `resolveMcpSecretOrigins`.
 */
export function preserveConfigSecrets<T>(
  next: T,
  existing?: unknown,
  basePath = '',
  validatedMcpOrigins?: ReadonlyMap<string, string | null>,
): T {
  if (next == null || typeof next !== 'object') {
    return next;
  }
  // A missing/invalid `existing` (no config document has ever been saved for
  // this principal yet) must still fall through to the cleanup below rather
  // than short-circuit here — `preserveArraySecrets` is what strips the
  // `__previousIdentity` hint from every array entry, and this was the one
  // path that skipped it entirely, letting the hint persist verbatim into
  // Mongo on a brand-new document's first save. Every downstream lookup
  // against `existingRoot` already treats "nothing found at this path" as
  // "nothing to restore," so an empty stand-in is exactly as safe as a
  // document that merely lacks this particular field.
  const existingRoot = existing != null && typeof existing === 'object' ? existing : {};

  const result = structuredClone(next);
  // Strips any `__previousIdentity` rename/create hint from mcpServers
  // oauth/apiKey/headers/oauth_headers sub-objects found in `result`
  // (mutating in place, unconditionally) and, for oauth/apiKey specifically,
  // records where the scalar-secret restoration pass below should look
  // instead of the bare current server name. headers/oauth_headers are
  // restored as a side effect of this same call — see its doc comment.
  const mcpScalarRedirects = resolveMcpSecretOrigins(
    result,
    existingRoot,
    basePath,
    validatedMcpOrigins,
  );
  const mcpExistingRoot = applyMcpScalarRedirects(existingRoot, mcpScalarRedirects);

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

    const existingSection = walkToParent(existingRoot, field.path.split('.'));
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

  preserveArraySecrets(result, existingRoot, basePath);
  restoreOmittedRecordSecretContainers(result as Record<string, unknown>, existingRoot, basePath);

  walkMcpServerSecrets(result, basePath, (parent, key, path) => {
    if (key in parent) {
      return;
    }
    const existingParent = walkToParent(mcpExistingRoot, path.split('.'));
    const existingValue = normalizeSecretString(existingParent?.[key]);
    if (!existingValue) {
      return;
    }
    parent[key] = isEncryptedConfigSecret(existingValue) ? existingValue : encryptV3(existingValue);
  });

  return result;
}

/**
 * Config paths holding a *map* of sensitive values rather than one scalar.
 * `CONFIG_SECRET_FIELDS` cannot describe these — it keys off a single path and
 * a `<path>Preview` companion — so they are masked on read instead.
 *
 * These are yaml-only (admin writes are rejected), which is what makes masking
 * safe: a masked read can never be round-tripped back over the real values.
 */
const CONFIG_SECRET_MAP_FIELDS: readonly string[] = ['langfuse.headers'];
const MASKED_MAP_VALUE = '***';

/**
 * Replaces every value of a registered secret map with a fixed mask, keeping
 * the key names so an admin can still see *which* headers a deployment sets
 * without receiving the gateway credentials themselves.
 */
/**
 * Masks registered secret maps on a cloned config, for callers outside the
 * admin read path that also serialize configuration — notably the startup
 * "Custom config file loaded" log, which would otherwise copy every literal
 * gateway credential into application logs.
 *
 * Only handles map-valued secrets; scalar secrets keep whatever handling the
 * caller already applies.
 */
export function redactConfigSecretMaps<T>(root: T): T {
  const clone = JSON.parse(JSON.stringify(root)) as T;
  const rootRecord = getPlainRecord(clone);
  if (!rootRecord) {
    return clone;
  }
  redactSecretMapFields(rootRecord);
  return clone;
}

function redactSecretMapFields(rootRecord: Record<string, unknown>): void {
  for (const path of CONFIG_SECRET_MAP_FIELDS) {
    const segments = path.split('.');
    const parent = walkToParent(rootRecord, segments);
    const key = segments[segments.length - 1];
    const value = parent?.[key];
    const map = getPlainRecord(value);
    if (parent == null) {
      continue;
    }
    if (map == null) {
      /** A non-object here is malformed for this path; drop it rather than
       *  risk serializing a raw string credential. */
      if (value !== undefined) {
        delete parent[key];
      }
      continue;
    }
    parent[key] = Object.fromEntries(Object.keys(map).map((name) => [name, MASKED_MAP_VALUE]));
  }
}

/**
 * Deletes registered secret values from `root` in place so admin reads never
 * return them (encrypted or plaintext). Preview companions and plain
 * `${ENV_VAR}` references (for fields that allow them) are preserved.
 * Secret *maps* are masked value-by-value. The caller passes a cloned object.
 */
export function redactConfigSecrets<T>(root: T): T {
  const rootRecord = getPlainRecord(root);
  if (!rootRecord) {
    return root;
  }

  redactSecretMapFields(rootRecord);

  for (const key of Object.keys(rootRecord)) {
    if (key.includes('.') && isConfigSecretRelatedPath(key)) {
      delete rootRecord[key];
    } else if (isConfigSecretAncestorPath(key) && Array.isArray(rootRecord[key])) {
      delete rootRecord[key];
    }
  }
  pruneSecretAncestorArrays(rootRecord, '');
  removeMalformedSecretContainers(rootRecord);

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

  for (const field of ARRAY_SECRET_FIELDS) {
    const entries = getSecretArray(rootRecord, field);
    if (!entries) {
      continue;
    }
    for (const item of entries) {
      const entry = getPlainRecord(item);
      if (entry && shouldRedactArraySecretValue(entry[field.secretKey], field)) {
        delete entry[field.secretKey];
      }
    }
  }

  walkRecordSecretContainers(rootRecord, '', (map) => {
    for (const [headerName, value] of Object.entries(map)) {
      if (typeof value === 'string' && isEnvPlaceholder(value)) {
        continue;
      }
      delete map[headerName];
    }
  });

  walkMcpServerSecrets(rootRecord, '', (parent, key) => {
    delete parent[key];
  });

  return root;
}
