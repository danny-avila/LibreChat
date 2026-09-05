import {
  BASE_PRINCIPAL_CONFIG_SECTIONS,
  BASE_ONLY_CONFIG_SECTIONS,
  PrincipalType,
  PrincipalModel,
  RUNTIME_CONFIG_INTERFACE_FIELDS,
  configSchema,
  hasProcessMCPServerConfig,
  isProcessMCPServerConfig,
  isProcessMCPServerField,
} from 'librechat-data-provider';
import {
  logger,
  BASE_CONFIG_PRINCIPAL_ID,
  SystemCapabilities,
  applyConfigFieldsMutation,
  canonicalizeResetPaths,
  fieldPathPolicyError,
  indexedArrayPathError,
  isConfigFieldPath,
  isForbiddenAdminConfigPath,
  isValidFieldPath,
  mergeConfigOverrides,
  sanitizeAdminConfigOverrides,
} from '@librechat/data-schemas';
import type {
  AppConfig,
  ConfigRevisionListItem,
  ConfigRevisionSnapshot,
  ConfigSection,
  FindConfigByPrincipalOptions,
  IConfig,
  SystemCapability,
} from '@librechat/data-schemas';
import type { TCustomConfig } from 'librechat-data-provider';
import type { Types, ClientSession } from 'mongoose';
import type { Response } from 'express';
import type { ZodTypeAny } from 'zod';
import type { CapabilityUser } from '~/middleware/capabilities';
import type { ServerRequest } from '~/types/http';
import {
  encryptConfigSecretFields,
  encryptConfigSecrets,
  encryptLegacyPlaintextConfigSecrets,
  getArrayExistingIdentityConflictError,
  getConfigSecretMutationPaths,
  getConfigSecretInputError,
  getConfigSecretSections,
  isConfigSecretAncestorPath,
  isConfigSecretDescendantPath,
  isConfigSecretPreservablePatch,
  preserveConfigSecrets,
  redactConfigSecrets,
  resolveMcpSecretHintBatch,
  resolveMcpSecretHintBatchForWholeDocument,
} from './secrets';
import { getEffectiveTenantId } from '~/middleware/tenant';

type ConfigRevisionCause = 'save' | 'import' | 'reset' | 'restore';
type ConfigMutationOp =
  | {
      kind: 'fields';
      resetPaths: string[];
      fields: Record<string, unknown>;
      priority: number;
      isActive?: boolean;
    }
  | { kind: 'replace'; overrides: Record<string, unknown>; priority: number }
  | { kind: 'delete' }
  | { kind: 'active'; isActive: boolean }
  | { kind: 'restore'; revisionId: string };

const MAX_PATCH_ENTRIES = 100;
const MAX_PATCH_MUTATIONS = 100;
const DEFAULT_PRIORITY = 10;
const DEFAULT_BASE_PRIORITY = 0;
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

type AtomicFieldEntry = { fieldPath: string; value: unknown };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function fieldPathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

function parseAtomicFieldEntries(
  value: unknown,
): { ok: true; entries: AtomicFieldEntry[] } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, entries: [] };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: 'entries must be an array' };
  }
  const entries: AtomicFieldEntry[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      return { ok: false, error: 'each entry must be an object with fieldPath and value' };
    }
    if (typeof entry.fieldPath !== 'string') {
      return { ok: false, error: 'each entry must include a fieldPath string' };
    }
    const fieldPathError = fieldPathPolicyError(entry.fieldPath);
    if (fieldPathError) {
      return { ok: false, error: fieldPathError };
    }
    if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
      return { ok: false, error: 'each entry must include a value property' };
    }
    entries.push({ fieldPath: entry.fieldPath, value: entry.value });
  }
  return { ok: true, entries };
}

function parseAtomicResetPaths(
  value: unknown,
): { ok: true; resetPaths: string[] } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, resetPaths: [] };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: 'resetPaths must be an array' };
  }
  for (const path of value) {
    if (typeof path !== 'string') {
      return { ok: false, error: 'each resetPaths element must be a string' };
    }
    const fieldPathError = fieldPathPolicyError(path);
    if (fieldPathError) {
      return { ok: false, error: fieldPathError };
    }
  }
  return { ok: true, resetPaths: value };
}

function validateAtomicMutationProperties(
  body: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  if ('entries' in body && body.entries !== undefined && !Array.isArray(body.entries)) {
    return { ok: false, error: 'entries must be an array' };
  }
  if ('resetPaths' in body && body.resetPaths !== undefined && !Array.isArray(body.resetPaths)) {
    return { ok: false, error: 'resetPaths must be an array' };
  }
  if ('overrides' in body && body.overrides !== undefined && !isPlainObject(body.overrides)) {
    return { ok: false, error: 'overrides must be an object' };
  }
  if (
    'deleteDocument' in body &&
    body.deleteDocument !== undefined &&
    typeof body.deleteDocument !== 'boolean'
  ) {
    return { ok: false, error: 'deleteDocument must be a boolean' };
  }
  if ('restoreRevisionId' in body && body.restoreRevisionId !== undefined) {
    if (typeof body.restoreRevisionId !== 'string' || body.restoreRevisionId.length === 0) {
      return { ok: false, error: 'restoreRevisionId must be a non-empty string' };
    }
  }
  if ('isActive' in body && body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return { ok: false, error: 'isActive must be a boolean' };
  }
  return { ok: true };
}

export { isValidFieldPath } from '@librechat/data-schemas';

export function isConfigVersionConflict(
  error: unknown,
): error is { currentVersion: number | null } {
  return (
    typeof error === 'object' &&
    error != null &&
    (error as { name?: string }).name === 'ConfigVersionConflictError'
  );
}

function isConfigRevisionNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    (error as { name?: string }).name === 'ConfigRevisionNotFoundError'
  );
}

function isRestoreValidationError(error: unknown): error is Error {
  return (
    typeof error === 'object' &&
    error != null &&
    (error as { name?: string }).name === 'RestoreValidationError'
  );
}

export function isTransactionRequired(error: unknown): error is Error {
  return (
    typeof error === 'object' &&
    error != null &&
    (error as { name?: string }).name === 'TransactionRequiredError'
  );
}

export function rejectConfigVersionConflict(
  res: Response,
  expectedVersion: number | null,
  config: { configVersion?: number } | null,
): Response | null {
  const currentVersion = config == null ? null : (config.configVersion ?? 0);
  if (expectedVersion === currentVersion) {
    return null;
  }
  return res.status(409).json({
    error: 'Config version conflict',
    currentVersion,
  });
}

/**
 * Legacy PUT/PATCH/DELETE base-config routes bypass CAS and revision history
 * entirely — they never carry `expectedVersion` and never write a revision.
 * Base-config mutations require a coordinated cutover with the admin panel
 * (both sides deploy together and the panel exclusively uses `/atomic`); once
 * that's in place, keeping these legacy paths open for the base principal
 * would silently reintroduce version-conflict blindness and rollback gaps.
 */
function rejectLegacyBaseMutation(res: Response): Response {
  return res.status(409).json({
    error:
      'Base configuration mutations must use POST /:principalType/:principalId/atomic ' +
      '— it is the only path with optimistic concurrency (expectedVersion) and revision history.',
  });
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

function isBlockedFieldPath(fieldPath: string): boolean {
  return isBaseOnlyFieldPath(fieldPath) || isForbiddenAdminConfigPath(fieldPath);
}

function sanitizeConfigOverrides(overrides: Record<string, unknown>): Partial<TCustomConfig> {
  const normalized = { ...overrides };
  delete normalized.interfaceConfig;
  if (
    'interface' in normalized &&
    (normalized.interface == null ||
      typeof normalized.interface !== 'object' ||
      Array.isArray(normalized.interface))
  ) {
    delete normalized.interface;
  }
  const sanitized = sanitizeAdminConfigOverrides(normalized) as Record<string, unknown>;
  if (
    sanitized.interface != null &&
    typeof sanitized.interface === 'object' &&
    !Array.isArray(sanitized.interface)
  ) {
    const interfaceConfig = sanitized.interface as Record<string, unknown>;
    for (const field of RUNTIME_CONFIG_INTERFACE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(interfaceConfig, field)) {
        interfaceConfig[field] = normalizeRuntimeInterfaceValue(field, interfaceConfig[field]);
      }
    }
  }
  return sanitized as Partial<TCustomConfig>;
}

