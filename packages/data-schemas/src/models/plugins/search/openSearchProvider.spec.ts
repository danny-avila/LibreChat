/**
 * Tests for the OpenSearch Provider.
 *
 * These tests verify:
 * - Constructor validation
 * - HTTP request building (auth headers, TLS)
 * - Query/filter translation from MeiliSearch-style to OpenSearch DSL
 * - All SearchProvider interface methods
 */

import { OpenSearchProvider } from './openSearchProvider';

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

describe('OpenSearchProvider', () => {
  let provider: OpenSearchProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new OpenSearchProvider({
      node: 'https://localhost:9200',
      username: 'admin',
      password: 'admin123',
      insecure: false,
    });
  });

  describe('constructor', () => {
    test('throws when node URL is missing', () => {
      expect(() => new OpenSearchProvider({ node: '' })).toThrow(
        'OpenSearch provider requires a node URL',
      );
    });

    test('strips trailing slashes from node URL', () => {
      const p = new OpenSearchProvider({ node: 'https://localhost:9200///' });
      expect((p as unknown as Record<string, unknown>)['node']).toBe('https://localhost:9200');
    });

    test('defaults username to "admin" when not provided', () => {
      const p = new OpenSearchProvider({ node: 'https://localhost:9200', password: 'pass' });
      // Auth header should contain base64 of "admin:pass"
      const expectedAuth = 'Basic ' + Buffer.from('admin:pass').toString('base64');
      expect((p as unknown as Record<string, unknown>)['authHeader']).toBe(expectedAuth);
    });

    test('builds correct auth header', () => {
      const expectedAuth = 'Basic ' + Buffer.from('admin:admin123').toString('base64');
      expect((provider as unknown as Record<string, unknown>)['authHeader']).toBe(expectedAuth);
    });
  });

  describe('healthCheck', () => {
    test('returns true when cluster status is green', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ status: 'green' })),
      });

      expect(await provider.healthCheck()).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://localhost:9200/_cluster/health',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    test('returns true when cluster status is yellow', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ status: 'yellow' })),
      });

      expect(await provider.healthCheck()).toBe(true);
    });

    test('returns false when cluster status is red', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ status: 'red' })),
      });

      expect(await provider.healthCheck()).toBe(false);
    });

    test('returns false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      expect(await provider.healthCheck()).toBe(false);
    });

    test('returns false on non-2xx status', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 503,
        text: () => Promise.resolve(JSON.stringify({ error: 'unavailable' })),
      });

      expect(await provider.healthCheck()).toBe(false);
    });
  });

  describe('createIndex', () => {
    test('skips creation when index already exists', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(''),
      });

      await provider.createIndex('messages', 'messageId');

      // Only HEAD request, no PUT
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://localhost:9200/messages',
        expect.objectContaining({ method: 'HEAD' }),
      );
    });

    test('creates index when it does not exist', async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 404,
          text: () => Promise.resolve('{"error":"index_not_found"}'),
        })
        .mockResolvedValueOnce({
          status: 200,
          text: () => Promise.resolve('{"acknowledged":true}'),
        });

      await provider.createIndex('messages', 'messageId');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const putCall = mockFetch.mock.calls[1];
      expect(putCall[0]).toBe('https://localhost:9200/messages');
      expect(putCall[1].method).toBe('PUT');

      const body = JSON.parse(putCall[1].body);
      expect(body.mappings.properties.messageId.type).toBe('keyword');
      expect(body.mappings.properties.user.type).toBe('keyword');
    });
  });

  describe('addDocuments', () => {
    test('does nothing for empty array', async () => {
      await provider.addDocuments('messages', []);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('sends bulk request with correct format', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ errors: false, items: [] }),
      });

      await provider.addDocuments(
        'messages',
        [
          { messageId: 'msg1', text: 'hello', user: 'user1' },
          { messageId: 'msg2', text: 'world', user: 'user2' },
        ],
        'messageId',
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://localhost:9200/messages/_bulk');
      expect(call[1].headers['Content-Type']).toBe('application/x-ndjson');

      const lines = (call[1].body as string).trim().split('\n');
      expect(lines.length).toBe(4); // 2 action + 2 document lines

      const action1 = JSON.parse(lines[0]);
      expect(action1.index._id).toBe('msg1');
      expect(action1.index._index).toBe('messages');
    });
  });

  describe('addDocumentsInBatches', () => {
    test('splits documents into batches', async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ errors: false, items: [] }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ errors: false, items: [] }),
        });

      const docs = Array.from({ length: 5 }, (_, i) => ({
        id: `doc${i}`,
        text: `text${i}`,
      }));

      await provider.addDocumentsInBatches('test', docs, 'id', 3);

      // Should be called twice: batch of 3 + batch of 2
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteDocument', () => {
    test('sends DELETE request with encoded document ID', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"result":"deleted"}'),
      });

      await provider.deleteDocument('messages', 'msg/1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://localhost:9200/messages/_doc/msg%2F1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('deleteDocuments', () => {
    test('does nothing for empty array', async () => {
      await provider.deleteDocuments('messages', []);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('sends bulk delete request', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ errors: false, items: [] }),
      });

      await provider.deleteDocuments('messages', ['msg1', 'msg2']);

      const call = mockFetch.mock.calls[0];
      const lines = (call[1].body as string).trim().split('\n');
      expect(lines.length).toBe(2);

      const action1 = JSON.parse(lines[0]);
      expect(action1.delete._id).toBe('msg1');
    });
  });

  describe('getDocument', () => {
    test('returns document source on success', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              _source: { messageId: 'msg1', text: 'hello' },
            }),
          ),
      });

      const doc = await provider.getDocument('messages', 'msg1');
      expect(doc).toEqual({ messageId: 'msg1', text: 'hello' });
    });

    test('returns null when document not found', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        text: () => Promise.resolve('{"found":false}'),
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
    test('performs match_all query when no query string', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              hits: { hits: [], total: { value: 0 } },
            }),
          ),
      });

      await provider.search('messages', '');

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.query).toEqual({ match_all: {} });
    });

    test('performs multi_match query with fuzziness', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              hits: {
                hits: [{ _source: { messageId: 'msg1', text: 'hello world' } }],
                total: { value: 1 },
              },
            }),
          ),
      });

      const result = await provider.search('messages', 'hello');

      expect(result.hits).toHaveLength(1);
      expect(result.totalHits).toBe(1);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.query.bool.must[0].multi_match.query).toBe('hello');
      expect(body.query.bool.must[0].multi_match.fuzziness).toBe('AUTO');
    });

    test('translates MeiliSearch-style filter to OpenSearch term filter', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              hits: { hits: [], total: { value: 0 } },
            }),
          ),
      });

      await provider.search('messages', 'hello', {
        filter: 'user = "user123"',
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.query.bool.filter).toEqual([{ term: { user: 'user123' } }]);
    });

    test('handles AND filters', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              hits: { hits: [], total: { value: 0 } },
            }),
          ),
      });

      await provider.search('messages', 'hello', {
        filter: 'user = "user123" AND status = "active"',
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.query.bool.filter).toEqual([
        { term: { user: 'user123' } },
        { term: { status: 'active' } },
      ]);
    });

    test('applies limit and offset', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              hits: { hits: [], total: { value: 0 } },
            }),
          ),
      });

      await provider.search('messages', 'hello', { limit: 10, offset: 20 });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.size).toBe(10);
      expect(body.from).toBe(20);
    });

    test('applies sort parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              hits: { hits: [], total: { value: 0 } },
            }),
          ),
      });

      await provider.search('messages', 'hello', {
        sort: ['createdAt:desc', 'title:asc'],
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.sort).toEqual([
        { createdAt: { order: 'desc' } },
        { title: { order: 'asc' } },
      ]);
    });

    test('returns empty result on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.search('messages', 'hello');
      expect(result.hits).toEqual([]);
      expect(result.totalHits).toBe(0);
    });
  });

  describe('getIndexSettings', () => {
    test('extracts filterable attributes from keyword-typed fields', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              messages: {
                mappings: {
                  properties: {
                    user: { type: 'keyword' },
                    messageId: { type: 'keyword' },
                    text: { type: 'text' },
                  },
                },
              },
            }),
          ),
      });

      const settings = await provider.getIndexSettings('messages');
      expect(settings.filterableAttributes).toContain('user');
      expect(settings.filterableAttributes).toContain('messageId');
      expect(settings.filterableAttributes).not.toContain('text');
    });

    test('returns empty settings on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const settings = await provider.getIndexSettings('messages');
      expect(settings).toEqual({});
    });
  });

  describe('updateIndexSettings', () => {
    test('updates mappings for filterable attributes', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"acknowledged":true}'),
      });

      await provider.updateIndexSettings('messages', {
        filterableAttributes: ['user', 'status'],
      });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://localhost:9200/messages/_mapping');
      const body = JSON.parse(call[1].body);
      expect(body.properties.user.type).toBe('keyword');
      expect(body.properties.status.type).toBe('keyword');
    });

    test('does nothing when no filterable attributes', async () => {
      await provider.updateIndexSettings('messages', {});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getDocuments', () => {
    test('returns documents with pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              hits: {
                hits: [
                  { _id: '1', _source: { messageId: 'msg1' } },
                  { _id: '2', _source: { messageId: 'msg2' } },
                ],
              },
            }),
          ),
      });

      const result = await provider.getDocuments('messages', { limit: 10, offset: 0 });
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toHaveProperty('messageId', 'msg1');
    });
  });
});
