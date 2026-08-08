const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * The only stub in this file, and it stubs only passport: the strategies are
 * registered by the server bootstrap rather than by the router. The real
 * `tenantContextMiddleware` still runs, because it is what puts the
 * authenticated principal into async-local storage — which is where the search
 * module re-derives scope from, and therefore load-bearing for what follows.
 */
jest.mock('~/server/middleware/requireJwtAuth', () => {
  const { tenantContextMiddleware } = require('@librechat/api');
  return (req, res, next) => {
    req.user = { id: '65a000000000000000000001' };
    return tenantContextMiddleware(req, res, next);
  };
});

/**
 * The feature, end to end, through the composition root production uses.
 *
 * Every unit below this line already had coverage and the feature still returned
 * nothing, because the test harness was the only complete composition root:
 * suites migrated the schema themselves, built their own pools and injected
 * their own embedder, while the server assembled a subset by hand. So this file
 * assembles nothing. It sets environment variables, calls the same
 * `initializeChatSearch()` the entry points call, and then only writes and
 * reads:
 *
 *   - the schema is created by the composition root, not by `migrate()` here;
 *   - the pools are opened by the composition root, using the three real roles
 *     it provisioned, so RLS is enforced against the reader for real;
 *   - the projector is started by the composition root and drains on its own
 *     timer — nothing here calls `drain()`;
 *   - the message is written with `saveMessage`, the same call the chat route
 *     makes;
 *   - the result is read back over HTTP through the real router.
 *
 * If this passes while production is unwired, it is the wrong test.
 *
 * Skips without `CHAT_SEARCH_TEST_URL` on a developer machine, and fails on a
 * runner that has not configured one — mirroring `describePg` in
 * `packages/api/src/search/pg.helper.ts`. A skip that reports green is how this
 * wiring went missing in the first place.
 */
const TEST_URL = process.env.CHAT_SEARCH_TEST_URL;

function pgDescribe() {
  if (TEST_URL) {
    return describe;
  }
  if (process.env.CI === 'true') {
    throw new Error(
      'CHAT_SEARCH_TEST_URL is unset in CI. The PostgreSQL-backed suites would skip and ' +
        'report green without executing; start the pgvector service for this job.',
    );
  }
  return describe.skip;
}

const describePg = pgDescribe();

const USER_ID = '65a000000000000000000001';
const DB_NAME = 'chat_search_test_route_wiring';
const CONVO_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CONVO_ID = '22222222-2222-4222-8222-222222222222';
const ROLE_PASSWORD = 'route-wiring-role-password';

/** The composition root reads these; nothing in this file opens a pool itself. */
function roleUrl(role, database) {
  const url = new URL(TEST_URL);
  url.username = role;
  url.password = ROLE_PASSWORD;
  url.pathname = `/${database}`;
  return url.toString();
}

