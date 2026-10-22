import { PrincipalType } from 'librechat-data-provider';
import type { PrincipalModel, TCustomConfig } from 'librechat-data-provider';
import type { ConfigOverrideState } from './mutations';
import type { ConfigPathSegments } from './paths';
import {
  setConfigFields,
  unsetConfigPaths,
  toConfigOverrideState,
  tombstoneConfigPaths,
  replaceConfigOverrides,
  isConfigOverrideStateEmpty,
} from './mutations';
import { BASE_CONFIG_PRINCIPAL_ID } from '~/admin/capabilities';
import { parseFieldPath } from './paths';

/**
 * The portable admin-config store contract.
 *
 * Override documents are plain JSON: record keys may contain `.` or start with `$`, and no
 * engine-specific operator appears in the override semantics. An engine stores and returns
 * documents verbatim (any key encoding is the engine's own business), and every write is a
 * whole-document compare-and-swap against a revision. Mutations are pure transforms
 * (`./mutations`) applied between a read and that write, so a second engine (PostgreSQL/JSONB)
 * implements five operations and inherits the rest.
 *
 * Every engine also scopes documents to the caller's tenant as `~/tenant/conformance` requires,
 * and keeps role documents (whose ids every tenant reuses) and every `listActive` read to one
 * tenant partition (`tenantPartition`), so a merge never mixes tenants. Only a `list` that asks
 * for `acrossTenants` reads every partition the caller's scope can see, for reports that name
 * each document's tenant.
 *
 * `./conformance` is the suite an engine must pass.
 */

/** Precondition meaning "the principal must not have a document yet" (create-only). */
export const ABSENT_CONFIG_REVISION = 'absent';

/** Priority a principal's document gets when a write creates it without one. */
export const DEFAULT_CONFIG_PRIORITY = 10;

/** How many times a write without a client precondition re-reads and retries on a conflict. */
export const CONFIG_WRITE_ATTEMPTS = 3;

/** The longest pause before the first retry; it doubles for each later one. */
const CONFIG_RETRY_BASE_DELAY_MS = 20;

/** The longest pause before any retry. */
const CONFIG_RETRY_MAX_DELAY_MS = 200;

/** `<document id>:<configVersion>`, or {@link ABSENT_CONFIG_REVISION}. */
export type ConfigRevision = string;

const REVISION_PATTERN = /^([A-Za-z0-9_-]{1,64}):(0|[1-9]\d{0,14})$/;

export interface ConfigPrincipal {
  principalType: PrincipalType;
  principalId: string;
}

/** A principal's override document as every engine returns it. */
export interface ConfigRecord {
  /** The engine's identity for the document; changes when a document is deleted and recreated. */
  _id: string;
  principalType: PrincipalType;
  principalId: string;
  principalModel: PrincipalModel;
  priority: number;
  overrides: Partial<TCustomConfig>;
  tombstones: string[];
  isActive: boolean;
  /** Incremented by every write; `0` for a legacy document that never had it. */
  configVersion: number;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Everything a write sets. Identity, version, tenant and timestamps belong to the engine. */
export type ConfigDraft = Pick<
  ConfigRecord,
  'principalModel' | 'priority' | 'overrides' | 'tombstones' | 'isActive'
>;

/** The parts of a document that name its principal and its tombstones. */
export type ConfigTombstones = Pick<
  ConfigRecord,
  'principalType' | 'principalId' | 'tenantId' | 'tombstones'
>;

/**
 * Which documents a `list` returns: only active or inactive ones, and with `acrossTenants`, the
 * role documents of every tenant partition the caller's scope can read instead of one partition's.
 */
export interface ConfigListFilter {
  isActive?: boolean;
  acrossTenants?: boolean;
}

export interface ConfigStore {
  /** The principal's document, active or not, or `null` when it has none. */
  read(principal: ConfigPrincipal): Promise<ConfigRecord | null>;
  /** Every document the filter selects, in {@link compareConfigRecords} order. */
  list(filter?: ConfigListFilter): Promise<ConfigRecord[]>;
  /** The active documents of exactly these principals, in {@link compareConfigRecords} order. */
  listActive(principals: readonly ConfigPrincipal[]): Promise<ConfigRecord[]>;
  /**
   * Writes the whole document when the stored one is at `expected` (or, for
   * {@link ABSENT_CONFIG_REVISION}, when none exists), incrementing `configVersion`. Any other
   * state throws {@link ConfigRevisionConflictError} and changes nothing.
   */
  write(
    principal: ConfigPrincipal,
    draft: ConfigDraft,
    expected: ConfigRevision,
  ): Promise<ConfigRecord>;
  /**
   * Deletes the principal's document and returns it, or returns `null` when there is none. With
   * `expected`, deletes only a document at that revision and throws
   * {@link ConfigRevisionConflictError} for any other state.
   */
  remove(principal: ConfigPrincipal, expected?: ConfigRevision): Promise<ConfigRecord | null>;
  /**
   * Re-inserts a deleted document as it was (identity and version included) only when the
   * principal has none, so a document written since is never replaced. Returns whether it did.
   */
  restore(snapshot: ConfigRecord): Promise<boolean>;
}

/**
 * The stored document is not at the revision a write was conditioned on. `currentRevision` is
 * the revision found (`null` when there is no document), when the failing step knew it.
 */
export class ConfigRevisionConflictError extends Error {
  readonly code = 'CONFIG_VERSION_CONFLICT';
  readonly currentRevision: ConfigRevision | null | undefined;

