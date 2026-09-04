import type { Connection } from 'mongoose';

/**
 * Driver-level completeness probe for tenant isolation.
 *
 * Tenant scoping is enforced by the storage engine's own binding — Mongoose
 * middleware today. That leaves one question no amount of reading the binding
 * can answer: does it cover *every* path, including the ones nobody enumerated?
 *
 * This probe answers it from below. It observes the commands that actually
 * reach the wire, so a query issued through a path the binding never hooked is
 * still caught. The check does not depend on the binding being correct, which
 * is the whole point of putting it here.
 *
 * Requires the connection to have been opened with `monitorCommands: true`.
 */

/** One command observed reaching the database. */
export interface TenantCommandRecord {
  readonly commandName: string;
  readonly collection: string;
  /** True when every predicate this command carries constrains `tenantId`. */
  readonly scoped: boolean;
  /** The predicates as sent, for test failure output. */
  readonly predicate: string;
}

export interface TenantProbe {
  /**
   * Runs `fn` and returns every observed command against a watched collection.
   * Not re-entrant: one recording at a time per probe.
   */
  record(fn: () => Promise<unknown>): Promise<readonly TenantCommandRecord[]>;
  /** Detaches the listener. */
  close(): void;
}

/**
 * Predicate locations per command, as the wire protocol names them.
 * `list` marks commands whose payload is an array of sub-operations.
 */
const PREDICATE_PATHS: ReadonlyMap<string, { readonly key: string; readonly list?: string }> =
  new Map([
    ['find', { key: 'filter' }],
    ['count', { key: 'query' }],
    ['distinct', { key: 'query' }],
    ['findAndModify', { key: 'query' }],
    ['update', { key: 'q', list: 'updates' }],
    ['delete', { key: 'q', list: 'deletes' }],
    ['insert', { key: '', list: 'documents' }],
  ]);

type CommandDocument = Record<string, unknown>;

/**
 * Whether a `tenantId` condition pins the query to a single tenant.
 *
 * Presence of the key is not enough: `{ $ne }`, `{ $nin }`, a regex, a
 * multi-valued `$in` and `{ $exists: true }` all *mention* the tenant while
 * matching rows from many. Only equality, a singleton `$in`, and the explicit
 * no-tenant partition (`{ $exists: false }`, used for platform-level audit
 * rows) actually constrain.
 */
function pinsSingleTenant(condition: unknown): boolean {
  if (condition === null || typeof condition !== 'object') {
    return true;
  }
  if (Array.isArray(condition)) {
    return false;
  }

  const operators = condition as CommandDocument;
  const keys = Object.keys(operators);
  if (keys.length === 0) {
    return false;
  }
  if (!keys.every((key) => key.startsWith('$'))) {
    return true;
  }

  return keys.every((key) => {
    const value = operators[key];
    if (key === '$eq') {
      return true;
    }
    if (key === '$in') {
      return Array.isArray(value) && value.length === 1;
    }
    if (key === '$exists') {
      return value === false;
    }
    return false;
  });
}

/**
 * Whether a filter genuinely restricts the query to one tenant.
 *
 * Deliberately conservative — a probe that over-reports scoping is worse than
 * useless, because it turns a leak into a green test. So `tenantId` counts only
 * where it actually constrains the match: at the top level, in any `$and`
 * branch, or in *every* `$or` branch. A `tenantId` nested under an unrelated
 * field constrains nothing, and `$nor` negates its branches, so it never
 * contributes a constraint.
 */
function constrainsTenant(filter: unknown): boolean {
  if (filter == null || typeof filter !== 'object' || Array.isArray(filter)) {
    return false;
  }

  const record = filter as CommandDocument;
  if ('tenantId' in record) {
    return pinsSingleTenant(record.tenantId);
  }

  const and = record.$and;
  if (Array.isArray(and) && and.some(constrainsTenant)) {
    return true;
  }

  const or = record.$or;
  if (Array.isArray(or) && or.length > 0 && or.every(constrainsTenant)) {
    return true;
  }

  return false;
}

