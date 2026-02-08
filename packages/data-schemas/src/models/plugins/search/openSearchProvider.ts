import type {
  SearchProvider,
  SearchHit,
  SearchResult,
  SearchParams,
  IndexSettings,
} from './searchProvider';
import logger from '~/config/meiliLogger';

/**
 * Minimal OpenSearch HTTP client.
 *
 * Uses the built-in fetch API (Node 18+) to communicate with OpenSearch's REST API,
 * avoiding a heavy SDK dependency. This keeps the footprint small and the provider
 * self-contained within the data-schemas package.
 */

export interface OpenSearchProviderOptions {
  /** OpenSearch node URL, e.g. https://localhost:9200 */
  node: string;
  /** HTTP Basic Auth username (default: 'admin') */
  username?: string;
  /** HTTP Basic Auth password */
  password?: string;
  /** Skip TLS certificate verification (useful for self-signed certs in dev) */
  insecure?: boolean;
}

interface OpenSearchBulkResponseItem {
  index?: { _id?: string; status?: number; error?: unknown };
  delete?: { _id?: string; status?: number; error?: unknown };
}

export class OpenSearchProvider implements SearchProvider {
  readonly name = 'opensearch';
  private node: string;
  private authHeader: string;
  private insecure: boolean;

  constructor(options: OpenSearchProviderOptions) {
    if (!options.node) {
      throw new Error('OpenSearch provider requires a node URL');
    }
    this.node = options.node.replace(/\/+$/, '');
    const username = options.username || 'admin';
    const password = options.password || '';
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    this.insecure = options.insecure ?? false;
  }