  constructor(currentRevision?: ConfigRevision | null) {
    super('Config was modified by another request');
    this.name = 'ConfigRevisionConflictError';
    this.currentRevision = currentRevision;
  }
}

export function isConfigRevisionConflict(error: unknown): error is ConfigRevisionConflictError {
  return (
    error instanceof ConfigRevisionConflictError ||
    (error instanceof Error && (error as { code?: unknown }).code === 'CONFIG_VERSION_CONFLICT')
  );
}

export function getConfigRevision(record: {
  _id: { toString(): string };
  configVersion?: number | null;
}): ConfigRevision {
  return `${record._id.toString()}:${record.configVersion ?? 0}`;
}

/** The revision a write must be conditioned on to replace `record` (or to create it). */
export function getExpectedRevision(record: ConfigRecord | null): ConfigRevision {
  return record ? getConfigRevision(record) : ABSENT_CONFIG_REVISION;
}

/** Splits a document revision into identity and version; `null` for anything else. */
export function parseConfigRevision(
  revision: ConfigRevision,
): { id: string; configVersion: number } | null {
  const match = REVISION_PATTERN.exec(revision);
  return match ? { id: match[1], configVersion: Number(match[2]) } : null;
}

/** Whether a client-supplied precondition is well formed: `absent` or a document revision. */
export function isConfigRevision(value: unknown): value is ConfigRevision {
  return (
    typeof value === 'string' &&
    (value === ABSENT_CONFIG_REVISION || parseConfigRevision(value) != null)
  );
}

/** Store order: ascending priority, then the engine identity, so equal priorities never shuffle. */
export function compareConfigRecords(
  left: Pick<ConfigRecord, '_id' | 'priority'>,
  right: Pick<ConfigRecord, '_id' | 'priority'>,
): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  if (left._id === right._id) {
    return 0;
  }
  return left._id < right._id ? -1 : 1;
}

/**
 * The pause in milliseconds before retry `attempt` (1-based) of a write that lost a race: a random
 * point in the upper half of a ceiling that doubles per retry (20, 40, 80 ms, up to 200), so
 * writers that lost the same race re-read at different times instead of colliding again.
 */
export function getConfigRetryDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(
    CONFIG_RETRY_MAX_DELAY_MS,
    CONFIG_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

function pauseBeforeRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, getConfigRetryDelay(attempt)));
}

/** What one attempt of {@link runConfigMutation} decided: write `draft`, or stop with `result`. */
export type ConfigMutationPlan<T> = { draft: ConfigDraft; result?: T } | { draft: null; result: T };

export type ConfigMutationOutcome<T> =
  | { written: true; record: ConfigRecord; previous: ConfigRecord | null; result?: T }
  | { written: false; current: ConfigRecord | null; result: T };

export interface ConfigMutationIO {
  read(): Promise<ConfigRecord | null>;
  write(draft: ConfigDraft, expected: ConfigRevision): Promise<ConfigRecord>;
}

/**
 * Read, plan, compare-and-swap. `plan` sees the document as stored and returns the whole next
 * draft (or a reason to stop), so validation and secret preservation always run against what
 * the write replaces.
 *
 * With `expectedRevision` the write happens only on that revision: a mismatch at read or at
 * write throws {@link ConfigRevisionConflictError}. Without it, a concurrent write is absorbed
 * by pausing ({@link getConfigRetryDelay}), re-reading and re-planning, up to `attempts` times,
 * and only then throws.
 */
