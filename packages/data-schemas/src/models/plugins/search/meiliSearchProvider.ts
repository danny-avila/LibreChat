import { MeiliSearch } from 'meilisearch';
import type { SearchParams as MeiliSearchParams } from 'meilisearch';
import type {
  SearchProvider,
  SearchHit,
  SearchResult,
  SearchParams,
  IndexSettings,
} from './searchProvider';
import logger from '~/config/meiliLogger';

export interface MeiliSearchProviderOptions {
  host: string;
  apiKey: string;
}

/**
 * MeiliSearch implementation of the SearchProvider interface.
 * Wraps the existing MeiliSearch client to conform to the abstraction layer.
 */
export class MeiliSearchProvider implements SearchProvider {
  readonly name = 'meilisearch';
  private client: MeiliSearch;

  constructor(options: MeiliSearchProviderOptions) {
    if (!options.host || !options.apiKey) {
      throw new Error('MeiliSearch provider requires host and apiKey');
    }
    this.client = new MeiliSearch({
      host: options.host,
      apiKey: options.apiKey,
    });
  }

  /** Expose the raw MeiliSearch client for backward-compatible code paths */
  getClient(): MeiliSearch {
    return this.client;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { status } = await this.client.health();
      return status === 'available';
    } catch (error) {
      logger.debug('[MeiliSearchProvider] Health check failed:', error);
      return false;
    }
  }

  async createIndex(indexName: string, primaryKey: string): Promise<void> {
    const index = this.client.index(indexName);
    try {
      await index.getRawInfo();
      logger.debug(`[MeiliSearchProvider] Index ${indexName} already exists`);
    } catch (error) {
      const errorCode = (error as { code?: string })?.code;
      if (errorCode === 'index_not_found') {
        try {
          logger.info(`[MeiliSearchProvider] Creating new index: ${indexName}`);
          await this.client.createIndex(indexName, { primaryKey });
          logger.info(`[MeiliSearchProvider] Successfully created index: ${indexName}`);
        } catch (createError) {
          logger.debug(
            `[MeiliSearchProvider] Index ${indexName} may already exist:`,
            createError,
          );
        }
      } else {
        logger.error(`[MeiliSearchProvider] Error checking index ${indexName}:`, error);
      }
    }
  }

  async updateIndexSettings(indexName: string, settings: IndexSettings): Promise<void> {
    try {
      const index = this.client.index(indexName);
      await index.updateSettings({
        filterableAttributes: settings.filterableAttributes,
        searchableAttributes: settings.searchableAttributes,
        sortableAttributes: settings.sortableAttributes,
      });
      logger.debug(`[MeiliSearchProvider] Updated index ${indexName} settings`);
    } catch (error) {
      logger.error(`[MeiliSearchProvider] Error updating index settings for ${indexName}:`, error);
    }
  }

  async getIndexSettings(indexName: string): Promise<IndexSettings> {
    try {
      const index = this.client.index(indexName);
      const settings = await index.getSettings();
      return {
        filterableAttributes: settings.filterableAttributes as string[],
        searchableAttributes: settings.searchableAttributes as string[],
        sortableAttributes: settings.sortableAttributes as string[],
      };
    } catch (error) {
      logger.error(`[MeiliSearchProvider] Error getting index settings for ${indexName}:`, error);
      return {};
    }
  }

  async addDocuments(indexName: string, documents: SearchHit[]): Promise<void> {
    const index = this.client.index(indexName);
    await index.addDocuments(documents);
  }

  async addDocumentsInBatches(
    indexName: string,
    documents: SearchHit[],
    _primaryKey?: string,
    batchSize?: number,
  ): Promise<void> {
    const index = this.client.index(indexName);
    await index.addDocumentsInBatches(documents, batchSize);
  }

  async updateDocuments(indexName: string, documents: SearchHit[]): Promise<void> {
    const index = this.client.index(indexName);
    await index.updateDocuments(documents);
  }

  async deleteDocument(indexName: string, documentId: string): Promise<void> {
    const index = this.client.index(indexName);
    await index.deleteDocument(documentId);
  }

  async deleteDocuments(indexName: string, documentIds: string[]): Promise<void> {
    const index = this.client.index(indexName);
    await index.deleteDocuments(documentIds);
  }

  async getDocument(indexName: string, documentId: string): Promise<SearchHit | null> {
    try {
      const index = this.client.index(indexName);
      return await index.getDocument(documentId);
    } catch (error) {
      return null;
    }
  }

  async getDocuments(
    indexName: string,
    options: { limit: number; offset: number },
  ): Promise<{ results: SearchHit[] }> {
    const index = this.client.index(indexName);
    const result = await index.getDocuments(options);
    return { results: result.results as SearchHit[] };
  }

  async search(indexName: string, query: string, params?: SearchParams): Promise<SearchResult> {
    const index = this.client.index(indexName);
    const meiliParams: MeiliSearchParams = {};

    if (params?.filter) {
      meiliParams.filter = params.filter;
    }
    if (params?.limit !== undefined) {
      meiliParams.limit = params.limit;
    }
    if (params?.offset !== undefined) {
      meiliParams.offset = params.offset;
    }
    if (params?.sort) {
      meiliParams.sort = params.sort;
    }

    const result = await index.search(query, meiliParams);
    return {
      hits: result.hits as SearchHit[],
      totalHits: result.estimatedTotalHits,
      offset: result.offset,
      limit: result.limit,
    };
  }
}
