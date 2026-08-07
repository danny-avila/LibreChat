import mongoose from 'mongoose';
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

    const backendFor = (meiliSearch: unknown) =>
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
