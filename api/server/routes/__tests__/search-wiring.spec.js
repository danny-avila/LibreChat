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
 * The wiring, end to end, against both real stores.
 *
 * Every unit below this line already had coverage and the feature still returned
 * nothing, because nothing asserted that a configured backend is actually
 * installed and reachable from a route. That is the gap this file closes: it
 * boots search the way the server does, projects a record the way the projector
 * does, and asks the real router for it over HTTP.
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

function databaseUrl(database) {
  const url = new URL(TEST_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

describePg('chat search route wiring', () => {
  let app;
  let mongoServer;
  let pool;
  let models;
  let searchService;
  let requestContextMiddleware;
  let createSearchPool;
  let migrate;
  const OLD_ENV = process.env;

  const adminPool = () => createSearchPool({ connectionString: TEST_URL, max: 1 });

  beforeAll(async () => {
    ({ migrate, createSearchPool, requestContextMiddleware } = require('@librechat/api'));
    const admin = adminPool();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${DB_NAME}`);
    } finally {
      await admin.end();
    }

    process.env = {
      ...OLD_ENV,
      SEARCH: 'true',
      CHAT_SEARCH_ENABLED: 'true',
      CHAT_SEARCH_DATABASE_URL: databaseUrl(DB_NAME),
      CHAT_SEARCH_CURSOR_SECRET: 'route-wiring-secret',
    };
    delete process.env.MEILI_HOST;
    delete process.env.MEILI_MASTER_KEY;

    pool = createSearchPool({ connectionString: databaseUrl(DB_NAME), max: 4 });
    await migrate(pool);

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    models = require('@librechat/data-schemas').createModels(mongoose);

    searchService = require('~/server/services/Search');
    if (!searchService.initializeChatSearch()) {
      throw new Error('chat search did not install a backend');
    }

    app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.use('/api/convos', require('../convos'));
    app.use('/api/search', require('../search'));
  }, 180_000);

  afterAll(async () => {
    await searchService?.shutdownChatSearch();
    await pool?.end().catch(() => undefined);
    await mongoose.disconnect();
    await mongoServer?.stop();
    const admin = adminPool();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    } finally {
      await admin.end();
    }
    process.env = OLD_ENV;
  });

  beforeEach(async () => {
    await models.Conversation.collection.deleteMany({});
    await pool.query('TRUNCATE chat_search.documents CASCADE');
  });

  /** Stands in for the projector: the same row it would write, written directly. */
  const project = (conversationId, title, overrides = {}) =>
    pool.query(
      `INSERT INTO chat_search.documents
         (tenant_id, user_id, kind, record_id, conversation_id, title, body,
          is_archived, tags, project_id, projection_version, embedding_input_hash)
       VALUES ('__BASE__', $1, 'conversation', $2, $2, $3, '', $4, $5::text[], $6, 1, 'h1')`,
      [
        USER_ID,
        conversationId,
        title,
        overrides.isArchived ?? false,
        overrides.tags ?? [],
        overrides.projectId ?? null,
      ],
    );

  const store = (conversationId, title, overrides = {}) =>
    models.Conversation.collection.insertOne({
      conversationId,
      user: USER_ID,
      title,
      endpoint: 'openAI',
      model: 'gpt-4',
      isArchived: overrides.isArchived ?? false,
      tags: overrides.tags ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  it('returns a hit resolved through the installed backend', async () => {
    await store('c-hit', 'Quarterly revenue review');
    await store('c-miss', 'Holiday planning');
    await project('c-hit', 'Quarterly revenue review');
    await project('c-miss', 'Holiday planning');

    const response = await request(app).get('/api/convos?search=quarterly');

    expect(response.status).toBe(200);
    expect(response.body.conversations.map((convo) => convo.conversationId)).toEqual(['c-hit']);
  });

  it('returns an empty page rather than unfiltered results when nothing matches', async () => {
    await store('c-hit', 'Quarterly revenue review');
    await project('c-hit', 'Quarterly revenue review');

    const response = await request(app).get('/api/convos?search=nothingmatchesthis');

    expect(response.status).toBe(200);
    expect(response.body.conversations).toEqual([]);
  });

  /**
   * Filters are pushed into the candidate query. Applied afterwards, a page of
   * archived candidates would come back empty with no cursor while the matching
   * conversation ranked just below the cut.
   */
  it('fills the page from below the archived candidates', async () => {
    /**
     * The ids put the archived rows above the live one in the arms' tiebreak
     * ordering, so a page that truncates before filtering starves rather than
     * happening to contain the answer.
     */
    for (let index = 0; index < 5; index++) {
      await store(`c-z-arch-${index}`, `Quarterly report ${index}`, { isArchived: true });
      await project(`c-z-arch-${index}`, `Quarterly report ${index}`, { isArchived: true });
    }
    await store('c-a-live', 'Quarterly report live');
    await project('c-a-live', 'Quarterly report live');

    const response = await request(app).get('/api/convos?search=quarterly&limit=5');

    expect(response.status).toBe(200);
    expect(response.body.conversations.map((convo) => convo.conversationId)).toEqual(['c-a-live']);
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
      searchService.initializeChatSearch();
    }
  });
});
