/**
 * Search Provider Abstraction Layer
 *
 * Defines the interface that all search engine backends must implement.
 * This enables LibreChat to support multiple search engines (MeiliSearch, OpenSearch, etc.)
 * in a modular, extensible way.
 */

export interface SearchHit {
  [key: string]: unknown;
}

export interface SearchResult {
  hits: SearchHit[];
  totalHits?: number;
  offset?: number;
  limit?: number;
}

export interface SearchParams {
  filter?: string;
  limit?: number;
  offset?: number;
  sort?: string[];
}

export interface IndexSettings {
  filterableAttributes?: string[];
  searchableAttributes?: string[];
  sortableAttributes?: string[];
}

/**
 * Core interface that every search provider must implement.
 * Designed to be minimal yet sufficient for LibreChat's search needs.
 */
export interface SearchProvider {
  /** Unique identifier for this provider (e.g., 'meilisearch', 'opensearch') */
  readonly name: string;

  /**
   * Check if the search backend is healthy and available.
   * @returns true if the backend is reachable and operational
   */
  healthCheck(): Promise<boolean>;

  /**
   * Create an index if it does not already exist.
   * @param indexName - Name of the index to create
   * @param primaryKey - The primary key field for documents in this index
   */
  createIndex(indexName: string, primaryKey: string): Promise<void>;

  /**
   * Update settings for an index (e.g., filterable attributes).
   * @param indexName - Name of the index
   * @param settings - Settings to apply
   */
  updateIndexSettings(indexName: string, settings: IndexSettings): Promise<void>;

  /**
   * Get current settings for an index.
   * @param indexName - Name of the index
   */
  getIndexSettings(indexName: string): Promise<IndexSettings>;

  /**
   * Add or replace documents in an index.
   * @param indexName - Name of the index
   * @param documents - Array of documents to add
   * @param primaryKey - The primary key field name
   */
  addDocuments(indexName: string, documents: SearchHit[], primaryKey?: string): Promise<void>;

  /**
   * Add documents in batches for large datasets.
   * @param indexName - Name of the index
   * @param documents - Array of documents to add
   * @param primaryKey - The primary key field name
   * @param batchSize - Number of documents per batch
   */
  addDocumentsInBatches(
    indexName: string,
    documents: SearchHit[],
    primaryKey?: string,
    batchSize?: number,
  ): Promise<void>;

  /**
   * Update existing documents in an index.
   * @param indexName - Name of the index
   * @param documents - Array of documents with updates
   */
  updateDocuments(indexName: string, documents: SearchHit[]): Promise<void>;

  /**
   * Delete a single document by its ID.
   * @param indexName - Name of the index
   * @param documentId - The document's primary key value
   */
  deleteDocument(indexName: string, documentId: string): Promise<void>;

  /**
   * Delete multiple documents by their IDs.
   * @param indexName - Name of the index
   * @param documentIds - Array of document primary key values
   */
  deleteDocuments(indexName: string, documentIds: string[]): Promise<void>;

  /**
   * Get a single document by its ID.
   * @param indexName - Name of the index
   * @param documentId - The document's primary key value
   */
  getDocument(indexName: string, documentId: string): Promise<SearchHit | null>;

  /**
   * Get documents from an index with pagination.
   * @param indexName - Name of the index
   * @param options - Pagination options (limit, offset)
   */
  getDocuments(
    indexName: string,
    options: { limit: number; offset: number },
  ): Promise<{ results: SearchHit[] }>;

  /**
   * Search an index with a query string and optional parameters.
   * @param indexName - Name of the index
   * @param query - The search query string
   * @param params - Optional search parameters (filters, pagination, etc.)
   */
  search(indexName: string, query: string, params?: SearchParams): Promise<SearchResult>;
}

/**
 * Configuration for search provider initialization.
 */
export interface SearchProviderConfig {
  /** The provider type to use */
  provider: 'meilisearch' | 'opensearch' | 'typesense';
  /** Provider-specific connection options */
  options: Record<string, unknown>;
}
