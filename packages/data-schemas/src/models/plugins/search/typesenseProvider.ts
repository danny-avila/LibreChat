import type {
  SearchProvider,
  SearchHit,
  SearchResult,
  SearchParams,
  IndexSettings,
} from './searchProvider';
import logger from '~/config/meiliLogger';

/**
 * Typesense Search Provider
 *
 * Uses the built-in fetch API (Node 18+) to communicate with Typesense's REST API.
 * Typesense requires explicit collection schemas with typed fields, unlike MeiliSearch
 * and OpenSearch which are more schema-flexible.
 *
 * Typesense API reference: https://typesense.org/api
 *
 * Key differences from MeiliSearch/OpenSearch:
 * - Collections require a schema definition with field names and types
 * - Search uses query parameters rather than JSON body
 * - Authentication via X-TYPESENSE-API-KEY header
 * - Default port is 8108
 * - Documents are accessed via /collections/{name}/documents
 */

export interface TypesenseProviderOptions {
  /** Typesense node URL, e.g. http://localhost:8108 */
  node: string;
  /** API key for authentication */
  apiKey: string;
  /** Connection timeout in milliseconds (default: 5000) */
  connectionTimeoutMs?: number;
}

interface TypesenseField {
  name: string;
  type: string;
  facet?: boolean;
  optional?: boolean;
  index?: boolean;
}

interface TypesenseCollectionSchema {
  name: string;
  fields: TypesenseField[];
  default_sorting_field?: string;
}

interface TypesenseSearchResponse {
  found: number;
  hits: Array<{
    document: SearchHit;
    highlights?: unknown[];
  }>;
  page: number;
  request_params?: unknown;
}

export class TypesenseProvider implements SearchProvider {
  readonly name = 'typesense';
  private node: string;
  private apiKey: string;
  private connectionTimeoutMs: number;

  constructor(options: TypesenseProviderOptions) {
    if (!options.node) {
      throw new Error('Typesense provider requires a node URL');
    }
    if (!options.apiKey) {
      throw new Error('Typesense provider requires an API key');
    }
    this.node = options.node.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 5000;
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
      'X-TYPESENSE-API-KEY': this.apiKey,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.connectionTimeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        data = { raw: text };
      }
      return { status: response.status, data };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Import documents using Typesense's JSONL import endpoint.
   * This is more efficient than individual document creation.
   */
  private async importDocuments(
    collectionName: string,
    documents: SearchHit[],
    action: 'create' | 'upsert' | 'update' = 'upsert',
  ): Promise<void> {
    const url = `${this.node}/collections/${encodeURIComponent(collectionName)}/documents/import?action=${action}`;
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain',
      'X-TYPESENSE-API-KEY': this.apiKey,
    };

