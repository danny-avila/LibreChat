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
  /** Maps index name → primary key field name (e.g. 'convos' → 'conversationId') */
  private primaryKeyMap: Map<string, string> = new Map();
  /** Maps index name → list of string field names for query_by */
  private searchableFieldsMap: Map<string, string[]> = new Map();

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
   * Prepare a document for Typesense by mapping the primary key to the `id` field.
   * Typesense requires every document to have a string `id` field.
   */
  private prepareDocument(collectionName: string, doc: SearchHit): SearchHit {
    const primaryKey = this.primaryKeyMap.get(collectionName);
    if (!primaryKey) {
      return doc;
    }

    const prepared: SearchHit = { ...doc };

    // Map primaryKey value → Typesense `id` field
    if (prepared[primaryKey] !== undefined && primaryKey !== 'id') {
      prepared['id'] = String(prepared[primaryKey]);
    }

    // Ensure all values are Typesense-compatible (strings, numbers, booleans, arrays)
    for (const [key, value] of Object.entries(prepared)) {
      if (value === null || value === undefined) {
        delete prepared[key];
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Typesense doesn't support nested objects — stringify them
        prepared[key] = JSON.stringify(value);
      }
    }

    return prepared;
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

    const preparedDocs = documents.map((doc) => this.prepareDocument(collectionName, doc));
    const bodyStr = preparedDocs.map((doc) => JSON.stringify(doc)).join('\n');

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

      if (!response.ok) {
        logger.error(
          `[TypesenseProvider] Import to ${collectionName} failed with HTTP ${response.status}: ${text}`,
        );
        return;
      }

      // Response is JSONL — one result per line
      const lines = text.trim().split('\n');
      let errorCount = 0;
      const errors: string[] = [];
      for (const line of lines) {
        try {
          const result = JSON.parse(line) as { success: boolean; error?: string; document?: string };
          if (!result.success) {
            errorCount++;
            if (result.error && errors.length < 3) {
              errors.push(result.error);
            }
          }
        } catch {
          // Skip unparseable lines
        }
      }
      if (errorCount > 0) {
        logger.error(
          `[TypesenseProvider] Import to ${collectionName}: ${errorCount}/${documents.length} failures. Sample errors: ${errors.join('; ')}`,
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
    // Track the primary key for this index so we can map it to `id` later
    this.primaryKeyMap.set(indexName, primaryKey);

    // Define searchable string fields based on the index type
    // These are the fields that have meiliIndex: true in the mongoose schemas
    let stringFields: string[];
    if (indexName === 'messages') {
      stringFields = ['messageId', 'conversationId', 'user', 'sender', 'text'];
    } else {
      // convos
      stringFields = ['conversationId', 'title', 'user'];
    }
    this.searchableFieldsMap.set(indexName, stringFields);

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
      // Typesense requires explicit schema with typed fields.
      // The `id` field is Typesense's built-in primary key (always string).
      // We define explicit string fields for searchable content, plus a
      // catch-all `.*` auto field for any additional dynamic attributes.
      const fields: TypesenseField[] = [];

      // Add explicit string fields (excluding 'id' which is built-in)
      for (const field of stringFields) {
        if (field !== 'id') {
          fields.push({
            name: field,
            type: 'string',
            optional: true,
            ...(field === 'user' ? { facet: true } : {}),
          });
        }
      }

      // Add tags field for convos
      if (indexName === 'convos') {
        fields.push({ name: 'tags', type: 'string[]', optional: true });
      }

      // Catch-all field for any other dynamic attributes
      fields.push({ name: '.*', type: 'auto' });

      const schema: TypesenseCollectionSchema = {
        name: indexName,
        fields,
      };

      const { status, data } = await this.request('POST', '/collections', schema);
      if (status >= 200 && status < 300) {
        logger.info(`[TypesenseProvider] Created collection: ${indexName}`);
      } else {
        logger.error(
          `[TypesenseProvider] Failed to create collection ${indexName}: HTTP ${status} - ${JSON.stringify(data)}`,
        );
      }
    } catch (error) {
      logger.error(`[TypesenseProvider] Error creating collection ${indexName}:`, error);
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
      // In Typesense, documents are retrieved by their `id` field.
      // We mapped primaryKey → id during import, so use documentId directly.
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

  /**
   * Get the query_by fields for a given index.
   * Typesense requires explicit field names — wildcard `*` is not supported for query_by.
   */
  private getQueryByFields(indexName: string): string {
    const fields = this.searchableFieldsMap.get(indexName);
    if (fields && fields.length > 0) {
      // Filter out the primary key from query_by — it's the `id` field in Typesense
      const primaryKey = this.primaryKeyMap.get(indexName);
      const queryFields = fields.filter((f) => f !== primaryKey && f !== 'id');
      return queryFields.length > 0 ? queryFields.join(',') : fields[0];
    }
    // Fallback: use title for convos, text for messages
    if (indexName === 'messages') {
      return 'text,sender';
    }
    return 'title,user';
  }

  async getDocuments(
    indexName: string,
    options: { limit: number; offset: number },
  ): Promise<{ results: SearchHit[] }> {
    try {
      // Typesense doesn't have a direct "list documents" API with offset.
      // We use the export endpoint for listing, or search with match-all query.
      const page = Math.floor(options.offset / options.limit) + 1;
      const queryBy = this.getQueryByFields(indexName);
      const { data } = await this.request(
        'GET',
        `/collections/${encodeURIComponent(indexName)}/documents/search?q=*&query_by=${encodeURIComponent(queryBy)}&per_page=${options.limit}&page=${page}`,
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
      const queryBy = this.getQueryByFields(indexName);

      let searchUrl =
        `/collections/${encodeURIComponent(indexName)}/documents/search` +
        `?q=${encodeURIComponent(searchQuery)}` +
        `&query_by=${encodeURIComponent(queryBy)}` +
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
