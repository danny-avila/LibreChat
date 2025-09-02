import _ from 'lodash';
import { MeiliSearch } from 'meilisearch';
import type { SearchResponse, Index } from 'meilisearch';
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
import logger from '~/config/meiliLogger';

interface MongoMeiliOptions {
  host: string;
  apiKey: string;
  indexName: string;
  primaryKey: string;
  mongoose: typeof import('mongoose');
  syncBatchSize?: number;
  syncDelayMs?: number;
}

interface MeiliIndexable {
  [key: string]: unknown;
  _meiliIndex?: boolean;
}

interface ContentItem {
  type: string;
  text?: string;
}

interface SyncProgress {
  lastSyncedId?: string;
  totalProcessed: number;
  totalDocuments: number;
  isComplete: boolean;
}

interface _DocumentWithMeiliIndex extends Document {
  _meiliIndex?: boolean;
  preprocessObjectForIndex?: () => Record<string, unknown>;
  addObjectToMeili?: (next: CallbackWithoutResultAndOptionalError) => Promise<void>;
  updateObjectToMeili?: (next: CallbackWithoutResultAndOptionalError) => Promise<void>;
  deleteObjectFromMeili?: (next: CallbackWithoutResultAndOptionalError) => Promise<void>;
  postSaveHook?: (next: CallbackWithoutResultAndOptionalError) => void;
  postUpdateHook?: (next: CallbackWithoutResultAndOptionalError) => void;
  postRemoveHook?: (next: CallbackWithoutResultAndOptionalError) => void;
}

export type DocumentWithMeiliIndex = _DocumentWithMeiliIndex & IConversation & Partial<IMessage>;

export interface SchemaWithMeiliMethods extends Model<DocumentWithMeiliIndex> {
  syncWithMeili(options?: { resumeFromId?: string }): Promise<void>;
  getSyncProgress(): Promise<SyncProgress>;
  processSyncBatch(
    index: Index<MeiliIndexable>,
    documents: Array<Record<string, unknown>>,
    updateOps: Array<{
      updateOne: {
        filter: Record<string, unknown>;
        update: { $set: { _meiliIndex: boolean } };
      };
    }>,
  ): Promise<void>;
  cleanupMeiliIndex(
    index: Index<MeiliIndexable>,
    primaryKey: string,
    batchSize: number,
    delayMs: number,
  ): Promise<void>;
  setMeiliIndexSettings(settings: Record<string, unknown>): Promise<unknown>;
  meiliSearch(
    q: string,
    params?: Record<string, unknown>,
    populate?: boolean,
  ): Promise<SearchResponse<MeiliIndexable, Record<string, unknown>>>;
}

// Environment flags
/**
 * Flag to indicate if search is enabled based on environment variables.
 */
const searchEnabled = process.env.SEARCH != null && process.env.SEARCH.toLowerCase() === 'true';

/**
 * Flag to indicate if MeiliSearch is enabled based on required environment variables.
 */
const meiliEnabled =
  process.env.MEILI_HOST != null && process.env.MEILI_MASTER_KEY != null && searchEnabled;

/**
 * Get sync configuration from environment variables
 */
const getSyncConfig = () => ({
  batchSize: parseInt(process.env.MEILI_SYNC_BATCH_SIZE || '100', 10),
  delayMs: parseInt(process.env.MEILI_SYNC_DELAY_MS || '100', 10),
});

/**
 * Local implementation of parseTextParts to avoid dependency on librechat-data-provider
 * Extracts text content from an array of content items
 */
const parseTextParts = (content: ContentItem[]): string => {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join(' ')
    .trim();
};

/**
 * Local implementation to handle Bing convoId conversion
 */
const cleanUpPrimaryKeyValue = (value: string): string => {
  return value.replace(/--/g, '|');
};

/**
 * Validates the required options for configuring the mongoMeili plugin.
 */
const validateOptions = (options: Partial<MongoMeiliOptions>): void => {
  const requiredKeys: (keyof MongoMeiliOptions)[] = ['host', 'apiKey', 'indexName'];
  requiredKeys.forEach((key) => {
    if (!options[key]) {
      throw new Error(`Missing mongoMeili Option: ${key}`);
    }
  });
};

