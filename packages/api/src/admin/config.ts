import {
  BASE_PRINCIPAL_CONFIG_SECTIONS,
  BASE_ONLY_CONFIG_SECTIONS,
  BASE_ONLY_CONFIG_PATHS,
  PrincipalType,
  PrincipalModel,
  INTERFACE_PERMISSION_FIELDS,
  RUNTIME_CONFIG_INTERFACE_FIELDS,
  PERMISSION_SUB_KEYS,
  hasProcessMCPServerConfig,
  isProcessMCPServerConfig,
  isProcessMCPServerField,
} from 'librechat-data-provider';
import {
  logger,
  getAtPath,
  unsetAtPath,
  isPlainRecord,
  isDotFreePath,
  isSegmentPrefix,
  parseFieldPath,
  setConfigFields,
  applyConfigChange,
  getConfigEntryKey,
  getConfigRevision,
  isConfigEntryError,
  isConfigRecordPath,
  pruneEmptyAncestors,
  isConfigArrayItemPath,
  isAcceptedOverrideSection,
  MAX_CONFIG_CHANGE_OPS,
  getConfigChangeIssues,
  getConfigArrayMergeKey,
  getIndexedMergeKeyIssues,
  getConfigChangeWrittenPaths,
  isSameConfigValue,
  isConfigRevision,
  isConfigPathError,
  runConfigMutation,
  getConfigFieldIssues,
  toConfigOverrideState,
  applyConfigTombstones,
  replaceConfigOverrides,
  parseConfigPathSegments,
  getConfigOverrideIssues,
  getExpectedRevision,
  MAX_CONFIG_PATH_DEPTH,
  DEFAULT_CONFIG_PRIORITY,
  BASE_CONFIG_PRINCIPAL_ID,
  isConfigRevisionConflict,
  isConfigOverrideStateEmpty,
} from '@librechat/data-schemas';
import type {
  AppConfig,
  ConfigDraft,
  ConfigChange,
  ConfigRecord,
  ConfigSection,
  ConfigRevision,
  ConfigFieldWrite,
  SystemCapability,
  ConfigPathError,
  ConfigPathInputs,
  ConfigOverrideIssue,
  ConfigPathErrorReason,
  ConfigOverrideState,
  ConfigEntryError,
  AdminConfigChangeOp,
  AdminConfigChangeRef,
  AdminConfigSkipReason,
  AdminConfigIgnoreReason,
  AdminConfigChangesResponse,
  AdminConfigChangeErrorResponse,
} from '@librechat/data-schemas';
import type { TCustomConfig } from 'librechat-data-provider';
import type { Response } from 'express';
import type { AdminAuditEvent, RecordAuditEntry } from './audit';
import type { CapabilityUser } from '~/middleware/capabilities';
import type { ServerRequest } from '~/types/http';
import {
  encryptConfigSecretFields,
  encryptConfigSecrets,
  getConfigSecretMutationPaths,
  getConfigSecretInputError,
  getConfigSecretSections,
  isConfigSecretAncestorPath,
  isConfigSecretDescendantPath,
  isConfigSecretKeyRename,
  isConfigSecretPreservablePatch,
  isConfigSecretRelatedSegments,
  preserveConfigSecrets,
  redactConfigSecrets,
} from './secrets';
import { getSafeErrorMetadata } from '~/utils/errors';
import { createAdminAuditEmitter } from './audit';

const UNSAFE_SEGMENTS = /(?:^|\.)(__[\w]*|constructor|prototype)(?:\.|$)/;
const MAX_PATCH_ENTRIES = 100;
const BASE_ONLY_OVERRIDE_SECTIONS = new Set<string>(BASE_ONLY_CONFIG_SECTIONS);
const BASE_PRINCIPAL_OVERRIDE_SECTIONS = new Set<string>(BASE_PRINCIPAL_CONFIG_SECTIONS);
const PROCESS_MCP_CONFIG_ERROR =
  'Process-backed MCP servers can only be configured in librechat.yaml';
const LANGFUSE_HEADERS_CONFIG_ERROR =
  'Langfuse request headers can only be configured in librechat.yaml';

/**
 * Langfuse export headers carry proxy/gateway credentials, but they are a map
 * of values rather than one scalar path, so the config secret registry cannot
 * encrypt them at rest or mask them on read. Keeping them out of stored
 * overrides is what makes them deployment-level: an admin-written map would sit
 * in Mongo in plaintext and come back in plaintext, unlike `langfuse.secretKey`.
 */
function isLangfuseHeadersFieldPath(fieldPath: string): boolean {
  return fieldPath === 'langfuse.headers' || fieldPath.startsWith('langfuse.headers.');
}

/**
 * Whether an overrides payload carries Langfuse headers under any spelling.
 *
 * `overrides` is a Mixed document written wholesale, so a dotted property name
 * survives verbatim: `{ langfuse: { "headers.X-Token": "..." } }` and
 * `{ "langfuse.headers": {...} }` both persist a credential that the nested-map
 * redactor never walks, and a later read returns it unchanged.
 */
function hasLangfuseHeadersOverride(rawOverrides: Record<string, unknown>): boolean {
  for (const key of Object.keys(rawOverrides)) {
    if (key === 'langfuse.headers' || key.startsWith('langfuse.headers.')) {
      return true;
    }
  }

  const rawLangfuse = rawOverrides.langfuse;
  if (rawLangfuse == null || typeof rawLangfuse !== 'object' || Array.isArray(rawLangfuse)) {
    return false;
  }
  return Object.keys(rawLangfuse).some((key) => key === 'headers' || key.startsWith('headers.'));
}

export function isValidFieldPath(path: string): boolean {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('.') &&
    !path.endsWith('.') &&
    !path.includes('..') &&
    !path.includes('$') &&
    !UNSAFE_SEGMENTS.test(path)
  );
}

export function getTopLevelSection(fieldPath: string): string {
  return fieldPath.split('.')[0];
}

function isProcessMCPServerFieldPath(fieldPath: string, value: unknown): boolean {
  const [section, _serverName, field] = fieldPath.split('.');
  if (section !== 'mcpServers' && section !== 'mcpConfig') {
    return false;
  }
  if (field == null) {
    return fieldPath === section
      ? hasProcessMCPServerConfig(value)
      : isProcessMCPServerConfig(value);
  }
  return isProcessMCPServerField(field) || (field === 'type' && value === 'stdio');
}

/** Sections whose guards read dotted paths, so a segment that contains a dot is refused there. */
const DOT_FREE_SECTIONS = new Set(['mcpServers', 'mcpConfig', 'langfuse']);

/**
 * Where a field write, removal or tombstone lands. `fieldPath` is the dotted spelling that the
 * section, permission and secret guards read; it names exactly `segments` when `dotFree`.
 */
interface FieldTarget {
  segments: string[];
  fieldPath: string;
  dotFree: boolean;
}

type FieldTargetRead =
  | { ok: true; target: FieldTarget }
  | { ok: false; error: string; reason?: ConfigPathErrorReason };

/**
 * Reads a target from exactly one of `fieldPath` (validated as it always was) and `segments`.
 * Both spellings share the {@link MAX_CONFIG_PATH_DEPTH} cap. A segment that contains a dot is
 * refused wherever a guard would split it: as the section, inside sections whose guards read
 * dotted paths, and on a registered secret's path.
 */
function readFieldTarget(fieldPath: unknown, segments: unknown): FieldTargetRead {
  if (segments === undefined) {
    if (typeof fieldPath !== 'string' || !isValidFieldPath(fieldPath)) {
      return { ok: false, error: `Invalid or unsafe field path: ${String(fieldPath)}` };
    }
    const parsed = parseFieldPath(fieldPath);
    if (parsed.length > MAX_CONFIG_PATH_DEPTH) {
      return { ok: false, error: 'Field path is too deep', reason: 'too_deep' };
    }
    return { ok: true, target: { segments: parsed, fieldPath, dotFree: true } };
  }
  if (fieldPath !== undefined) {
    return { ok: false, error: 'Provide either fieldPath or segments, not both' };
  }
  const parsed = parseConfigPathSegments(segments);
  if (!parsed.ok) {
    return { ok: false, error: 'Invalid or unsafe field path segments', reason: parsed.reason };
  }
  const target: FieldTarget = {
    segments: parsed.segments,
    fieldPath: parsed.segments.join('.'),
    dotFree: isDotFreePath(parsed.segments),
  };
  const [section] = target.segments;
  if (
    !target.dotFree &&
    (section.includes('.') ||
      DOT_FREE_SECTIONS.has(section) ||
      isConfigSecretRelatedSegments(target.segments))
  ) {
    return {
      ok: false,
      error: 'This path cannot address a key that contains a dot',
      reason: 'dotted_segment',
    };
  }
  return { ok: true, target };
}

function fieldTargetErrorResponse(
  res: Response,
  failure: { error: string; reason?: ConfigPathErrorReason },
): Response {
  const { error, reason } = failure;
  return res.status(400).json(reason ? { error, code: 'CONFIG_PATH_INVALID', reason } : { error });
}

/** How a target is named in audit metadata: its dotted path, or its segments when lossy. */
function describeFieldTarget(target: FieldTarget): string {
  return target.dotFree ? target.fieldPath : JSON.stringify(target.segments);
}

