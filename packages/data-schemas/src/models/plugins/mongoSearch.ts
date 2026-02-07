import _ from 'lodash';
import { parseTextParts } from 'librechat-data-provider';
import type {
  CallbackWithoutResultAndOptionalError,
  FilterQuery,
  Document,
  Schema,
  Query,
  Types,
  Model,
} from 'mongoose';
import type { IConversation, IMessage } from '~/types';
import type { SearchProvider, SearchHit, SearchResult } from './search/searchProvider';
import { getSearchProvider } from './search/searchProviderFactory';
import logger from '~/config/meiliLogger';

interface MongoSearchOptions {
  indexName: string;
  primaryKey: string;
  mongoose: typeof import('mongoose');
  syncBatchSize?: number;
  syncDelayMs?: number;
}

interface SearchIndexable {
  [key: string]: unknown;
  _meiliIndex?: boolean;
}

interface SyncProgress {
  lastSyncedId?: string;
  totalProcessed: number;
  totalDocuments: number;
  isComplete: boolean;
}

interface _DocumentWithSearchIndex extends Document {
  _meiliIndex?: boolean;
  preprocessObjectForIndex?: () => Record<string, unknown>;
  addObjectToSearchIndex?: (next: CallbackWithoutResultAndOptionalError) => Promise<void>;
  updateObjectInSearchIndex?: (next: CallbackWithoutResultAndOptionalError) => Promise<void>;
  deleteObjectFromSearchIndex?: (next: CallbackWithoutResultAndOptionalError) => Promise<void>;
  postSaveHook?: (next: CallbackWithoutResultAndOptionalError) => void;
  postUpdateHook?: (next: CallbackWithoutResultAndOptionalError) => void;
  postRemoveHook?: (next: CallbackWithoutResultAndOptionalError) => void;
}

export type DocumentWithSearchIndex = _DocumentWithSearchIndex & IConversation & Partial<IMessage>;

export interface SchemaWithSearchMethods extends Model<DocumentWithSearchIndex> {
  syncWithSearch(): Promise<void>;
  getSyncProgress(): Promise<SyncProgress>;
  processSyncBatch(
    provider: SearchProvider,
    indexName: string,
    documents: Array<Record<string, unknown>>,
  ): Promise<void>;
  cleanupSearchIndex(
    provider: SearchProvider,
    indexName: string,
    primaryKey: string,
    batchSize: number,
    delayMs: number,
  ): Promise<void>;
  setSearchIndexSettings(settings: Record<string, unknown>): Promise<unknown>;
  searchIndex(
    q: string,
    params?: { filter?: string; limit?: number; offset?: number },
    populate?: boolean,
  ): Promise<SearchResult>;
}

// Environment flags — kept backward compatible with existing MEILI_* vars
const searchEnabled = process.env.SEARCH != null && process.env.SEARCH.toLowerCase() === 'true';

const searchConfigured = (() => {
  if (process.env.SEARCH_PROVIDER?.toLowerCase() === 'opensearch' || process.env.OPENSEARCH_HOST) {
    return true;
  }
  return process.env.MEILI_HOST != null && process.env.MEILI_MASTER_KEY != null;
})();

const isEnabled = searchEnabled && searchConfigured;

const getSyncConfig = () => ({
  batchSize: parseInt(process.env.MEILI_SYNC_BATCH_SIZE || '100', 10),
  delayMs: parseInt(process.env.MEILI_SYNC_DELAY_MS || '100', 10),
});

const validateOptions = (options: Partial<MongoSearchOptions>): void => {
  const requiredKeys: (keyof MongoSearchOptions)[] = ['indexName'];
  requiredKeys.forEach((key) => {
    if (!options[key]) {
      throw new Error(`Missing mongoSearch Option: ${key}`);
    }
  });
};

