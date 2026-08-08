import mongoose from 'mongoose';
import type { SearchPool } from './types';
import {
  describePg,
  isolatedDatabaseUrl,
  dropIsolatedDatabase,
  createIsolatedDatabase,
} from './pg.helper';
import { STANDBY_RETRY_MS } from './constants';
import { startChatSearch } from './boot';

/**
 * The composition root, exercised as production runs it.
 *
 * Nothing here calls `migrate`, opens a pool or constructs a `Projector`: if a
 * step is missing from `startChatSearch`, it is missing from these tests too,
 * which is the only arrangement under which they mean anything.
 */
const DB = 'boot';

describePg('chat search composition root', () => {
  let admin: SearchPool;
  let url: string;
  const OLD_ENV = process.env;

  beforeAll(async () => {
    admin = await createIsolatedDatabase(DB);
    url = isolatedDatabaseUrl(DB);
  }, 180_000);

  afterAll(async () => {
    await dropIsolatedDatabase(admin, DB);
    process.env = OLD_ENV;
  });

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      CHAT_SEARCH_ENABLED: 'true',
      CHAT_SEARCH_SYNC: 'true',
      CHAT_SEARCH_OWNER_URL: url,
      CHAT_SEARCH_WRITER_URL: url,
      CHAT_SEARCH_DATABASE_URL: url,
      CHAT_SEARCH_CURSOR_SECRET: 'boot-secret',
    };
    delete process.env.MEILI_HOST;
    delete process.env.MEILI_MASTER_KEY;
  });

  /**
   * `migrate` had no production caller at all: every schema that existed was
   * created by a test's `beforeAll`. This is that caller.
   */
  it('provisions the schema itself rather than expecting one to exist', async () => {
    const stack = await startChatSearch({ mongoose });
    try {
      expect(stack.migrated).toContain('001_schema.sql');
      expect(stack.chatSearch).not.toBeNull();

      const { rows } = await admin.query<{ count: string }>(
        `SELECT count(*) AS count FROM information_schema.tables
          WHERE table_schema = 'chat_search' AND table_name = 'documents'`,
      );
      expect(Number(rows[0].count)).toBe(1);
    } finally {
      await stack.stop();
    }
  }, 120_000);

  it('is idempotent, so a second pod applies nothing and still serves', async () => {
    const first = await startChatSearch({ mongoose });
    await first.stop();

    const second = await startChatSearch({ mongoose });
    try {
      expect(second.migrated).toEqual([]);
      expect(second.chatSearch).not.toBeNull();
    } finally {
      await second.stop();
    }
  }, 120_000);

  /**
   * The regression this file exists for.
   *
   * A pod that loses the election registers a standby timer that retries
   * `acquireLease` on its writer pool. An earlier version closed that pool the
   * moment the election was lost, and `pg-pool` rejects `connect()` permanently
   * after `end()` — so every standby was already dead when the leader died, and
   * a cluster that lost its projector never got another one until a full
   * restart. Teardown therefore belongs in `stop()` and nowhere else.
   */
  it('lets a standby take over once the leader releases the lease', async () => {
    const leader = await startChatSearch({ mongoose });
    expect(leader.isProjecting()).toBe(true);

    const standby = await startChatSearch({ mongoose });
    try {
      expect(standby.isProjecting()).toBe(false);

      await leader.stop();

      const deadline = Date.now() + STANDBY_RETRY_MS * 6;
      while (!standby.isProjecting() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      expect(standby.isProjecting()).toBe(true);
    } finally {
      await leader.stop();
      await standby.stop();
    }
  }, 180_000);

  /**
   * A deployment that configured nothing must boot exactly as it did before,
   * which means no pool, no projector and no throw — just no search.
   */
  it('installs nothing when the feature is unconfigured', async () => {
    delete process.env.CHAT_SEARCH_ENABLED;
    delete process.env.CHAT_SEARCH_DATABASE_URL;
    delete process.env.CHAT_SEARCH_OWNER_URL;
    delete process.env.CHAT_SEARCH_WRITER_URL;

    const stack = await startChatSearch({ mongoose });
    try {
      expect(stack.chatSearch).toBeNull();
      expect(stack.migrated).toEqual([]);
      expect(stack.isProjecting()).toBe(false);
    } finally {
      await stack.stop();
    }
  }, 60_000);
});