const CONFIG_SCHEMA_SHAPE = configSchema.shape as Record<string, ZodTypeAny>;

function buildNestedPatch(segments: string[], value: unknown): Record<string, unknown> {
  const [head, ...rest] = segments;
  return rest.length === 0 ? { [head]: value } : { [head]: buildNestedPatch(rest, value) };
}

/** Deep-merges `source` onto `target`, mutating and returning `target`. Falls back to `source`
 * wherever `target`'s existing value isn't a plain object (e.g. a boolean union branch). */
function mergeNestedPatches(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    target[key] =
      isPlainObject(value) && isPlainObject(existing)
        ? mergeNestedPatches({ ...existing }, value)
        : value;
  }
  return target;
}

function firstZodIssueMessage(issues: { message: string; path: (string | number)[] }[]): string {
  const [issue] = issues;
  if (!issue) return 'schema validation failed';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Finds a caller-supplied key that Zod removed while parsing. Zod objects
 * strip unknown keys by default, so a successful parse alone is not proof
 * that every submitted override belongs to the configuration schema. */
function firstStrippedInputPath(
  input: unknown,
  parsed: unknown,
  prefix = '',
  matchMergedArrays = false,
): string | null {
  if (Array.isArray(input)) {
    if (!Array.isArray(parsed)) return prefix || '<root>';
    for (let index = 0; index < input.length; index += 1) {
      const path = prefix ? `${prefix}.${index}` : String(index);
      const item = input[index];
      // Runtime merges custom endpoints by name, retaining YAML-only entries
      // ahead of newly appended entries. Their positions need not match the
      // submitted array, but error paths must still refer to the submission.
      const parsedItem =
        matchMergedArrays && prefix === 'endpoints.custom' && isPlainObject(item)
          ? parsed.find((entry) => isPlainObject(entry) && entry.name === item.name)
          : parsed[index];
      const stripped = firstStrippedInputPath(item, parsedItem, path, matchMergedArrays);
      if (stripped) return stripped;
    }
    return null;
  }
  if (!isPlainObject(input)) return null;
  if (!isPlainObject(parsed)) return prefix || '<root>';
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!Object.prototype.hasOwnProperty.call(parsed, key)) {
      return path;
    }
    const stripped = firstStrippedInputPath(value, parsed[key], path, matchMergedArrays);
    if (stripped) return stripped;
  }
  return null;
}

/**
 * Validates the values a "fields"-mode atomic mutation would actually write against the
 * librechat.yaml config schema, so a caller cannot persist a structurally invalid runtime
 * value (e.g. `interface.schedules.maxPerUser: -1`) by bypassing the admin panel's own
 * validation and calling the API directly. Each touched section (by a set value or a reset)
 * is resolved with the transaction's field/tombstone transition and the runtime merge, so
 * cross-field constraints see the section's real post-mutation state, not just the delta.
 * A bare top-level entry for a section (e.g. `cloudfront`) fully replaces that section and is
 * validated independently because ancestor/descendant field entries are rejected before this
 * function is called; the YAML/DB baseline never applies to a whole-section replacement.
 * `yamlBaseline` may be `null` when `getAppConfig` isn't configured for this deployment; in
 * that case sections are validated against DB overrides alone (pre-existing behavior).
 */
function validateAtomicFieldValues(
  fields: Record<string, unknown>,
  resetPaths: string[],
  existing: IConfig | null,
  yamlBaseline: Record<string, unknown> | null,
): string | null {
  const sectionPatches = new Map<string, Record<string, unknown>>();
  const bareSectionEntries = new Map<string, unknown>();
  const candidate = applyConfigFieldsMutation(existing, resetPaths, fields);
  const resolvedConfig = mergeConfigOverrides((yamlBaseline ?? {}) as unknown as AppConfig, [
    { principalId: BASE_CONFIG_PRINCIPAL_ID, priority: 0, ...candidate },
  ]) as unknown as Record<string, unknown>;

  const touchedSection = (section: string): Record<string, unknown> => {
    let patch = sectionPatches.get(section);
    if (!patch) {
      patch = {};
      sectionPatches.set(section, patch);
    }
    return patch;
  };

  for (const path of resetPaths) {
    const [section, ...rest] = path.split('.');
    if (!CONFIG_SCHEMA_SHAPE[section]) {
      return `Unknown config field path: "${path}"`;
    }
    if (rest.length === 0) {
      // A bare reset with nothing else touching the section is pure YAML,
      // which is presumed already valid — only worth resolving if a
      // descendant patch (below) also lands in sectionPatches for it.
      continue;
    }
    touchedSection(section);
  }

  for (const [fieldPath, value] of Object.entries(fields)) {
    const [section, ...rest] = fieldPath.split('.');
    const sectionSchema = CONFIG_SCHEMA_SHAPE[section];
    if (!sectionSchema) {
      return `Unknown config field path: "${fieldPath}"`;
    }

    if (rest.length === 0) {
      bareSectionEntries.set(section, value);
      continue;
    }

    mergeNestedPatches(touchedSection(section), buildNestedPatch(rest, value));
  }

  // Whole-section submissions must be valid on their own, even when YAML
  // happens to supply a required value that the submission omitted.
  for (const [section, value] of bareSectionEntries) {
    const sectionSchema = CONFIG_SCHEMA_SHAPE[section];
    sectionPatches.delete(section);

    const result = sectionSchema.safeParse(value);
    if (!result.success) {
      return `Invalid value for "${section}": ${firstZodIssueMessage(result.error.issues)}`;
    }
    const stripped = firstStrippedInputPath(value, result.data, section);
    if (stripped) {
      return `Unknown config field path: "${stripped}"`;
    }
  }

  for (const [section, patch] of sectionPatches) {
    const resolved = resolvedConfig[SECTION_TO_APP_CONFIG_FIELD[section] ?? section];
    const result = CONFIG_SCHEMA_SHAPE[section].safeParse(resolved);
    if (!result.success) {
      return `Invalid value for config section "${section}": ${firstZodIssueMessage(result.error.issues)}`;
    }
    const stripped =
      Object.keys(patch).length > 0
        ? firstStrippedInputPath(patch, result.data, section, true)
        : null;
    if (stripped) {
      return `Unknown config field path: "${stripped}"`;
    }
  }
  return null;
}

/** Validates a "replace"-mode atomic mutation's full overrides object against the librechat.yaml
 * config schema. `.partial()` allows the sparse, section-at-a-time shape overrides always have —
 * only sections actually present are checked. */
function validateAtomicReplaceOverrides(overrides: Record<string, unknown>): string | null {
  const result = configSchema.partial().strict().safeParse(overrides);
  if (!result.success) {
    return `Invalid config overrides: ${firstZodIssueMessage(result.error.issues)}`;
  }
  const stripped = firstStrippedInputPath(overrides, result.data);
  if (stripped) {
    return `Unknown config field path: "${stripped}"`;
  }
  return null;
}

/**
 * Applies the same policies an import (`hasOverrides`) mutation enforces on
 * its submitted overrides to a legacy revision's stored overrides before a
 * restore is allowed to write them. Restoring an older revision must not be
 * a side channel for reintroducing content the API would reject if it were
 * submitted directly today — e.g. a schema constraint tightened since the
 * revision was created, or a since-forbidden process-backed MCP server.
 * Runs read-only against the data layer's already-sanitized overrides; it
 * does not re-sanitize or otherwise change what gets persisted.
 */