/** `segments` in a query string is a JSON-encoded array; anything else is passed on to fail. */
function readSegmentsQuery(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * The field writes in request order: each dot-free entry as encryption and secret
 * preservation left it (one they dropped is skipped), each dotted entry as sent, then any
 * field the secret pipeline added, such as a preview companion.
 */
function toOrderedWrites(
  entries: ReadonlyArray<{ target: FieldTarget; value: unknown }>,
  fields: Record<string, unknown>,
): ConfigFieldWrite[] {
  const pending = new Map(Object.entries(fields));
  const writes: ConfigFieldWrite[] = [];
  for (const { target, value } of entries) {
    if (!target.dotFree) {
      writes.push({ segments: target.segments, value });
    } else if (pending.has(target.fieldPath)) {
      writes.push({ segments: target.segments, value: pending.get(target.fieldPath) });
      pending.delete(target.fieldPath);
    }
  }
  for (const [fieldPath, value] of pending) {
    writes.push({ segments: parseFieldPath(fieldPath), value });
  }
  return writes;
}

/**
 * Returns true if `fieldPath` targets an interface permission field or permission sub-key.
 *
 * - `"interface.prompts"` → true (boolean permission field)
 * - `"interface.agents.use"` → true (permission sub-key)
 * - `"interface.mcpServers"` → true (entire composite field)
 * - `"interface.mcpServers.use"` → true (permission sub-key)
 * - `"interface.mcpServers.placeholder"` → false (UI-only sub-key)
 * - `"interface.peoplePicker.users"` → true (all peoplePicker sub-keys are permissions)
 * - `"interface.modelSelect"` → false (UI-only field)
 */
function isInterfacePermissionPath(fieldPath: string): boolean {
  const parts = fieldPath.split('.');
  if (parts[0] !== 'interface' || parts.length < 2) {
    return false;
  }
  if (!INTERFACE_PERMISSION_FIELDS.has(parts[1])) {
    return false;
  }
  // "interface.<permField>" with no sub-key → permission (blocks the whole field),
  // EXCEPT dual-purpose runtime fields (e.g. schedules) whose bare top-level value
  // is a runtime enable toggle, not a permission — those must pass through so admin
  // field patches/tombstones can set or clear them (their .use/.create permission
  // sub-keys are still blocked below).
  if (parts.length === 2) {
    return !RUNTIME_CONFIG_INTERFACE_FIELDS.has(parts[1]);
  }
  // "interface.<permField>.<subKey>" → only block if sub-key is a permission bit
  return PERMISSION_SUB_KEYS.has(parts[2]);
}

/**
 * Collapses an explicit disable on a dual-purpose runtime interface field (e.g. `schedules`)
 * to its boolean form.
 *
 * For these fields `use` is BOTH a permission bit — stripped from DB overrides — and the
 * runtime disable signal. Stripping it alone would leave `{ maxPerUser: 2 }`, which
 * `getLimits` reads as ENABLED because an object opts in unless it sets `use: false`. An
 * override written to stop scheduled billing for a principal would therefore start it.
 * Other object forms are left alone so a principal can still narrow limits.
 */
function normalizeRuntimeInterfaceValue(field: string, value: unknown): unknown {
  if (!RUNTIME_CONFIG_INTERFACE_FIELDS.has(field)) {
    return value;
  }
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  return (value as Record<string, unknown>).use === false ? false : value;
}

/** Applies {@link normalizeRuntimeInterfaceValue} to a bare `interface.<field>` patch. */
function normalizeInterfaceFieldPatch(fieldPath: string, value: unknown): unknown {
  const parts = fieldPath.split('.');
  if (parts[0] !== 'interface' || parts.length !== 2) {
    return value;
  }
  return normalizeRuntimeInterfaceValue(parts[1], value);
}

/** Sets a key as data, so a submitted `__proto__` key never becomes a prototype. */
function defineKey(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Drops the role-permission fields from a whole `interface` override: a composite permission
 * field keeps its UI-only sub-keys, a runtime field keeps its boolean form, and runtime disables
 * are normalized. Returns what is left (`undefined` when nothing is) and the dropped paths
 * relative to `interface`.
 */
function filterInterfaceOverride(iface: Record<string, unknown>): {
  value?: Record<string, unknown>;
  stripped: string[][];
} {
  const value: Record<string, unknown> = {};
  const stripped: string[][] = [];
  for (const [field, rawValue] of Object.entries(iface)) {
    const fieldValue = normalizeRuntimeInterfaceValue(field, rawValue);
    if (!INTERFACE_PERMISSION_FIELDS.has(field)) {
      defineKey(value, field, fieldValue);
      continue;
    }
    if (isPlainRecord(fieldValue)) {
      const uiOnly: Record<string, unknown> = {};
      for (const [sub, subValue] of Object.entries(fieldValue)) {
        if (PERMISSION_SUB_KEYS.has(sub)) {
          stripped.push([field, sub]);
        } else {
          defineKey(uiOnly, sub, subValue);
        }
      }
      if (Object.keys(uiOnly).length > 0) {
        defineKey(value, field, uiOnly);
      }
      continue;
    }
    if (RUNTIME_CONFIG_INTERFACE_FIELDS.has(field)) {
      defineKey(value, field, fieldValue);
      continue;
    }
    stripped.push([field]);
  }
  return { value: Object.keys(value).length > 0 ? value : undefined, stripped };
}

/** A failure a field guard answers with 400: a message and a stable code. */
interface FieldGuardError {
  error: string;
  code: 'PROCESS_MCP_CONFIG' | 'LANGFUSE_HEADERS_CONFIG' | 'SECRET_PATH';
}

/** Why a field write at `fieldPath` is refused outright, checked before anything is read. */
function getFieldWriteError(fieldPath: string, value: unknown): FieldGuardError | null {
  if (isProcessMCPServerFieldPath(fieldPath, value)) {
    return { error: PROCESS_MCP_CONFIG_ERROR, code: 'PROCESS_MCP_CONFIG' };
  }
  if (isLangfuseHeadersFieldPath(fieldPath)) {
    return { error: LANGFUSE_HEADERS_CONFIG_ERROR, code: 'LANGFUSE_HEADERS_CONFIG' };
  }
  if (isConfigSecretDescendantPath(fieldPath)) {
    return {
      error: `Cannot patch inside protected secret path: ${fieldPath}`,
      code: 'SECRET_PATH',
    };
  }
  const secretInputError = getConfigSecretInputError(fieldPath, value);
  if (secretInputError) {
    return { error: secretInputError, code: 'SECRET_PATH' };
  }
  if (Array.isArray(value) && isConfigSecretAncestorPath(fieldPath)) {
    return {
      error: `Cannot patch protected secret ancestor as an array: ${fieldPath}`,
      code: 'SECRET_PATH',
    };
  }
  return null;
}

/** Why a removal or tombstone at `fieldPath` is refused outright. */
function getFieldRemovalError(fieldPath: string): FieldGuardError | null {
  const secretInputError = getConfigSecretInputError(fieldPath, undefined);
  return secretInputError ? { error: secretInputError, code: 'SECRET_PATH' } : null;
}

/**
 * Why the generic config API leaves a path alone instead of changing it: a section only
 * librechat.yaml configures, a section with its own admin API, or an interface permission. The
 * request still succeeds (owner decision: skip and report, never 400).
 */
function getFieldSkipReason(fieldPath: string): AdminConfigSkipReason | null {
  const section = getTopLevelSection(fieldPath);
  if (BASE_ONLY_OVERRIDE_SECTIONS.has(section)) {
    return 'base_only_section';
  }
  if (BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(section)) {
    return 'dedicated_section';
  }
  return isInterfacePermissionPath(fieldPath) ? 'interface_permission' : null;
}

const SKIP_DESCRIPTIONS: Readonly<Record<AdminConfigSkipReason, string>> = {
  base_only_section: 'base-only config field %s - configure it in librechat.yaml instead',
  base_only_path: 'base-only config path %s - configure it in librechat.yaml instead',
  dedicated_section: 'dedicated tenant-wide config field %s in the generic config API',
  interface_permission: 'interface permission field %s — use role permissions instead',
};

/** Logs a skipped path; `action` is how the route words it (`Stripping`, `Ignoring tombstone for`). */
function logSkippedField(action: string, fieldPath: string, reason: AdminConfigSkipReason): void {
  logger.warn(
    `[adminConfig] ${action} ${SKIP_DESCRIPTIONS[reason].replace('%s', JSON.stringify(fieldPath))}`,
  );
}

/** Fields of overridable sections only librechat.yaml sets, as segments. */
const BASE_ONLY_PATHS: ReadonlyArray<readonly string[]> = BASE_ONLY_CONFIG_PATHS.map((path) =>
  path.split('.'),
);

/** Whether `segments` is a base-only field or lies inside one. */
function isBaseOnlyPath(segments: readonly string[]): boolean {
  return BASE_ONLY_PATHS.some((path) => isSegmentPrefix(path, segments));
}

/**
 * Removes the base-only fields below `segments` from a value written there (`endpoints.agents`
 * carrying `pullRequests.provider`), with the objects that leaves empty. Returns the value to
 * store and the full paths it removed.
 */
function stripBaseOnlyPaths(
  segments: readonly string[],
  value: unknown,
): { value: unknown; stripped: string[][] } {
  let result = value;
  const stripped: string[][] = [];
  for (const path of BASE_ONLY_PATHS) {
    if (path.length <= segments.length || !isSegmentPrefix(segments, path)) {
      continue;
    }
    const relative = path.slice(segments.length);
    if (!isPlainRecord(result) || getAtPath(result, relative) === undefined) {
      continue;
    }
    result = pruneEmptyAncestors(unsetAtPath(result, relative), relative);
    stripped.push([...path]);
  }
  return { value: result, stripped };
}

/**
 * Positional slot where config methods once took a Mongoose `ClientSession`; the portable
 * config store does not join transactions.
 */
type NoSession = undefined;

/** Options of the principal-scoped config writes the handlers delegate whole. */
interface ConfigWriteOptions {
  /** Write only when the stored document is at this revision (`absent`: only if none exists). */
  expectedRevision?: ConfigRevision;
}

interface ConfigLifecycleOptions extends ConfigWriteOptions {
  /** Act only on a document that holds nothing; otherwise resolve to `null`. */
  expectEmpty?: boolean;
}

export interface AdminConfigDeps {
  listAllConfigs: (filter?: { isActive?: boolean }, session?: NoSession) => Promise<ConfigRecord[]>;
  findConfigByPrincipal: (
    principalType: PrincipalType,
    principalId: string,
    options?: { includeInactive?: boolean },
    session?: NoSession,
  ) => Promise<ConfigRecord | null>;
  /**
   * Writes the principal's whole document when it is still at `expected` (`absent`: only when
   * none exists), or throws a `ConfigRevisionConflictError`. PUT and PATCH plan the next
   * document from the one they read, so validation and secret preservation see exactly what the
   * write replaces.
   */
  writeConfigDocument: (
    principalType: PrincipalType,
    principalId: string,
    draft: ConfigDraft,
    expected: ConfigRevision,
  ) => Promise<ConfigRecord>;
  /** Tombstones every path in one write; an omitted `priority` keeps the stored one. */
  tombstoneConfigField: (
    principalType: PrincipalType,
    principalId: string,
    principalModel: PrincipalModel,
    fieldPaths: ConfigPathInputs,
    priority?: number,
    session?: NoSession,
    options?: ConfigWriteOptions,
  ) => Promise<ConfigRecord>;
  /**
   * Removes every path (dotted, or `{ segments }` for keys that contain dots) in one write,
   * pruning parents left empty; `null` when there is no document.
   */
  unsetConfigField: (
    principalType: PrincipalType,
    principalId: string,
    fieldPaths: ConfigPathInputs,
    session?: NoSession,
    options?: ConfigWriteOptions,
  ) => Promise<ConfigRecord | null>;
  deleteConfig: (
    principalType: PrincipalType,
    principalId: string,
    session?: NoSession,
    options?: ConfigLifecycleOptions,
  ) => Promise<ConfigRecord | null>;
  /** Resolves to the post-write document and whether this write changed `isActive`. */
  toggleConfigActiveTracked: (
    principalType: PrincipalType,
    principalId: string,
    isActive: boolean,
    options?: ConfigLifecycleOptions,
  ) => Promise<{ config: ConfigRecord; changed: boolean } | null>;
  hasConfigCapability: (
    user: CapabilityUser,
    section: ConfigSection | null,
    verb?: 'manage' | 'read',
  ) => Promise<boolean>;
  /** Pre-flight-only: whether the caller holds any config-read capability at all (broad or any section), so a zero-access caller 403s before a DB fetch. */
  hasAnyConfigReadAccess?: (user: CapabilityUser) => Promise<boolean>;
  /** Resolves which of a set of sections the caller can read in a single batched query. */
  getReadableConfigSections?: (
    user: CapabilityUser,
    sections: ConfigSection[],
  ) => Promise<{ broad: boolean; sections: Set<string> }>;
  hasCapability?: (user: CapabilityUser, capability: SystemCapability) => Promise<boolean>;
  getAppConfig?: (options?: {
    role?: string;
    userId?: string;
    tenantId?: string;
    baseOnly?: boolean;
    /** Read the overrides from the store instead of the per-principal merged-config cache. */
    bypassOverrideCache?: boolean;
  }) => Promise<AppConfig>;
  /** Invalidate the config caches a mutation affects; awaited before the response is sent. */
  invalidateConfigCaches?: (tenantId?: string) => Promise<void>;
  /** Optional audit emission for override mutations; fail-open unless `auditFailClosed`. */
  recordAuditEntry?: RecordAuditEntry;
  /** When true, a failed audit write surfaces as a 5xx after the mutation has
   * been persisted. Defaults to fail-open. */
  auditFailClosed?: boolean;
}

/** Audit target for a principal's override document. Records field paths and
 * sections only: override values can carry secrets. */
function configTarget(principalType: string, principalId: string): AdminAuditEvent['target'] {
  const key = `${principalType}:${principalId}`;
  return { type: 'config', id: key, name: key };
}

// ── Validation helpers ───────────────────────────────────────────────

const CONFIG_PRINCIPAL_TYPES = new Set([
  PrincipalType.USER,
  PrincipalType.GROUP,
  PrincipalType.ROLE,
]);

function validatePrincipalType(value: string): value is PrincipalType {
  return CONFIG_PRINCIPAL_TYPES.has(value as PrincipalType);
}

function principalModel(type: PrincipalType): PrincipalModel {
  switch (type) {
    case PrincipalType.USER:
      return PrincipalModel.USER;
    case PrincipalType.GROUP:
      return PrincipalModel.GROUP;
    case PrincipalType.ROLE:
      return PrincipalModel.ROLE;
    case PrincipalType.PUBLIC:
      return PrincipalModel.ROLE;
    default: {
      const _exhaustive: never = type;
      logger.warn(`[adminConfig] Unmapped PrincipalType: ${String(_exhaustive)}`);
      return PrincipalModel.ROLE;
    }
  }
}

function getCapabilityUser(req: ServerRequest): CapabilityUser | null {
  if (!req.user) {
    return null;
  }
  return {
    id: req.user.id ?? req.user._id?.toString() ?? '',
    role: req.user.role ?? '',
    tenantId: (req.user as { tenantId?: string }).tenantId,
  };
}

/**
 * `AppConfig` keys exempt from the generic per-key `read:configs:<section>`
 * lookup in `filterSectionsByReadAccess`, for three distinct reasons:
 * - `paths` is a server-computed constant (resolved at module load), not a
 *   `TCustomConfig` section, so no `read:configs:<section>` grant could ever
 *   apply to it.
 * - `config` is the nested container whose contents are filtered separately
 *   below; checking the outer key against a nonexistent `read:configs:config`
 *   grant would always fail and strip the whole object, including sections
 *   the caller legitimately holds.
 * - `availableTools` is derived from the `filteredTools`/`includedTools`
 *   sections plus a filesystem scan, not itself a grantable section. It gets
 *   its own explicit check below, gated on those two source sections, rather
 *   than a lookup against the nonexistent `read:configs:availableTools`.
 * Real `TCustomConfig` sections (e.g. `fileStrategy`) must never be added
 * here: exempting one would return it to every caller regardless of grants.
 */
const STRUCTURAL_APP_CONFIG_KEYS = new Set(['paths', 'availableTools', 'config']);

/**
 * Top-level `AppConfig` response field → canonical `ConfigSection` name.
 * `getAppConfig` renames a few sections in the resolved payload
 * (`interface` → `interfaceConfig`, `turnstile` → `turnstileConfig`,
 * `mcpServers` → `mcpConfig`). The read-grant capability is keyed by the
 * canonical section name, so the top-level filter must normalize through
 * this map before calling `canRead`. Otherwise a caller holding
 * `read:configs:interface` gets `interfaceConfig` incorrectly stripped
 * because no section named "interfaceConfig" exists to grant.
 */
const APP_CONFIG_FIELD_TO_SECTION: Readonly<Record<string, string>> = {
  interfaceConfig: 'interface',
  turnstileConfig: 'turnstile',
  mcpConfig: 'mcpServers',
};

type ReadableSections = { broad: boolean; sections: ReadonlySet<string> };

function canReadSection(readable: ReadableSections, section: string): boolean {
  return readable.broad || readable.sections.has(section);
}

/** Strips every top-level key not in `preserveKeys` that `canRead` rejects. */
function filterSectionsByReadAccess<T extends Record<string, unknown>>(
  obj: T,
  canRead: (section: string) => boolean,
  preserveKeys: Set<string> = new Set(),
): T {
  const result: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(result)) {
    if (!preserveKeys.has(key) && !canRead(key)) {
      delete result[key];
    }
  }
  return result as T;
}

function filterConfigDocForReadAccess<T extends ConfigRecord>(
  config: T,
  readable: ReadableSections,
): T {
  const canRead = (section: string): boolean => canReadSection(readable, section);
  const filteredOverrides = filterSectionsByReadAccess(
    (config.overrides ?? {}) as Record<string, unknown>,
    canRead,
  );

  let filteredTombstones = config.tombstones;
  if (config.tombstones?.length) {
    filteredTombstones = config.tombstones.filter((path) => canRead(getTopLevelSection(path)));
  }

  return {
    ...config,
    overrides: filteredOverrides as Partial<TCustomConfig>,
    tombstones: filteredTombstones,
  };
}

function filterAppConfigForReadAccess(appConfig: AppConfig, readable: ReadableSections): AppConfig {
  const canRead = (section: string): boolean => canReadSection(readable, section);
  const canReadTopLevelField = (field: string): boolean =>
    canRead(APP_CONFIG_FIELD_TO_SECTION[field] ?? field);

  const filtered = filterSectionsByReadAccess(
    appConfig as unknown as Record<string, unknown>,
    canReadTopLevelField,
    STRUCTURAL_APP_CONFIG_KEYS,
  );
  if (!canRead('filteredTools') && !canRead('includedTools')) {
    delete (filtered as { availableTools?: unknown }).availableTools;
  }
  const nestedConfig = (filtered as { config?: Record<string, unknown> }).config;
  if (nestedConfig != null && typeof nestedConfig === 'object') {
    (filtered as { config?: unknown }).config = filterSectionsByReadAccess(nestedConfig, canRead);
  }
  return filtered as unknown as AppConfig;
}

/** All section names a config document's overrides/tombstones could reference. */
function collectConfigSections(config: ConfigRecord): string[] {
  return [
    ...Object.keys(config.overrides ?? {}),
    ...(config.tombstones ?? []).map(getTopLevelSection),
  ];
}

/** All section names an `AppConfig` response could reference, normalized to canonical section names. */
function collectAppConfigSections(appConfig: AppConfig): string[] {
  const topLevel = Object.keys(appConfig)
    .filter((key) => !STRUCTURAL_APP_CONFIG_KEYS.has(key))
    .map((key) => APP_CONFIG_FIELD_TO_SECTION[key] ?? key);
  const nested = (appConfig as unknown as { config?: Record<string, unknown> }).config;
  return [...topLevel, ...(nested ? Object.keys(nested) : [])];
}

type ConfigResponse = ConfigRecord & { revision: ConfigRevision };

/** The document as the admin API returns it: secrets redacted, with its revision. */
function redactConfigForResponse(config: ConfigRecord): ConfigResponse {
  const safeConfig = JSON.parse(JSON.stringify(config)) as ConfigRecord;
  if (safeConfig.overrides) {
    redactConfigSecrets(safeConfig.overrides);
  }
  return { ...safeConfig, revision: getConfigRevision(config) };
}

function redactAppConfigForResponse(appConfig: AppConfig): AppConfig {
  const safeConfig = JSON.parse(JSON.stringify(appConfig)) as AppConfig & { config?: unknown };
  redactConfigSecrets(safeConfig);
  if (safeConfig.config != null && typeof safeConfig.config === 'object') {
    redactConfigSecrets(safeConfig.config);
  }
  return safeConfig;
}

/**
 * Reports only the paths and stable codes: schema messages can echo the submitted values.
 * `report` adds what a route reports alongside them (a batch's `skipped`).
 */
function invalidOverrideResponse(
  res: Response,
  issues: ConfigOverrideIssue[],
  report?: Pick<AdminConfigChangeErrorResponse, 'skipped'>,
): Response {
  return res.status(400).json({
    error: 'Invalid config override',
    code: 'CONFIG_OVERRIDE_INVALID',
    issues: issues.map(({ path, code }) => ({ path, code })),
    ...report,
  });
}

const INVALID_EXPECTED_REVISION_ERROR =
  'expectedRevision must be "absent" or a revision returned by the config API';

/** A client precondition: absent (none given), a well-formed revision, or malformed. */
function readExpectedRevision(
  value: unknown,
): { ok: true; value?: ConfigRevision } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true };
  }
  return isConfigRevision(value) ? { ok: true, value } : { ok: false };
}

