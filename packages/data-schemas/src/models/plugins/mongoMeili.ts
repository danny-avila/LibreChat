import _ from 'lodash';
import { MeiliSearch, MeiliSearchTimeOutError } from 'meilisearch';
import type {
  CallbackWithoutResultAndOptionalError,
  FilterQuery,
  Document,
  Schema,
  Types,
  Model,
} from 'mongoose';
import type { SearchResponse, SearchParams, Index, MeiliSearchErrorInfo } from 'meilisearch';
import type { SearchSink, SearchSyncDocument, SearchSyncOrigin } from '~/models/plugins/projection';
import type { IConversation, IMessage } from '~/types';
import {
  buildIndexableQuery,
  isIndexableDocument,
  preprocessObjectForIndex,
} from '~/search/document';
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

interface SyncProgress {
  lastSyncedId?: string;
  totalProcessed: number;
  totalDocuments: number;
  isComplete: boolean;
}

interface _DocumentWithMeiliIndex extends Document {
  _meiliIndex?: boolean;
  isTemporary?: boolean;
  expiredAt?: Date | null;
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
  syncWithMeili(): Promise<void>;
  getSyncProgress(): Promise<SyncProgress>;
  processSyncBatch(
    index: Index<MeiliIndexable>,
    documents: Array<Record<string, unknown>>,
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
    params?: SearchParams,
    populate?: boolean,
  ): Promise<SearchResponse<MeiliIndexable, Record<string, unknown>>>;
}

/**
 * Meilisearch is decoupled from the write path: every sink call is gated by
 * `MEILI_WRITES_ENABLED` (default **false**), including the three post hooks
 * that used to fire unconditionally whenever credentials were present. This
 * takes precedence over `MEILI_NO_SYNC`, which keeps its narrower meaning of
 * "skip the startup catch-up job only".
 *
 * Evaluated per call rather than cached at module load so a deployment can flip
 * the flag for a legacy rollback without a code change.
 */
export const meiliWritesEnabled = (): boolean =>
  process.env.MEILI_HOST != null &&
  process.env.MEILI_MASTER_KEY != null &&
  process.env.MEILI_WRITES_ENABLED === 'true';

/** Model factories are re-entrant; one sink per schema, created once. */
const MEILI_SINK = Symbol.for('librechat:meiliSink');

/**
 * Get sync configuration from environment variables
 */
const getSyncConfig = () => ({
  batchSize: parseInt(process.env.MEILI_SYNC_BATCH_SIZE || '100', 10),
  delayMs: parseInt(process.env.MEILI_SYNC_DELAY_MS || '100', 10),
});

/**
 * Validates the required options for configuring the mongoMeili plugin.
 */
