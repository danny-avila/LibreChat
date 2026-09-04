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
    ['aggregate', { key: 'pipeline' }],
    ['update', { key: 'q', list: 'updates' }],
    ['delete', { key: 'q', list: 'deletes' }],
    ['insert', { key: '', list: 'documents' }],
  ]);

type CommandDocument = Record<string, unknown>;

function constrainsTenant(value: unknown): boolean {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(constrainsTenant);
  }
  const record = value as CommandDocument;
  if ('tenantId' in record) {
    return true;
  }
  return Object.values(record).some(constrainsTenant);
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
    const predicates = predicatesOf(event.command, event.commandName);
    if (predicates.length === 0) {
      return;
    }
    recording.push({
      commandName: event.commandName,
      collection,
      scoped: predicates.every(constrainsTenant),
      predicate: JSON.stringify(predicates),
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