function invalidExpectedRevisionResponse(res: Response): Response {
  return res
    .status(400)
    .json({ error: INVALID_EXPECTED_REVISION_ERROR, code: 'INVALID_EXPECTED_REVISION' });
}

/** Reports why a path cannot apply to the stored document, without echoing the path. */
function invalidPathResponse(res: Response, error: ConfigPathError): Response {
  return res.status(400).json({
    error: 'Config path cannot be applied to the stored config',
    code: 'CONFIG_PATH_INVALID',
    reason: error.reason,
  });
}

function preservePatchedConfigSecretFields(
  fields: Record<string, unknown>,
  existingOverrides?: unknown,
): Record<string, unknown> {
  const result = { ...fields };
  for (const [fieldPath, value] of Object.entries(result)) {
    if (isConfigSecretPreservablePatch(fieldPath, value)) {
      result[fieldPath] = preserveConfigSecrets(value, existingOverrides, fieldPath);
    }
  }
  return result;
}

// ── Change batches ───────────────────────────────────────────────────

type ChangeOpKind = AdminConfigChangeOp['op'];

const CHANGE_OPS: ReadonlySet<string> = new Set<ChangeOpKind>([
  'set',
  'unset',
  'tombstone',
  'upsertEntry',
  'removeEntry',
  'rename',
]);

