import {
  logger,
  readSearchEvents,
  searchSyncEnabled,
  deleteSearchEvents,
  dedupeSearchEvents,
} from '@librechat/data-schemas';
import type { SearchPool } from './types';
import { applyRolePasswords, migrate } from './migrate';
import { createMongoSourceReader } from './source';
import { assertManagedRoleUrl } from './roles';
import { createSearchPool } from './pool';
import { Projector } from './projector';

/**
 * The composition root for chat search.
 *
 * Every piece of this feature had a caller in the test harness and none in the
 * server: the harness migrated the schema in `beforeAll`, built its own pools and
 * started its own projector, while the entry points assembled a subset of the
 * same parts by hand. Assembling it in one place, and requiring both entry points
 * to go through that one place, is what keeps the shipped stack and the tested
 * stack the same stack.
 *
 * Order is load-bearing, which is the other reason this is a single function: the
 * projector must not start against a schema that has not been migrated.
 */
export type ChatSearchStackOptions = Readonly<{
  mongoose: typeof import('mongoose');
}>;

export type ChatSearchStack = Readonly<{
  /** Migrations this process applied; empty when another pod got there first. */
  migrated: readonly string[];
  /**
   * Whether this process holds the projector lease *right now*.
   *
   * Deliberately a call rather than a boot-time boolean: leadership moves. A pod
   * that lost the election wins it when the leader dies, and a leader loses it to
   * a partition, so a snapshot taken at boot is wrong for most of the process's
   * life.
   */
  isProjecting(): boolean;
  stop(): Promise<void>;
}>;

type ProjectorHandle = Readonly<{
  projector: Projector;
  pool: SearchPool;
}>;

/**
 * Applies the schema before anything connects to project into it.
 *
 * The migrate connection is a separate variable because it has to be:
 * `002_roles.sql` issues `CREATE ROLE` and `ALTER TABLE ... OWNER TO`, and the
 * writer role can execute neither — it is deliberately `NOCREATEROLE` and
 * deliberately not the owner. Migrating on the writer pool would fail on the
 * first boot against a fresh database, which is the only boot where it matters.
 *
 * Unset is a supported answer. An operator who provisions out of band with
 * `npm run migrate:chat-search` gets the same schema and this becomes a no-op;
 * `migrate` takes an advisory lock either way, so concurrent pods serialize
 * rather than race.
 */
async function provisionSchema(): Promise<readonly string[]> {
  const connectionString = process.env.CHAT_SEARCH_MIGRATE_URL;
  if (!connectionString) {
    logger.info(
      '[chatSearch] CHAT_SEARCH_MIGRATE_URL is unset; expecting the schema to be provisioned ' +
        'out of band (npm run migrate:chat-search)',
    );
    return [];
  }

  const pool = createSearchPool({
    connectionString,
    max: 1,
    applicationName: 'librechat-chat-search-migrate',
    /** DDL against a populated table runs far longer than a request ever should. */
    statementTimeoutMillis: 0,
  });
  try {
    const applied = await migrate(pool);
    /**
     * The SQL creates the roles without passwords on purpose — a credential in a
     * migration file is a credential in the repository. They are useless until
     * set, so setting them is part of provisioning rather than a separate ritual
     * an operator can forget between `migrate` and first login.
     */
    await applyRolePasswords(pool);
    return applied;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/**
 * Starts the projector, or explains why it did not.
 *
 * Leadership is settled by a PostgreSQL lease rather than by this call, so every
 * pod may invoke it: one becomes the projector and the rest stand by, retrying.
 * The pool outlives a lost election precisely because of that retry — a standby
 * holds a timer that will call `acquireLease` on this pool, and `pg-pool` rejects
 * `connect()` permanently once `end()` has been called. Closing it here would
 * mean no surviving pod ever picks projection back up when the leader dies,
 * which is the failure the standby path exists to prevent.
 */
async function startProjector(
  mongoose: typeof import('mongoose'),
): Promise<ProjectorHandle | null> {
  if (!searchSyncEnabled()) {
    return null;
  }

  const connectionString = process.env.CHAT_SEARCH_WRITER_URL;
  if (!connectionString) {
    logger.info(
      '[chatSearch] CHAT_SEARCH_WRITER_URL is unset; not projecting to PostgreSQL chat search',
    );
    return null;
  }
  assertManagedRoleUrl('CHAT_SEARCH_WRITER_URL', connectionString, 'writer');

  const pool = createSearchPool({
    connectionString,
    applicationName: 'librechat-chat-search-projector',
    /** The reconciliation sweep runs far longer than a request ever should. */
    statementTimeoutMillis: 0,
  });

  const projector = new Projector(
    { pool, mongoose, source: createMongoSourceReader(mongoose) },
    {
      readSearchEvents: (limit) => readSearchEvents(mongoose, limit),
      deleteSearchEvents: (ids) => deleteSearchEvents(mongoose, ids),
      dedupeSearchEvents,
    },
  );

  /**
   * A startup that throws — an unreachable database, a missing lease table —
   * returns no handle, so nothing downstream can ever end this pool; it is
   * closed here or its clients and timers outlive the failure for the life of
   * the process (pinned by `leaves no writer connection behind when the
   * projector fails to start`).
   */
  try {
    await projector.start();
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
  return Object.freeze({ projector, pool });
}

/**
 * Builds and starts the stack: schema, then projector.
 *
 * Never throws. A deployment that configured none of this boots exactly as it did
 * before, and a deployment that misconfigured it boots without projection and
 * says so — refusing to start would turn a projection outage into a total one.
 */
export async function startChatSearch(options: ChatSearchStackOptions): Promise<ChatSearchStack> {
  /**
   * Gated on the migrate URL alone, deliberately. Supplying a provisioning
   * connection is the operator saying "migrate this", and it is the only signal
   * that means that.
   *
   * A provisioning attempt that *fails* gates the projector: an older or
   * half-provisioned database can still hold a usable lease table, so starting
   * anyway would project against a schema whose pending migration did not apply
   * (pinned by `does not start the projector when an attempted migration
   * fails`). The out-of-band path — no migrate URL configured — never throws
   * here and proceeds as before.
   */
  let migrated: readonly string[] = [];
  try {
    migrated = await provisionSchema();
  } catch (error) {
    logger.error(
      '[chatSearch] schema provisioning failed; projection will not run until it succeeds',
      error,
    );
    return Object.freeze({
      migrated,
      isProjecting: (): boolean => false,
      stop: async (): Promise<void> => undefined,
    });
  }

  let projection: ProjectorHandle | null = null;
  try {
    projection = await startProjector(options.mongoose);
  } catch (error) {
    logger.error('[chatSearch] failed to start the projector; projection will not run', error);
  }

  return Object.freeze({
    migrated,
    isProjecting: (): boolean => projection?.projector.isLeader ?? false,
    async stop(): Promise<void> {
      /**
       * Teardown is the only place the pool is closed. `stop()` clears the standby
       * timer first, so nothing is left holding a connection request against a
       * pool that is about to reject it.
       */
      await projection?.projector.stop().catch(() => undefined);
      await projection?.pool.end().catch(() => undefined);
    },
  });
}