  // ------------------------------------------------------------------ //
  //  Internal HTTP helpers                                              //
  // ------------------------------------------------------------------ //

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: Record<string, unknown> }> {
    const url = `${this.node}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: this.authHeader,
    };

    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };

    // Support insecure TLS via undici dispatcher when available
    if (this.insecure) {
      try {
        // Use require() so Rollup externalizes this instead of code-splitting
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Agent } = require('undici') as { Agent: new (opts: Record<string, unknown>) => unknown };
        fetchOptions.dispatcher = new Agent({
          connect: { rejectUnauthorized: false },
        });
      } catch {
        // undici not available; fetch will use default TLS settings
        logger.debug('[OpenSearchProvider] undici not available for insecure TLS');
      }
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { raw: text };
    }
    return { status: response.status, data };
  }

  private async bulkRequest(
    indexName: string,
    operations: string[],
  ): Promise<{ errors: boolean; items: OpenSearchBulkResponseItem[] }> {
    const url = `${this.node}/${indexName}/_bulk`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-ndjson',
      Authorization: this.authHeader,
    };

    const bodyStr = operations.join('\n') + '\n';

    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      method: 'POST',
      headers,
      body: bodyStr,
    };

    if (this.insecure) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Agent } = require('undici') as { Agent: new (opts: Record<string, unknown>) => unknown };
        fetchOptions.dispatcher = new Agent({
          connect: { rejectUnauthorized: false },
        });
      } catch {
        // undici not available
      }
    }

    const response = await fetch(url, fetchOptions);
    const data = (await response.json()) as {
      errors: boolean;
      items: OpenSearchBulkResponseItem[];
    };
    return data;
  }

  // ------------------------------------------------------------------ //
  //  SearchProvider implementation                                       //
  // ------------------------------------------------------------------ //

  async healthCheck(): Promise<boolean> {
    try {
      const { status, data } = await this.request('GET', '/_cluster/health');
      if (status >= 200 && status < 300) {
        const clusterStatus = data.status as string | undefined;
        return clusterStatus === 'green' || clusterStatus === 'yellow';
      }
      return false;
    } catch (error) {
      logger.debug('[OpenSearchProvider] Health check failed:', error);
      return false;
    }
  }

  async createIndex(indexName: string, primaryKey: string): Promise<void> {
    try {
      // Check if index exists
      const { status } = await this.request('HEAD', `/${indexName}`);
      if (status === 200) {
        logger.debug(`[OpenSearchProvider] Index ${indexName} already exists`);
        return;
      }
    } catch {
      // Index doesn't exist, create it
    }

    try {
      const mappings: Record<string, unknown> = {
        properties: {
          [primaryKey]: { type: 'keyword' },
          user: { type: 'keyword' },
        },
      };

      await this.request('PUT', `/${indexName}`, {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
        },
        mappings,
      });
      logger.info(`[OpenSearchProvider] Created index: ${indexName}`);
    } catch (error) {
      logger.debug(`[OpenSearchProvider] Index ${indexName} may already exist:`, error);
    }
  }

  async updateIndexSettings(indexName: string, settings: IndexSettings): Promise<void> {
    try {
      // In OpenSearch, filterable/sortable attributes are handled via mappings.
      // We update the mapping to ensure the specified fields are keyword-typed.
      if (settings.filterableAttributes && settings.filterableAttributes.length > 0) {
        const properties: Record<string, unknown> = {};
        for (const attr of settings.filterableAttributes) {
          properties[attr] = { type: 'keyword' };
        }
        await this.request('PUT', `/${indexName}/_mapping`, { properties });
        logger.debug(`[OpenSearchProvider] Updated mappings for ${indexName}`);
      }
    } catch (error) {
      logger.error(
        `[OpenSearchProvider] Error updating index settings for ${indexName}:`,
        error,
      );
    }
  }

  async getIndexSettings(indexName: string): Promise<IndexSettings> {
    try {
      const { data } = await this.request('GET', `/${indexName}/_mapping`);
      const indexData = data[indexName] as Record<string, unknown> | undefined;
      const mappings = indexData?.mappings as Record<string, unknown> | undefined;
      const properties = mappings?.properties as Record<string, Record<string, unknown>> | undefined;

      const filterableAttributes: string[] = [];
      if (properties) {
        for (const [key, value] of Object.entries(properties)) {
          if (value.type === 'keyword') {
            filterableAttributes.push(key);
          }
        }
      }
      return { filterableAttributes };
    } catch (error) {
      logger.error(
        `[OpenSearchProvider] Error getting index settings for ${indexName}:`,
        error,
      );
      return {};
    }
  }

  async addDocuments(
    indexName: string,
    documents: SearchHit[],
    primaryKey?: string,
  ): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    const operations: string[] = [];
    for (const doc of documents) {
      const id = primaryKey ? String(doc[primaryKey]) : undefined;
      const action = id
        ? JSON.stringify({ index: { _index: indexName, _id: id } })
        : JSON.stringify({ index: { _index: indexName } });
      operations.push(action);
      operations.push(JSON.stringify(doc));
    }

    const result = await this.bulkRequest(indexName, operations);
    if (result.errors) {
      const errorItems = result.items.filter(
        (item) => item.index?.error,
      );
      logger.error(
        `[OpenSearchProvider] Bulk index errors in ${indexName}: ${errorItems.length} failures`,
      );
    }
  }

  async addDocumentsInBatches(
    indexName: string,
    documents: SearchHit[],
    primaryKey?: string,
    batchSize: number = 100,
  ): Promise<void> {
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      await this.addDocuments(indexName, batch, primaryKey);
    }
  }

  async updateDocuments(indexName: string, documents: SearchHit[]): Promise<void> {
    // OpenSearch uses the same index API for upserts
    await this.addDocuments(indexName, documents);
  }

  async deleteDocument(indexName: string, documentId: string): Promise<void> {
    try {
      await this.request('DELETE', `/${indexName}/_doc/${encodeURIComponent(documentId)}`);
    } catch (error) {
      logger.error(
        `[OpenSearchProvider] Error deleting document ${documentId} from ${indexName}:`,
        error,
      );
    }
  }

  async deleteDocuments(indexName: string, documentIds: string[]): Promise<void> {
    if (documentIds.length === 0) {
      return;
    }

    const operations: string[] = [];
    for (const id of documentIds) {
      operations.push(JSON.stringify({ delete: { _index: indexName, _id: id } }));
    }

    const result = await this.bulkRequest(indexName, operations);
    if (result.errors) {
      const errorItems = result.items.filter(
        (item) => item.delete?.error,
      );
      logger.error(
        `[OpenSearchProvider] Bulk delete errors in ${indexName}: ${errorItems.length} failures`,
      );
    }
  }

  async getDocument(indexName: string, documentId: string): Promise<SearchHit | null> {
    try {
      const { status, data } = await this.request(
        'GET',
        `/${indexName}/_doc/${encodeURIComponent(documentId)}`,
      );
      if (status === 200 && data._source) {
        return data._source as SearchHit;
      }
      return null;
    } catch {
      return null;
    }
  }

  async getDocuments(
    indexName: string,
    options: { limit: number; offset: number },
  ): Promise<{ results: SearchHit[] }> {
    try {
      const { data } = await this.request('POST', `/${indexName}/_search`, {
        query: { match_all: {} },
        size: options.limit,
        from: options.offset,
      });

      const hits = data.hits as { hits?: Array<{ _source: SearchHit; _id: string }> } | undefined;
      const results: SearchHit[] = (hits?.hits || []).map((hit) => ({
        ...hit._source,
        _opensearch_id: hit._id,
      }));
      return { results };
    } catch (error) {
      logger.error(`[OpenSearchProvider] Error getting documents from ${indexName}:`, error);
      return { results: [] };
    }
  }

  async search(indexName: string, query: string, params?: SearchParams): Promise<SearchResult> {
    try {
      const searchBody: Record<string, unknown> = {};

      // Build the query
      if (query) {
        searchBody.query = this.buildQuery(query, params?.filter);
      } else {
        if (params?.filter) {
          searchBody.query = this.buildFilterQuery(params.filter);
        } else {
          searchBody.query = { match_all: {} };
        }
      }

      if (params?.limit !== undefined) {
        searchBody.size = params.limit;
      }
      if (params?.offset !== undefined) {
        searchBody.from = params.offset;
      }
      if (params?.sort) {
        searchBody.sort = params.sort.map((s) => {
          const [field, order] = s.split(':');
          return { [field]: { order: order || 'asc' } };
        });
      }

      const { data } = await this.request('POST', `/${indexName}/_search`, searchBody);

      const hitsData = data.hits as {
        hits?: Array<{ _source: SearchHit; _id: string }>;
        total?: { value?: number } | number;
      } | undefined;

      const hits: SearchHit[] = (hitsData?.hits || []).map((hit) => ({
        ...hit._source,
      }));

      let totalHits = 0;
      if (typeof hitsData?.total === 'object' && hitsData.total !== null) {
        totalHits = hitsData.total.value ?? 0;
      } else if (typeof hitsData?.total === 'number') {
        totalHits = hitsData.total;
      }

      return {
        hits,
        totalHits,
        offset: params?.offset,
        limit: params?.limit,
      };
    } catch (error) {
      logger.error(`[OpenSearchProvider] Error searching ${indexName}:`, error);
      return { hits: [], totalHits: 0 };
    }
  }

  // ------------------------------------------------------------------ //
  //  Query building helpers                                              //
  // ------------------------------------------------------------------ //

  /**
   * Build an OpenSearch query from a text query and optional MeiliSearch-style filter.
   * MeiliSearch filters use syntax like: `user = "userId"`
   * We translate this to OpenSearch bool query with term filters.
   */
  private buildQuery(query: string, filter?: string): Record<string, unknown> {
    const must: Record<string, unknown>[] = [
      {
        multi_match: {
          query,
          fields: ['*'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      },
    ];

    const filterClauses = filter ? this.parseFilter(filter) : [];

    return {
      bool: {
        must,
        ...(filterClauses.length > 0 ? { filter: filterClauses } : {}),
      },
    };
  }

  private buildFilterQuery(filter: string): Record<string, unknown> {
    const filterClauses = this.parseFilter(filter);
    if (filterClauses.length === 0) {
      return { match_all: {} };
    }
    return {
      bool: {
        filter: filterClauses,
      },
    };
  }

  /**
   * Parse a MeiliSearch-style filter string into OpenSearch filter clauses.
   * Supports basic equality filters: `field = "value"` and `field = 'value'`
   * Multiple filters can be combined with AND.
   */
  private parseFilter(filter: string): Record<string, unknown>[] {
    const clauses: Record<string, unknown>[] = [];
    // Split on AND (case-insensitive)
    const parts = filter.split(/\s+AND\s+/i);

    for (const part of parts) {
      const match = part.trim().match(/^(\w+)\s*=\s*["'](.+?)["']$/);
      if (match) {
        const [, field, value] = match;
        clauses.push({ term: { [field]: value } });
      }
    }

    return clauses;
  }
}
