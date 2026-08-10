import mongoose from 'mongoose';
import { createScope } from '@librechat/data-schemas';
import type { MeiliSearchFn, MeiliSearchParams } from './meili';
import { chatSearchConfigured, createChatSearch } from './service';
import { PostgresChatSearch } from './search';
import { MeiliChatSearch } from './meili';

/**
 * The seam that decides which store answers a search. Nothing else in the stack
 * chooses: the routes hold one adapter and the adapter holds whatever this
 * returns, so a wrong answer here is a feature that silently does nothing.
 */
describe('chat search backend selection', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.CHAT_SEARCH_ENABLED;
    delete process.env.CHAT_SEARCH_DATABASE_URL;
    delete process.env.MEILI_HOST;
    delete process.env.MEILI_MASTER_KEY;
    process.env.CHAT_SEARCH_CURSOR_SECRET = 'test-cursor-secret';
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('requires both the flag and the reader URL', () => {
    expect(chatSearchConfigured()).toBe(false);

    process.env.CHAT_SEARCH_ENABLED = 'true';
    expect(chatSearchConfigured()).toBe(false);

    process.env.CHAT_SEARCH_DATABASE_URL = 'postgres://reader@localhost:5435/chat_search';
    expect(chatSearchConfigured()).toBe(true);
  });

  it('builds the PostgreSQL backend when configured', async () => {
    process.env.CHAT_SEARCH_ENABLED = 'true';
    process.env.CHAT_SEARCH_DATABASE_URL = 'postgres://reader@localhost:5435/chat_search';

    const runtime = createChatSearch({ mongoose });

    expect(runtime?.chatSearch).toBeInstanceOf(PostgresChatSearch);
    await runtime?.close();
  });

  /**
   * The routes read candidates through one seam now. Without this fallback, an
   * upgrade that changes no configuration would turn every existing Meilisearch
   * deployment's search into a silently empty result set.
   */
  it('falls back to Meilisearch when chat search is not configured', async () => {
    process.env.MEILI_HOST = 'http://localhost:7700';
    process.env.MEILI_MASTER_KEY = 'key';

    const runtime = createChatSearch({ mongoose });

    expect(runtime?.chatSearch).toBeInstanceOf(MeiliChatSearch);
    await runtime?.close();
  });

  it('prefers PostgreSQL when both are configured', async () => {
    process.env.CHAT_SEARCH_ENABLED = 'true';
    process.env.CHAT_SEARCH_DATABASE_URL = 'postgres://reader@localhost:5435/chat_search';
    process.env.MEILI_HOST = 'http://localhost:7700';
    process.env.MEILI_MASTER_KEY = 'key';

    const runtime = createChatSearch({ mongoose });

    expect(runtime?.chatSearch).toBeInstanceOf(PostgresChatSearch);
    await runtime?.close();
  });

  it('installs nothing when no search store is configured', () => {
    expect(createChatSearch({ mongoose })).toBeNull();
  });

  /**
   * The probe this replaced called Meilisearch's health endpoint, so readiness
   * has to mean reachable rather than merely configured — otherwise a
   * deployment whose Meilisearch is down newly advertises a search that cannot
   * answer. Meilisearch itself is the only thing stubbed: it is the external
   * service whose being down is the condition under test.
   */
  describe('Meilisearch readiness', () => {
    beforeEach(() => {
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'key';
    });

    const backendFor = (meiliSearch: MeiliSearchFn) =>
      new MeiliChatSearch({ mongoose: { models: { Conversation: { meiliSearch } } } });

    it('is ready when the index answers', async () => {
      const backend = backendFor(async () => ({ hits: [] }));

      await expect(backend.isReady()).resolves.toBe(true);
    });

    it('is not ready when the index cannot answer', async () => {
      const backend = backendFor(async () => {
        throw new Error('connect ECONNREFUSED');
      });

      await expect(backend.isReady()).resolves.toBe(false);
    });

    it('is not ready when the index was never registered', async () => {
      const backend = new MeiliChatSearch({ mongoose: { models: {} } });

      await expect(backend.isReady()).resolves.toBe(false);
    });

    it('is not ready without credentials', async () => {
      delete process.env.MEILI_HOST;
      const backend = backendFor(async () => ({ hits: [] }));

      await expect(backend.isReady()).resolves.toBe(false);
    });
  });

  /**
   * The Meilisearch index declares `filterableAttributes: ['user']`, so archive,
   * tag and project predicates cannot be pushed down to it at all — and widening
   * that list forces a re-index on upgrade, which is exactly the cost a deployment
   * on this path was promised it would not pay. The caller's post-hydration filter
   * still produces a correct page, so the limitation is reported rather than
   * hidden: silently ignoring the filters is what makes a short page look like a
   * search that matched nothing.
   */
  describe('Meilisearch listing filters', () => {
    beforeEach(() => {
      process.env.MEILI_HOST = 'http://localhost:7700';
      process.env.MEILI_MASTER_KEY = 'key';
    });

    const scope = () => createScope({ tenantId: 'acme', userId: 'alice' });

    const backendWith = (capture: (params: MeiliSearchParams) => void) =>
      new MeiliChatSearch({
        mongoose: {
          models: {
            Conversation: {
              meiliSearch: async (_query: string, params: MeiliSearchParams) => {
                capture(params);
                return { hits: [{ conversationId: 'c1' }] };
              },
            },
          },
        },
        resolveScope: scope,
      });

    it('reports that it could not apply them', async () => {
      const backend = backendWith(() => undefined);

      const result = await backend.search({
        target: 'conversations',
        scope: scope(),
        query: 'quarterly',
        limit: 25,
        filters: { archived: true },
      });

      expect(result.degradations).toEqual(['filters-unapplied']);
      expect(result.hits.map((hit) => hit.recordId)).toEqual(['c1']);
    });

    it('reports nothing when no listing filter was asked for', async () => {
      const backend = backendWith(() => undefined);

      const result = await backend.search({
        target: 'conversations',
        scope: scope(),
        query: 'quarterly',
        limit: 25,
      });

      expect(result.degradations).toEqual([]);
    });

    it('still sends only the user predicate, so the index is never asked the impossible', async () => {
      let sent: MeiliSearchParams = {};
      const backend = backendWith((params) => {
        sent = params;
      });

      await backend.search({
        target: 'conversations',
        scope: scope(),
        query: 'quarterly',
        limit: 25,
        filters: { archived: true, tags: ['x'], projectId: 'p' },
      });

      expect(sent.filter).toBe('user = "alice"');
    });
  });

  /**
   * A missing cursor secret is an operator error, and a search that only fails
   * on the second page is far worse to diagnose than one that fails at boot.
   */
  it('refuses to build without a cursor secret', () => {
    process.env.CHAT_SEARCH_ENABLED = 'true';
    process.env.CHAT_SEARCH_DATABASE_URL = 'postgres://reader@localhost:5435/chat_search';
    delete process.env.CHAT_SEARCH_CURSOR_SECRET;

    expect(() => createChatSearch({ mongoose })).toThrow(/CHAT_SEARCH_CURSOR_SECRET/);
  });
});