const validateOptions = (options: Partial<MongoMeiliOptions>): void => {
  const requiredKeys: (keyof MongoMeiliOptions)[] = ['host', 'apiKey', 'indexName', 'primaryKey'];
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
 * @param config.primaryKey - The primary key field for MeiliSearch document operations.
 * @param config.syncOptions - Sync configuration options.
 * @returns A class definition that will be loaded into the Mongoose schema.
 */
const createMeiliMongooseModel = ({
  index,
  getIndexableQuery,
  attributesToIndex,
  primaryKey,
  syncOptions,
}: {
  index: Index<MeiliIndexable>;
  getIndexableQuery: () => FilterQuery<unknown>;
  attributesToIndex: string[];
  primaryKey: string;
  syncOptions: { batchSize: number; delayMs: number };
}) => {
  const syncConfig = { ...getSyncConfig(), ...syncOptions };

  class MeiliMongooseModel {
    /**
     * Get the current sync progress
     */
    static async getSyncProgress(this: SchemaWithMeiliMethods): Promise<SyncProgress> {
      const indexableQuery = getIndexableQuery();
      const totalDocuments = await this.countDocuments(indexableQuery);
      const indexedDocuments = await this.countDocuments({
        ...indexableQuery,
        _meiliIndex: true,
      });

      return {
        totalProcessed: indexedDocuments,
        totalDocuments,
        isComplete: indexedDocuments === totalDocuments,
      };
    }

    /**
     * Synchronizes data between the MongoDB collection and the MeiliSearch index by
     * incrementally indexing only non-temporary documents where `_meiliIndex` is not `true`.
     * */
    static async syncWithMeili(this: SchemaWithMeiliMethods): Promise<void> {
      const startTime = Date.now();
      const { batchSize, delayMs } = syncConfig;

      const collectionName = primaryKey === 'messageId' ? 'messages' : 'conversations';
      logger.info(
        `[syncWithMeili] Starting sync for ${collectionName} with batch size ${batchSize}`,
      );

      // Get approximate total count for raw estimation, the sync should not overcome this number
      const approxTotalCount = await this.estimatedDocumentCount();
      logger.info(
        `[syncWithMeili] Approximate total number of all ${collectionName}: ${approxTotalCount}`,
      );

      try {
        // First, handle documents that need to be removed from Meili
        logger.info(`[syncWithMeili] Starting cleanup of Meili index ${index.uid} before sync`);
        await this.cleanupMeiliIndex(index, primaryKey, batchSize, delayMs);
        logger.info(`[syncWithMeili] Completed cleanup of Meili index: ${index.uid}`);
      } catch (error) {
        logger.error('[syncWithMeili] Error during cleanup Meili before sync:', error);
        throw error;
      }

      let processedCount = 0;
      let hasMore = true;

      while (hasMore) {
        const indexableQuery = getIndexableQuery();
        const query: FilterQuery<unknown> = {
          ...indexableQuery,
          _meiliIndex: { $ne: true },
        };

        try {
          const documents = await this.find(query)
            .select(attributesToIndex.join(' ') + ' _meiliIndex')
            .limit(batchSize)
            .lean();

          // Check if there are more documents to process
          if (documents.length === 0) {
            logger.info('[syncWithMeili] No more documents to process');
            break;
          }

          // Process the batch
          await this.processSyncBatch(index, documents);
          processedCount += documents.length;
          logger.info(`[syncWithMeili] Processed: ${processedCount}`);

          if (documents.length < batchSize) {
            hasMore = false;
          }

          // Add delay to prevent overwhelming resources
          if (hasMore && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        } catch (error) {
          logger.error('[syncWithMeili] Error processing documents batch:', error);
          throw error;
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        `[syncWithMeili] Completed sync for ${collectionName}. Processed ${processedCount} documents in ${duration}ms`,
      );
    }

    /**
     * Process a batch of documents for syncing
     */
    static async processSyncBatch(
      this: SchemaWithMeiliMethods,
      index: Index<MeiliIndexable>,
      documents: Array<Record<string, unknown>>,
    ): Promise<void> {
      if (documents.length === 0) {
        return;
      }

      // Format documents for MeiliSearch
      const formattedDocs = documents.map((doc) =>
        _.omitBy(_.pick(doc, attributesToIndex), (_v, k) => k.startsWith('$')),
      );

      try {
        // Add documents to MeiliSearch
        await index.addDocumentsInBatches(formattedDocs, undefined, { primaryKey });

        // Update MongoDB to mark documents as indexed.
        // { timestamps: false } prevents Mongoose from touching updatedAt, preserving
        // original conversation/message timestamps (fixes sidebar chronological sort).
        const docsIds = documents.map((doc) => doc._id);
        await this.updateMany(
          { _id: { $in: docsIds } },
          { $set: { _meiliIndex: true } },
          { timestamps: false },
        );
      } catch (error) {
        logger.error('[processSyncBatch] Error processing batch:', error);
        throw error;
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

          const existingDocs = await this.find({ ...query, ...getIndexableQuery() })
            .select(primaryKey)
            .lean();

          const existingIds = new Set(
            existingDocs.map((doc: Record<string, unknown>) => doc[primaryKey]),
          );

          // Delete documents that don't exist in MongoDB
          const toDelete = meiliIds.filter((id) => !existingIds.has(id));
          if (toDelete.length > 0) {
            await index.deleteDocuments(toDelete.map(String));
            logger.debug(`[cleanupMeiliIndex] Deleted ${toDelete.length} orphaned documents`);
          }
          // if fetch documents request returns less documents than limit, all documents are processed
          if (batch.results.length < batchSize) {
            break;
          }

          offset += batchSize - toDelete.length;

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
      params: SearchParams,
      populate: boolean,
    ): Promise<SearchResponse<MeiliIndexable, Record<string, unknown>>> {
      const data = await index.search(q, params);

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

    /**
     * Preprocesses the current document for indexing
     */
    preprocessObjectForIndex(this: DocumentWithMeiliIndex): Record<string, unknown> {
      return preprocessObjectForIndex(this.toJSON(), attributesToIndex);
    }

    /**
     * Adds the current document to the MeiliSearch index with retry logic
     */
    async addObjectToMeili(
      this: DocumentWithMeiliIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): Promise<void> {
      if (!isIndexableDocument(this)) {
        return next();
      }

      const object = this.preprocessObjectForIndex!();
      const maxRetries = 3;
      let retryCount = 0;

      while (retryCount < maxRetries) {
        try {
          await index.addDocuments([object], { primaryKey });
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
        // eslint-disable-next-line no-restricted-syntax -- _meiliIndex is an internal bookkeeping flag, not tenant-scoped data
        await this.collection.updateOne(
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
        if (!isIndexableDocument(this)) {
          await index.deleteDocument(String(this[primaryKey as keyof DocumentWithMeiliIndex]));
          const model = this.constructor as Model<DocumentWithMeiliIndex>;
          await model.updateOne(
            { _id: this._id as Types.ObjectId },
            { $set: { _meiliIndex: false } },
          );
          return next();
        }

        const object = this.preprocessObjectForIndex!();
        await index.updateDocuments([object], { primaryKey });
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
        await index.deleteDocument(String(this[primaryKey as keyof DocumentWithMeiliIndex]));
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
 * Registers the Meilisearch statics on a schema and returns the optional write
 * sink behind them.
 *
 * This plugin no longer registers write hooks of its own. `applySearchSync` owns
 * every hook on the schema and Meilisearch is one sink it may fan out to, which
 * is what removes the three post hooks that used to fire unconditionally
 * whenever credentials were present. Every write here is gated by
 * `MEILI_WRITES_ENABLED` (default false); the statics stay registered so the
 * startup catch-up job and a legacy rollback still have something to call.
 */
export function createMeiliSink(schema: Schema, options: MongoMeiliOptions): SearchSink {
  const cached = schema as Schema & { [MEILI_SINK]?: SearchSink };
  if (cached[MEILI_SINK]) {
    return cached[MEILI_SINK];
  }

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

  (async () => {
    try {
      await index.getRawInfo();
      logger.debug(`[mongoMeili] Index ${indexName} already exists`);
    } catch (error) {
      const errorCode = (error as { code?: string })?.code;
      if (errorCode === 'index_not_found') {
        try {
          logger.info(`[mongoMeili] Creating new index: ${indexName}`);
          const enqueued = await client.createIndex(indexName, { primaryKey });
          const task = await client.waitForTask(enqueued.taskUid, {
            timeOutMs: 10000,
            intervalMs: 100,
          });
          logger.debug(`[mongoMeili] Index ${indexName} creation task:`, task);
          if (task.status !== 'succeeded') {
            const taskError = task.error as MeiliSearchErrorInfo | null;
            if (taskError?.code === 'index_already_exists') {
              logger.debug(`[mongoMeili] Index ${indexName} was created by another instance`);
            } else {
              logger.warn(`[mongoMeili] Index ${indexName} creation failed:`, taskError);
            }
          } else {
            logger.info(`[mongoMeili] Successfully created index: ${indexName}`);
          }
        } catch (createError) {
          if (createError instanceof MeiliSearchTimeOutError) {
            logger.warn(`[mongoMeili] Timed out waiting for index ${indexName} creation`);
          } else {
            logger.warn(`[mongoMeili] Error creating index ${indexName}:`, createError);
          }
        }
      } else {
        logger.error(`[mongoMeili] Error checking index ${indexName}:`, error);
      }
    }

    try {
      await index.updateSettings({
        filterableAttributes: ['user'],
      });
      logger.debug(`[mongoMeili] Updated index ${indexName} settings to make 'user' filterable`);
    } catch (settingsError) {
      logger.error(`[mongoMeili] Error updating index settings for ${indexName}:`, settingsError);
    }
  })();

  // Collect attributes from the schema that should be indexed
  const attributesToIndex: string[] = [
    ...Object.entries(schema.obj).reduce<string[]>((results, [key, value]) => {
      const schemaValue = value as { meiliIndex?: boolean };
      return schemaValue.meiliIndex ? [...results, key] : results;
    }, []),
  ];

  // CRITICAL: Always include 'user' field for proper filtering
  // This ensures existing deployments can filter by user after migration
  if (schema.obj.user && !attributesToIndex.includes('user')) {
    attributesToIndex.push('user');
    logger.debug(`[mongoMeili] Added 'user' field to ${indexName} index attributes`);
  }

  schema.loadClass(
    createMeiliMongooseModel({
      index,
      getIndexableQuery: () => buildIndexableQuery(schema),
      attributesToIndex,
      primaryKey,
      syncOptions,
    }),
  );

  const callHook = (
    doc: DocumentWithMeiliIndex,
    hook?: (next: CallbackWithoutResultAndOptionalError) => void,
  ): Promise<void> =>
    new Promise((resolve) => {
      if (typeof hook !== 'function') {
        resolve();
        return;
      }
      hook.call(doc, () => resolve());
    });

  const asDocument = (doc: SearchSyncDocument): DocumentWithMeiliIndex | null =>
    typeof (doc as unknown as DocumentWithMeiliIndex).postSaveHook === 'function'
      ? (doc as unknown as DocumentWithMeiliIndex)
      : null;

  /**
   * `saveConvo` rewrites a conversation on every turn, so re-indexing on each
   * `findOneAndUpdate` would push an unchanged title repeatedly. Skip when the
   * indexed title already matches.
   */
  const titleAlreadyIndexed = async (doc: DocumentWithMeiliIndex): Promise<boolean> => {
    if (!doc.messages) {
      return false;
    }
    try {
      const meiliDoc = await client.index('convos').getDocument(doc.conversationId as string);
      return Boolean(meiliDoc) && meiliDoc.title === doc.title;
    } catch (error) {
      logger.debug(
        '[mongoMeili] Convo not found in MeiliSearch and will index ' + doc.conversationId,
        error as Record<string, unknown>,
      );
      return false;
    }
  };

  const sink: SearchSink = {
    name: 'meilisearch',
    isEnabled: meiliWritesEnabled,

    async upsert(doc: SearchSyncDocument, origin: SearchSyncOrigin): Promise<void> {
      const document = asDocument(doc);
      if (!document) {
        return;
      }
      if (origin === 'findOneAndUpdate' && (await titleAlreadyIndexed(document))) {
        return;
      }
      await callHook(document, document.postSaveHook);
    },

    async remove(doc: SearchSyncDocument): Promise<void> {
      const document = asDocument(doc);
      if (!document) {
        return;
      }
      await callHook(document, document.postRemoveHook);
    },

    /**
     * `deleteMany` yields no documents, so the affected primary keys are read
     * back from Mongo before the delete lands.
     */
    async removeMany(conditions: FilterQuery<unknown>): Promise<void> {
      const { batchSize, delayMs } = syncOptions;
      try {
        if (Object.prototype.hasOwnProperty.call(schema.obj, 'messages')) {
          const convoIndex = client.index('convos');
          const deletedConvos = await mongoose
            .model('Conversation')
            .find(conditions)
            .select('conversationId')
            .lean();

          await processBatch(deletedConvos, batchSize, delayMs, async (batch) => {
            await Promise.all(
              batch.map((convo: Record<string, unknown>) =>
                convoIndex.deleteDocument(convo.conversationId as string),
              ),
            );
          });
        }

        if (Object.prototype.hasOwnProperty.call(schema.obj, 'messageId')) {
          const messageIndex = client.index('messages');
          const deletedMessages = await mongoose
            .model('Message')
            .find(conditions)
            .select('messageId')
            .lean();

          await processBatch(deletedMessages, batchSize, delayMs, async (batch) => {
            await Promise.all(
              batch.map((message: Record<string, unknown>) =>
                messageIndex.deleteDocument(message.messageId as string),
              ),
            );
          });
        }
      } catch (error) {
        logger.error(
          '[mongoMeili.removeMany] There was an issue deleting indexes upon deletion. Next startup may trigger syncing.',
          error,
        );
      }
    },
  };

  cached[MEILI_SINK] = sink;
  return sink;
}

export default createMeiliSink;
