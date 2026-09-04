import type { Connection } from 'mongoose';
import { getTenantId, SYSTEM_TENANT_ID } from '~/config/tenantContext';

/**
 * Driver-level completeness probe for tenant isolation.
 *
 * Tenant scoping is enforced by the storage engine's own binding — Mongoose
 * middleware today. That leaves one question no amount of reading the binding
 * can answer: does it cover *every* path, including the ones nobody enumerated?
 *
 * This probe answers it from below, by observing the commands that actually
 * reach the wire. The check does not depend on the binding being correct, which
 * is the whole point of putting it here.
 *
 * It asks one narrow, decidable question: **did the binding's own contribution
 * arrive, for the tenant that was active when the command was issued?** It does
 * not try to decide tenant-safety for arbitrary filter algebra — that problem is
 * unbounded, and every operator left open is a way for a regression to look
 * scoped. The binding emits `{ tenantId: <active> }` at the top level of a
 * filter, or unshifts `{ $match: { tenantId: <active> } }` onto a pipeline, so
 * that is exactly what is checked. Anything else is reported unscoped.
 *
 * Requires the connection to have been opened with `monitorCommands: true`.
 */

/** One command observed reaching the database. */
export interface TenantCommandRecord {
  readonly commandName: string;
  readonly collection: string;
  /** The tenant active when the command was issued, if any. */
  readonly tenantId?: string;
  /** True when the command provably restricts itself to that tenant. */
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

type CommandDocument = Record<string, unknown>;

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

/** Stages that rewrite another collection from inside the aggregate command. */
const COLLECTION_WRITING_STAGES = ['$out', '$merge'] as const;

/**
 * Whether a filter carries the binding's own contribution: `tenantId` equal to
 * the active tenant, at the top level, as a plain equality.
 */
function pinsTenant(filter: unknown, tenantId: string): boolean {
  if (filter == null || typeof filter !== 'object' || Array.isArray(filter)) {
    return false;
  }
  return (filter as CommandDocument).tenantId === tenantId;
}

/** A `$lookup` reads its foreign collection inside the outer command. */
function lookupTargetsTenant(lookup: unknown, tenantId: string): boolean {
  if (lookup == null || typeof lookup !== 'object') {
    return false;
  }
  return pipelineTargetsTenant((lookup as CommandDocument).pipeline, tenantId);
}

/**
 * A pipeline is scoped when its *first* stage is the tenant `$match` the
 * binding unshifts, it writes to no other collection, and every joined read
 * scopes itself.
 *
 * Position is the whole point: `[{ $limit: 1 }, { $match: { tenantId } }]`
 * mentions the tenant but lets another tenant's row take the limited slot, and
 * a `$group` before the match has already combined every tenant's data.
 */
function pipelineTargetsTenant(pipeline: unknown, tenantId: string): boolean {
  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    return false;
  }

  for (const stage of pipeline) {
    if (stage == null || typeof stage !== 'object') {
      continue;
    }
    const record = stage as CommandDocument;
    for (const name of COLLECTION_WRITING_STAGES) {
      if (name in record) {
        return false;
      }
    }
    if ('$lookup' in record && !lookupTargetsTenant(record.$lookup, tenantId)) {
      return false;
    }
  }

  const first = pipeline[0];
  if (first == null || typeof first !== 'object') {
    return false;
  }
  return pinsTenant((first as CommandDocument).$match, tenantId);
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

/** The collection a command targets, or undefined when it names none. */
function collectionOf(command: CommandDocument, commandName: string): string | undefined {
  // `getMore` carries the cursor id under its own name and the collection separately.
  const value = commandName === 'getMore' ? command.collection : command[commandName];
  return typeof value === 'string' ? value : undefined;
}

/** The predicates a command carries, for test failure output. */
function describePredicates(command: CommandDocument, commandName: string): string {
  if (commandName === 'aggregate') {
    return JSON.stringify(command.pipeline);
  }
  if (commandName === 'getMore') {
    return '(cursor continuation — no predicate)';
  }
  return JSON.stringify(predicatesOf(command, commandName));
}

/** Whether this command is one the probe can judge at all. */
function carriesPredicate(command: CommandDocument, commandName: string): boolean {
  if (commandName === 'aggregate') {
    return Array.isArray(command.pipeline);
  }
  if (commandName === 'getMore') {
    return true;
  }
  return predicatesOf(command, commandName).length > 0;
}

/**
 * Whether every predicate this command carries targets `tenantId`.
 * Only called for commands `carriesPredicate` has already accepted.
 */
function isScoped(command: CommandDocument, commandName: string, tenantId: string): boolean {
  if (commandName === 'aggregate') {
    return pipelineTargetsTenant(command.pipeline, tenantId);
  }
  // A cursor continuation carries no predicate, and the scope it was opened
  // under is not visible here, so it fails closed rather than passing unseen.
  if (commandName === 'getMore') {
    return false;
  }
  return predicatesOf(command, commandName).every((predicate) => pinsTenant(predicate, tenantId));
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
    const collection = collectionOf(event.command, event.commandName);
    if (collection == null || !watched.has(collection)) {
      return;
    }

    if (!carriesPredicate(event.command, event.commandName)) {
      return;
    }

    // Async context reaches this handler, so each command is judged against the
    // tenant that was actually active when it was issued.
    const tenantId = getTenantId();
    const predicate = describePredicates(event.command, event.commandName);

    if (tenantId == null || tenantId === SYSTEM_TENANT_ID) {
      recording.push({ commandName: event.commandName, collection, scoped: false, predicate });
      return;
    }

    recording.push({
      commandName: event.commandName,
      collection,
      tenantId,
      scoped: isScoped(event.command, event.commandName, tenantId),
      predicate,
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