function adminUrl(database) {
  const url = new URL(TEST_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * Polls until the projector has caught up.
 *
 * The projector drains on its own two-second timer because that is what it does
 * in production. Driving it by hand here would be the harness doing the
 * projector's job again, which is the whole class of bug this file exists to
 * catch.
 */
async function eventually(assertion, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  for (;;) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      if (Date.now() > deadline) {
        throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

describePg('chat search wiring (composition root)', () => {
  let app;
  let mongoServer;
  let db;
  let searchService;
  let createSearchPool;
  let requestContextMiddleware;
  const OLD_ENV = process.env;

  const admin = () => createSearchPool({ connectionString: TEST_URL, max: 1 });

  beforeAll(async () => {
    ({ createSearchPool, requestContextMiddleware } = require('@librechat/api'));

    const maintenance = admin();
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await maintenance.query(`CREATE DATABASE ${DB_NAME}`);
    } finally {
      await maintenance.end();
    }

    /**
     * Exactly what an operator sets, and nothing else. In particular the schema
     * does not exist yet: `CHAT_SEARCH_MIGRATE_URL` is how it comes to.
     */
    process.env = {
      ...OLD_ENV,
      SEARCH: 'true',
      CHAT_SEARCH_ENABLED: 'true',
      CHAT_SEARCH_SYNC: 'true',
      CHAT_SEARCH_MIGRATE_URL: adminUrl(DB_NAME),
      CHAT_SEARCH_OWNER_PASSWORD: ROLE_PASSWORD,
      CHAT_SEARCH_WRITER_PASSWORD: ROLE_PASSWORD,
      CHAT_SEARCH_READER_PASSWORD: ROLE_PASSWORD,
      CHAT_SEARCH_WRITER_URL: roleUrl('chat_search_writer', DB_NAME),
      CHAT_SEARCH_DATABASE_URL: roleUrl('chat_search_reader', DB_NAME),
      CHAT_SEARCH_CURSOR_SECRET: 'route-wiring-secret',
    };
    delete process.env.MEILI_HOST;
    delete process.env.MEILI_MASTER_KEY;

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    require('@librechat/data-schemas').createModels(mongoose);
    db = require('~/models');

    searchService = require('~/server/services/Search');
    if (!(await searchService.initializeChatSearch())) {
      throw new Error('the composition root installed no search backend');
    }

    app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.use('/api/convos', require('../convos'));
    app.use('/api/messages', require('../messages'));
    app.use('/api/search', require('../search'));
  }, 300_000);

  afterAll(async () => {
    await searchService?.shutdownChatSearch();
    await mongoose.disconnect();
    await mongoServer?.stop();
    const maintenance = admin();
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
    process.env = OLD_ENV;
  });

  /** The normal application path: what the chat route calls, with its arguments. */
  const writeConversation = (conversationId, title) =>
    db.saveConvo(
      { userId: USER_ID, isTemporary: false },
      { conversationId, title, endpoint: 'openAI', model: 'gpt-4' },
      { context: 'search-wiring' },
    );

  const writeMessage = (conversationId, messageId, text) =>
    db.saveMessage(
      { userId: USER_ID, isTemporary: false },
      {
        conversationId,
        messageId,
        text,
        sender: 'User',
        isCreatedByUser: true,
        unfinished: false,
      },
      { context: 'search-wiring' },
    );

  /**
   * The whole point of the file.
   *
   * Nothing between the write and the read is driven by this test: the schema
   * was migrated by the composition root, the event was enqueued by the model
   * hooks, the projector that consumed it was started by the composition root,
   * and the row it wrote is read back by the reader pool the composition root
   * opened. Remove any one of those from the server wiring and this fails.
   */
  it('makes a saved message searchable over HTTP without the test wiring anything', async () => {
    await writeConversation(CONVO_ID, 'Quarterly revenue review');
    await writeMessage(CONVO_ID, 'm-hit', 'The quarterly revenue review is on Thursday');

    await writeConversation(OTHER_CONVO_ID, 'Holiday planning');
    await writeMessage(OTHER_CONVO_ID, 'm-miss', 'Holiday planning notes');

    await eventually(async () => {
      const response = await request(app).get('/api/messages?search=quarterly');
      expect(response.status).toBe(200);
      const ids = (response.body.messages ?? []).map((message) => message.messageId);
      expect(ids).toContain('m-hit');
      expect(ids).not.toContain('m-miss');
    });
  }, 120_000);

  it('makes a saved conversation searchable over HTTP', async () => {
    await writeConversation(CONVO_ID, 'Quarterly revenue review');
    await writeConversation(OTHER_CONVO_ID, 'Holiday planning');

    await eventually(async () => {
      const response = await request(app).get('/api/convos?search=quarterly');
      expect(response.status).toBe(200);
      const ids = response.body.conversations.map((convo) => convo.conversationId);
      expect(ids).toContain(CONVO_ID);
      expect(ids).not.toContain(OTHER_CONVO_ID);
    });
  }, 120_000);

  it('returns an empty page rather than unfiltered results when nothing matches', async () => {
    await writeConversation(CONVO_ID, 'Quarterly revenue review');

    const response = await request(app).get('/api/convos?search=nothingmatchesthisatall');

    expect(response.status).toBe(200);
    expect(response.body.conversations).toEqual([]);
  });

  /**
   * Search results used to be permanently single-page, in every one of the three
   * routes, by the same arithmetic: the route asked the backend for exactly
   * `limit` candidates and the primary store then detected "more" with a
   * `limit + 1` read over an `$in` that could never hold more than `limit`. So
   * the has-more test could not fire, no cursor was ever returned, and every
   * match ranked below the first page was unreachable.
   */
  describe('pagination', () => {
    const PAGE = 3;

    beforeAll(async () => {
      for (let index = 0; index < 8; index++) {
        await writeConversation(`convo-page-${index}`, `Quarterly review part ${index}`);
      }
    }, 120_000);

    it('returns a cursor and reaches matches below the first page', async () => {
      await eventually(async () => {
        const first = await request(app).get(`/api/convos?search=quarterly&limit=${PAGE}`);
        expect(first.status).toBe(200);
        expect(first.body.conversations).toHaveLength(PAGE);
        expect(first.body.nextCursor).toBeTruthy();

        const second = await request(app).get(
          `/api/convos?search=quarterly&limit=${PAGE}&cursor=${encodeURIComponent(
            first.body.nextCursor,
          )}`,
        );
        expect(second.status).toBe(200);
        expect(second.body.conversations.length).toBeGreaterThan(0);

        const firstIds = first.body.conversations.map((convo) => convo.conversationId);
        const secondIds = second.body.conversations.map((convo) => convo.conversationId);
        /** Pages must be disjoint: a repeat means the cursor is not advancing. */
        expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
      });
    }, 180_000);

    it('pages messages on the search backend own cursor, in ranked order', async () => {
      for (let index = 0; index < 8; index++) {
        await writeMessage(CONVO_ID, `m-page-${index}`, `quarterly revenue item ${index}`);
      }

      await eventually(async () => {
        const first = await request(app).get(`/api/messages?search=quarterly&pageSize=${PAGE}`);
        expect(first.status).toBe(200);
        expect(first.body.messages.length).toBeGreaterThan(0);
        expect(first.body.nextCursor).toBeTruthy();

        const second = await request(app).get(
          `/api/messages?search=quarterly&pageSize=${PAGE}&cursor=${encodeURIComponent(
            first.body.nextCursor,
          )}`,
        );
        expect(second.status).toBe(200);

        const firstIds = first.body.messages.map((message) => message.messageId);
        const secondIds = second.body.messages.map((message) => message.messageId);
        expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
      });
    }, 180_000);
  });

  /**
   * The capability probe drives whether the client offers conversation,
   * archived-chat and shared-link search at all. Reporting on a store the routes
   * do not call hides a working search behind a healthy reader.
   */
  it('reports the backend the routes actually call', async () => {
    const response = await request(app).get('/api/search/enable');

    expect(response.status).toBe(200);
    expect(response.body).toBe(true);
  });

  it('reports false once no backend is installed', async () => {
    await searchService.shutdownChatSearch();
    try {
      const response = await request(app).get('/api/search/enable');
      expect(response.body).toBe(false);
    } finally {
      await searchService.initializeChatSearch();
    }
  }, 120_000);
});
