/**
 * Tests for the Typesense Provider.
 *
 * These tests verify:
 * - Constructor validation
 * - HTTP request building (API key header, timeouts)
 * - Query/filter translation from MeiliSearch-style to Typesense syntax
 * - All SearchProvider interface methods
 */

import { TypesenseProvider } from './typesenseProvider';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock logger
jest.mock('~/config/meiliLogger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('TypesenseProvider', () => {
  let provider: TypesenseProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new TypesenseProvider({
      node: 'http://localhost:8108',
      apiKey: 'test-api-key',
    });
  });

  describe('constructor', () => {
    test('throws when node URL is missing', () => {
      expect(() => new TypesenseProvider({ node: '', apiKey: 'key' })).toThrow(
        'Typesense provider requires a node URL',
      );
    });

    test('throws when API key is missing', () => {
      expect(() => new TypesenseProvider({ node: 'http://localhost:8108', apiKey: '' })).toThrow(
        'Typesense provider requires an API key',
      );
    });

    test('strips trailing slashes from node URL', () => {
      const p = new TypesenseProvider({ node: 'http://localhost:8108///', apiKey: 'key' });
      expect((p as unknown as Record<string, unknown>)['node']).toBe('http://localhost:8108');
    });
  });

  describe('healthCheck', () => {
    test('returns true when health endpoint returns 200', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"ok":true}'),
      });

      expect(await provider.healthCheck()).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8108/health',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-TYPESENSE-API-KEY': 'test-api-key',
          }),
        }),
      );
    });

    test('returns false on non-200 status', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      });

      expect(await provider.healthCheck()).toBe(false);
    });

    test('returns false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      expect(await provider.healthCheck()).toBe(false);
    });
  });

  describe('createIndex', () => {
    test('skips creation when collection already exists', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ name: 'messages' })),
      });

      await provider.createIndex('messages', 'messageId');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8108/collections/messages',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    test('creates collection with schema when it does not exist', async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 404,
          text: () => Promise.resolve('{"message":"Not Found"}'),
        })
        .mockResolvedValueOnce({
          status: 201,
          text: () => Promise.resolve(JSON.stringify({ name: 'messages' })),
        });

      await provider.createIndex('messages', 'messageId');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const createCall = mockFetch.mock.calls[1];
      expect(createCall[0]).toBe('http://localhost:8108/collections');
      expect(createCall[1].method).toBe('POST');

      const body = JSON.parse(createCall[1].body);
      expect(body.name).toBe('messages');
      expect(body.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'messageId', type: 'string' }),
          expect.objectContaining({ name: 'user', type: 'string', facet: true }),
          expect.objectContaining({ name: '.*', type: 'auto' }),
        ]),
      );
    });
  });

  describe('addDocuments', () => {
    test('does nothing for empty array', async () => {
      await provider.addDocuments('messages', []);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('sends import request with JSONL body', async () => {
      mockFetch.mockResolvedValueOnce({
        text: () => Promise.resolve('{"success":true}\n{"success":true}'),
      });

      await provider.addDocuments(
        'messages',
        [
          { id: 'msg1', text: 'hello', user: 'user1' },
          { id: 'msg2', text: 'world', user: 'user2' },
        ],
        'id',
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('/collections/messages/documents/import?action=upsert');
      expect(call[1].headers['Content-Type']).toBe('text/plain');

      const lines = (call[1].body as string).split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual({ id: 'msg1', text: 'hello', user: 'user1' });
    });
  });

  describe('addDocumentsInBatches', () => {
    test('splits documents into batches', async () => {
      mockFetch
        .mockResolvedValueOnce({
          text: () => Promise.resolve('{"success":true}\n{"success":true}\n{"success":true}'),
        })
        .mockResolvedValueOnce({
          text: () => Promise.resolve('{"success":true}\n{"success":true}'),
        });

      const docs = Array.from({ length: 5 }, (_, i) => ({
        id: `doc${i}`,
        text: `text${i}`,
      }));

      await provider.addDocumentsInBatches('test', docs, 'id', 3);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteDocument', () => {
    test('sends DELETE request with encoded document ID', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      await provider.deleteDocument('messages', 'msg/1');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8108/collections/messages/documents/msg%2F1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('deleteDocuments', () => {
    test('does nothing for empty array', async () => {
      await provider.deleteDocuments('messages', []);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('sends batch delete with filter_by', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"num_deleted":2}'),
      });

      await provider.deleteDocuments('messages', ['msg1', 'msg2']);

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('/collections/messages/documents?filter_by=');
      expect(call[1].method).toBe('DELETE');
    });
  });

  describe('getDocument', () => {
    test('returns document on success', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(JSON.stringify({ id: 'msg1', text: 'hello', user: 'user1' })),
      });

      const doc = await provider.getDocument('messages', 'msg1');
      expect(doc).toEqual({ id: 'msg1', text: 'hello', user: 'user1' });
    });

    test('returns null when document not found', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        text: () => Promise.resolve('{"message":"Not Found"}'),
      });

      const doc = await provider.getDocument('messages', 'nonexistent');
      expect(doc).toBeNull();
    });

    test('returns null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const doc = await provider.getDocument('messages', 'msg1');
      expect(doc).toBeNull();
    });
  });

  describe('search', () => {
    test('performs wildcard search when no query string', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              found: 0,
              hits: [],
              page: 1,
            }),
          ),
      });

      await provider.search('messages', '');

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('q=*');
    });

    test('performs search with query', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              found: 1,
              hits: [{ document: { id: 'msg1', text: 'hello world' } }],
              page: 1,
            }),
          ),
      });

      const result = await provider.search('messages', 'hello');

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]).toEqual({ id: 'msg1', text: 'hello world' });
      expect(result.totalHits).toBe(1);

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('q=hello');
    });

    test('translates MeiliSearch-style filter to Typesense filter_by', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              found: 0,
              hits: [],
              page: 1,
            }),
          ),
      });

      await provider.search('messages', 'hello', {
        filter: 'user = "user123"',
      });

      const call = mockFetch.mock.calls[0];
      expect(decodeURIComponent(call[0])).toContain('filter_by=user:=user123');
    });

    test('handles AND filters', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              found: 0,
              hits: [],
              page: 1,
            }),
          ),
      });

      await provider.search('messages', 'hello', {
        filter: 'user = "user123" AND status = "active"',
      });

      const call = mockFetch.mock.calls[0];
      const url = decodeURIComponent(call[0]);
      expect(url).toContain('filter_by=user:=user123 && status:=active');
    });

    test('applies limit and offset via per_page and page', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              found: 0,
              hits: [],
              page: 3,
            }),
          ),
      });

      await provider.search('messages', 'hello', { limit: 10, offset: 20 });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('per_page=10');
      expect(call[0]).toContain('page=3'); // offset 20 / limit 10 + 1 = 3
    });

    test('applies sort parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              found: 0,
              hits: [],
              page: 1,
            }),
          ),
      });

      await provider.search('messages', 'hello', {
        sort: ['createdAt:desc', 'title:asc'],
      });

      const call = mockFetch.mock.calls[0];
      const url = decodeURIComponent(call[0]);
      expect(url).toContain('sort_by=createdAt:desc,title:asc');
    });

    test('returns empty result on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.search('messages', 'hello');
      expect(result.hits).toEqual([]);
      expect(result.totalHits).toBe(0);
    });
  });

  describe('getIndexSettings', () => {
    test('extracts filterable attributes from faceted fields', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              name: 'messages',
              fields: [
                { name: 'user', type: 'string', facet: true },
                { name: 'messageId', type: 'string', facet: false },
                { name: 'text', type: 'string' },
              ],
            }),
          ),
      });

      const settings = await provider.getIndexSettings('messages');
      expect(settings.filterableAttributes).toContain('user');
      expect(settings.filterableAttributes).not.toContain('messageId');
      expect(settings.filterableAttributes).not.toContain('text');
    });

    test('returns empty settings on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const settings = await provider.getIndexSettings('messages');
      expect(settings).toEqual({});
    });
  });

  describe('updateIndexSettings', () => {
    test('patches collection schema for filterable attributes', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      await provider.updateIndexSettings('messages', {
        filterableAttributes: ['user', 'status'],
      });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('http://localhost:8108/collections/messages');
      expect(call[1].method).toBe('PATCH');

      const body = JSON.parse(call[1].body);
      expect(body.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'user', type: 'string', facet: true }),
          expect.objectContaining({ name: 'status', type: 'string', facet: true }),
        ]),
      );
    });

    test('does nothing when no filterable attributes', async () => {
      await provider.updateIndexSettings('messages', {});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('updateDocuments', () => {
    test('uses upsert action for updates', async () => {
      mockFetch.mockResolvedValueOnce({
        text: () => Promise.resolve('{"success":true}'),
      });

      await provider.updateDocuments('messages', [{ id: 'msg1', text: 'updated' }]);

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('action=upsert');
    });

    test('does nothing for empty array', async () => {
      await provider.updateDocuments('messages', []);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