function validateRestoredOverrides(
  overrides: Record<string, unknown>,
  tombstones: string[] = [],
  yamlBaseline?: AppConfig,
): string | null {
  if (
    hasProcessMCPServerConfig(overrides.mcpServers) ||
    hasProcessMCPServerConfig(overrides.mcpConfig)
  ) {
    return PROCESS_MCP_CONFIG_ERROR;
  }
  if (hasLangfuseHeadersOverride(overrides)) {
    return LANGFUSE_HEADERS_CONFIG_ERROR;
  }
  if (!yamlBaseline) {
    return validateAtomicReplaceOverrides(overrides);
  }
  // Snapshots contain sparse DB overrides, not standalone YAML documents.
  // Resolve only for validation; never persist inherited YAML in the snapshot.
  const resolved = mergeConfigOverrides(yamlBaseline, [
    { principalId: BASE_CONFIG_PRINCIPAL_ID, priority: 0, overrides, tombstones },
  ]);
  const sections = new Set([
    ...Object.keys(overrides),
    ...tombstones.map((path) => getTopLevelSection(path)),
  ]);
  const effectiveOverrides = Object.fromEntries(
    [...sections].map((section) => [
      section,
      resolved[(SECTION_TO_APP_CONFIG_FIELD[section] ?? section) as keyof AppConfig],
    ]),
  );
  return validateAtomicReplaceOverrides(effectiveOverrides);
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

export interface AdminConfigDeps {
  listAllConfigs: (filter?: { isActive?: boolean }, session?: ClientSession) => Promise<IConfig[]>;
  findConfigByPrincipal: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    options?: FindConfigByPrincipalOptions,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  upsertConfig: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    overrides: Partial<TCustomConfig>,
    priority: number,
    session?: ClientSession,
    options?: { expectEmpty?: boolean; preservePriority?: boolean },
  ) => Promise<IConfig | null>;
  patchConfigFields: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fields: Record<string, unknown>,
    priority?: number,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  tombstoneConfigField: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fieldPath: string,
    priority?: number,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  unsetConfigField: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    fieldPath: string,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  deleteConfig: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
    options?: { expectEmpty?: boolean },
  ) => Promise<IConfig | null>;
  toggleConfigActive: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    isActive: boolean,
    session?: ClientSession,
    options?: { expectEmpty?: boolean },
  ) => Promise<IConfig | null>;
  mutateConfigWithRevision: (params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    principalModel: PrincipalModel;
    expectedVersion: number | null;
    op: ConfigMutationOp;
    cause: ConfigRevisionCause;
    actor: { actorId: string; actorEmail?: string; tenantId: string };
    normalizeSecrets?: (overrides: Record<string, unknown>) => Record<string, unknown>;
    trustedBasePrincipalSections?: string[];
    validateRestoredOverrides?: (
      overrides: Record<string, unknown>,
      tombstones: string[],
    ) => string | null;
  }) => Promise<{
    changed: boolean;
    config: IConfig | null;
    revision: ConfigRevisionSnapshot | null;
  }>;
  listConfigRevisions: (params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    tenantId: string;
    limit?: number;
  }) => Promise<ConfigRevisionListItem[]>;
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
    refresh?: boolean;
    failClosed?: boolean;
  }) => Promise<AppConfig>;
  /** Invalidate all config-related caches after a mutation. */
  invalidateConfigCaches?: (tenantId?: string) => Promise<void>;
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

/**
 * The capability principal is built with the request's *effective* tenant —
 * the same one the mutation, the revision insert, and the epoch update run
 * under. Resolving grants from `req.user.tenantId` while writing under the ALS
 * tenant would let a deployment that resolves tenants server-side
 * (`req.tenantId`) authorize in tenant A and persist in tenant B.
 */