export async function runConfigMutation<T = never>(
  io: ConfigMutationIO,
  plan: (current: ConfigRecord | null) => ConfigMutationPlan<T> | Promise<ConfigMutationPlan<T>>,
  options: { expectedRevision?: ConfigRevision; attempts?: number } = {},
): Promise<ConfigMutationOutcome<T>> {
  const { expectedRevision } = options;
  const attempts = expectedRevision ? 1 : Math.max(1, options.attempts ?? CONFIG_WRITE_ATTEMPTS);
  for (let attempt = 1; ; attempt++) {
    const current = await io.read();
    const currentRevision = current ? getConfigRevision(current) : null;
    if (expectedRevision && expectedRevision !== (currentRevision ?? ABSENT_CONFIG_REVISION)) {
      throw new ConfigRevisionConflictError(currentRevision);
    }
    const next = await plan(current);
    if (next.draft == null) {
      return { written: false, current, result: next.result as T };
    }
    try {
      const record = await io.write(next.draft, getExpectedRevision(current));
      return { written: true, record, previous: current, result: next.result };
    } catch (error) {
      if (!isConfigRevisionConflict(error) || attempt >= attempts) {
        throw error;
      }
    }
    await pauseBeforeRetry(attempt);
  }
}

/** Options every principal-scoped write accepts. */
export interface ConfigWriteOptions {
  /** Write only when the stored document is at this revision (`absent`: only when none exists). */
  expectedRevision?: ConfigRevision;
}

export interface ConfigLifecycleOptions extends ConfigWriteOptions {
  /**
   * Act only on a document that holds nothing (see `isConfigOverrideStateEmpty`); otherwise
   * resolve to `null` and leave it unchanged. Assign-only callers manage profiles they cannot
   * edit, so they may only touch empty ones.
   */
  expectEmpty?: boolean;
}

/**
 * A path a removal or tombstone addresses: a dotted field path, which cannot name a key that
 * contains a dot, or the path's segments, which can.
 */
export type ConfigPathInput = string | { segments: ConfigPathSegments };

/** One path, or several removed or tombstoned in the same write. */
export type ConfigPathInputs = ConfigPathInput | readonly ConfigPathInput[];

function isEmptyRecord(record: ConfigRecord): boolean {
  return isConfigOverrideStateEmpty(toConfigOverrideState(record));
}

function toDraft(
  current: ConfigRecord | null,
  state: ConfigOverrideState,
  defaults: Pick<ConfigDraft, 'principalModel'> & { priority?: number },
): ConfigDraft {
  return {
    principalModel: defaults.principalModel,
    priority: defaults.priority ?? current?.priority ?? DEFAULT_CONFIG_PRIORITY,
    overrides: state.overrides,
    tombstones: state.tombstones,
    isActive: current?.isActive ?? true,
  };
}

/** The record a plan that always drafts has written. */
function writtenRecord(outcome: ConfigMutationOutcome<never>): ConfigRecord {
  if (!outcome.written) {
    throw new Error('Config mutation planned no write');
  }
  return outcome.record;
}

function toSegments(path: ConfigPathInput): ConfigPathSegments {
  return typeof path === 'string' ? parseFieldPath(path) : path.segments;
}

function toPathList(paths: ConfigPathInputs): ConfigPathSegments[] {
  return Array.isArray(paths) ? paths.map(toSegments) : [toSegments(paths as ConfigPathInput)];
}

function isPathOrDescendant(path: string, fieldPath: string): boolean {
  return path === fieldPath || path.startsWith(`${fieldPath}.`);
}

function toTombstones(record: ConfigRecord): ConfigTombstones {
  const { principalType, principalId, tenantId, tombstones } = record;
  return tenantId == null
    ? { principalType, principalId, tombstones }
    : { principalType, principalId, tenantId, tombstones };
}

type ActiveToggle = { config: ConfigRecord; changed: boolean };

