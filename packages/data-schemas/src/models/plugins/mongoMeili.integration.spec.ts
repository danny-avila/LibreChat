import { GenericContainer, Wait, type StartedGenericContainer } from 'testcontainers';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { MeiliSearch } from 'meilisearch';
import { EModelEndpoint } from 'librechat-data-provider';
import { createConversationModel } from '~/models/convo';
import { createMessageModel } from '~/models/message';
import type { SchemaWithMeiliMethods } from '~/models/plugins/mongoMeili';
import { execSync } from 'child_process';

const MEILISEARCH_IMAGE = 'getmeili/meilisearch:v1.35.1';
const MEILISEARCH_API_KEY = 'test-key';
const MEILISEARCH_PORT = 7700;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CONTAINER_STARTUP_TIMEOUT_MS = 120000;

const isDockerAvailable = () => {
  try {
    execSync('docker ps', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const isError = (error: unknown): error is Error =>
  error instanceof Error;

const stubEnv = (env: Record<string, string | undefined>) => {
  const OLD_ENV = { ...process.env };
  beforeAll(() => {
    Object.assign(process.env, env);
  });
  afterAll(() => {
    Object.keys(env).forEach((key) => {
      if (OLD_ENV[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = OLD_ENV[key];
      }
    });
  });
};

const describeIfDocker = isDockerAvailable() ? describe : describe.skip;

describeIfDocker('MeiliSearch sortable attributes integration', () => {
  let mongoServer: MongoMemoryServer;
  let meiliContainer: StartedGenericContainer | null = null;
  let meiliHost: string;
  let meiliClient: MeiliSearch;

  const waitForIndexing = async () => {
    const tasks = await meiliClient.getTasks({ statuses: ['enqueued', 'processing'] });
    if (tasks.results.length > 0) {
      await meiliClient.waitForTasks(tasks.results.map((t) => t.uid));
    }
  };

  stubEnv({
    SEARCH: 'true',
    MEILI_MASTER_KEY: MEILISEARCH_API_KEY,
    MEILI_HOST: undefined,
  });

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    meiliHost = `http://${process.env.MEILI_HOST || 'localhost'}:7700`;

    try {
      meiliContainer = await new GenericContainer(MEILISEARCH_IMAGE)
        .withExposedPorts(MEILISEARCH_PORT)
        .withEnvironment({ MEILI_MASTER_KEY: MEILISEARCH_API_KEY })
        .withStartupTimeout(CONTAINER_STARTUP_TIMEOUT_MS)
        .withWaitStrategy(Wait.forHttp('/', MEILISEARCH_PORT))
        .start();

      const host = meiliContainer.getHost();
      const mappedPort = meiliContainer.getMappedPort(MEILISEARCH_PORT);
      meiliHost = `http://${host}:${mappedPort}`;
    } catch (error) {
      if (isError(error)) {
        throw new Error(`Failed to start MeiliSearch container: ${error.message}`);
      }
      throw error;
    }

    meiliClient = new MeiliSearch({ host: meiliHost, apiKey: MEILISEARCH_API_KEY });
    process.env.MEILI_HOST = meiliHost;
  }, 180000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();

    if (meiliContainer) {
      try {
        await meiliContainer.stop();
      } catch (error) {
        if (!(error instanceof Error)) {
          console.error('Failed to stop MeiliSearch container:', error);
        }
      }
    }
  });

  beforeEach(async () => {
    const clearIndex = async (indexName: string) => {
      try {
        await meiliClient.index(indexName).deleteAllDocuments();
      } catch (error) {
        if (isError(error) && !error.message.includes('index_not_found')) {
          throw error;
        }
      }
    };

    await Promise.all([
      clearIndex('messages'),
      clearIndex('convos'),
    ]);
  });

  describe('Document indexing with timestamps', () => {
    test.each(['messages', 'convos'] as const)(
      '%s indexed with createdAt and updatedAt',
      async (indexName) => {
        const model = (indexName === 'messages'
          ? createMessageModel(mongoose)
          : createConversationModel(mongoose)) as ReturnType<typeof createConversationModel> & SchemaWithMeiliMethods;
        const now = new Date();

        const document = indexName === 'messages'
          ? {
              messageId: `msg-${Date.now()}`,
              conversationId: new mongoose.Types.ObjectId().toString(),
              user: new mongoose.Types.ObjectId().toString(),
              isCreatedByUser: true,
              text: 'Test message',
              createdAt: now,
              updatedAt: now,
              expiredAt: null,
              _meiliIndex: false,
            }
          : {
              conversationId: `convo-${Date.now()}`,
              user: new mongoose.Types.ObjectId().toString(),
              title: 'Test Conversation',
              endpoint: EModelEndpoint.openAI,
              createdAt: now,
              updatedAt: now,
              expiredAt: null,
              _meiliIndex: false,
            };

        await model.create(document);
        await model.syncWithMeili();
        await waitForIndexing();

        const results = await meiliClient.index(indexName).search('');
        expect(results.hits.length).toBeGreaterThan(0);

        const hit = results.hits[0] as Record<string, unknown>;
        expect(hit).toHaveProperty('createdAt');
        expect(hit).toHaveProperty('updatedAt');
        expect(new Date(hit.createdAt as string).toString()).not.toBe('Invalid Date');
        expect(new Date(hit.updatedAt as string).toString()).not.toBe('Invalid Date');
      },
    );

    test('documents with various date ranges are indexed correctly', async () => {
      const model = createConversationModel(mongoose) as ReturnType<typeof createConversationModel> & SchemaWithMeiliMethods;
      const now = new Date();

      const timestamps = [
        new Date(now.getTime() - 365 * ONE_DAY_MS),
        new Date(now.getTime() - 30 * ONE_DAY_MS),
        now,
      ];

      await model.collection.insertMany(
        timestamps.map((date, i) => ({
          conversationId: `convo-range-${i}-${Date.now()}`,
          user: new mongoose.Types.ObjectId().toString(),
          title: `Conversation ${i}`,
          endpoint: EModelEndpoint.openAI,
          createdAt: date,
          updatedAt: date,
          _meiliIndex: false,
          expiredAt: null,
        })),
      );

      await model.syncWithMeili();
      await waitForIndexing();

      const stats = await meiliClient.index('convos').getStats();
      expect(stats.numberOfDocuments).toBe(3);
    });
  });

  describe('Sorting by createdAt and updatedAt', () => {
    test.each([
      ['createdAt', 'asc'],
      ['createdAt', 'desc'],
      ['updatedAt', 'asc'],
      ['updatedAt', 'desc'],
    ] as const)('sorting by %s %s', async (field, direction) => {
      const model = createConversationModel(mongoose) as ReturnType<typeof createConversationModel> & SchemaWithMeiliMethods;
      const now = new Date();

      const dates = [
        new Date(now.getTime() - 30 * ONE_DAY_MS),
        new Date(now.getTime() - 15 * ONE_DAY_MS),
        now,
      ];

      await model.collection.insertMany(
        dates.map((date, i) => ({
          conversationId: `convo-sort-${field}-${direction}-${i}-${Date.now()}`,
          user: new mongoose.Types.ObjectId().toString(),
          title: `Sort ${field} ${direction} ${i}`,
          endpoint: EModelEndpoint.openAI,
          createdAt: date,
          updatedAt: date,
          _meiliIndex: false,
          expiredAt: null,
        })),
      );

      await model.syncWithMeili();
      await waitForIndexing();

      const results = await meiliClient.index('convos').search('', {
        sort: [`${field}:${direction}`],
      });

      expect(results.hits.length).toBe(3);

      const timestamps = results.hits.map(
        (h) => new Date((h as Record<string, unknown>)[field] as string).getTime(),
      );

      const isAscending = direction === 'asc';
      for (let i = 1; i < timestamps.length; i++) {
        if (isAscending) {
          expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
        } else {
          expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
        }
      }
    });
  });

  describe('Settings configuration', () => {
    test.each(['messages', 'convos'] as const)(
      'sortableAttributes are configured for %s index',
      async (indexName) => {
        const model = (indexName === 'messages'
          ? createMessageModel(mongoose)
          : createConversationModel(mongoose)) as ReturnType<typeof createConversationModel> & SchemaWithMeiliMethods;

        const document = indexName === 'messages'
          ? {
              messageId: `msg-settings-${Date.now()}`,
              conversationId: new mongoose.Types.ObjectId().toString(),
              user: new mongoose.Types.ObjectId().toString(),
              isCreatedByUser: true,
              expiredAt: null,
              _meiliIndex: false,
            }
          : {
              conversationId: `convo-settings-${Date.now()}`,
              user: new mongoose.Types.ObjectId().toString(),
              title: 'Settings Test',
              endpoint: EModelEndpoint.openAI,
              expiredAt: null,
              _meiliIndex: false,
            };

        await model.create(document);
        await waitForIndexing();

        const settings = await meiliClient.index(indexName).getSettings();
        expect(settings.sortableAttributes).toContain('createdAt');
        expect(settings.sortableAttributes).toContain('updatedAt');
      },
    );

    test('filterableAttributes still work alongside sortableAttributes', async () => {
      const model = createConversationModel(mongoose) as ReturnType<typeof createConversationModel> & SchemaWithMeiliMethods;
      const userId = new mongoose.Types.ObjectId().toString();

      await model.create({
        conversationId: `convo-filter-${Date.now()}`,
        user: userId,
        title: 'Filter Test',
        endpoint: EModelEndpoint.openAI,
      });

      await model.syncWithMeili();
      await waitForIndexing();

      const results = await meiliClient.index('convos').search('', {
        filter: `user = "${userId}"`,
      });

      expect(results.hits.length).toBeGreaterThan(0);
      expect((results.hits[0] as Record<string, unknown>).user).toBe(userId);
    });
  });

  describe('Error handling', () => {
    test('sync operation handles MeiliSearch errors gracefully', async () => {
      const model = createConversationModel(mongoose) as ReturnType<typeof createConversationModel> & SchemaWithMeiliMethods;

      await model.create({
        conversationId: `convo-err-${Date.now()}`,
        user: new mongoose.Types.ObjectId().toString(),
        title: 'Error Test',
        endpoint: EModelEndpoint.openAI,
      });

      try {
        await model.syncWithMeili();
      } catch (error) {
        expect(error).toBeDefined();
        expect(error).toBeInstanceOf(Error);
      }
    });

    test('search returns empty results when no documents match', async () => {
      const results = await meiliClient.index('convos').search('nonexistent-query-12345');
      expect(results.hits.length).toBe(0);
    });
  });
});