function getCapabilityUser(req: ServerRequest): CapabilityUser | null {
  if (!req.user) {
    return null;
  }
  return {
    id: req.user.id ?? req.user._id?.toString() ?? '',
    role: req.user.role ?? '',
    tenantId: getEffectiveTenantId(req),
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

/** Inverse of `APP_CONFIG_FIELD_TO_SECTION`: canonical schema section name →
 * the top-level key `getAppConfig`'s resolved payload actually uses. */
const SECTION_TO_APP_CONFIG_FIELD: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(APP_CONFIG_FIELD_TO_SECTION).map(([field, section]) => [section, field]),
);

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

function filterConfigDocForReadAccess(config: IConfig, readable: ReadableSections): IConfig {
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
  } as IConfig;
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

/** All section names an `IConfig` document's overrides/tombstones could reference. */
function collectConfigSections(config: IConfig): string[] {
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

function redactConfigForResponse(config: IConfig): IConfig {
  const safeConfig = JSON.parse(JSON.stringify(config)) as IConfig;
  if (safeConfig.overrides) {
    redactConfigSecrets(safeConfig.overrides);
  }
  return safeConfig;
}

function redactAppConfigForResponse(appConfig: AppConfig): AppConfig {
  const safeConfig = JSON.parse(JSON.stringify(appConfig)) as AppConfig & { config?: unknown };
  redactConfigSecrets(safeConfig);
  redactConfigSecrets({ mcpServers: safeConfig.mcpConfig });
  if (safeConfig.config != null && typeof safeConfig.config === 'object') {
    redactConfigSecrets(safeConfig.config);
  }
  return safeConfig;
}

function redactRevisionForResponse(revision: ConfigRevisionSnapshot): ConfigRevisionSnapshot {
  const safeRevision = JSON.parse(JSON.stringify(revision)) as ConfigRevisionSnapshot;
  redactConfigSecrets(safeRevision.overrides);
  return safeRevision;
}

/**
 * Preserves omitted secrets across every fieldPath in one save's batch.
 * `preserveConfigSecrets` is called once per fieldPath, so an mcpServers
 * `__previousIdentity` hint on one fieldPath cannot, by itself, see whether a
 * DIFFERENT fieldPath in this same batch collides with it (same origin
 * claimed twice, a destination's own sub-keys disagreeing, or the claimed
 * origin still present as itself elsewhere in the batch). `resolveMcpSecretHintBatch`
 * scans the whole batch up front to catch exactly that, and its validated,
 * ambiguity-free result is threaded into every per-fieldPath call below.
 */
function preservePatchedConfigSecretFields(
  fields: Record<string, unknown>,
  existingOverrides?: unknown,
  resetPaths: readonly string[] = [],
): Record<string, unknown> {
  const result = { ...fields };
  const validatedMcpOrigins = resolveMcpSecretHintBatch(fields, existingOverrides, resetPaths);
  for (const [fieldPath, value] of Object.entries(result)) {
    if (isConfigSecretPreservablePatch(fieldPath, value)) {
      result[fieldPath] = preserveConfigSecrets(
        value,
        existingOverrides,
        fieldPath,
        validatedMcpOrigins,
      );
    }
  }
  return result;
}

// ── Handler factory ──────────────────────────────────────────────────

export function createAdminConfigHandlers(deps: AdminConfigDeps): {
  listConfigs: (req: ServerRequest, res: Response) => Promise<Response>;
  getBaseConfig: (req: ServerRequest, res: Response) => Promise<Response>;
  listConfigRevisions: (req: ServerRequest, res: Response) => Promise<Response>;
  getConfig: (req: ServerRequest, res: Response) => Promise<Response>;
  upsertConfigOverrides: (req: ServerRequest, res: Response) => Promise<Response>;
  patchConfigField: (req: ServerRequest, res: Response) => Promise<Response>;
  tombstoneConfigField: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteConfigField: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteConfigOverrides: (req: ServerRequest, res: Response) => Promise<Response>;
  toggleConfig: (req: ServerRequest, res: Response) => Promise<Response>;
  mutateConfigAtomic: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const {
    listAllConfigs,
    findConfigByPrincipal,
    upsertConfig,
    patchConfigFields,
    tombstoneConfigField: writeConfigTombstone,
    unsetConfigField,
    deleteConfig,
    toggleConfigActive,
    mutateConfigWithRevision,
    listConfigRevisions: readConfigRevisions,
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
  } = deps;

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
      logger.error('[adminConfig] listConfigs error:', error);
      return res.status(500).json({ error: 'Failed to list configs' });
    }
  }

  /**
   * GET /base — Return the raw AppConfig (YAML + DB base merged), and, unless
   * `baseOnly`, the raw base document's `overrides`/`configVersion` too.
   *
   * Both come from this one request, and `refresh: true` bypasses
   * `getAppConfig`'s per-tenant override-merge cache, because that cache
   * alone can't be trusted to agree with a version read fetched independently:
   * most mutation handlers fire off `invalidateConfigCaches` without awaiting
   * it, and the cache itself is process-local with no cross-pod invalidation,
   * so a merge cached on this process could still predate a write whose
   * bumped version a fresh Mongo read would already see. Reading the raw doc
   * *before* the (now always-fresh) merge additionally means that if a
   * mutation still lands in the remaining gap between these two calls,
   * `dbConfigVersion` can only end up older than what `config` reflects, never
   * newer — the safe direction, since a CAS write built on that pairing either
   * matches the still-current version or gets a 409, instead of silently
   * overwriting a change `config`'s content already includes.
   *
   * `failClosed: true` closes the remaining gap: without it, a transient
   * failure inside `getApplicableConfigs` makes `getAppConfig` swallow the
   * error and fall back to the YAML-only base — `config` would then be
   * missing every DB override while `dbConfigVersion` still reports the true,
   * unrelated-to-this-error current version. An edit built on that response
   * (e.g. adding one array entry to what looks like an empty list) would pass
   * CAS and replace the real stored array. Propagating the failure into the
   * handler's 500 instead is what keeps `config` and `dbConfigVersion`
   * meaningfully paired on error paths too, not just on the success path.
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
      const requestTenantId = user.tenantId ?? '';
      const rawBase = baseOnly
        ? null
        : await findConfigByPrincipal(PrincipalType.ROLE, BASE_CONFIG_PRINCIPAL_ID, {
            tenantId: requestTenantId,
            includeInactive: true,
          });

      const appConfig = await getAppConfig({
        tenantId: requestTenantId,
        baseOnly,
        refresh: !baseOnly,
        failClosed: true,
      });

      const sections = new Set<string>(collectAppConfigSections(appConfig));
      if (rawBase) {
        for (const section of collectConfigSections(rawBase)) {
          sections.add(section);
        }
      }
      const readable = await getReadableConfigSections(user, [...sections] as ConfigSection[]);
      const filteredAppConfig = filterAppConfigForReadAccess(appConfig, readable);

      let dbOverrides: Partial<TCustomConfig> | undefined;
      let dbConfigVersion: number | null = null;
      let dbIsActive: boolean | null = null;
      if (rawBase) {
        const safeRawBase = redactConfigForResponse(
          filterConfigDocForReadAccess(rawBase, readable),
        );
        dbOverrides = safeRawBase.overrides;
        dbConfigVersion = safeRawBase.configVersion ?? 0;
        dbIsActive = safeRawBase.isActive ?? true;
      }

      return res.status(200).json({
        config: redactAppConfigForResponse(filteredAppConfig),
        effectiveTenantId: requestTenantId,
        ...(baseOnly ? {} : { dbOverrides, dbConfigVersion, dbIsActive }),
      });
    } catch (error) {
      logger.error('[adminConfig] getBaseConfig error:', error);
      return res.status(500).json({ error: 'Failed to get base config' });
    }
  }

  /**
   * GET /:principalType/:principalId/revisions — List rollback points through
   * the authenticated backend tenant context. The admin panel must not derive
   * this scope from its independently cached session user or query MongoDB
   * directly, because either can disagree with the tenant that a subsequent
   * atomic mutation will use.
   */
  async function listConfigRevisions(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };
      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }
      if (principalType !== PrincipalType.ROLE || principalId !== BASE_CONFIG_PRINCIPAL_ID) {
        return res
          .status(400)
          .json({ error: 'Config revision history is only available for the base configuration' });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (!(await hasCapability(user, SystemCapabilities.MANAGE_CONFIGS))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const revisions = await readConfigRevisions({
        principalType,
        principalId,
        tenantId: user.tenantId ?? '',
      });
      return res.status(200).json({ revisions, effectiveTenantId: user.tenantId ?? '' });
    } catch (error) {
      logger.error('[adminConfig] listConfigRevisions error:', error);
      return res.status(500).json({ error: 'Failed to list config revisions' });
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
      logger.error('[adminConfig] getConfig error:', error);
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

      if (principalId === BASE_CONFIG_PRINCIPAL_ID) {
        return rejectLegacyBaseMutation(res);
      }

      const { overrides, priority } = req.body as {
        overrides?: Partial<TCustomConfig>;
        priority?: number;
      };

      if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
        return res.status(400).json({ error: 'overrides must be a plain object' });
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

      const hasAssignConfigs =
        hasBroadManage ||
        (await hasCapability(user, `assign:configs:${principalType}` as SystemCapability));

      if (!hasAssignConfigs) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const filteredOverrides = sanitizeConfigOverrides(rawOverrides);
      for (const key of Object.keys(filteredOverrides)) {
        const section = getTopLevelSection(key);
        if (BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(section)) {
          delete (filteredOverrides as Record<string, unknown>)[key];
          logger.warn(
            `[adminConfig] Stripping dedicated tenant-wide config section "${key}" from the generic config API`,
          );
        }
      }

      const overrideSections = Object.keys(filteredOverrides);

      if (overrideSections.length === 0 && priority == null) {
        return res.status(200).json({ message: 'No actionable override sections provided' });
      }

      if (overrideSections.length > 0 && !hasBroadManage) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      if (priority != null && !hasBroadManage) {
        logger.warn(
          `[adminConfig] Ignoring caller-supplied priority on assign-only scope lifecycle upsert to ${principalType}/${principalId}: only broad manage:configs may modify document priority`,
        );
      }

      const requestedPriority = hasBroadManage ? (priority ?? DEFAULT_PRIORITY) : DEFAULT_PRIORITY;
      const upsertOptions = hasBroadManage
        ? { expectEmpty: false }
        : { expectEmpty: true, preservePriority: true };

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
      // mcpServers has no entry in the CONFIG_SECRET_FIELDS/ARRAY_SECRET_FIELDS
      // registry `getConfigSecretSections()` is derived from — its secrets
      // are dynamic (admin-named servers), matched by shape rather than a
      // fixed path. Checked explicitly here so an mcpServers-only whole
      // replacement still fetches the existing document to preserve omitted
      // secrets, instead of silently dropping them.
      const needsExistingSecrets =
        getConfigSecretSections().some((section) =>
          isConfigSecretPreservablePatch(
            section,
            (filteredOverrides as Record<string, unknown>)[section],
          ),
        ) ||
        isConfigSecretPreservablePatch(
          'mcpServers',
          (filteredOverrides as Record<string, unknown>).mcpServers,
        );
      const existingConfig = needsExistingSecrets
        ? await findConfigByPrincipal(principalType, principalId, { includeInactive: true })
        : null;
      const existingConflictError = getArrayExistingIdentityConflictError(
        '',
        filteredOverrides,
        existingConfig?.overrides,
      );
      if (existingConflictError) {
        return res.status(400).json({ error: existingConflictError });
      }
      const preservedOverrides = preserveConfigSecrets(
        encryptedOverrides,
        existingConfig?.overrides,
        '',
        resolveMcpSecretHintBatchForWholeDocument(encryptedOverrides),
      );
      const config = await upsertConfig(
        principalType,
        principalId,
        principalModel(principalType),
        preservedOverrides,
        requestedPriority,
        undefined,
        upsertOptions,
      );
      if (!config && !hasBroadManage) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      invalidateConfigCaches?.(user.tenantId)?.catch((err) =>
        logger.error('[adminConfig] Cache invalidation failed after upsert:', err),
      );
      return res.status(config?.configVersion === 1 ? 201 : 200).json({
        config: config ? redactConfigForResponse(config) : config,
      });
    } catch (error) {
      logger.error('[adminConfig] upsertConfigOverrides error:', error);
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

      if (principalId === BASE_CONFIG_PRINCIPAL_ID) {
        return rejectLegacyBaseMutation(res);
      }

      const rawBody: unknown = req.body;
      if (!isPlainObject(rawBody)) {
        return res.status(400).json({ error: 'request body must be a JSON object' });
      }

      const { priority } = rawBody;
      const parsedEntries = parseAtomicFieldEntries(rawBody.entries);
      if (!parsedEntries.ok) {
        return res.status(400).json({ error: parsedEntries.error });
      }
      const entries = parsedEntries.entries;

      if (priority != null && (typeof priority !== 'number' || priority < 0)) {
        return res.status(400).json({ error: 'priority must be a non-negative number' });
      }

      if (entries.length === 0) {
        return res.status(400).json({ error: 'entries array is required and must not be empty' });
      }

      if (entries.length > MAX_PATCH_ENTRIES) {
        return res
          .status(400)
          .json({ error: `entries array exceeds maximum of ${MAX_PATCH_ENTRIES}` });
      }

      for (const entry of entries) {
        if (!isValidFieldPath(entry.fieldPath)) {
          return res
            .status(400)
            .json({ error: `Invalid or unsafe field path: ${entry.fieldPath}` });
        }
        if (isProcessMCPServerFieldPath(entry.fieldPath, entry.value)) {
          return res.status(400).json({ error: PROCESS_MCP_CONFIG_ERROR });
        }
        if (isLangfuseHeadersFieldPath(entry.fieldPath)) {
          return res.status(400).json({ error: LANGFUSE_HEADERS_CONFIG_ERROR });
        }
        if (isConfigSecretDescendantPath(entry.fieldPath)) {
          return res
            .status(400)
            .json({ error: `Cannot patch inside protected secret path: ${entry.fieldPath}` });
        }
        const secretInputError = getConfigSecretInputError(entry.fieldPath, entry.value);
        if (secretInputError) {
          return res.status(400).json({ error: secretInputError });
        }
        if (Array.isArray(entry.value) && isConfigSecretAncestorPath(entry.fieldPath)) {
          return res.status(400).json({
            error: `Cannot patch protected secret ancestor as an array: ${entry.fieldPath}`,
          });
        }
        const indexedErr = indexedArrayPathError(entry.fieldPath);
        if (indexedErr) {
          return res.status(400).json({ error: indexedErr });
        }
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const validEntries = entries
        .map((entry) => ({
          ...entry,
          value: normalizeInterfaceFieldPatch(entry.fieldPath, entry.value),
        }))
        .filter((entry) => {
          if (isBlockedFieldPath(entry.fieldPath)) {
            logger.warn(
              `[adminConfig] Stripping protected config field "${entry.fieldPath}" — use canonical YAML UI fields only`,
            );
            return false;
          }
          if (BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(getTopLevelSection(entry.fieldPath))) {
            logger.warn(
              `[adminConfig] Stripping dedicated tenant-wide config field "${entry.fieldPath}" from the generic config API`,
            );
            return false;
          }
          return true;
        });

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      if (validEntries.length === 0) {
        if (!hasBroadManage) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
        return res.status(200).json({ message: 'No actionable field entries provided' });
      }

      if (!hasBroadManage) {
        const sections = [...new Set(validEntries.map((e) => getTopLevelSection(e.fieldPath)))];
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

      const seen = new Set<string>();
      const fields: Record<string, unknown> = {};
      for (const entry of validEntries) {
        if (seen.has(entry.fieldPath)) {
          return res.status(400).json({ error: `Duplicate fieldPath: ${entry.fieldPath}` });
        }
        seen.add(entry.fieldPath);
        fields[entry.fieldPath] = entry.value;
      }

      if (priority != null && !hasBroadManage) {
        logger.warn(
          `[adminConfig] Ignoring caller-supplied priority on section-scoped patch to ${principalType}/${principalId}: only broad manage:configs may modify document priority`,
        );
      }
      const requestedPriority = hasBroadManage ? (priority as number | undefined) : undefined;

      const hasObjectValuedSecretPatch = Object.entries(fields).some(([fieldPath, value]) =>
        isConfigSecretPreservablePatch(fieldPath, value),
      );
      const existing = hasObjectValuedSecretPatch
        ? await findConfigByPrincipal(principalType, principalId, { includeInactive: true })
        : null;
      for (const [fieldPath, fieldValue] of Object.entries(fields)) {
        const existingConflictError = getArrayExistingIdentityConflictError(
          fieldPath,
          fieldValue,
          existing?.overrides,
        );
        if (existingConflictError) {
          return res.status(400).json({ error: existingConflictError });
        }
      }
      const encryptedFields = encryptConfigSecretFields(fields);
      const preservedFields = preservePatchedConfigSecretFields(
        encryptedFields,
        existing?.overrides,
      );

      const config = await patchConfigFields(
        principalType,
        principalId,
        principalModel(principalType),
        preservedFields,
        requestedPriority,
      );

      invalidateConfigCaches?.(user.tenantId)?.catch((err) =>
        logger.error('[adminConfig] Cache invalidation failed after patch:', err),
      );
      return res.status(200).json({ config: config ? redactConfigForResponse(config) : config });
    } catch (error) {
      logger.error('[adminConfig] patchConfigField error:', error);
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

      if (principalId === BASE_CONFIG_PRINCIPAL_ID) {
        return rejectLegacyBaseMutation(res);
      }

      const { fieldPath, priority } = req.body as {
        fieldPath?: string;
        priority?: number;
      };

      if (!fieldPath || typeof fieldPath !== 'string') {
        return res.status(400).json({ error: 'fieldPath is required' });
      }

      if (priority != null && (typeof priority !== 'number' || priority < 0)) {
        return res.status(400).json({ error: 'priority must be a non-negative number' });
      }

      if (!isValidFieldPath(fieldPath)) {
        return res.status(400).json({ error: `Invalid or unsafe field path: ${fieldPath}` });
      }
      const secretInputError = getConfigSecretInputError(fieldPath, undefined);
      if (secretInputError) {
        return res.status(400).json({ error: secretInputError });
      }
      const tombstoneIndexedErr = indexedArrayPathError(fieldPath);
      if (tombstoneIndexedErr) {
        return res.status(400).json({ error: tombstoneIndexedErr });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const section = getTopLevelSection(fieldPath);

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      if (
        !hasBroadManage &&
        !(await hasConfigCapability(user, section as ConfigSection, 'manage'))
      ) {
        return res.status(403).json({
          error: `Insufficient permissions for config section: ${section}`,
        });
      }

      if (isBlockedFieldPath(fieldPath)) {
        logger.warn(
          `[adminConfig] Ignoring tombstone for protected config field "${fieldPath}" — use canonical YAML UI fields only`,
        );
        return res.status(200).json({ message: 'No actionable field path provided' });
      }
      if (BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(section)) {
        logger.warn(
          `[adminConfig] Ignoring dedicated tenant-wide config tombstone "${fieldPath}" in the generic config API`,
        );
        return res.status(200).json({ message: 'No actionable field path provided' });
      }

      if (priority != null && !hasBroadManage) {
        logger.warn(
          `[adminConfig] Ignoring caller-supplied priority on section-scoped tombstone for ${principalType}/${principalId}: only broad manage:configs may modify document priority`,
        );
      }
      const requestedPriority = hasBroadManage ? priority : undefined;

      let config: IConfig | null = null;
      for (const path of getConfigSecretMutationPaths(fieldPath)) {
        const fieldConfig = await writeConfigTombstone(
          principalType,
          principalId,
          principalModel(principalType),
          path,
          requestedPriority,
        );
        if (fieldConfig) {
          config = fieldConfig;
        }
      }

      invalidateConfigCaches?.(user.tenantId)?.catch((err) =>
        logger.error('[adminConfig] Cache invalidation failed after field tombstone:', err),
      );
      return res.status(200).json({ config: config ? redactConfigForResponse(config) : config });
    } catch (error) {
      logger.error('[adminConfig] tombstoneConfigField error:', error);
      return res.status(500).json({ error: 'Failed to tombstone config field' });
    }
  }

  /**
   * DELETE /:principalType/:principalId/fields?fieldPath=dotted.path
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

      if (principalId === BASE_CONFIG_PRINCIPAL_ID) {
        return rejectLegacyBaseMutation(res);
      }

      const fieldPath = req.query.fieldPath as string | undefined;

      if (!fieldPath || typeof fieldPath !== 'string') {
        return res.status(400).json({ error: 'fieldPath query parameter is required' });
      }

      if (!isValidFieldPath(fieldPath)) {
        return res.status(400).json({ error: `Invalid or unsafe field path: ${fieldPath}` });
      }
      const secretInputError = getConfigSecretInputError(fieldPath, undefined);
      if (secretInputError) {
        return res.status(400).json({ error: secretInputError });
      }
      const unsetIndexedErr = indexedArrayPathError(fieldPath);
      if (unsetIndexedErr) {
        return res.status(400).json({ error: unsetIndexedErr });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const section = getTopLevelSection(fieldPath);

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      if (
        !hasBroadManage &&
        !(await hasConfigCapability(user, section as ConfigSection, 'manage'))
      ) {
        return res.status(403).json({
          error: `Insufficient permissions for config section: ${section}`,
        });
      }

      if (isBlockedFieldPath(fieldPath)) {
        logger.warn(
          `[adminConfig] Ignoring delete for protected config field "${fieldPath}" — use canonical YAML UI fields only`,
        );
        return res.status(200).json({ message: 'No actionable field path provided' });
      }

      if (BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(section)) {
        logger.warn(
          `[adminConfig] Ignoring dedicated tenant-wide config delete "${fieldPath}" in the generic config API`,
        );
        return res.status(200).json({ message: 'No actionable field path provided' });
      }

      let config: IConfig | null = null;
      for (const path of getConfigSecretMutationPaths(fieldPath)) {
        const fieldConfig = await unsetConfigField(principalType, principalId, path);
        if (fieldConfig) {
          config = fieldConfig;
        }
      }
      if (!config) {
        return res.status(404).json({ error: 'Config not found' });
      }

      invalidateConfigCaches?.(user.tenantId)?.catch((err) =>
        logger.error('[adminConfig] Cache invalidation failed after field delete:', err),
      );
      return res.status(200).json({ config: redactConfigForResponse(config) });
    } catch (error) {
      logger.error('[adminConfig] deleteConfigField error:', error);
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

      if (principalId === BASE_CONFIG_PRINCIPAL_ID) {
        return rejectLegacyBaseMutation(res);
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      const allowed =
        hasBroadManage ||
        (await hasCapability(user, `assign:configs:${principalType}` as SystemCapability));
      if (!allowed) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const config = await deleteConfig(principalType, principalId, undefined, {
        expectEmpty: !hasBroadManage,
      });
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

      invalidateConfigCaches?.(user.tenantId)?.catch((err) =>
        logger.error('[adminConfig] Cache invalidation failed after config delete:', err),
      );
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[adminConfig] deleteConfigOverrides error:', error);
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

      if (principalId === BASE_CONFIG_PRINCIPAL_ID) {
        return rejectLegacyBaseMutation(res);
      }

      const { isActive } = req.body as { isActive?: boolean };
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive boolean is required' });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');

      const allowed =
        hasBroadManage ||
        (await hasCapability(user, `assign:configs:${principalType}` as SystemCapability));
      if (!allowed) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const config = await toggleConfigActive(principalType, principalId, isActive, undefined, {
        expectEmpty: !hasBroadManage,
      });
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

      invalidateConfigCaches?.(user.tenantId)?.catch((err) =>
        logger.error('[adminConfig] Cache invalidation failed after toggle:', err),
      );
      return res.status(200).json({ config: redactConfigForResponse(config) });
    } catch (error) {
      logger.error('[adminConfig] toggleConfig error:', error);
      return res.status(500).json({ error: 'Failed to toggle config' });
    }
  }

  /**
   * POST /:principalType/:principalId/atomic
   * Compare-and-set mutation that snapshots the predecessor and inserts a finalized
   * config revision in the same Mongo transaction, then invalidates caches.
   */
  async function mutateConfigAtomic(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const { principalType, principalId } = req.params as {
        principalType: string;
        principalId: string;
      };
      if (!validatePrincipalType(principalType)) {
        return res.status(400).json({ error: `Invalid principalType: ${principalType}` });
      }
      if (principalType !== PrincipalType.ROLE || principalId !== BASE_CONFIG_PRINCIPAL_ID) {
        return res.status(400).json({
          error: 'Atomic config revisions are only supported for the base configuration',
        });
      }

      const user = getCapabilityUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      // `user.tenantId` is already the effective request tenant, so the
      // capability checks above, the config write (Mongoose, ALS-scoped), and
      // the raw revision/epoch read/write (explicit tenant filter) all resolve
      // to the same scope by construction.
      const requestTenantId = user.tenantId ?? '';

      const rawBody: unknown = req.body;
      if (!isPlainObject(rawBody)) {
        return res.status(400).json({ error: 'request body must be a JSON object' });
      }
      const body = rawBody;

      const propertyValidation = validateAtomicMutationProperties(body);
      if (!propertyValidation.ok) {
        return res.status(400).json({ error: propertyValidation.error });
      }

      const { expectedVersion, priority } = body;
      if (
        expectedVersion != null &&
        (typeof expectedVersion !== 'number' ||
          !Number.isInteger(expectedVersion) ||
          expectedVersion < 0)
      ) {
        return res
          .status(400)
          .json({ error: 'expectedVersion must be a non-negative integer or null' });
      }
      if (!('expectedVersion' in body)) {
        return res.status(400).json({ error: 'expectedVersion is required' });
      }
      const requestedVersion = (expectedVersion as number | null | undefined) ?? null;
      if (typeof body.expectedTenantId !== 'string') {
        return res.status(400).json({ error: 'expectedTenantId is required' });
      }
      if (body.expectedTenantId !== requestTenantId) {
        return res.status(409).json({
          error: 'Tenant context changed',
          expectedTenantId: body.expectedTenantId,
          currentTenantId: requestTenantId,
        });
      }
      if (priority != null && (typeof priority !== 'number' || priority < 0)) {
        return res.status(400).json({ error: 'priority must be a non-negative number' });
      }

      const parsedEntries = parseAtomicFieldEntries(body.entries);
      if (!parsedEntries.ok) {
        return res.status(400).json({ error: parsedEntries.error });
      }
      const parsedResets = parseAtomicResetPaths(body.resetPaths);
      if (!parsedResets.ok) {
        return res.status(400).json({ error: parsedResets.error });
      }
      const entries = parsedEntries.entries;
      const rawResetPaths = parsedResets.resetPaths;
      if (entries.length + rawResetPaths.length > MAX_PATCH_MUTATIONS) {
        return res.status(400).json({
          error: `combined entries and resetPaths exceed maximum of ${MAX_PATCH_MUTATIONS}`,
        });
      }

      const CAUSES = new Set(['save', 'import', 'reset', 'restore']);
      if (body.cause != null && (typeof body.cause !== 'string' || !CAUSES.has(body.cause))) {
        return res.status(400).json({ error: 'cause must be one of save, import, reset, restore' });
      }

      const hasEntries = entries.length > 0;
      const hasResets = rawResetPaths.length > 0;
      const hasOverrides = isPlainObject(body.overrides);
      const deleteDocument = body.deleteDocument === true;
      const restoreRevisionId =
        typeof body.restoreRevisionId === 'string' && body.restoreRevisionId.length > 0
          ? body.restoreRevisionId
          : undefined;
      const hasActiveMutation = typeof body.isActive === 'boolean';
      const modeCount =
        Number(hasEntries || hasResets) +
        Number(hasOverrides) +
        Number(deleteDocument) +
        Number(Boolean(restoreRevisionId)) +
        Number(hasActiveMutation);
      if (modeCount !== 1) {
        if (
          !hasEntries &&
          !hasResets &&
          !hasOverrides &&
          !deleteDocument &&
          !restoreRevisionId &&
          !hasActiveMutation
        ) {
          return res.status(400).json({
            error:
              'Provide resetPaths, entries, overrides, deleteDocument, restoreRevisionId, or isActive',
          });
        }
        if (
          deleteDocument &&
          (hasEntries || hasResets || hasOverrides || restoreRevisionId || hasActiveMutation)
        ) {
          return res
            .status(400)
            .json({ error: 'deleteDocument cannot be combined with field mutations' });
        }
        if (hasOverrides && (hasEntries || hasResets || restoreRevisionId || hasActiveMutation)) {
          return res
            .status(400)
            .json({ error: 'overrides cannot be combined with entries or resetPaths' });
        }
        if (
          restoreRevisionId &&
          (hasEntries || hasResets || hasOverrides || deleteDocument || hasActiveMutation)
        ) {
          return res
            .status(400)
            .json({ error: 'restoreRevisionId cannot be combined with other mutations' });
        }
        if (hasActiveMutation && (hasEntries || hasResets || hasOverrides || deleteDocument)) {
          return res
            .status(400)
            .json({ error: 'isActive cannot be combined with other mutations' });
        }
      }

      const hasBroadManage = await hasConfigCapability(user, null, 'manage');
      if (deleteDocument || hasOverrides || restoreRevisionId || hasActiveMutation) {
        if (!hasBroadManage) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
      }

      let op: ConfigMutationOp;
      if (hasActiveMutation) {
        op = { kind: 'active', isActive: body.isActive as boolean };
      } else if (restoreRevisionId) {
        op = { kind: 'restore', revisionId: restoreRevisionId };
      } else if (deleteDocument) {
        op = { kind: 'delete' };
      } else if (hasOverrides) {
        const rawOverrides = body.overrides as Record<string, unknown>;
        if (
          hasProcessMCPServerConfig(rawOverrides.mcpServers) ||
          hasProcessMCPServerConfig(rawOverrides.mcpConfig)
        ) {
          return res.status(400).json({ error: PROCESS_MCP_CONFIG_ERROR });
        }
        if (hasLangfuseHeadersOverride(rawOverrides)) {
          return res.status(400).json({ error: LANGFUSE_HEADERS_CONFIG_ERROR });
        }
        const sanitizedOverrides = sanitizeConfigOverrides(rawOverrides) as Record<string, unknown>;
        for (const section of BASE_PRINCIPAL_OVERRIDE_SECTIONS) {
          delete sanitizedOverrides[section];
        }
        for (const section of getConfigSecretSections()) {
          const secretInputError = getConfigSecretInputError(section, sanitizedOverrides[section]);
          if (secretInputError) {
            return res.status(400).json({ error: secretInputError });
          }
        }
        const existing = await findConfigByPrincipal(principalType, principalId, {
          includeInactive: true,
          tenantId: requestTenantId,
        });
        const versionConflictResponse = rejectConfigVersionConflict(
          res,
          requestedVersion,
          existing,
        );
        if (versionConflictResponse) {
          return versionConflictResponse;
        }
        const existingConflictError = getArrayExistingIdentityConflictError(
          '',
          sanitizedOverrides,
          existing?.overrides,
        );
        if (existingConflictError) {
          return res.status(400).json({ error: existingConflictError });
        }
        const encryptedOverrides = encryptConfigSecrets(sanitizedOverrides);
        const preservedOverrides = preserveConfigSecrets(
          encryptedOverrides,
          existing?.overrides,
          '',
          resolveMcpSecretHintBatchForWholeDocument(encryptedOverrides),
        );
        const replaceValidationError = validateAtomicReplaceOverrides(preservedOverrides);
        if (replaceValidationError) {
          return res.status(400).json({ error: replaceValidationError });
        }
        op = {
          kind: 'replace',
          overrides: preservedOverrides,
          priority: hasBroadManage
            ? ((priority as number | null | undefined) ??
              existing?.priority ??
              DEFAULT_BASE_PRIORITY)
            : DEFAULT_BASE_PRIORITY,
        };
      } else {
        if (entries.length > MAX_PATCH_ENTRIES) {
          return res
            .status(400)
            .json({ error: `entries array exceeds maximum of ${MAX_PATCH_ENTRIES}` });
        }
        for (const entry of entries) {
          if (!isValidFieldPath(entry.fieldPath)) {
            return res
              .status(400)
              .json({ error: `Invalid or unsafe field path: ${entry.fieldPath}` });
          }
          if (
            !isBlockedFieldPath(entry.fieldPath) &&
            !BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(getTopLevelSection(entry.fieldPath)) &&
            !isConfigFieldPath(entry.fieldPath)
          ) {
            return res.status(400).json({ error: `Unknown config field path: ${entry.fieldPath}` });
          }
          if (isProcessMCPServerFieldPath(entry.fieldPath, entry.value)) {
            return res.status(400).json({ error: PROCESS_MCP_CONFIG_ERROR });
          }
          if (isLangfuseHeadersFieldPath(entry.fieldPath)) {
            return res.status(400).json({ error: LANGFUSE_HEADERS_CONFIG_ERROR });
          }
          if (isConfigSecretDescendantPath(entry.fieldPath)) {
            return res
              .status(400)
              .json({ error: `Cannot patch inside protected secret path: ${entry.fieldPath}` });
          }
          const secretInputError = getConfigSecretInputError(entry.fieldPath, entry.value);
          if (secretInputError) {
            return res.status(400).json({ error: secretInputError });
          }
          if (Array.isArray(entry.value) && isConfigSecretAncestorPath(entry.fieldPath)) {
            return res.status(400).json({
              error: `Cannot patch protected secret ancestor as an array: ${entry.fieldPath}`,
            });
          }
          const indexedErr = indexedArrayPathError(entry.fieldPath);
          if (indexedErr) {
            return res.status(400).json({ error: indexedErr });
          }
        }
        for (const path of rawResetPaths) {
          if (!isValidFieldPath(path)) {
            return res.status(400).json({ error: `Invalid or unsafe field path: ${path}` });
          }
          if (
            !isBlockedFieldPath(path) &&
            !BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(getTopLevelSection(path)) &&
            !isConfigFieldPath(path)
          ) {
            return res.status(400).json({ error: `Unknown config field path: ${path}` });
          }
          if (isProcessMCPServerFieldPath(path, undefined)) {
            return res.status(400).json({ error: PROCESS_MCP_CONFIG_ERROR });
          }
          if (isLangfuseHeadersFieldPath(path)) {
            return res.status(400).json({ error: LANGFUSE_HEADERS_CONFIG_ERROR });
          }
          const secretInputError = getConfigSecretInputError(path, undefined);
          if (secretInputError) {
            return res.status(400).json({ error: secretInputError });
          }
          const indexedErr = indexedArrayPathError(path);
          if (indexedErr) {
            return res.status(400).json({ error: indexedErr });
          }
        }

        const validResets = canonicalizeResetPaths(
          rawResetPaths
            .filter(
              (path) =>
                !isBlockedFieldPath(path) &&
                !BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(getTopLevelSection(path)),
            )
            .flatMap(getConfigSecretMutationPaths),
        );
        const seen = new Set<string>();
        const rawFields: Record<string, unknown> = {};
        for (const entry of entries.map((item) => ({
          ...item,
          value: normalizeInterfaceFieldPatch(item.fieldPath, item.value),
        }))) {
          if (isBlockedFieldPath(entry.fieldPath)) {
            continue;
          }
          if (BASE_PRINCIPAL_OVERRIDE_SECTIONS.has(getTopLevelSection(entry.fieldPath))) {
            continue;
          }
          if (seen.has(entry.fieldPath)) {
            return res.status(400).json({ error: `Duplicate fieldPath: ${entry.fieldPath}` });
          }
          let overlappingPath: string | null = null;
          for (const path of seen) {
            if (entry.fieldPath.startsWith(`${path}.`) || path.startsWith(`${entry.fieldPath}.`)) {
              overlappingPath = path;
              break;
            }
          }
          if (overlappingPath) {
            return res.status(400).json({
              error: `Overlapping fieldPath entries are not allowed: ${overlappingPath} and ${entry.fieldPath}`,
            });
          }
          seen.add(entry.fieldPath);
          rawFields[entry.fieldPath] = entry.value;
        }

        for (const fieldPath of Object.keys(rawFields)) {
          const overlappingReset = validResets.find((resetPath) =>
            fieldPathsOverlap(fieldPath, resetPath),
          );
          if (overlappingReset) {
            return res.status(400).json({
              error:
                'resetPaths and entries must not overlap: ' +
                `${overlappingReset} and ${fieldPath}`,
            });
          }
        }

        const requestedSections = [
          ...new Set([
            ...Object.keys(rawFields).map((fieldPath) => getTopLevelSection(fieldPath)),
            ...validResets.map((path) => getTopLevelSection(path)),
          ]),
        ];

        if (!hasBroadManage && requestedSections.length > 0) {
          const requestedAllowed = await Promise.all(
            requestedSections.map((section) =>
              hasConfigCapability(user, section as ConfigSection, 'manage'),
            ),
          );
          const requestedDenied = requestedSections.find((_, i) => !requestedAllowed[i]);
          if (requestedDenied) {
            return res
              .status(403)
              .json({ error: `Insufficient permissions for config section: ${requestedDenied}` });
          }
        }
        if (!hasBroadManage && requestedSections.length === 0) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const existing = await findConfigByPrincipal(principalType, principalId, {
          includeInactive: true,
          tenantId: requestTenantId,
        });
        const versionConflictResponse = rejectConfigVersionConflict(
          res,
          requestedVersion,
          existing,
        );
        if (versionConflictResponse) {
          return versionConflictResponse;
        }
        for (const [fieldPath, fieldValue] of Object.entries(rawFields)) {
          const existingConflictError = getArrayExistingIdentityConflictError(
            fieldPath,
            fieldValue,
            existing?.overrides,
          );
          if (existingConflictError) {
            return res.status(400).json({ error: existingConflictError });
          }
        }
        const fields = preservePatchedConfigSecretFields(
          encryptConfigSecretFields(rawFields),
          existing?.overrides,
          validResets,
        );

        const yamlBaseline = getAppConfig
          ? ((await getAppConfig({
              tenantId: requestTenantId,
              baseOnly: true,
            })) as unknown as Record<string, unknown>)
          : null;
        const fieldsValidationError = validateAtomicFieldValues(
          fields,
          validResets,
          existing,
          yamlBaseline,
        );
        if (fieldsValidationError) {
          return res.status(400).json({ error: fieldsValidationError });
        }

        if (Object.keys(fields).length === 0 && validResets.length === 0) {
          return res.status(200).json({ message: 'No actionable field entries provided' });
        }

        op = {
          kind: 'fields',
          resetPaths: validResets,
          fields,
          priority: hasBroadManage
            ? ((priority as number | null | undefined) ??
              existing?.priority ??
              DEFAULT_BASE_PRIORITY)
            : // A section-scoped caller's submitted priority is untrusted and
              // discarded above, but falling back to DEFAULT_PRIORITY (10) for a
              // brand-new __base__ document ties it with the default role
              // profile priority. Resolution has no tie-breaker for equal
              // priorities, so the base config — which must apply before every
              // more specific profile — could end up applied after one instead
              // and overwrite it. Base config has no more-general layer beneath
              // it, so 0 is always correct for a first-ever base document.
              (existing?.priority ?? DEFAULT_BASE_PRIORITY),
        };
      }

      const cause: ConfigRevisionCause = (() => {
        if (op.kind === 'restore') {
          return 'restore';
        }
        if (op.kind === 'delete') {
          return 'reset';
        }
        if (op.kind === 'active') {
          return 'save';
        }
        if (op.kind === 'replace') {
          return 'import';
        }
        return Object.keys(op.fields).length === 0 ? 'reset' : 'save';
      })();

      const restoreBaseline = restoreRevisionId
        ? await getAppConfig?.({ tenantId: requestTenantId, baseOnly: true })
        : undefined;
      const { config, revision, changed } = await mutateConfigWithRevision({
        principalType,
        principalId,
        principalModel: principalModel(principalType),
        expectedVersion: requestedVersion,
        op,
        cause,
        actor: {
          actorId: user.id,
          actorEmail: (req.user as { email?: string } | undefined)?.email,
          tenantId: requestTenantId,
        },
        normalizeSecrets: encryptLegacyPlaintextConfigSecrets,
        validateRestoredOverrides: (overrides, tombstones) =>
          validateRestoredOverrides(overrides, tombstones, restoreBaseline),
      });

      try {
        await invalidateConfigCaches?.(requestTenantId);
      } catch (err) {
        logger.error('[adminConfig] Cache invalidation failed after atomic mutate:', err);
      }

      if (!changed || revision == null) {
        return res.status(200).json({
          changed: false,
          configVersion: null,
          revisionId: null,
        });
      }

      if (!hasBroadManage) {
        return res.status(200).json({
          changed: true,
          configVersion: config?.configVersion ?? null,
          revisionId: revision.id,
        });
      }
      return res.status(200).json({
        changed: true,
        config: config ? redactConfigForResponse(config) : config,
        revision: redactRevisionForResponse(revision),
      });
    } catch (error) {
      if (isConfigVersionConflict(error)) {
        return res.status(409).json({
          error: 'Config version conflict',
          currentVersion: error.currentVersion,
        });
      }
      if (isConfigRevisionNotFound(error)) {
        return res.status(404).json({ error: 'Revision not found' });
      }
      if (isRestoreValidationError(error)) {
        return res.status(400).json({ error: error.message });
      }
      if (isTransactionRequired(error)) {
        return res.status(503).json({ error: (error as Error).message });
      }
      logger.error('[adminConfig] mutateConfigAtomic error:', error);
      return res.status(500).json({ error: 'Failed to mutate config' });
    }
  }

  return {
    listConfigs,
    getBaseConfig,
    listConfigRevisions,
    getConfig,
    upsertConfigOverrides,
    patchConfigField,
    tombstoneConfigField,
    deleteConfigField,
    deleteConfigOverrides,
    toggleConfig,
    mutateConfigAtomic,
  };
}