/** Changes whose own path may not reach into a merged-by-key array entry by position. */
const INDEXED_PATH_OPS: ReadonlySet<ChangeOpKind> = new Set<ChangeOpKind>([
  'set',
  'unset',
  'rename',
]);

type SkippedChange = AdminConfigChangeRef & { reason: AdminConfigSkipReason };
type IgnoredChange = AdminConfigChangeRef & { reason: AdminConfigIgnoreReason };

/** A 400 for one change of a batch; `opIndex` names it and nothing submitted is echoed. */
interface ChangeFailure {
  error: string;
  code: string;
  opIndex: number;
  reason?: string;
}

/**
 * A change of a batch, checked and prepared before the stored document is read: guards run,
 * skipped parts are cut out, and submitted secrets are encrypted once. What depends on the
 * stored document (secrets an object omits, entries to rename) is resolved while applying.
 */
interface PreparedChange {
  index: number;
  op: ChangeOpKind;
  target: FieldTarget;
  /** The entry key of `upsertEntry` and `removeEntry`; the old key of `rename`. */
  key?: string;
  /** The new key of `rename`. */
  to?: string;
  /** `set`: the value to store, after normalization and stripping. */
  value?: unknown;
  /** `set` on a dot-free path: `value` with secrets encrypted, plus any preview companion. */
  fields?: Record<string, unknown>;
  /** `upsertEntry`: the entry with secrets encrypted. */
  entry?: Record<string, unknown>;
  /**
   * `unset` and `tombstone`: the paths removed together (a secret and its preview). `set`: the
   * paths it resets instead, when nothing of its value is stored.
   */
  paths?: string[][];
}

type PreparedRead =
  | {
      ok: true;
      /** Two changes with the same identity address the same location. */
      identity: string;
      section: string;
      /** `null` when the whole change is skipped. */
      change: PreparedChange | null;
      skipped: SkippedChange[];
    }
  | { ok: false; failure: ChangeFailure };

function changeFailure(
  opIndex: number,
  error: string,
  code: string,
  reason?: string,
): PreparedRead {
  return {
    ok: false,
    failure: reason ? { error, code, opIndex, reason } : { error, code, opIndex },
  };
}

function toChangeRef(
  change: Pick<PreparedChange, 'index' | 'op' | 'target' | 'key'>,
): AdminConfigChangeRef {
  const ref: AdminConfigChangeRef = {
    opIndex: change.index,
    op: change.op,
    segments: [...change.target.segments],
  };
  if (change.key !== undefined && change.op !== 'rename') {
    ref.key = change.key;
  }
  return ref;
}