/**
 * Helper function to process documents in batches with rate limiting
 */
const processBatch = async <T>(
  items: T[],
  batchSize: number,
  delayMs: number,
  processor: (batch: T[]) => Promise<void>,
): Promise<void> => {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processor(batch);

    // Add delay between batches to prevent overwhelming resources
    if (i + batchSize < items.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

/**
 * Factory function to create a MeiliMongooseModel class which extends a Mongoose model.
 * This class contains static and instance methods to synchronize and manage the MeiliSearch index
 * corresponding to the MongoDB collection.
 *
 * @param config - Configuration object.
 * @param config.index - The MeiliSearch index object.
 * @param config.attributesToIndex - List of attributes to index.
 * @param config.syncOptions - Sync configuration options.
 * @returns A class definition that will be loaded into the Mongoose schema.
 */
const createMeiliMongooseModel = ({
  index,
  attributesToIndex,
  syncOptions,
}: {
  index: Index<MeiliIndexable>;
  attributesToIndex: string[];
  syncOptions: { batchSize: number; delayMs: number };
}) => {
  const primaryKey = attributesToIndex[0];
  const syncConfig = { ...getSyncConfig(), ...syncOptions };

  class MeiliMongooseModel {
    /**
     * Get the current sync progress
     */
    static async getSyncProgress(this: SchemaWithMeiliMethods): Promise<SyncProgress> {
      const totalDocuments = await this.countDocuments();
      const indexedDocuments = await this.countDocuments({ _meiliIndex: true });

      return {
        totalProcessed: indexedDocuments,
        totalDocuments,
        isComplete: indexedDocuments === totalDocuments,
      };
    }

    /**
     * Synchronizes the data between the MongoDB collection and the MeiliSearch index.
     * Now uses streaming and batching to reduce memory usage.
     */
    static async syncWithMeili(
      this: SchemaWithMeiliMethods,
      options?: { resumeFromId?: string },
    ): Promise<void> {
      try {
        const startTime = Date.now();
        const { batchSize, delayMs } = syncConfig;

        logger.info(
          `[syncWithMeili] Starting sync for ${primaryKey === 'messageId' ? 'messages' : 'conversations'} with batch size ${batchSize}`,
        );

        // Build query with resume capability
        const query: FilterQuery<unknown> = {};
        if (options?.resumeFromId) {
          query._id = { $gt: options.resumeFromId };
        }

        // Get total count for progress tracking
        const totalCount = await this.countDocuments(query);
        let processedCount = 0;

        // First, handle documents that need to be removed from Meili
        await this.cleanupMeiliIndex(index, primaryKey, batchSize, delayMs);

        // Process MongoDB documents in batches using cursor
        const cursor = this.find(query)
          .select(attributesToIndex.join(' ') + ' _meiliIndex')
          .sort({ _id: 1 })
          .batchSize(batchSize)
          .cursor();

        const format = (doc: Record<string, unknown>) =>
          _.omitBy(_.pick(doc, attributesToIndex), (v, k) => k.startsWith('$'));

        let documentBatch: Array<Record<string, unknown>> = [];
        let updateOps: Array<{
          updateOne: {
            filter: Record<string, unknown>;
            update: { $set: { _meiliIndex: boolean } };
          };
        }> = [];

        // Process documents in streaming fashion
        for await (const doc of cursor) {
          const typedDoc = doc.toObject() as unknown as Record<string, unknown>;
          const formatted = format(typedDoc);

          // Check if document needs indexing
          if (!typedDoc._meiliIndex) {
            documentBatch.push(formatted);
            updateOps.push({
              updateOne: {
                filter: { _id: typedDoc._id },
                update: { $set: { _meiliIndex: true } },
              },
            });
          }

          processedCount++;

          // Process batch when it reaches the configured size
          if (documentBatch.length >= batchSize) {
            await this.processSyncBatch(index, documentBatch, updateOps);
            documentBatch = [];
            updateOps = [];

            // Log progress
            const progress = Math.round((processedCount / totalCount) * 100);
            logger.info(`[syncWithMeili] Progress: ${progress}% (${processedCount}/${totalCount})`);

            // Add delay to prevent overwhelming resources
            if (delayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          }
        }

        // Process remaining documents
        if (documentBatch.length > 0) {
          await this.processSyncBatch(index, documentBatch, updateOps);
        }

        const duration = Date.now() - startTime;
        logger.info(
          `[syncWithMeili] Completed sync for ${primaryKey === 'messageId' ? 'messages' : 'conversations'} in ${duration}ms`,
        );
      } catch (error) {
        logger.error('[syncWithMeili] Error during sync:', error);
        throw error;
      }
    }

    /**
     * Process a batch of documents for syncing
     */
    static async processSyncBatch(
      this: SchemaWithMeiliMethods,
      index: Index<MeiliIndexable>,
      documents: Array<Record<string, unknown>>,
      updateOps: Array<{
        updateOne: {
          filter: Record<string, unknown>;
          update: { $set: { _meiliIndex: boolean } };
        };
      }>,
    ): Promise<void> {
      if (documents.length === 0) {
        return;
      }

      try {
        // Add documents to MeiliSearch
        await index.addDocuments(documents);

        // Update MongoDB to mark documents as indexed
        if (updateOps.length > 0) {
          await this.collection.bulkWrite(updateOps);
        }
      } catch (error) {
        logger.error('[processSyncBatch] Error processing batch:', error);
        // Don't throw - allow sync to continue with other documents
      }
    }

    /**
     * Clean up documents in MeiliSearch that no longer exist in MongoDB
     */
    static async cleanupMeiliIndex(
      this: SchemaWithMeiliMethods,
      index: Index<MeiliIndexable>,
      primaryKey: string,
      batchSize: number,
      delayMs: number,
    ): Promise<void> {
      try {
        let offset = 0;
        let moreDocuments = true;

        while (moreDocuments) {
          const batch = await index.getDocuments({ limit: batchSize, offset });
          if (batch.results.length === 0) {
            moreDocuments = false;
            break;
          }

          const meiliIds = batch.results.map((doc) => doc[primaryKey]);
          const query: Record<string, unknown> = {};
          query[primaryKey] = { $in: meiliIds };

          // Find which documents exist in MongoDB
          const existingDocs = await this.find(query).select(primaryKey).lean();

          const existingIds = new Set(
            existingDocs.map((doc: Record<string, unknown>) => doc[primaryKey]),
          );

          // Delete documents that don't exist in MongoDB
          const toDelete = meiliIds.filter((id) => !existingIds.has(id));
          if (toDelete.length > 0) {
            await Promise.all(toDelete.map((id) => index.deleteDocument(id as string)));
            logger.debug(`[cleanupMeiliIndex] Deleted ${toDelete.length} orphaned documents`);
          }

          offset += batchSize;

          // Add delay between batches
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      } catch (error) {
        logger.error('[cleanupMeiliIndex] Error during cleanup:', error);
      }
    }

    /**
     * Updates settings for the MeiliSearch index
     */
    static async setMeiliIndexSettings(settings: Record<string, unknown>): Promise<unknown> {
      return await index.updateSettings(settings);
    }

    /**
     * Searches the MeiliSearch index and optionally populates results
     */
    static async meiliSearch(
      this: SchemaWithMeiliMethods,
      q: string,
      params: Record<string, unknown>,
      populate: boolean,
    ): Promise<SearchResponse<MeiliIndexable, Record<string, unknown>>> {
      const data = await index.search(q, params);

      if (populate) {
        const query: Record<string, unknown> = {};
        query[primaryKey] = _.map(data.hits, (hit) =>
          cleanUpPrimaryKeyValue(hit[primaryKey] as string),
        );

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

    /**
     * Preprocesses the current document for indexing
     */
    preprocessObjectForIndex(this: DocumentWithMeiliIndex): Record<string, unknown> {
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

    /**
     * Adds the current document to the MeiliSearch index with retry logic
     */
    async addObjectToMeili(
      this: DocumentWithMeiliIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): Promise<void> {
      const object = this.preprocessObjectForIndex!();
      const maxRetries = 3;
      let retryCount = 0;

      while (retryCount < maxRetries) {
        try {
          await index.addDocuments([object]);
          break;
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            logger.error('[addObjectToMeili] Error adding document to Meili after retries:', error);
            return next();
          }
          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        }
      }

      try {
        await this.collection.updateMany(
          { _id: this._id as Types.ObjectId },
          { $set: { _meiliIndex: true } },
        );
      } catch (error) {
        logger.error('[addObjectToMeili] Error updating _meiliIndex field:', error);
        return next();
      }

      next();
    }

    /**
     * Updates the current document in the MeiliSearch index
     */
    async updateObjectToMeili(
      this: DocumentWithMeiliIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): Promise<void> {
      try {
        const object = _.omitBy(_.pick(this.toJSON(), attributesToIndex), (v, k) =>
          k.startsWith('$'),
        );
        await index.updateDocuments([object]);
        next();
      } catch (error) {
        logger.error('[updateObjectToMeili] Error updating document in Meili:', error);
        return next();
      }
    }

    /**
     * Deletes the current document from the MeiliSearch index.
     *
     * @returns {Promise<void>}
     */
    async deleteObjectFromMeili(
      this: DocumentWithMeiliIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): Promise<void> {
      try {
        await index.deleteDocument(this._id as string);
        next();
      } catch (error) {
        logger.error('[deleteObjectFromMeili] Error deleting document from Meili:', error);
        return next();
      }
    }

    /**
     * Post-save hook to synchronize the document with MeiliSearch.
     *
     * If the document is already indexed (i.e. `_meiliIndex` is true), it updates it;
     * otherwise, it adds the document to the index.
     */
    postSaveHook(this: DocumentWithMeiliIndex, next: CallbackWithoutResultAndOptionalError): void {
      if (this._meiliIndex) {
        this.updateObjectToMeili!(next);
      } else {
        this.addObjectToMeili!(next);
      }
    }

    /**
     * Post-update hook to update the document in MeiliSearch.
     *
     * This hook is triggered after a document update, ensuring that changes are
     * propagated to the MeiliSearch index if the document is indexed.
     */
    postUpdateHook(
      this: DocumentWithMeiliIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): void {
      if (this._meiliIndex) {
        this.updateObjectToMeili!(next);
      } else {
        next();
      }
    }

    /**
     * Post-remove hook to delete the document from MeiliSearch.
     *
     * This hook is triggered after a document is removed, ensuring that the document
     * is also removed from the MeiliSearch index if it was previously indexed.
     */
    postRemoveHook(
      this: DocumentWithMeiliIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): void {
      if (this._meiliIndex) {
        this.deleteObjectFromMeili!(next);
      } else {
        next();
      }
    }
  }

  return MeiliMongooseModel;
};

/**
 * Mongoose plugin to synchronize MongoDB collections with a MeiliSearch index.
 *
 * This plugin:
 *   - Validates the provided options.
 *   - Adds a `_meiliIndex` field to the schema to track indexing status.
 *   - Sets up a MeiliSearch client and creates an index if it doesn't already exist.
 *   - Loads class methods for syncing, searching, and managing documents in MeiliSearch.
 *   - Registers Mongoose hooks (post-save, post-update, post-remove, etc.) to maintain index consistency.
 *
 * @param schema - The Mongoose schema to which the plugin is applied.
 * @param options - Configuration options.
 * @param options.host - The MeiliSearch host.
 * @param options.apiKey - The MeiliSearch API key.
 * @param options.indexName - The name of the MeiliSearch index.
 * @param options.primaryKey - The primary key field for indexing.
 * @param options.syncBatchSize - Batch size for sync operations.
 * @param options.syncDelayMs - Delay between batches in milliseconds.
 */
export default function mongoMeili(schema: Schema, options: MongoMeiliOptions): void {
  const mongoose = options.mongoose;
  validateOptions(options);

  // Add _meiliIndex field to the schema to track if a document has been indexed in MeiliSearch.
  schema.add({
    _meiliIndex: {
      type: Boolean,
      required: false,
      select: false,
      default: false,
    },
  });

  const { host, apiKey, indexName, primaryKey } = options;
  const syncOptions = {
    batchSize: options.syncBatchSize || getSyncConfig().batchSize,
    delayMs: options.syncDelayMs || getSyncConfig().delayMs,
  };

  const client = new MeiliSearch({ host, apiKey });

  /** Create index only if it doesn't exist */
  const index = client.index<MeiliIndexable>(indexName);

  // Check if index exists and create if needed
  (async () => {
    try {
      await index.getRawInfo();
      logger.debug(`[mongoMeili] Index ${indexName} already exists`);
    } catch (error) {
      const errorCode = (error as { code?: string })?.code;
      if (errorCode === 'index_not_found') {
        try {
          logger.info(`[mongoMeili] Creating new index: ${indexName}`);
          await client.createIndex(indexName, { primaryKey });
          logger.info(`[mongoMeili] Successfully created index: ${indexName}`);
        } catch (createError) {
          // Index might have been created by another instance
          logger.debug(`[mongoMeili] Index ${indexName} may already exist:`, createError);
        }
      } else {
        logger.error(`[mongoMeili] Error checking index ${indexName}:`, error);
      }
    }
  })();

  // Collect attributes from the schema that should be indexed
  const attributesToIndex: string[] = [
    ...Object.entries(schema.obj).reduce<string[]>((results, [key, value]) => {
      const schemaValue = value as { meiliIndex?: boolean };
      return schemaValue.meiliIndex ? [...results, key] : results;
    }, []),
  ];

  schema.loadClass(createMeiliMongooseModel({ index, attributesToIndex, syncOptions }));

  // Register Mongoose hooks
  schema.post('save', function (doc: DocumentWithMeiliIndex, next) {
    doc.postSaveHook?.(next);
  });

  schema.post('updateOne', function (doc: DocumentWithMeiliIndex, next) {
    doc.postUpdateHook?.(next);
  });

  schema.post('deleteOne', function (doc: DocumentWithMeiliIndex, next) {
    doc.postRemoveHook?.(next);
  });

  // Pre-deleteMany hook: remove corresponding documents from MeiliSearch when multiple documents are deleted.
  schema.pre('deleteMany', async function (next) {
    if (!meiliEnabled) {
      return next();
    }

    try {
      const conditions = (this as Query<unknown, unknown>).getQuery();
      const { batchSize, delayMs } = syncOptions;

      if (Object.prototype.hasOwnProperty.call(schema.obj, 'messages')) {
        const convoIndex = client.index('convos');
        const deletedConvos = await mongoose
          .model('Conversation')
          .find(conditions as FilterQuery<unknown>)
          .select('conversationId')
          .lean();

        // Process deletions in batches
        await processBatch(deletedConvos, batchSize, delayMs, async (batch) => {
          const promises = batch.map((convo: Record<string, unknown>) =>
            convoIndex.deleteDocument(convo.conversationId as string),
          );
          await Promise.all(promises);
        });
      }

      if (Object.prototype.hasOwnProperty.call(schema.obj, 'messageId')) {
        const messageIndex = client.index('messages');
        const deletedMessages = await mongoose
          .model('Message')
          .find(conditions as FilterQuery<unknown>)
          .select('messageId')
          .lean();

        // Process deletions in batches
        await processBatch(deletedMessages, batchSize, delayMs, async (batch) => {
          const promises = batch.map((message: Record<string, unknown>) =>
            messageIndex.deleteDocument(message.messageId as string),
          );
          await Promise.all(promises);
        });
      }
      return next();
    } catch (error) {
      if (meiliEnabled) {
        logger.error(
          '[MeiliMongooseModel.deleteMany] There was an issue deleting conversation indexes upon deletion. Next startup may trigger syncing.',
          error,
        );
      }
      return next();
    }
  });

  // Post-findOneAndUpdate hook
  schema.post('findOneAndUpdate', async function (doc: DocumentWithMeiliIndex, next) {
    if (!meiliEnabled) {
      return next();
    }

    if (doc.unfinished) {
      return next();
    }

    let meiliDoc: Record<string, unknown> | undefined;
    if (doc.messages) {
      try {
        meiliDoc = await client.index('convos').getDocument(doc.conversationId as string);
      } catch (error: unknown) {
        logger.debug(
          '[MeiliMongooseModel.findOneAndUpdate] Convo not found in MeiliSearch and will index ' +
            doc.conversationId,
          error as Record<string, unknown>,
        );
      }
    }

    if (meiliDoc && meiliDoc.title === doc.title) {
      return next();
    }

    doc.postSaveHook?.(next);
  });
}
