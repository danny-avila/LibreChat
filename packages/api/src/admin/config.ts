import {
  BASE_PRINCIPAL_CONFIG_SECTIONS,
  BASE_ONLY_CONFIG_SECTIONS,
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
  isDotFreePath,
  parseFieldPath,
  setConfigFields,
  getConfigRevision,
  isConfigRevision,
  isConfigPathError,
  isFieldNameRejection,
  getDottedSectionIssues,
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
  ConfigRecord,
  ConfigSection,
  ConfigRevision,
  ConfigFieldWrite,
  SystemCapability,
  ConfigPathError,
  ConfigPathInputs,
  ConfigOverrideIssue,
  ConfigPathErrorReason,
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
  isConfigSecretPreservablePatch,
  isConfigSecretRelatedSegments,
  preserveConfigSecrets,
  redactConfigSecrets,
} from './secrets';
import { DEFAULT_OVERRIDE_CACHE_TTL } from '~/app/service';
import { getSafeErrorMetadata } from '~/utils/errors';
import { createAdminAuditEmitter } from './audit';
import { buildAdminConfigMeta } from './meta';

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

function isBaseOnlyFieldPath(fieldPath: string): boolean {
  return BASE_ONLY_OVERRIDE_SECTIONS.has(getTopLevelSection(fieldPath));
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
  /**
   * The `overrideCacheTtl` the app config service runs with, which `GET /meta` reports.
   * Defaults to the service's own default.
   */
  overrideCacheTtlMs?: number;
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

function filterConfigDocForReadAccess(
  config: ConfigRecord,
  readable: ReadableSections,
): ConfigRecord {
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
 * Reports only locations and stable codes: schema messages can echo the submitted values.
 * `segments` names the location key by key, since `path` is ambiguous once a record key
 * itself holds a dot.
 */
function invalidOverrideResponse(res: Response, issues: ConfigOverrideIssue[]): Response {
  return res.status(400).json({
    error: 'Invalid config override',
    code: 'CONFIG_OVERRIDE_INVALID',
    issues: issues.map(({ path, segments, code }) => ({ path, segments, code })),
  });
}

/**
 * The database refused a key name in the written overrides, such as a dotted record key on an
 * engine that cannot store one. Nothing was written; the key is not echoed.
 */
function unstorableKeyResponse(res: Response, operation: string): Response {
  logger.warn(
    `[adminConfig] ${operation}: the database rejected a key name in the overrides, such as a dotted record key this engine cannot store`,
  );
  return res.status(422).json({
    error: 'The database cannot store a key name in this config',
    code: 'CONFIG_KEY_NOT_STORABLE',
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

// ── Handler factory ──────────────────────────────────────────────────

export function createAdminConfigHandlers(deps: AdminConfigDeps): {
  listConfigs: (req: ServerRequest, res: Response) => Promise<Response>;
  getConfigMeta: (req: ServerRequest, res: Response) => Promise<Response>;
  getBaseConfig: (req: ServerRequest, res: Response) => Promise<Response>;
  getConfig: (req: ServerRequest, res: Response) => Promise<Response>;
  upsertConfigOverrides: (req: ServerRequest, res: Response) => Promise<Response>;
  patchConfigField: (req: ServerRequest, res: Response) => Promise<Response>;
  tombstoneConfigField: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteConfigField: (req: ServerRequest, res: Response) => Promise<Response>;
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
    overrideCacheTtlMs = DEFAULT_OVERRIDE_CACHE_TTL,
  } = deps;

  const emitAudit = createAdminAuditEmitter({
    recordAuditEntry,
    failClosed: auditFailClosed,
    logPrefix: '[adminConfig]',
  });

  const meta = buildAdminConfigMeta({ maxPatchEntries: MAX_PATCH_ENTRIES, overrideCacheTtlMs });

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
   * GET /meta — The contract this server applies to config writes: feature flags, limits,
   * versions and the rules a client mirrors. An older server answers 404, which a client reads
   * as every feature off.
   */
  async function getConfigMeta(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!(await hasAnyConfigReadAccess(user))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      return res.status(200).json(meta);
    } catch (error) {
      logger.error('[adminConfig] getConfigMeta error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to get config meta' });
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

      /**
       * Checked before any section rule or secret encryption reads a dotted key as a path. A
       * dotted key is a section write, which only broad manage may make.
       */
      const dottedSectionIssues = getDottedSectionIssues(rawOverrides);
      if (dottedSectionIssues.length > 0) {
        return hasBroadManage
          ? invalidOverrideResponse(res, dottedSectionIssues)
          : res.status(403).json({ error: 'Insufficient permissions' });
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
      if (iface != null && typeof iface === 'object' && !Array.isArray(iface)) {
        const filteredIface: Record<string, unknown> = {};
        for (const [field, rawVal] of Object.entries(iface as Record<string, unknown>)) {
          const val = normalizeRuntimeInterfaceValue(field, rawVal);
          if (!INTERFACE_PERMISSION_FIELDS.has(field)) {
            filteredIface[field] = val;
          } else if (val != null && typeof val === 'object' && !Array.isArray(val)) {
            // Composite permission field (e.g. mcpServers): strip permission
            // sub-keys but preserve UI-only sub-keys like placeholder/trustCheckbox.
            const uiOnly: Record<string, unknown> = {};
            for (const [sub, subVal] of Object.entries(val as Record<string, unknown>)) {
              if (!PERMISSION_SUB_KEYS.has(sub)) {
                uiOnly[sub] = subVal;
              } else {
                logger.warn(
                  `[adminConfig] Stripping interface permission sub-field "${field}.${sub}" — use role permissions instead`,
                );
              }
            }
            if (Object.keys(uiOnly).length > 0) {
              filteredIface[field] = uiOnly;
            }
          } else if (RUNTIME_CONFIG_INTERFACE_FIELDS.has(field)) {
            // Dual-purpose field: the boolean form is a runtime disable, not a
            // permission toggle, so preserve it (e.g. schedules: false).
            filteredIface[field] = val;
          } else {
            logger.warn(
              `[adminConfig] Stripping interface permission field "${field}" — use role permissions instead`,
            );
          }
        }
        if (Object.keys(filteredIface).length > 0) {
          (filteredOverrides as Record<string, unknown>).interface = filteredIface;
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
      if (isFieldNameRejection(error)) {
        return unstorableKeyResponse(res, 'upsertConfigOverrides');
      }
      logger.error('[adminConfig] upsertConfigOverrides error:', getSafeErrorMetadata(error));
      return res.status(500).json({ error: 'Failed to upsert config' });
    }
  }

  /**
   * PATCH /:principalType/:principalId/fields — Set individual fields via dot-paths.
   *
   * A `fieldPath` (here, and for tombstones and unsets) is split on dots, so it cannot address
   * a record key that holds one, such as a Bedrock inference profile or a `gpt-4.1` model
   * entry: write that record whole at its own path (`endpoints.bedrock.inferenceProfiles`).
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
        const { fieldPath } = read.target;
        const value = entry?.value;
        if (isProcessMCPServerFieldPath(fieldPath, value)) {
          return res.status(400).json({ error: PROCESS_MCP_CONFIG_ERROR });
        }
        if (isLangfuseHeadersFieldPath(fieldPath)) {
          return res.status(400).json({ error: LANGFUSE_HEADERS_CONFIG_ERROR });
        }
        if (isConfigSecretDescendantPath(fieldPath)) {
          return res
            .status(400)
            .json({ error: `Cannot patch inside protected secret path: ${fieldPath}` });
        }
        const secretInputError = getConfigSecretInputError(fieldPath, value);
        if (secretInputError) {
          return res.status(400).json({ error: secretInputError });
        }
        if (Array.isArray(value) && isConfigSecretAncestorPath(fieldPath)) {
          return res.status(400).json({
            error: `Cannot patch protected secret ancestor as an array: ${fieldPath}`,
          });
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
          if (isBaseOnlyFieldPath(fieldPath)) {
            logger.warn(
              `[adminConfig] Stripping base-only config field "${fieldPath}" - configure it in librechat.yaml instead`,
            );
            return false;
          }
          if (BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(getTopLevelSection(fieldPath))) {
            logger.warn(
              `[adminConfig] Stripping dedicated tenant-wide config field "${fieldPath}" from the generic config API`,
            );
            return false;
          }
          if (isInterfacePermissionPath(fieldPath)) {
            logger.warn(
              `[adminConfig] Stripping interface permission field "${fieldPath}" — use role permissions instead`,
            );
            return false;
          }
          return true;
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
      if (isFieldNameRejection(error)) {
        return unstorableKeyResponse(res, 'patchConfigField');
      }
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
      const secretInputError = getConfigSecretInputError(fieldPath, undefined);
      if (secretInputError) {
        return res.status(400).json({ error: secretInputError });
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

      if (isBaseOnlyFieldPath(fieldPath)) {
        logger.warn(
          `[adminConfig] Ignoring tombstone for base-only config field "${fieldPath}" - configure it in librechat.yaml instead`,
        );
        return noopResponse(
          res,
          'No actionable field path provided',
          principalType,
          principalId,
          expected.value,
        );
      }

      if (isInterfacePermissionPath(fieldPath)) {
        logger.warn(
          `[adminConfig] Ignoring tombstone for interface permission field "${fieldPath}" — use role permissions instead`,
        );
        return noopResponse(
          res,
          'No actionable field path provided',
          principalType,
          principalId,
          expected.value,
        );
      }
      if (BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(section)) {
        logger.warn(
          `[adminConfig] Ignoring dedicated tenant-wide config tombstone "${fieldPath}" in the generic config API`,
        );
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
      const secretInputError = getConfigSecretInputError(fieldPath, undefined);
      if (secretInputError) {
        return res.status(400).json({ error: secretInputError });
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

      if (isBaseOnlyFieldPath(fieldPath)) {
        logger.warn(
          `[adminConfig] Ignoring delete for base-only config field "${fieldPath}" - configure it in librechat.yaml instead`,
        );
        return noopResponse(
          res,
          'No actionable field path provided',
          principalType,
          principalId,
          expected.value,
        );
      }

      if (BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(section)) {
        logger.warn(
          `[adminConfig] Ignoring dedicated tenant-wide config delete "${fieldPath}" in the generic config API`,
        );
        return noopResponse(
          res,
          'No actionable field path provided',
          principalType,
          principalId,
          expected.value,
        );
      }

      if (isInterfacePermissionPath(fieldPath)) {
        logger.warn(
          `[adminConfig] Ignoring delete for interface permission field "${fieldPath}" — use role permissions instead`,
        );
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
    getConfigMeta,
    getBaseConfig,
    getConfig,
    upsertConfigOverrides,
    patchConfigField,
    tombstoneConfigField,
    deleteConfigField,
    deleteConfigOverrides,
    toggleConfig,
  };
}