export interface ConfigOperations {
  findConfig(
    principal: ConfigPrincipal,
    options?: { includeInactive?: boolean },
  ): Promise<ConfigRecord | null>;
  getApplicableConfigs(
    principals?: ReadonlyArray<{ principalType: string; principalId?: { toString(): string } }>,
  ): Promise<ConfigRecord[]>;
  listTombstones(fieldPath: string): Promise<ConfigTombstones[]>;
  replaceOverrides(
    principal: ConfigPrincipal,
    principalModel: PrincipalModel,
    overrides: Partial<TCustomConfig>,
    priority: number,
    options?: ConfigLifecycleOptions & { preservePriority?: boolean },
  ): Promise<ConfigRecord | null>;
  setFields(
    principal: ConfigPrincipal,
    principalModel: PrincipalModel,
    fields: Record<string, unknown>,
    priority?: number,
    options?: ConfigWriteOptions,
  ): Promise<ConfigRecord>;
  tombstoneFields(
    principal: ConfigPrincipal,
    principalModel: PrincipalModel,
    fieldPaths: ConfigPathInputs,
    priority?: number,
    options?: ConfigWriteOptions,
  ): Promise<ConfigRecord>;
  unsetFields(
    principal: ConfigPrincipal,
    fieldPaths: ConfigPathInputs,
    options?: ConfigWriteOptions,
  ): Promise<ConfigRecord | null>;
  deleteConfig(
    principal: ConfigPrincipal,
    options?: ConfigLifecycleOptions,
  ): Promise<ConfigRecord | null>;
  setActive(
    principal: ConfigPrincipal,
    isActive: boolean,
    options?: ConfigLifecycleOptions,
  ): Promise<ActiveToggle | null>;
}

/**
 * The principal-scoped operations every caller uses, built only on the {@link ConfigStore}
 * contract, so each engine gets identical override semantics. A dotted `fieldPath` argument is
 * split into segments and so cannot address a key that itself contains a dot; removals take
 * `{ segments }` for that, and `setFields` callers write such a record whole at its own path.
 */