    const bodyStr = documents.map((doc) => JSON.stringify(doc)).join('\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.connectionTimeoutMs * 2);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: controller.signal,
      });

      const text = await response.text();
      // Response is JSONL — one result per line
      const lines = text.trim().split('\n');
      let errorCount = 0;
      for (const line of lines) {
        try {
          const result = JSON.parse(line) as { success: boolean; error?: string };
          if (!result.success) {
            errorCount++;
          }
        } catch {
          // Skip unparseable lines
        }
      }
      if (errorCount > 0) {
        logger.error(
          `[TypesenseProvider] Import to ${collectionName}: ${errorCount}/${documents.length} failures`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  // ------------------------------------------------------------------ //
  //  SearchProvider implementation                                       //
  // ------------------------------------------------------------------ //

  async healthCheck(): Promise<boolean> {
    try {
      const { status } = await this.request('GET', '/health');
      return status === 200;
    } catch (error) {
      logger.debug('[TypesenseProvider] Health check failed:', error);
      return false;
    }
  }

  async createIndex(indexName: string, primaryKey: string): Promise<void> {
    try {
      // Check if collection exists
      const { status } = await this.request(
        'GET',
        `/collections/${encodeURIComponent(indexName)}`,
      );
      if (status === 200) {
        logger.debug(`[TypesenseProvider] Collection ${indexName} already exists`);
        return;
      }
    } catch {
      // Collection doesn't exist, create it
    }

    try {
      // Typesense requires explicit schema. We create a flexible schema
      // with auto-detection for unknown fields.
      const schema: TypesenseCollectionSchema = {
        name: indexName,
        fields: [
          { name: primaryKey, type: 'string' },
          { name: 'user', type: 'string', facet: true, optional: true },
          // Catch-all field for dynamic attributes
          { name: '.*', type: 'auto' },
        ],
      };

      await this.request('POST', '/collections', schema);
      logger.info(`[TypesenseProvider] Created collection: ${indexName}`);
    } catch (error) {
      logger.debug(`[TypesenseProvider] Collection ${indexName} may already exist:`, error);
    }
  }

  async updateIndexSettings(indexName: string, settings: IndexSettings): Promise<void> {
    try {
      // Typesense doesn't have a direct "update settings" API like MeiliSearch.
      // Filterable attributes in Typesense are handled via field faceting in the schema.
      // We update the collection schema to add facet: true for filterable fields.
      if (settings.filterableAttributes && settings.filterableAttributes.length > 0) {
        const fields: TypesenseField[] = settings.filterableAttributes.map((attr) => ({
          name: attr,
          type: 'string',
          facet: true,
          optional: true,
        }));

        await this.request(
          'PATCH',
          `/collections/${encodeURIComponent(indexName)}`,
          { fields },
        );
        logger.debug(`[TypesenseProvider] Updated schema for ${indexName}`);
      }
    } catch (error) {
      logger.error(
        `[TypesenseProvider] Error updating collection settings for ${indexName}:`,
        error,
      );
    }
  }

  async getIndexSettings(indexName: string): Promise<IndexSettings> {
    try {
      const { data } = await this.request(
        'GET',
        `/collections/${encodeURIComponent(indexName)}`,
      );
      const fields = data.fields as TypesenseField[] | undefined;

      const filterableAttributes: string[] = [];
      if (fields) {
        for (const field of fields) {
          if (field.facet) {
            filterableAttributes.push(field.name);
          }
        }
      }
      return { filterableAttributes };
    } catch (error) {
      logger.error(
        `[TypesenseProvider] Error getting collection settings for ${indexName}:`,
        error,
      );
      return {};
    }
  }

  async addDocuments(
    indexName: string,
    documents: SearchHit[],
    _primaryKey?: string,
  ): Promise<void> {
    if (documents.length === 0) {
      return;
    }
    await this.importDocuments(indexName, documents, 'upsert');
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
    if (documents.length === 0) {
      return;
    }
    await this.importDocuments(indexName, documents, 'upsert');
  }

  async deleteDocument(indexName: string, documentId: string): Promise<void> {
    try {
      await this.request(
        'DELETE',
        `/collections/${encodeURIComponent(indexName)}/documents/${encodeURIComponent(documentId)}`,
      );
    } catch (error) {
      logger.error(
        `[TypesenseProvider] Error deleting document ${documentId} from ${indexName}:`,
        error,
      );
    }
  }

  async deleteDocuments(indexName: string, documentIds: string[]): Promise<void> {
    if (documentIds.length === 0) {
      return;
    }
    // Typesense supports batch delete via filter_by
    // For ID-based deletion, we use individual deletes or filter
    const filterBy = `id: [${documentIds.join(',')}]`;
    try {
      await this.request(
        'DELETE',
        `/collections/${encodeURIComponent(indexName)}/documents?filter_by=${encodeURIComponent(filterBy)}`,
      );
    } catch {
      // Fallback: delete individually
      for (const id of documentIds) {
        await this.deleteDocument(indexName, id);
      }
    }
  }

  async getDocument(indexName: string, documentId: string): Promise<SearchHit | null> {
    try {
      const { status, data } = await this.request(
        'GET',
        `/collections/${encodeURIComponent(indexName)}/documents/${encodeURIComponent(documentId)}`,
      );
      if (status === 200) {
        return data as SearchHit;
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
      // Typesense doesn't have a direct "list documents" API with offset.
      // We use search with match-all query.
      const page = Math.floor(options.offset / options.limit) + 1;
      const { data } = await this.request(
        'GET',
        `/collections/${encodeURIComponent(indexName)}/documents/search?q=*&query_by=&per_page=${options.limit}&page=${page}`,
      );

      const typesenseData = data as unknown as TypesenseSearchResponse;
      const results: SearchHit[] = (typesenseData.hits || []).map((hit) => hit.document);
      return { results };
    } catch (error) {
      logger.error(`[TypesenseProvider] Error getting documents from ${indexName}:`, error);
      return { results: [] };
    }
  }

  async search(indexName: string, query: string, params?: SearchParams): Promise<SearchResult> {
    try {
      const searchQuery = query || '*';
      const perPage = params?.limit ?? 20;
      const page = params?.offset !== undefined ? Math.floor(params.offset / perPage) + 1 : 1;

      let searchUrl =
        `/collections/${encodeURIComponent(indexName)}/documents/search` +
        `?q=${encodeURIComponent(searchQuery)}` +
        `&query_by=*` +
        `&per_page=${perPage}` +
        `&page=${page}`;

      // Translate MeiliSearch-style filter to Typesense filter_by
      if (params?.filter) {
        const typesenseFilter = this.translateFilter(params.filter);
        if (typesenseFilter) {
          searchUrl += `&filter_by=${encodeURIComponent(typesenseFilter)}`;
        }
      }

      if (params?.sort) {
        const sortBy = params.sort
          .map((s) => {
            const [field, order] = s.split(':');
            return `${field}:${order || 'asc'}`;
          })
          .join(',');
        searchUrl += `&sort_by=${encodeURIComponent(sortBy)}`;
      }

      const { data } = await this.request('GET', searchUrl);
      const typesenseData = data as unknown as TypesenseSearchResponse;

      const hits: SearchHit[] = (typesenseData.hits || []).map((hit) => hit.document);

      return {
        hits,
        totalHits: typesenseData.found || 0,
        offset: params?.offset,
        limit: params?.limit,
      };
    } catch (error) {
      logger.error(`[TypesenseProvider] Error searching ${indexName}:`, error);
      return { hits: [], totalHits: 0 };
    }
  }

  // ------------------------------------------------------------------ //
  //  Filter translation helpers                                          //
  // ------------------------------------------------------------------ //

  /**
   * Translate a MeiliSearch-style filter string to Typesense filter_by syntax.
   * MeiliSearch: `user = "userId"` or `user = 'userId'`
   * Typesense:   `user:=userId`
   */
  private translateFilter(filter: string): string {
    const parts = filter.split(/\s+AND\s+/i);
    const typesenseParts: string[] = [];

    for (const part of parts) {
      const match = part.trim().match(/^(\w+)\s*=\s*["'](.+?)["']$/);
      if (match) {
        const [, field, value] = match;
        typesenseParts.push(`${field}:=${value}`);
      }
    }

    return typesenseParts.join(' && ');
  }
}