function isEntryOp(op: ChangeOpKind): boolean {
  return op === 'upsertEntry' || op === 'removeEntry' || op === 'rename';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** The paths an `unset` of `target` removes together: a secret and its preview companion. */
function getRemovalPaths(target: FieldTarget): string[][] {
  return target.dotFree
    ? getConfigSecretMutationPaths(target.fieldPath).map(parseFieldPath)
    : [target.segments];
}

/**
 * Prepares a `set`: refuses what PATCH refuses, skips what PATCH strips, filters a whole
 * `interface` object and base-only fields out of the value (reporting each), and encrypts it.
 * A set replaces what is stored at its path with what is left of its value, so one whose
 * whole value is filtered out resets the path, as an `unset` does.
 */
function prepareSet(
  raw: Record<string, unknown>,
  base: Pick<PreparedChange, 'index' | 'op' | 'target'>,
  skipReason: AdminConfigSkipReason | null,
): PreparedRead | { ok: true; change: PreparedChange | null; skipped: SkippedChange[] } {
  const { index, target } = base;
  if (!Object.prototype.hasOwnProperty.call(raw, 'value') || raw.value === undefined) {
    return changeFailure(index, 'A set change needs a value', 'INVALID_CHANGE');
  }
  const guardError = getFieldWriteError(target.fieldPath, raw.value);
  if (guardError) {
    return changeFailure(index, guardError.error, guardError.code);
  }
  const ref = toChangeRef(base);
  if (skipReason) {
    return { ok: true, change: null, skipped: [{ ...ref, reason: skipReason }] };
  }
  let value = normalizeInterfaceFieldPatch(target.fieldPath, raw.value);
  const skipped: SkippedChange[] = [];
  if (target.segments.length === 1 && target.segments[0] === 'interface' && isPlainRecord(value)) {
    const filtered = filterInterfaceOverride(value);
    for (const path of filtered.stripped) {
      skipped.push({ ...ref, segments: ['interface', ...path], reason: 'interface_permission' });
    }
    if (filtered.stripped.length > 0 && !filtered.value) {
      return { ok: true, change: { ...base, paths: getRemovalPaths(target) }, skipped };
    }
    value = filtered.value ?? value;
  }
  const stripped = stripBaseOnlyPaths(target.segments, value);
  for (const segments of stripped.stripped) {
    skipped.push({ ...ref, segments, reason: 'base_only_path' });
  }
  if (
    stripped.stripped.length > 0 &&
    isPlainRecord(stripped.value) &&
    Object.keys(stripped.value).length === 0
  ) {
    return { ok: true, change: { ...base, paths: getRemovalPaths(target) }, skipped };
  }
  value = stripped.value;
  const fields = target.dotFree
    ? encryptConfigSecretFields({ [target.fieldPath]: value })
    : undefined;
  return { ok: true, change: { ...base, value, fields }, skipped };
}

/** Prepares an entry change: the path must hold a merged-by-key array (or, to rename, a record). */
function prepareEntryChange(
  raw: Record<string, unknown>,
  base: Pick<PreparedChange, 'index' | 'op' | 'target'>,
  skipReason: AdminConfigSkipReason | null,
): PreparedRead | { ok: true; change: PreparedChange | null; skipped: SkippedChange[] } {
  const { index, op, target } = base;
  const keyField = getConfigArrayMergeKey(target.segments);
  let change: PreparedChange;
  if (op === 'rename') {
    if (!isNonEmptyString(raw.from) || !isNonEmptyString(raw.to)) {
      return changeFailure(
        index,
        'A rename needs non-empty from and to',
        'CONFIG_ENTRY_INVALID',
        'invalid_entry',
      );
    }
    if (!keyField) {
      if (!isConfigRecordPath(target.segments)) {
        return changeFailure(
          index,
          'A rename addresses a collection merged by key or a record of named entries',
          'CONFIG_ENTRY_INVALID',
          'not_collection',
        );
      }
      for (const name of [raw.from, raw.to]) {
        const keyTarget = readFieldTarget(undefined, [...target.segments, name]);
        if (!keyTarget.ok) {
          return changeFailure(index, keyTarget.error, 'CONFIG_PATH_INVALID', keyTarget.reason);
        }
      }
      if (isConfigSecretKeyRename(target.segments, raw.from, raw.to)) {
        return changeFailure(index, 'A rename cannot move a registered secret', 'SECRET_PATH');
      }
    }
    change = { ...base, key: raw.from, to: raw.to };
  } else if (!keyField) {
    return changeFailure(
      index,
      'Entry changes address a collection merged by key, such as endpoints.custom',
      'CONFIG_ENTRY_INVALID',
      'not_collection',
    );
  } else if (op === 'removeEntry') {
    if (!isNonEmptyString(raw.key)) {
      return changeFailure(
        index,
        'removeEntry needs a non-empty key',
        'CONFIG_ENTRY_INVALID',
        'invalid_entry',
      );
    }
    change = { ...base, key: raw.key };
  } else {
    const key = getConfigEntryKey(raw.entry, keyField);
    if (key === undefined) {
      return changeFailure(
        index,
        `upsertEntry needs an entry object with a non-empty ${keyField}`,
        'CONFIG_ENTRY_INVALID',
        'invalid_entry',
      );
    }
    const guardError = getFieldWriteError(target.fieldPath, [raw.entry]);
    if (guardError) {
      return changeFailure(index, guardError.error, guardError.code);
    }
    const [entry] = encryptConfigSecrets([raw.entry as Record<string, unknown>], target.fieldPath);
    change = { ...base, key, entry };
  }
  if (skipReason) {
    return { ok: true, change: null, skipped: [{ ...toChangeRef(change), reason: skipReason }] };
  }
  return { ok: true, change, skipped: [] };
}

/**
 * What a change addresses, for refusing two changes of a batch that address the same thing: a
 * path, or one entry of a collection (by its key; a rename by the key it starts from).
 */
function getChangeIdentity(
  raw: Record<string, unknown>,
  op: ChangeOpKind,
  segments: readonly string[],
): string {
  if (!isEntryOp(op)) {
    return JSON.stringify(['path', segments]);
  }
  if (op === 'rename') {
    return JSON.stringify(['entry', segments, raw.from]);
  }
  if (op === 'removeEntry') {
    return JSON.stringify(['entry', segments, raw.key]);
  }
  const keyField = getConfigArrayMergeKey(segments);
  return JSON.stringify([
    'entry',
    segments,
    keyField ? getConfigEntryKey(raw.entry, keyField) : null,
  ]);
}

/**
 * Reads and checks one change of a batch without touching the stored document. A change
 * refused outright fails the whole batch (400, by `opIndex`); one the API never stores
 * (decision #2: base-only, deployment-owned, dedicated, interface permission) is reported as
 * skipped and the rest of the batch still applies.
 */
function prepareChange(raw: unknown, index: number): PreparedRead {
  if (!isPlainRecord(raw) || typeof raw.op !== 'string' || !CHANGE_OPS.has(raw.op)) {
    return changeFailure(
      index,
      'Each change needs an op: set, unset, tombstone, upsertEntry, removeEntry or rename',
      'INVALID_CHANGE',
    );
  }
  const op = raw.op as ChangeOpKind;
  const read = readFieldTarget(raw.fieldPath, raw.segments);
  if (!read.ok) {
    return changeFailure(
      index,
      read.error,
      read.reason ? 'CONFIG_PATH_INVALID' : 'INVALID_FIELD_PATH',
      read.reason,
    );
  }
  const { target } = read;
  const base = { index, op, target };
  const section = target.segments[0];
  /** Unsetting what an older server stored outside configSchema is cleanup, as DELETE allows. */
  if (op !== 'unset' && !isAcceptedOverrideSection(section)) {
    return changeFailure(index, 'Unknown config section', 'UNKNOWN_SECTION');
  }
  const sectionSkip = getFieldSkipReason(target.fieldPath);

  let prepared:
    | PreparedRead
    | { ok: true; change: PreparedChange | null; skipped: SkippedChange[] };
  if (op === 'set') {
    prepared = prepareSet(
      raw,
      base,
      sectionSkip ?? (isBaseOnlyPath(target.segments) ? 'base_only_path' : null),
    );
  } else if (isEntryOp(op)) {
    prepared = prepareEntryChange(raw, base, sectionSkip);
  } else {
    if (op === 'tombstone' && !target.dotFree) {
      return changeFailure(
        index,
        'A tombstone cannot name a key that contains a dot',
        'CONFIG_PATH_INVALID',
        'dotted_segment',
      );
    }
    if (op === 'tombstone' && isConfigArrayItemPath(target.segments)) {
      return changeFailure(
        index,
        'A tombstone can hide a whole array, not an element or a path inside one',
        'CONFIG_PATH_INVALID',
        'inside_array',
      );
    }
    const removalError = target.dotFree ? getFieldRemovalError(target.fieldPath) : null;
    if (removalError) {
      return changeFailure(index, removalError.error, removalError.code);
    }
    /** Unsetting a stored base-only field is cleanup, so only a tombstone of one is skipped. */
    const skipReason =
      sectionSkip ??
      (op === 'tombstone' && isBaseOnlyPath(target.segments) ? 'base_only_path' : null);
    prepared = skipReason
      ? { ok: true, change: null, skipped: [{ ...toChangeRef(base), reason: skipReason }] }
      : { ok: true, change: { ...base, paths: getRemovalPaths(target) }, skipped: [] };
  }
  if (!prepared.ok) {
    return prepared;
  }
  return {
    ok: true,
    identity: getChangeIdentity(raw, op, target.segments),
    section,
    change: prepared.change,
    skipped: prepared.skipped,
  };
}

/** The changes a prepared change applies, resolved against the document as it stands. */
function expandChange(change: PreparedChange, overrides: unknown): ConfigChange[] {
  const { segments } = change.target;
  switch (change.op) {
    case 'set': {
      if (change.paths) {
        return change.paths.map((path) => ({ op: 'unset', segments: path }));
      }
      if (!change.fields) {
        return [{ op: 'set', segments, value: change.value }];
      }
      /** Secrets an object omits are kept from the document before this change. */
      const fields = preservePatchedConfigSecretFields(change.fields, overrides);
      return toOrderedWrites([{ target: change.target, value: change.value }], fields).map(
        (write) => ({ op: 'set', segments: write.segments, value: write.value }),
      );
    }
    case 'unset':
    case 'tombstone':
      return (change.paths ?? [segments]).map(
        (path) => ({ op: change.op, segments: path }) as ConfigChange,
      );
    case 'upsertEntry': {
      /** An entry that omits its secret keeps the one stored on the entry of the same key. */
      const [entry] = preserveConfigSecrets(
        [change.entry ?? {}],
        overrides,
        change.target.fieldPath,
      );
      return [{ op: 'upsertEntry', segments, entry }];
    }
    case 'removeEntry':
      return [{ op: 'removeEntry', segments, key: change.key ?? '' }];
    case 'rename':
      return [{ op: 'rename', segments, from: change.key ?? '', to: change.to ?? '' }];
  }
}

/** Whether `librechat.yaml` itself defines entry `name` of the collection a change addresses. */
function isYamlEntry(base: unknown, change: PreparedChange, name: string): boolean {
  const node = getAtPath(base, change.target.segments);
  const keyField = getConfigArrayMergeKey(change.target.segments);
  if (keyField) {
    return (
      Array.isArray(node) && node.some((item) => isPlainRecord(item) && item[keyField] === name)
    );
  }
  return isPlainRecord(node) && Object.prototype.hasOwnProperty.call(node, name);
}

/** Names of the MCP servers `librechat.yaml` runs as local processes. */
function getProcessServerNames(base: Partial<TCustomConfig>): Set<string> {
  const servers = (base as { mcpServers?: unknown }).mcpServers;
  if (!isPlainRecord(servers)) {
    return new Set();
  }
  return new Set(
    Object.entries(servers)
      .filter(([, serverConfig]) => isProcessMCPServerConfig(serverConfig))
      .map(([name]) => name),
  );
}

/**
 * The parts of an applied change the runtime merge drops: a write or tombstone under an MCP
 * server librechat.yaml runs as a process, whose overrides the merge never applies, and each
 * such server a tombstone of the whole section leaves in place.
 */
function getIgnoredSegments(
  change: PreparedChange,
  processServers: ReadonlySet<string>,
): string[][] {
  const [section, name] = change.target.segments;
  if (section !== 'mcpServers' || processServers.size === 0) {
    return [];
  }
  if (change.op !== 'set' && change.op !== 'tombstone') {
    return [];
  }
  if (name !== undefined) {
    return processServers.has(name) ? [[...change.target.segments]] : [];
  }
  if (change.op === 'tombstone') {
    return [...processServers].map((server) => ['mcpServers', server]);
  }
  if (!isPlainRecord(change.value)) {
    return [];
  }
  return Object.keys(change.value)
    .filter((server) => processServers.has(server))
    .map((server) => ['mcpServers', server]);
}

/** How an applied change is named in audit metadata: its path, plus the entry it addressed. */
function describeChange(change: PreparedChange): string {
  const path = describeFieldTarget(change.target);
  if (change.op === 'rename') {
    return `${path}[${JSON.stringify(change.key)}->${JSON.stringify(change.to)}]`;
  }
  return change.key !== undefined ? `${path}[${JSON.stringify(change.key)}]` : path;
}

// ── Handler factory ──────────────────────────────────────────────────

export function createAdminConfigHandlers(deps: AdminConfigDeps): {
  listConfigs: (req: ServerRequest, res: Response) => Promise<Response>;
  getBaseConfig: (req: ServerRequest, res: Response) => Promise<Response>;
  getConfig: (req: ServerRequest, res: Response) => Promise<Response>;
  upsertConfigOverrides: (req: ServerRequest, res: Response) => Promise<Response>;
  patchConfigField: (req: ServerRequest, res: Response) => Promise<Response>;
  tombstoneConfigField: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteConfigField: (req: ServerRequest, res: Response) => Promise<Response>;
  applyConfigChanges: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteConfigOverrides: (req: ServerRequest, res: Response) => Promise<Response>;
  toggleConfig: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const {
    listAllConfigs,
    findConfigByPrincipal,
    writeConfigDocument,
    tombstoneConfigField: writeConfigTombstone,
    unsetConfigField,
    deleteConfig,
    toggleConfigActiveTracked,
    hasConfigCapability,
    hasAnyConfigReadAccess = async () => false,
    getReadableConfigSections = async (u, sections) => {
      if (await hasConfigCapability(u, null, 'read')) {
        return { broad: true, sections: new Set(sections) };
      }
      const held = await Promise.all(
        sections.map((section) => hasConfigCapability(u, section, 'read')),
      );
      return { broad: false, sections: new Set(sections.filter((_, i) => held[i])) };
    },
    hasCapability = async () => false,
    getAppConfig,
    invalidateConfigCaches,
    recordAuditEntry,
    auditFailClosed,
  } = deps;

  const emitAudit = createAdminAuditEmitter({
    recordAuditEntry,
    failClosed: auditFailClosed,
    logPrefix: '[adminConfig]',
  });

  function readStoredConfig(
    principalType: PrincipalType,
    principalId: string,
  ): Promise<ConfigRecord | null> {
    return findConfigByPrincipal(principalType, principalId, { includeInactive: true });
  }

  /**
   * Clears the caches a write affects before the response goes out, so the caller's next read
   * sees the write. A failure is logged, not surfaced: the write itself has committed.
   */
  async function invalidateCaches(tenantId: string | undefined, operation: string): Promise<void> {
    try {
      await invalidateConfigCaches?.(tenantId);
    } catch (error) {
      logger.error(
        `[adminConfig] Cache invalidation failed after ${operation}:`,
        getSafeErrorMetadata(error),
      );
    }
  }

  /**
   * 200 for a write with nothing to apply, reporting the stored revision. The precondition
   * still holds: a document that is not at `expectedRevision` answers 409, as the write would.
   */
  async function noopResponse(
    res: Response,
    message: string,
    principalType: PrincipalType,
    principalId: string,
    expectedRevision: ConfigRevision | undefined,
  ): Promise<Response> {
    const stored = await readStoredConfig(principalType, principalId);
    const revision = stored ? getConfigRevision(stored) : null;
    if (expectedRevision && expectedRevision !== getExpectedRevision(stored)) {
      return conflictResponse(res, revision, principalType, principalId);
    }
    return res.status(200).json({ message, revision });
  }

  async function conflictResponse(
    res: Response,
    knownRevision: ConfigRevision | null | undefined,
    principalType: PrincipalType,
    principalId: string,
  ): Promise<Response> {
    let currentRevision = knownRevision;
    if (currentRevision === undefined) {
      const stored = await readStoredConfig(principalType, principalId);
      currentRevision = stored ? getConfigRevision(stored) : null;
    }
    return res.status(409).json({
      error: 'Config was modified by another request',
      code: 'CONFIG_VERSION_CONFLICT',
      currentRevision,
    });
  }

  /** Maps the expected failures of a write to their responses; anything else is rethrown. */
  async function writeFailureResponse(
    res: Response,
    error: unknown,
    principalType: PrincipalType,
    principalId: string,
  ): Promise<Response> {
    if (isConfigRevisionConflict(error)) {
      return conflictResponse(res, error.currentRevision, principalType, principalId);
    }
    if (isConfigPathError(error)) {
      return invalidPathResponse(res, error);
    }
    throw error;
  }

  /** The deployment's `librechat.yaml` config, which overrides are validated on top of. */
  async function getBaseYamlConfig(tenantId?: string): Promise<Partial<TCustomConfig>> {
    if (!getAppConfig) {
      return {};
    }
    const appConfig = await getAppConfig({ tenantId, baseOnly: true });
    return appConfig?.config ?? {};
  }

  /**
   * GET / — List all active config overrides.
   */
  async function listConfigs(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!(await hasAnyConfigReadAccess(user))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const configs = await listAllConfigs();
      const sections = [...new Set(configs.flatMap(collectConfigSections))] as ConfigSection[];
      const readable = await getReadableConfigSections(user, sections);
      const filtered = configs.map((config) => filterConfigDocForReadAccess(config, readable));

      const safeConfigs = filtered.map(redactConfigForResponse);
      return res.status(200).json({ configs: safeConfigs });
    } catch (error) {
      logger.error('[adminConfig] listConfigs error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to list configs' });
    }
  }

  /**
   * GET /base — Return the raw AppConfig (YAML + DB base merged).
   * This is the full config structure admins can edit, NOT the startup payload.
   */
  async function getBaseConfig(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!getAppConfig) {
        return res.status(501).json({ error: 'Base config endpoint not configured' });
      }

      if (!(await hasAnyConfigReadAccess(user))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const baseOnly = (req.query as Record<string, unknown>).baseOnly === 'true';
      const appConfig = await getAppConfig({
        tenantId: user.tenantId,
        baseOnly,
        bypassOverrideCache: true,
      });
      const sections = collectAppConfigSections(appConfig) as ConfigSection[];
      const readable = await getReadableConfigSections(user, sections);
      const filteredAppConfig = filterAppConfigForReadAccess(appConfig, readable);

      return res.status(200).json({ config: redactAppConfigForResponse(filteredAppConfig) });
    } catch (error) {
      logger.error('[adminConfig] getBaseConfig error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to get base config' });
    }
  }

  /**
   * GET /:principalType/:principalId — Get config for a specific principal.
   */
  async function getConfig(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!(await hasAnyConfigReadAccess(user))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const config = await findConfigByPrincipal(principalType, principalId, {
        includeInactive: true,
      });
      if (!config) {
        return res.status(404).json({ error: 'Config not found' });
      }

      const sections = collectConfigSections(config) as ConfigSection[];
      const readable = await getReadableConfigSections(user, sections);
      const filteredConfig = filterConfigDocForReadAccess(config, readable);

      return res.status(200).json({ config: redactConfigForResponse(filteredConfig) });
    } catch (error) {
      logger.error('[adminConfig] getConfig error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to get config' });
    }
  }

  /**
   * PUT /:principalType/:principalId — Replace entire overrides for a principal.
   */
  async function upsertConfigOverrides(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const { overrides, priority } = req.body as {
        overrides?: Partial<TCustomConfig>;
        priority?: number;
      };

      if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
        return res.status(400).json({ error: 'overrides must be a plain object' });
      }

      const expected = readExpectedRevision(
        (req.body as { expectedRevision?: unknown }).expectedRevision,
      );
      if (!expected.ok) {
        return invalidExpectedRevisionResponse(res);
      }

      const rawOverrides = overrides as Record<string, unknown>;
      if (
        hasProcessMCPServerConfig(rawOverrides.mcpServers) ||
        hasProcessMCPServerConfig(rawOverrides.mcpConfig)
      ) {
        return res.status(400).json({ error: PROCESS_MCP_CONFIG_ERROR });
      }

      if (hasLangfuseHeadersOverride(rawOverrides)) {
        return res.status(400).json({ error: LANGFUSE_HEADERS_CONFIG_ERROR });
      }

      if (priority != null && (typeof priority !== 'number' || priority < 0)) {
        return res.status(400).json({ error: 'priority must be a non-negative number' });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      if (principalId === BASE_CONFIG_PRINCIPAL_ID && !hasBroadManage) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const hasAssignConfigs =
        hasBroadManage ||
        (await hasCapability(user, `assign:configs:${principalType}` as SystemCapability));

      if (!hasAssignConfigs) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const filteredOverrides = {
        ...(overrides as Record<string, unknown>),
      } as Partial<TCustomConfig>;
      for (const section of BASE_ONLY_OVERRIDE_SECTIONS) {
        if (section in filteredOverrides) {
          delete (filteredOverrides as Record<string, unknown>)[section];
          logger.warn(
            `[adminConfig] Stripping base-only config section "${section}" - configure it in librechat.yaml instead`,
          );
        }
      }
      for (const key of Object.keys(filteredOverrides)) {
        const section = getTopLevelSection(key);
        if (BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(section)) {
          delete (filteredOverrides as Record<string, unknown>)[key];
          logger.warn(
            `[adminConfig] Stripping dedicated tenant-wide config section "${key}" from the generic config API`,
          );
        }
      }
      const iface = (overrides as Record<string, unknown>).interface;
      if (isPlainRecord(iface)) {
        const { value, stripped } = filterInterfaceOverride(iface);
        for (const path of stripped) {
          logSkippedField('Stripping', ['interface', ...path].join('.'), 'interface_permission');
        }
        if (value) {
          (filteredOverrides as Record<string, unknown>).interface = value;
        } else {
          delete (filteredOverrides as Record<string, unknown>).interface;
        }
      }

      const overrideSections = Object.keys(filteredOverrides);

      if (overrideSections.length === 0 && priority == null) {
        return noopResponse(
          res,
          'No actionable override sections provided',
          principalType,
          principalId,
          expected.value,
        );
      }

      if (overrideSections.length > 0 && !hasBroadManage) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      if (priority != null && !hasBroadManage) {
        logger.warn(
          `[adminConfig] Ignoring caller-supplied priority on assign-only scope lifecycle upsert to ${principalType}/${principalId}: only broad manage:configs may modify document priority`,
        );
      }

      for (const section of getConfigSecretSections()) {
        const secretInputError = getConfigSecretInputError(
          section,
          (filteredOverrides as Record<string, unknown>)[section],
        );
        if (secretInputError) {
          return res.status(400).json({ error: secretInputError });
        }
      }

      const encryptedOverrides = encryptConfigSecrets(filteredOverrides);
      const baseYaml = overrideSections.length > 0 ? await getBaseYamlConfig(user.tenantId) : {};

      type PutStop = { status: 403 } | { status: 400; issues: ConfigOverrideIssue[] };
      let outcome;
      try {
        outcome = await runConfigMutation<PutStop>(
          {
            read: () => readStoredConfig(principalType, principalId),
            write: (draft, revision) =>
              writeConfigDocument(principalType, principalId, draft, revision),
          },
          (stored) => {
            /** Assign-only callers manage the profile's lifecycle, never its contents. */
            if (
              !hasBroadManage &&
              stored &&
              !isConfigOverrideStateEmpty(toConfigOverrideState(stored))
            ) {
              return { draft: null, result: { status: 403 } };
            }
            /** Secrets an object omits are kept before validation sees the document. */
            const preserved = preserveConfigSecrets(encryptedOverrides, stored?.overrides);
            /** A full replace keeps the principal's tombstones, so they shape its base. */
            const issues = getConfigOverrideIssues(
              preserved,
              applyConfigTombstones(baseYaml, stored?.tombstones),
            );
            if (issues.length > 0) {
              return { draft: null, result: { status: 400, issues } };
            }
            const next = { ...preserved } as Record<string, unknown>;
            if (principalId === BASE_CONFIG_PRINCIPAL_ID) {
              for (const section of BASE_PRINCIPAL_OVERRIDE_SECTIONS) {
                const storedSection = (stored?.overrides as Record<string, unknown> | undefined)?.[
                  section
                ];
                if (storedSection !== undefined) {
                  next[section] = storedSection;
                }
              }
            }
            const state = replaceConfigOverrides(
              toConfigOverrideState(stored),
              next as Partial<TCustomConfig>,
            );
            return {
              draft: {
                principalModel: principalModel(principalType),
                priority: hasBroadManage
                  ? (priority ?? DEFAULT_CONFIG_PRIORITY)
                  : (stored?.priority ?? DEFAULT_CONFIG_PRIORITY),
                overrides: state.overrides,
                tombstones: state.tombstones,
                isActive: true,
              },
            };
          },
          { expectedRevision: expected.value },
        );
      } catch (error) {
        return await writeFailureResponse(res, error, principalType, principalId);
      }

      if (!outcome.written) {
        const stop = outcome.result;
        if (stop.status === 403) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
        return invalidOverrideResponse(res, stop.issues);
      }

      const { record: config, previous } = outcome;
      const created = previous == null;
      await invalidateCaches(user.tenantId, 'upsert');
      await emitAudit(req, {
        action: created ? 'config.created' : 'config.updated',
        target: configTarget(principalType, principalId),
        metadata: {
          operation: 'replace',
          sections: overrideSections.join(','),
          priority: config.priority,
        },
      });
      return res.status(created ? 201 : 200).json({ config: redactConfigForResponse(config) });
    } catch (error) {
      logger.error('[adminConfig] upsertConfigOverrides error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to upsert config' });
    }
  }

  /**
   * PATCH /:principalType/:principalId/fields — Set individual fields via dot-paths.
   */
  async function patchConfigField(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const { entries, priority } = req.body as {
        entries?: Array<{ fieldPath?: unknown; segments?: unknown; value: unknown } | null>;
        priority?: number;
      };

      if (priority != null && (typeof priority !== 'number' || priority < 0)) {
        return res.status(400).json({ error: 'priority must be a non-negative number' });
      }

      const expected = readExpectedRevision(
        (req.body as { expectedRevision?: unknown }).expectedRevision,
      );
      if (!expected.ok) {
        return invalidExpectedRevisionResponse(res);
      }

      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: 'entries array is required and must not be empty' });
      }

      if (entries.length > MAX_PATCH_ENTRIES) {
        return res
          .status(400)
          .json({ error: `entries array exceeds maximum of ${MAX_PATCH_ENTRIES}` });
      }

      const targets: Array<{ target: FieldTarget; value: unknown }> = [];
      for (const entry of entries) {
        const read = readFieldTarget(entry?.fieldPath, entry?.segments);
        if (!read.ok) {
          return fieldTargetErrorResponse(res, read);
        }
        const value = entry?.value;
        const guardError = getFieldWriteError(read.target.fieldPath, value);
        if (guardError) {
          return res.status(400).json({ error: guardError.error });
        }
        targets.push({ target: read.target, value });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const validEntries = targets
        .map(({ target, value }) => ({
          target,
          value: normalizeInterfaceFieldPatch(target.fieldPath, value),
        }))
        .filter(({ target: { fieldPath } }) => {
          const skipReason = getFieldSkipReason(fieldPath);
          if (skipReason) {
            logSkippedField('Stripping', fieldPath, skipReason);
          }
          return skipReason == null;
        });

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      if (principalId === BASE_CONFIG_PRINCIPAL_ID && !hasBroadManage) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      if (validEntries.length === 0) {
        if (!hasBroadManage) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
        return noopResponse(
          res,
          'No actionable field entries provided',
          principalType,
          principalId,
          expected.value,
        );
      }

      if (!hasBroadManage) {
        const sections = [
          ...new Set(validEntries.map(({ target }) => getTopLevelSection(target.fieldPath))),
        ];
        const allowed = await Promise.all(
          sections.map((s) => hasConfigCapability(user, s as ConfigSection, 'manage')),
        );
        const denied = sections.find((_, i) => !allowed[i]);
        if (denied) {
          return res.status(403).json({
            error: `Insufficient permissions for config section: ${denied}`,
          });
        }
      }

      const seenPaths = new Set<string>();
      const seenSegments = new Set<string>();
      const fields: Record<string, unknown> = {};
      for (const { target, value } of validEntries) {
        if (!target.dotFree) {
          const key = JSON.stringify(target.segments);
          if (seenSegments.has(key)) {
            return res.status(400).json({ error: 'Duplicate field path segments' });
          }
          seenSegments.add(key);
          continue;
        }
        if (seenPaths.has(target.fieldPath)) {
          return res.status(400).json({ error: `Duplicate fieldPath: ${target.fieldPath}` });
        }
        seenPaths.add(target.fieldPath);
        fields[target.fieldPath] = value;
      }

      if (priority != null && !hasBroadManage) {
        logger.warn(
          `[adminConfig] Ignoring caller-supplied priority on section-scoped patch to ${principalType}/${principalId}: only broad manage:configs may modify document priority`,
        );
      }
      const requestedPriority = hasBroadManage ? priority : undefined;

      const baseYaml = await getBaseYamlConfig(user.tenantId);
      const encryptedFields = encryptConfigSecretFields(fields);

      let outcome;
      try {
        outcome = await runConfigMutation<ConfigOverrideIssue[]>(
          {
            read: () => readStoredConfig(principalType, principalId),
            write: (draft, revision) =>
              writeConfigDocument(principalType, principalId, draft, revision),
          },
          (stored) => {
            /** Secrets an object omits are kept before validation sees the document. */
            const writes = toOrderedWrites(
              validEntries,
              preservePatchedConfigSecretFields(encryptedFields, stored?.overrides),
            );
            const fieldIssues = getConfigFieldIssues(writes, baseYaml, stored);
            if (fieldIssues.length > 0) {
              return { draft: null, result: fieldIssues };
            }
            const state = setConfigFields(toConfigOverrideState(stored), writes);
            return {
              draft: {
                principalModel: principalModel(principalType),
                priority: requestedPriority ?? stored?.priority ?? DEFAULT_CONFIG_PRIORITY,
                overrides: state.overrides,
                tombstones: state.tombstones,
                isActive: stored?.isActive ?? true,
              },
            };
          },
          { expectedRevision: expected.value },
        );
      } catch (error) {
        return await writeFailureResponse(res, error, principalType, principalId);
      }

      if (!outcome.written) {
        return invalidOverrideResponse(res, outcome.result);
      }

      const { record: config, previous } = outcome;
      await invalidateCaches(user.tenantId, 'patch');
      await emitAudit(req, {
        action: previous == null ? 'config.created' : 'config.updated',
        target: configTarget(principalType, principalId),
        metadata: {
          operation: 'patch',
          fieldPaths: validEntries.map(({ target }) => describeFieldTarget(target)).join(','),
        },
      });
      return res.status(200).json({ config: redactConfigForResponse(config) });
    } catch (error) {
      logger.error('[adminConfig] patchConfigField error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to patch config fields' });
    }
  }

  /**
   * POST /:principalType/:principalId/fields/tombstone — Suppress an inherited config path.
   */
  async function tombstoneConfigField(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const {
        fieldPath: rawFieldPath,
        segments,
        priority,
      } = req.body as {
        fieldPath?: unknown;
        segments?: unknown;
        priority?: number;
      };

      if (segments === undefined && (!rawFieldPath || typeof rawFieldPath !== 'string')) {
        return res.status(400).json({ error: 'fieldPath is required' });
      }

      if (priority != null && (typeof priority !== 'number' || priority < 0)) {
        return res.status(400).json({ error: 'priority must be a non-negative number' });
      }

      const expected = readExpectedRevision(
        (req.body as { expectedRevision?: unknown }).expectedRevision,
      );
      if (!expected.ok) {
        return invalidExpectedRevisionResponse(res);
      }

      const read = readFieldTarget(rawFieldPath, segments);
      if (!read.ok) {
        return fieldTargetErrorResponse(res, read);
      }
      /** Tombstones are stored as dotted paths, so they cannot name a key that contains a dot. */
      if (!read.target.dotFree) {
        return fieldTargetErrorResponse(res, {
          error: 'A tombstone cannot name a key that contains a dot',
          reason: 'dotted_segment',
        });
      }
      const { fieldPath } = read.target;
      const removalError = getFieldRemovalError(fieldPath);
      if (removalError) {
        return res.status(400).json({ error: removalError.error });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const section = getTopLevelSection(fieldPath);

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      if (principalId === BASE_CONFIG_PRINCIPAL_ID && !hasBroadManage) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      if (
        !hasBroadManage &&
        !(await hasConfigCapability(user, section as ConfigSection, 'manage'))
      ) {
        return res.status(403).json({
          error: `Insufficient permissions for config section: ${section}`,
        });
      }

      const skipReason = getFieldSkipReason(fieldPath);
      if (skipReason) {
        logSkippedField('Ignoring tombstone for', fieldPath, skipReason);
        return noopResponse(
          res,
          'No actionable field path provided',
          principalType,
          principalId,
          expected.value,
        );
      }

      if (priority != null && !hasBroadManage) {
        logger.warn(
          `[adminConfig] Ignoring caller-supplied priority on section-scoped tombstone for ${principalType}/${principalId}: only broad manage:configs may modify document priority`,
        );
      }
      const requestedPriority = hasBroadManage ? priority : undefined;

      let config: ConfigRecord;
      try {
        /** A secret and its preview companion are suppressed together, in one write. */
        config = await writeConfigTombstone(
          principalType,
          principalId,
          principalModel(principalType),
          getConfigSecretMutationPaths(fieldPath),
          requestedPriority,
          undefined,
          { expectedRevision: expected.value },
        );
      } catch (error) {
        return await writeFailureResponse(res, error, principalType, principalId);
      }

      await invalidateCaches(user.tenantId, 'field tombstone');
      await emitAudit(req, {
        action: config.configVersion === 1 ? 'config.created' : 'config.updated',
        target: configTarget(principalType, principalId),
        metadata: { operation: 'tombstone', fieldPath },
      });
      return res.status(200).json({ config: redactConfigForResponse(config) });
    } catch (error) {
      logger.error('[adminConfig] tombstoneConfigField error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to tombstone config field' });
    }
  }

  /**
   * DELETE /:principalType/:principalId/fields?fieldPath=dotted.path
   * (or `?segments=<JSON array>` for a path whose keys contain dots)
   */
  async function deleteConfigField(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };
      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const { fieldPath: rawFieldPath, segments: rawSegments } = req.query;

      if (rawSegments === undefined && (!rawFieldPath || typeof rawFieldPath !== 'string')) {
        return res.status(400).json({ error: 'fieldPath query parameter is required' });
      }

      const expected = readExpectedRevision(req.query.expectedRevision);
      if (!expected.ok) {
        return invalidExpectedRevisionResponse(res);
      }

      const read = readFieldTarget(
        rawFieldPath,
        rawSegments === undefined ? undefined : readSegmentsQuery(rawSegments),
      );
      if (!read.ok) {
        return fieldTargetErrorResponse(res, read);
      }
      const { target } = read;
      const { fieldPath } = target;
      const removalError = getFieldRemovalError(fieldPath);
      if (removalError) {
        return res.status(400).json({ error: removalError.error });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const section = getTopLevelSection(fieldPath);

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      if (principalId === BASE_CONFIG_PRINCIPAL_ID && !hasBroadManage) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      if (
        !hasBroadManage &&
        !(await hasConfigCapability(user, section as ConfigSection, 'manage'))
      ) {
        return res.status(403).json({
          error: `Insufficient permissions for config section: ${section}`,
        });
      }

      const skipReason = getFieldSkipReason(fieldPath);
      if (skipReason) {
        logSkippedField('Ignoring delete for', fieldPath, skipReason);
        return noopResponse(
          res,
          'No actionable field path provided',
          principalType,
          principalId,
          expected.value,
        );
      }

      let config: ConfigRecord | null;
      try {
        /**
         * A secret and its preview companion are removed together, in one write. A path with a
         * dotted key never names a secret, so it goes by its segments alone.
         */
        config = await unsetConfigField(
          principalType,
          principalId,
          target.dotFree
            ? getConfigSecretMutationPaths(fieldPath)
            : [{ segments: target.segments }],
          undefined,
          { expectedRevision: expected.value },
        );
      } catch (error) {
        return await writeFailureResponse(res, error, principalType, principalId);
      }
      if (!config) {
        return res.status(404).json({ error: 'Config not found' });
      }

      await invalidateCaches(user.tenantId, 'field delete');
      await emitAudit(req, {
        action: 'config.updated',
        target: configTarget(principalType, principalId),
        metadata: { operation: 'unset', fieldPath: describeFieldTarget(target) },
      });
      return res.status(200).json({ config: redactConfigForResponse(config) });
    } catch (error) {
      logger.error('[adminConfig] deleteConfigField error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to delete config field' });
    }
  }

  /**
   * The document a write returns, as a read would show it to the caller: redacted, and limited
   * to the sections they can read plus the ones they just managed (`manage:configs:<section>`
   * does not imply reading other sections).
   */
  async function toReadableConfig(
    user: CapabilityUser,
    config: ConfigRecord,
    access: { hasBroadManage: boolean; managedSections: readonly string[] },
  ): Promise<ConfigResponse> {
    const safeConfig = redactConfigForResponse(config);
    if (access.hasBroadManage) {
      return safeConfig;
    }
    const readable = await getReadableConfigSections(user, [
      ...new Set(collectConfigSections(safeConfig)),
    ] as ConfigSection[]);
    const sections = new Set([...readable.sections, ...access.managedSections]);
    return filterConfigDocForReadAccess(safeConfig, { broad: readable.broad, sections });
  }

  /**
   * POST /:principalType/:principalId/changes — Apply a batch of changes atomically.
   *
   * Every change is checked before anything is read; then the stored document is read, the
   * changes are applied in order as pure transforms (secrets an object omits are kept from the
   * document as it stands before each change), the end state is validated on the deployment's
   * librechat.yaml without the principal's tombstones, and the result is written with one
   * compare-and-swap. Any failure leaves the document as it was.
   */
  async function applyChanges(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({
          error: `Invalid principalType: ${principalType}`,
          code: 'INVALID_PRINCIPAL_TYPE',
        });
      }

      const body = (req.body ?? {}) as {
        ops?: unknown;
        priority?: unknown;
        dryRun?: unknown;
        expectedRevision?: unknown;
      };
      const { ops, priority } = body;

      if (
        priority != null &&
        (typeof priority !== 'number' || !Number.isFinite(priority) || priority < 0)
      ) {
        return res
          .status(400)
          .json({ error: 'priority must be a non-negative number', code: 'INVALID_PRIORITY' });
      }

      if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') {
        return res.status(400).json({ error: 'dryRun must be a boolean', code: 'INVALID_DRY_RUN' });
      }
      const dryRun = body.dryRun === true;

      const expected = readExpectedRevision(body.expectedRevision);
      if (!expected.ok) {
        return invalidExpectedRevisionResponse(res);
      }

      if (!Array.isArray(ops) || ops.length === 0) {
        return res
          .status(400)
          .json({ error: 'ops array is required and must not be empty', code: 'OPS_REQUIRED' });
      }

      if (ops.length > MAX_CONFIG_CHANGE_OPS) {
        return res.status(400).json({
          error: `ops array exceeds maximum of ${MAX_CONFIG_CHANGE_OPS}`,
          code: 'TOO_MANY_OPS',
        });
      }

      const changes: PreparedChange[] = [];
      const skipped: SkippedChange[] = [];
      const identities = new Set<string>();
      const sections = new Set<string>();
      for (let index = 0; index < ops.length; index++) {
        const prepared = prepareChange(ops[index], index);
        if (!prepared.ok) {
          return res.status(400).json(prepared.failure);
        }
        if (identities.has(prepared.identity)) {
          return res.status(400).json({
            error: 'Two changes address the same path or entry',
            code: 'DUPLICATE_FIELD_PATH',
            opIndex: index,
          });
        }
        identities.add(prepared.identity);
        sections.add(prepared.section);
        skipped.push(...prepared.skipped);
        if (prepared.change) {
          changes.push(prepared.change);
        }
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      if (principalId === BASE_CONFIG_PRINCIPAL_ID && !hasBroadManage) {
        return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
      }

      const managedSections = [...sections];
      if (!hasBroadManage) {
        const allowed = await Promise.all(
          managedSections.map((section) =>
            hasConfigCapability(user, section as ConfigSection, 'manage'),
          ),
        );
        const denied = managedSections.find((_, i) => !allowed[i]);
        if (denied) {
          return res.status(403).json({
            error: `Insufficient permissions for config section: ${denied}`,
            code: 'FORBIDDEN_SECTION',
            section: denied,
          });
        }
      }

      if (priority != null && !hasBroadManage) {
        logger.warn(
          `[adminConfig] Ignoring caller-supplied priority on section-scoped changes to ${principalType}/${principalId}: only broad manage:configs may modify document priority`,
        );
      }
      const requestedPriority = hasBroadManage ? (priority as number | undefined) : undefined;

      const baseYaml = await getBaseYamlConfig(user.tenantId);
      for (const change of changes) {
        if (
          change.op === 'rename' &&
          (isYamlEntry(baseYaml, change, change.key ?? '') ||
            isYamlEntry(baseYaml, change, change.to ?? ''))
        ) {
          return res.status(400).json({
            error:
              'An entry librechat.yaml defines cannot be renamed, and no entry can take its name',
            code: 'CONFIG_ENTRY_INVALID',
            reason: 'inherited_entry',
            opIndex: change.index,
          });
        }
      }
      const processServers = getProcessServerNames(baseYaml);

      interface ChangesReport {
        applied: AdminConfigChangeRef[];
        unchanged: AdminConfigChangeRef[];
        ignored: IgnoredChange[];
        appliedChanges: PreparedChange[];
      }
      type ChangesStop =
        | { kind: 'issues'; issues: ConfigOverrideIssue[] }
        | { kind: 'change'; failure: ChangeFailure };
      type ChangesResult = { report: ChangesReport; stop?: never } | { stop: ChangesStop };

      const plan = (
        stored: ConfigRecord | null,
      ): { draft: ConfigDraft | null; result: ChangesResult } => {
        const report: ChangesReport = {
          applied: [],
          unchanged: [],
          ignored: [],
          appliedChanges: [],
        };
        const written: string[][] = [];
        let state: ConfigOverrideState = toConfigOverrideState(stored);
        for (const change of changes) {
          const steps = expandChange(change, state.overrides);
          let next = state;
          try {
            for (const step of steps) {
              next = applyConfigChange(next, step);
            }
          } catch (error) {
            if (!isConfigPathError(error) && !isConfigEntryError(error)) {
              throw error;
            }
            const failure: ChangeFailure = {
              error: 'Config change cannot be applied to the stored config',
              code: (error as ConfigPathError | ConfigEntryError).code,
              reason: (error as ConfigPathError | ConfigEntryError).reason,
              opIndex: change.index,
            };
            return { draft: null, result: { stop: { kind: 'change', failure } } };
          }
          const ref = toChangeRef(change);
          if (next === state) {
            report.unchanged.push(ref);
            continue;
          }
          for (const step of steps) {
            written.push(...getConfigChangeWrittenPaths(step, next));
          }
          report.applied.push(ref);
          report.appliedChanges.push(change);
          for (const segments of getIgnoredSegments(change, processServers)) {
            report.ignored.push({ ...ref, segments, reason: 'process_mcp_server' });
          }
          state = next;
        }

        /** Entries of a merged-by-key array are named by key: a write, a removal or a record
         *  rename that reaches into one by position is refused, since the position can name
         *  another entry by the time the batch is applied. */
        const indexed = getIndexedMergeKeyIssues(
          changes
            .filter((change) => INDEXED_PATH_OPS.has(change.op))
            .map((change) => change.target.segments),
        );
        if (indexed.length > 0) {
          return { draft: null, result: { stop: { kind: 'issues', issues: indexed } } };
        }
        /** Changes that cancel out (a set, then an unset of its parent) leave nothing to write. */
        const storedState = toConfigOverrideState(stored);
        const documentChanged =
          report.applied.length > 0 &&
          !(
            isSameConfigValue(state.overrides, storedState.overrides) &&
            isSameConfigValue(state.tombstones, storedState.tombstones)
          );
        if (!documentChanged && report.applied.length > 0) {
          report.unchanged = [...report.applied, ...report.unchanged].sort(
            (left, right) => left.opIndex - right.opIndex,
          );
          report.applied = [];
          report.ignored = [];
          report.appliedChanges = [];
        }
        const priorityChanged =
          stored != null && requestedPriority != null && requestedPriority !== stored.priority;
        if (!documentChanged && !priorityChanged) {
          return { draft: null, result: { report } };
        }
        if (documentChanged) {
          const issues = getConfigChangeIssues(state, baseYaml, stored, written);
          if (issues.length > 0) {
            return { draft: null, result: { stop: { kind: 'issues', issues } } };
          }
        }
        if (dryRun) {
          return { draft: null, result: { report } };
        }
        return {
          draft: {
            principalModel: principalModel(principalType),
            priority: requestedPriority ?? stored?.priority ?? DEFAULT_CONFIG_PRIORITY,
            overrides: state.overrides,
            tombstones: state.tombstones,
            isActive: stored?.isActive ?? true,
          },
          result: { report },
        };
      };

      let outcome;
      try {
        outcome = await runConfigMutation<ChangesResult>(
          {
            read: () => readStoredConfig(principalType, principalId),
            write: (draft, revision) =>
              writeConfigDocument(principalType, principalId, draft, revision),
          },
          plan,
          { expectedRevision: expected.value },
        );
      } catch (error) {
        return await writeFailureResponse(res, error, principalType, principalId);
      }

      const result = outcome.result as ChangesResult;
      if (result.stop?.kind === 'change') {
        return res.status(400).json(result.stop.failure);
      }
      if (result.stop) {
        return invalidOverrideResponse(res, result.stop.issues, { skipped });
      }
      const { report } = result;
      const config = outcome.written ? outcome.record : outcome.current;

      if (outcome.written) {
        await invalidateCaches(user.tenantId, 'changes');
        const paths = new Map<string, string[]>();
        for (const change of report.appliedChanges) {
          paths.set(change.op, [...(paths.get(change.op) ?? []), describeChange(change)]);
        }
        await emitAudit(req, {
          action: outcome.previous == null ? 'config.created' : 'config.updated',
          target: configTarget(principalType, principalId),
          metadata: {
            operation: 'batch',
            changes: report.applied.length,
            priority: outcome.record.priority,
            ...Object.fromEntries([...paths].map(([op, described]) => [op, described.join(',')])),
          },
        });
      }

      return res.status(200).json({
        ...(dryRun
          ? {}
          : {
              config: config
                ? await toReadableConfig(user, config, { hasBroadManage, managedSections })
                : null,
            }),
        revision: config ? getConfigRevision(config) : null,
        written: outcome.written,
        dryRun,
        applied: report.applied,
        skipped,
        ignored: report.ignored,
        unchanged: report.unchanged,
      } satisfies Omit<AdminConfigChangesResponse, 'config'> & { config?: ConfigResponse | null });
    } catch (error) {
      logger.error('[adminConfig] applyConfigChanges error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to apply config changes' });
    }
  }

  /**
   * DELETE /:principalType/:principalId — Delete an entire config override.
   */
  async function deleteConfigOverrides(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const expected = readExpectedRevision(req.query.expectedRevision);
      if (!expected.ok) {
        return invalidExpectedRevisionResponse(res);
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      if (principalId === BASE_CONFIG_PRINCIPAL_ID && !hasBroadManage) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const allowed =
        hasBroadManage ||
        (await hasCapability(user, `assign:configs:${principalType}` as SystemCapability));
      if (!allowed) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      let config: ConfigRecord | null;
      try {
        config = await deleteConfig(principalType, principalId, undefined, {
          expectEmpty: !hasBroadManage,
          expectedRevision: expected.value,
        });
      } catch (error) {
        return await writeFailureResponse(res, error, principalType, principalId);
      }
      if (!config) {
        if (!hasBroadManage) {
          const exists = await findConfigByPrincipal(principalType, principalId, {
            includeInactive: true,
          });
          if (exists) {
            return res.status(403).json({ error: 'Insufficient permissions' });
          }
        }
        return res.status(404).json({ error: 'Config not found' });
      }

      await invalidateCaches(user.tenantId, 'config delete');
      await emitAudit(req, {
        action: 'config.deleted',
        severity: 'warning',
        target: configTarget(principalType, principalId),
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[adminConfig] deleteConfigOverrides error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to delete config' });
    }
  }

  /**
   * PATCH /:principalType/:principalId/active — Toggle isActive.
   */
  async function toggleConfig(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };

      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }

      const { isActive } = req.body as { isActive?: boolean };
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive boolean is required' });
      }

      const expected = readExpectedRevision(
        (req.body as { expectedRevision?: unknown }).expectedRevision,
      );
      if (!expected.ok) {
        return invalidExpectedRevisionResponse(res);
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      if (principalId === BASE_CONFIG_PRINCIPAL_ID && !hasBroadManage) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const allowed =
        hasBroadManage ||
        (await hasCapability(user, `assign:configs:${principalType}` as SystemCapability));
      if (!allowed) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      let toggled: { config: ConfigRecord; changed: boolean } | null;
      try {
        toggled = await toggleConfigActiveTracked(principalType, principalId, isActive, {
          expectEmpty: !hasBroadManage,
          expectedRevision: expected.value,
        });
      } catch (error) {
        return await writeFailureResponse(res, error, principalType, principalId);
      }
      if (!toggled) {
        if (!hasBroadManage) {
          const exists = await findConfigByPrincipal(principalType, principalId, {
            includeInactive: true,
          });
          if (exists) {
            return res.status(403).json({ error: 'Insufficient permissions' });
          }
        }
        return res.status(404).json({ error: 'Config not found' });
      }

      const { config, changed } = toggled;
      await invalidateCaches(user.tenantId, 'toggle');
      /** A retry that finds the requested state already set changed nothing and is not recorded. */
      if (changed) {
        await emitAudit(req, {
          action: 'config.toggled',
          severity: 'warning',
          target: configTarget(principalType, principalId),
          metadata: { isActive },
        });
      }
      return res.status(200).json({ config: redactConfigForResponse(config) });
    } catch (error) {
      logger.error('[adminConfig] toggleConfig error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to toggle config' });
    }
  }

  return {
    listConfigs,
    getBaseConfig,
    getConfig,
    upsertConfigOverrides,
    patchConfigField,
    tombstoneConfigField,
    deleteConfigField,
    applyConfigChanges: applyChanges,
    deleteConfigOverrides,
    toggleConfig,
  };
}