export function createConfigOperations(store: ConfigStore): ConfigOperations {
  function mutate<T = never>(
    principal: ConfigPrincipal,
    plan: (current: ConfigRecord | null) => ConfigMutationPlan<T>,
    options?: ConfigWriteOptions,
  ): Promise<ConfigMutationOutcome<T>> {
    return runConfigMutation<T>(
      {
        read: () => store.read(principal),
        write: (draft, expected) => store.write(principal, draft, expected),
      },
      plan,
      { expectedRevision: options?.expectedRevision },
    );
  }

  async function findConfig(
    principal: ConfigPrincipal,
    options?: { includeInactive?: boolean },
  ): Promise<ConfigRecord | null> {
    const record = await store.read(principal);
    if (!record || (!options?.includeInactive && !record.isActive)) {
      return null;
    }
    return record;
  }

  /** Base first in the query, then every principal that has an id; inactive documents excluded. */
  function getApplicableConfigs(
    principals?: ReadonlyArray<{ principalType: string; principalId?: { toString(): string } }>,
  ): Promise<ConfigRecord[]> {
    const query: ConfigPrincipal[] = [
      { principalType: PrincipalType.ROLE, principalId: BASE_CONFIG_PRINCIPAL_ID },
    ];
    for (const principal of principals ?? []) {
      if (principal.principalId !== undefined) {
        query.push({
          principalType: principal.principalType as PrincipalType,
          principalId: principal.principalId.toString(),
        });
      }
    }
    return store.listActive(query);
  }

  /**
   * The active documents with a tombstone at `fieldPath` or below it, in store order, without
   * their overrides. Tombstones are dotted paths, so `fieldPath` is too.
   */
  async function listTombstones(fieldPath: string): Promise<ConfigTombstones[]> {
    const found: ConfigTombstones[] = [];
    for (const record of await store.list({ isActive: true, acrossTenants: true })) {
      if (record.tombstones.some((path) => isPathOrDescendant(path, fieldPath))) {
        found.push(toTombstones(record));
      }
    }
    return found;
  }

  /** Replaces the overrides whole and activates the document; tombstones stay. */
  async function replaceOverrides(
    principal: ConfigPrincipal,
    principalModel: PrincipalModel,
    overrides: Partial<TCustomConfig>,
    priority: number,
    options?: ConfigLifecycleOptions & { preservePriority?: boolean },
  ): Promise<ConfigRecord | null> {
    const outcome = await mutate<null>(
      principal,
      (current) => {
        if (options?.expectEmpty && current && !isEmptyRecord(current)) {
          return { draft: null, result: null };
        }
        const state = replaceConfigOverrides(toConfigOverrideState(current), overrides);
        const keptPriority = options?.preservePriority ? (current?.priority ?? priority) : priority;
        return {
          draft: {
            ...toDraft(current, state, { principalModel, priority: keptPriority }),
            isActive: true,
          },
        };
      },
      options,
    );
    return outcome.written ? outcome.record : null;
  }

  /** Sets dotted field paths, clearing the tombstones they write over. Creates the document. */
  async function setFields(
    principal: ConfigPrincipal,
    principalModel: PrincipalModel,
    fields: Record<string, unknown>,
    priority?: number,
    options?: ConfigWriteOptions,
  ): Promise<ConfigRecord> {
    const writes = Object.entries(fields).map(([fieldPath, value]) => ({
      segments: parseFieldPath(fieldPath),
      value,
    }));
    const outcome = await mutate(
      principal,
      (current) => ({
        draft: toDraft(current, setConfigFields(toConfigOverrideState(current), writes), {
          principalModel,
          priority,
        }),
      }),
      options,
    );
    return writtenRecord(outcome);
  }

  /** Tombstones every path in one write (a secret and its preview companion together). */
  async function tombstoneFields(
    principal: ConfigPrincipal,
    principalModel: PrincipalModel,
    fieldPaths: ConfigPathInputs,
    priority?: number,
    options?: ConfigWriteOptions,
  ): Promise<ConfigRecord> {
    const paths = toPathList(fieldPaths);
    const outcome = await mutate(
      principal,
      (current) => ({
        draft: toDraft(current, tombstoneConfigPaths(toConfigOverrideState(current), paths), {
          principalModel,
          priority,
        }),
      }),
      options,
    );
    return writtenRecord(outcome);
  }

  /** Removes every path in one write, pruning emptied parents. `null` when there is no document. */
  async function unsetFields(
    principal: ConfigPrincipal,
    fieldPaths: ConfigPathInputs,
    options?: ConfigWriteOptions,
  ): Promise<ConfigRecord | null> {
    const paths = toPathList(fieldPaths);
    const outcome = await mutate<null>(
      principal,
      (current) => {
        if (!current) {
          return { draft: null, result: null };
        }
        const state = unsetConfigPaths(toConfigOverrideState(current), paths);
        return { draft: toDraft(current, state, current) };
      },
      options,
    );
    return outcome.written ? outcome.record : null;
  }

  /** Deletes the principal's document; `null` when there is none (or `expectEmpty` refused). */
  async function deleteConfig(
    principal: ConfigPrincipal,
    options?: ConfigLifecycleOptions,
  ): Promise<ConfigRecord | null> {
    if (!options?.expectEmpty && !options?.expectedRevision) {
      return store.remove(principal);
    }
    for (let attempt = 1; ; attempt++) {
      const current = await store.read(principal);
      const currentRevision = current ? getConfigRevision(current) : null;
      if (
        options.expectedRevision &&
        options.expectedRevision !== (currentRevision ?? ABSENT_CONFIG_REVISION)
      ) {
        throw new ConfigRevisionConflictError(currentRevision);
      }
      if (!current || (options.expectEmpty && !isEmptyRecord(current))) {
        return null;
      }
      try {
        return await store.remove(principal, getConfigRevision(current));
      } catch (error) {
        if (
          !isConfigRevisionConflict(error) ||
          options.expectedRevision ||
          attempt >= CONFIG_WRITE_ATTEMPTS
        ) {
          throw error;
        }
      }
      await pauseBeforeRetry(attempt);
    }
  }

  /** Sets `isActive`, reporting whether this write changed it. `null` when there is no document. */
  async function setActive(
    principal: ConfigPrincipal,
    isActive: boolean,
    options?: ConfigLifecycleOptions,
  ): Promise<ActiveToggle | null> {
    const outcome = await mutate<ActiveToggle | null>(
      principal,
      (current) => {
        if (!current || (options?.expectEmpty && !isEmptyRecord(current))) {
          return { draft: null, result: null };
        }
        if (current.isActive === isActive) {
          return { draft: null, result: { config: current, changed: false } };
        }
        return {
          draft: { ...toDraft(current, toConfigOverrideState(current), current), isActive },
        };
      },
      options,
    );
    return outcome.written ? { config: outcome.record, changed: true } : outcome.result;
  }

  return {
    findConfig,
    getApplicableConfigs,
    listTombstones,
    replaceOverrides,
    setFields,
    tombstoneFields,
    unsetFields,
    deleteConfig,
    setActive,
  };
}