const processBatch = async <T>(
  items: T[],
  batchSize: number,
  delayMs: number,
  processor: (batch: T[]) => Promise<void>,
): Promise<void> => {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processor(batch);

    if (i + batchSize < items.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

const createSearchMongooseModel = ({
  provider,
  indexName,
  attributesToIndex,
  syncOptions,
}: {
  provider: SearchProvider;
  indexName: string;
  attributesToIndex: string[];
  syncOptions: { batchSize: number; delayMs: number };
}) => {
  const primaryKey = attributesToIndex[0];
  const syncConfig = { ...getSyncConfig(), ...syncOptions };

  class SearchMongooseModel {
    static async getSyncProgress(this: SchemaWithSearchMethods): Promise<SyncProgress> {
      const totalDocuments = await this.countDocuments({ expiredAt: null });
      const indexedDocuments = await this.countDocuments({ expiredAt: null, _meiliIndex: true });

      return {
        totalProcessed: indexedDocuments,
        totalDocuments,
        isComplete: indexedDocuments === totalDocuments,
      };
    }

    static async syncWithSearch(this: SchemaWithSearchMethods): Promise<void> {
      const startTime = Date.now();
      const { batchSize, delayMs } = syncConfig;

      const collectionName = primaryKey === 'messageId' ? 'messages' : 'conversations';
      logger.info(
        `[syncWithSearch] Starting sync for ${collectionName} with batch size ${batchSize}`,
      );

      const approxTotalCount = await this.estimatedDocumentCount();
      logger.info(
        `[syncWithSearch] Approximate total number of all ${collectionName}: ${approxTotalCount}`,
      );

      try {
        logger.info(`[syncWithSearch] Starting cleanup of index ${indexName} before sync`);
        await this.cleanupSearchIndex(provider, indexName, primaryKey, batchSize, delayMs);
        logger.info(`[syncWithSearch] Completed cleanup of index: ${indexName}`);
      } catch (error) {
        logger.error('[syncWithSearch] Error during cleanup before sync:', error);
        throw error;
      }

      let processedCount = 0;
      let hasMore = true;

      while (hasMore) {
        const query: FilterQuery<unknown> = {
          expiredAt: null,
          _meiliIndex: false,
        };

        try {
          const documents = await this.find(query)
            .select(attributesToIndex.join(' ') + ' _meiliIndex')
            .limit(batchSize)
            .lean();

          if (documents.length === 0) {
            logger.info('[syncWithSearch] No more documents to process');
            break;
          }

          await this.processSyncBatch(provider, indexName, documents);
          processedCount += documents.length;
          logger.info(`[syncWithSearch] Processed: ${processedCount}`);

          if (documents.length < batchSize) {
            hasMore = false;
          }

          if (hasMore && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        } catch (error) {
          logger.error('[syncWithSearch] Error processing documents batch:', error);
          throw error;
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        `[syncWithSearch] Completed sync for ${collectionName}. Processed ${processedCount} documents in ${duration}ms`,
      );
    }

    static async processSyncBatch(
      this: SchemaWithSearchMethods,
      provider: SearchProvider,
      indexName: string,
      documents: Array<Record<string, unknown>>,
    ): Promise<void> {
      if (documents.length === 0) {
        return;
      }

      const formattedDocs = documents.map((doc) =>
        _.omitBy(_.pick(doc, attributesToIndex), (_v, k) => k.startsWith('$')),
      );

      try {
        await provider.addDocumentsInBatches(indexName, formattedDocs, primaryKey);

        const docsIds = documents.map((doc) => doc._id);
        await this.updateMany({ _id: { $in: docsIds } }, { $set: { _meiliIndex: true } });
      } catch (error) {
        logger.error('[processSyncBatch] Error processing batch:', error);
        throw error;
      }
    }

    static async cleanupSearchIndex(
      this: SchemaWithSearchMethods,
      provider: SearchProvider,
      indexName: string,
      primaryKey: string,
      batchSize: number,
      delayMs: number,
    ): Promise<void> {
      try {
        let offset = 0;
        let moreDocuments = true;

        while (moreDocuments) {
          const batch = await provider.getDocuments(indexName, { limit: batchSize, offset });
          if (batch.results.length === 0) {
            moreDocuments = false;
            break;
          }

          const searchIds = batch.results.map((doc) => doc[primaryKey]);
          const query: Record<string, unknown> = {};
          query[primaryKey] = { $in: searchIds };

          const existingDocs = await this.find(query).select(primaryKey).lean();

          const existingIds = new Set(
            existingDocs.map((doc: Record<string, unknown>) => doc[primaryKey]),
          );

          const toDelete = searchIds.filter((id) => !existingIds.has(id));
          if (toDelete.length > 0) {
            await provider.deleteDocuments(indexName, toDelete.map(String));
            logger.debug(`[cleanupSearchIndex] Deleted ${toDelete.length} orphaned documents`);
          }

          if (batch.results.length < batchSize) {
            break;
          }

          offset += batchSize - toDelete.length;

          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      } catch (error) {
        logger.error('[cleanupSearchIndex] Error during cleanup:', error);
      }
    }

    static async setSearchIndexSettings(settings: Record<string, unknown>): Promise<unknown> {
      return await provider.updateIndexSettings(indexName, {
        filterableAttributes: settings.filterableAttributes as string[] | undefined,
        searchableAttributes: settings.searchableAttributes as string[] | undefined,
        sortableAttributes: settings.sortableAttributes as string[] | undefined,
      });
    }

    static async searchIndex(
      this: SchemaWithSearchMethods,
      q: string,
      params: { filter?: string; limit?: number; offset?: number },
      populate: boolean,
    ): Promise<SearchResult> {
      const data = await provider.search(indexName, q, params);

      if (populate) {
        const query: Record<string, unknown> = {};
        query[primaryKey] = _.map(data.hits, (hit) => hit[primaryKey]);

        const projection = Object.keys(this.schema.obj).reduce<Record<string, number>>(
          (results, key) => {
            if (!key.startsWith('$')) {
              results[key] = 1;
            }
            return results;
          },
          { _id: 1, __v: 1 },
        );

        const hitsFromMongoose = await this.find(query, projection).lean();

        const populatedHits = data.hits.map((hit) => {
          const queryObj: Record<string, unknown> = {};
          queryObj[primaryKey] = hit[primaryKey];
          const originalHit = _.find(hitsFromMongoose, (item) => {
            const typedItem = item as Record<string, unknown>;
            return typedItem[primaryKey] === hit[primaryKey];
          });

          return {
            ...(originalHit && typeof originalHit === 'object' ? originalHit : {}),
            ...hit,
          };
        });
        data.hits = populatedHits;
      }

      return data;
    }

    preprocessObjectForIndex(this: DocumentWithSearchIndex): Record<string, unknown> {
      const object = _.omitBy(_.pick(this.toJSON(), attributesToIndex), (v, k) =>
        k.startsWith('$'),
      );

      if (
        object.conversationId &&
        typeof object.conversationId === 'string' &&
        object.conversationId.includes('|')
      ) {
        object.conversationId = object.conversationId.replace(/\|/g, '--');
      }

      if (object.content && Array.isArray(object.content)) {
        object.text = parseTextParts(object.content);
        delete object.content;
      }

      return object;
    }

    async addObjectToSearchIndex(
      this: DocumentWithSearchIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): Promise<void> {
      if (!_.isNil(this.expiredAt)) {
        return next();
      }

      const object = this.preprocessObjectForIndex!();
      const maxRetries = 3;
      let retryCount = 0;

      while (retryCount < maxRetries) {
        try {
          await provider.addDocuments(indexName, [object], primaryKey);
          break;
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            logger.error(
              '[addObjectToSearchIndex] Error adding document to search index after retries:',
              error,
            );
            return next();
          }
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        }
      }

      try {
        await this.collection.updateMany(
          { _id: this._id as Types.ObjectId },
          { $set: { _meiliIndex: true } },
        );
      } catch (error) {
        logger.error('[addObjectToSearchIndex] Error updating _meiliIndex field:', error);
        return next();
      }

      next();
    }

    async updateObjectInSearchIndex(
      this: DocumentWithSearchIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): Promise<void> {
      try {
        const object = _.omitBy(_.pick(this.toJSON(), attributesToIndex), (v, k) =>
          k.startsWith('$'),
        );
        await provider.updateDocuments(indexName, [object]);
        next();
      } catch (error) {
        logger.error('[updateObjectInSearchIndex] Error updating document in search index:', error);
        return next();
      }
    }

    async deleteObjectFromSearchIndex(
      this: DocumentWithSearchIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): Promise<void> {
      try {
        await provider.deleteDocument(indexName, this._id as string);
        next();
      } catch (error) {
        logger.error(
          '[deleteObjectFromSearchIndex] Error deleting document from search index:',
          error,
        );
        return next();
      }
    }

    postSaveHook(
      this: DocumentWithSearchIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): void {
      if (this._meiliIndex) {
        this.updateObjectInSearchIndex!(next);
      } else {
        this.addObjectToSearchIndex!(next);
      }
    }

    postUpdateHook(
      this: DocumentWithSearchIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): void {
      if (this._meiliIndex) {
        this.updateObjectInSearchIndex!(next);
      } else {
        next();
      }
    }

    postRemoveHook(
      this: DocumentWithSearchIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): void {
      if (this._meiliIndex) {
        this.deleteObjectFromSearchIndex!(next);
      } else {
        next();
      }
    }
  }

  return SearchMongooseModel;
};

/**
 * Generic Mongoose plugin to synchronize MongoDB collections with a search index.
 *
 * This plugin is provider-agnostic — it works with MeiliSearch, OpenSearch, or any
 * future provider that implements the SearchProvider interface.
 *
 * It maintains full backward compatibility:
 *   - The `_meiliIndex` field name is preserved so existing data doesn't need migration.
 *   - All existing MEILI_* environment variables continue to work.
 *   - The `meiliSearch` static method is aliased to `searchIndex` for backward compat.
 */
export default function mongoSearch(schema: Schema, options: MongoSearchOptions): void {
  const mongoose = options.mongoose;
  validateOptions(options);

  schema.add({
    _meiliIndex: {
      type: Boolean,
      required: false,
      select: false,
      default: false,
    },
  });

  const { indexName, primaryKey } = options;
  const syncOptions = {
    batchSize: options.syncBatchSize || getSyncConfig().batchSize,
    delayMs: options.syncDelayMs || getSyncConfig().delayMs,
  };

  const provider = getSearchProvider();
  if (!provider) {
    logger.debug('[mongoSearch] No search provider configured, skipping plugin setup');
    return;
  }

  // Create index and configure settings asynchronously
  (async () => {
    try {
      await provider.createIndex(indexName, primaryKey);
    } catch (error) {
      logger.error(`[mongoSearch] Error creating index ${indexName}:`, error);
    }

    try {
      await provider.updateIndexSettings(indexName, {
        filterableAttributes: ['user'],
      });
      logger.debug(`[mongoSearch] Updated index ${indexName} settings to make 'user' filterable`);
    } catch (settingsError) {
      logger.error(
        `[mongoSearch] Error updating index settings for ${indexName}:`,
        settingsError,
      );
    }
  })();

  const attributesToIndex: string[] = [
    ...Object.entries(schema.obj).reduce<string[]>((results, [key, value]) => {
      const schemaValue = value as { meiliIndex?: boolean };
      return schemaValue.meiliIndex ? [...results, key] : results;
    }, []),
  ];

  if (schema.obj.user && !attributesToIndex.includes('user')) {
    attributesToIndex.push('user');
    logger.debug(`[mongoSearch] Added 'user' field to ${indexName} index attributes`);
  }

  schema.loadClass(
    createSearchMongooseModel({ provider, indexName, attributesToIndex, syncOptions }),
  );

  // Backward compatibility aliases: map old method names to new ones
  schema.statics.syncWithMeili = schema.statics.syncWithSearch;
  schema.statics.meiliSearch = schema.statics.searchIndex;

  // Register Mongoose hooks
  schema.post('save', function (doc: DocumentWithSearchIndex, next) {
    doc.postSaveHook?.(next);
  });

  schema.post('updateOne', function (doc: DocumentWithSearchIndex, next) {
    doc.postUpdateHook?.(next);
  });

  schema.post('deleteOne', function (doc: DocumentWithSearchIndex, next) {
    doc.postRemoveHook?.(next);
  });

  schema.pre('deleteMany', async function (next) {
    if (!isEnabled) {
      return next();
    }

    try {
      const conditions = (this as Query<unknown, unknown>).getQuery();
      const { batchSize, delayMs } = syncOptions;

      if (Object.prototype.hasOwnProperty.call(schema.obj, 'messages')) {
        const deletedConvos = await mongoose
          .model('Conversation')
          .find(conditions as FilterQuery<unknown>)
          .select('conversationId')
          .lean();

        await processBatch(deletedConvos, batchSize, delayMs, async (batch) => {
          const promises = batch.map((convo: Record<string, unknown>) =>
            provider.deleteDocument('convos', convo.conversationId as string),
          );
          await Promise.all(promises);
        });
      }

      if (Object.prototype.hasOwnProperty.call(schema.obj, 'messageId')) {
        const deletedMessages = await mongoose
          .model('Message')
          .find(conditions as FilterQuery<unknown>)
          .select('messageId')
          .lean();

        await processBatch(deletedMessages, batchSize, delayMs, async (batch) => {
          const promises = batch.map((message: Record<string, unknown>) =>
            provider.deleteDocument('messages', message.messageId as string),
          );
          await Promise.all(promises);
        });
      }
      return next();
    } catch (error) {
      if (isEnabled) {
        logger.error(
          '[SearchMongooseModel.deleteMany] There was an issue deleting indexes upon deletion. Next startup may trigger syncing.',
          error,
        );
      }
      return next();
    }
  });

  schema.post('findOneAndUpdate', async function (doc: DocumentWithSearchIndex, next) {
    if (!isEnabled) {
      return next();
    }

    if (doc.unfinished) {
      return next();
    }

    let searchDoc: SearchHit | null = null;
    if (doc.messages) {
      try {
        searchDoc = await provider.getDocument('convos', doc.conversationId as string);
      } catch (error: unknown) {
        logger.debug(
          '[SearchMongooseModel.findOneAndUpdate] Convo not found in search index and will index ' +
            doc.conversationId,
          error as Record<string, unknown>,
        );
      }
    }

    if (searchDoc && searchDoc.title === doc.title) {
      return next();
    }

    doc.postSaveHook?.(next);
  });
}