/**
 * Stages that read a second collection inside the same aggregate command.
 *
 * Only `$lookup` appears here: the other two collection-reading stages are
 * rejected by Amazon DocumentDB and banned repo-wide by the compatibility
 * guard in `methods/documentdb.spec.ts`, so they cannot occur.
 */
const COLLECTION_READING_STAGES = ['$lookup'] as const;

/**
 * A joined or unioned collection is read as part of the outer command, so the
 * connection listener never sees a separate predicate for it. It counts as
 * scoped only if its own sub-pipeline constrains the tenant — otherwise the
 * whole aggregate is reported unscoped, which fails closed.
 */
function foreignStageConstrainsTenant(stage: unknown): boolean {
  if (stage == null || typeof stage !== 'object') {
    return false;
  }
  const record = stage as CommandDocument;
  if (constrainsTenant(record.restrictSearchWithMatch)) {
    return true;
  }
  return pipelineConstrainsTenant(record.pipeline);
}

/**
 * A pipeline is scoped when some `$match` stage constrains the tenant and every
 * collection-reading stage is scoped in its own right.
 */
function pipelineConstrainsTenant(pipeline: unknown): boolean {
  if (!Array.isArray(pipeline)) {
    return false;
  }

  let matched = false;
  for (const stage of pipeline) {
    if (stage == null || typeof stage !== 'object') {
      continue;
    }
    const record = stage as CommandDocument;
    if (constrainsTenant(record.$match)) {
      matched = true;
    }
    for (const name of COLLECTION_READING_STAGES) {
      if (name in record && !foreignStageConstrainsTenant(record[name])) {
        return false;
      }
    }
  }
  return matched;
}

/** Every predicate a command carries, so a partially-scoped batch still fails. */
function predicatesOf(command: CommandDocument, commandName: string): unknown[] {
  const path = PREDICATE_PATHS.get(commandName);
  if (!path) {
    return [];
  }
  if (!path.list) {
    return [command[path.key]];
  }
  const operations = command[path.list];
  if (!Array.isArray(operations)) {
    return [];
  }
  return path.key ? operations.map((operation) => operation?.[path.key]) : operations;
}

/**
 * Whether every predicate this command carries is tenant-scoped.
 * Returns null for commands that carry no predicate at all.
 */
function isScoped(command: CommandDocument, commandName: string): boolean | null {
  if (commandName === 'aggregate') {
    return pipelineConstrainsTenant(command.pipeline);
  }
  const predicates = predicatesOf(command, commandName);
  if (predicates.length === 0) {
    return null;
  }
  return predicates.every(constrainsTenant);
}

/** The predicates a command carries, for test failure output. */
function describePredicates(command: CommandDocument, commandName: string): string {
  const value = commandName === 'aggregate' ? command.pipeline : predicatesOf(command, commandName);
  return JSON.stringify(value);
}

export function attachTenantProbe(
  connection: Connection,
  collections: Iterable<string>,
): TenantProbe {
  const watched = new Set(collections);
  let recording: TenantCommandRecord[] | null = null;

  const onCommandStarted = (event: { commandName: string; command: CommandDocument }): void => {
    if (recording == null) {
      return;
    }
    const collection = event.command[event.commandName];
    if (typeof collection !== 'string' || !watched.has(collection)) {
      return;
    }
    const scoped = isScoped(event.command, event.commandName);
    if (scoped == null) {
      return;
    }
    recording.push({
      commandName: event.commandName,
      collection,
      scoped,
      predicate: describePredicates(event.command, event.commandName),
    });
  };

  connection.getClient().on('commandStarted', onCommandStarted);

  return {
    async record(fn) {
      const captured: TenantCommandRecord[] = [];
      recording = captured;
      try {
        await fn();
      } finally {
        recording = null;
      }
      return captured;
    },
    close() {
      connection.getClient().off('commandStarted', onCommandStarted);
    },
  };
}

/** Convenience for assertions: the commands that reached the wire unscoped. */
export function unscoped(records: readonly TenantCommandRecord[]): readonly TenantCommandRecord[] {
  return records.filter((record) => !record.scoped);
}
