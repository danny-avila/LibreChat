import _ from 'lodash';
import { MeiliSearch, Index } from 'meilisearch';
import type {
  CallbackWithoutResultAndOptionalError,
  FilterQuery,
  Document,
  Schema,
  Query,
  Types,
  Model,
} from 'mongoose';
import logger from '~/config/meiliLogger';

interface MongoMeiliOptions {
  host: string;
  apiKey: string;
  indexName: string;
  primaryKey: string;
  mongoose: typeof import('mongoose');
}

interface MeiliIndexable {
  [key: string]: unknown;
  _meiliIndex?: boolean;
}

interface ContentItem {
  type: string;
  text?: string;
}

interface DocumentWithMeiliIndex extends Document {
  _meiliIndex?: boolean;
  preprocessObjectForIndex?: () => Record<string, unknown>;
  addObjectToMeili?: (next: CallbackWithoutResultAndOptionalError) => Promise<void>;
  updateObjectToMeili?: (next: CallbackWithoutResultAndOptionalError) => Promise<void>;
  deleteObjectFromMeili?: (next: CallbackWithoutResultAndOptionalError) => Promise<void>;
  postSaveHook?: (next: CallbackWithoutResultAndOptionalError) => void;
  postUpdateHook?: (next: CallbackWithoutResultAndOptionalError) => void;
  postRemoveHook?: (next: CallbackWithoutResultAndOptionalError) => void;
  conversationId?: string;
  content?: ContentItem[];
  messageId?: string;
  unfinished?: boolean;
  messages?: unknown[];
  title?: string;
  toJSON(): Record<string, unknown>;
}

interface SchemaWithMeiliMethods extends Model<DocumentWithMeiliIndex> {
  syncWithMeili(): Promise<void>;
  setMeiliIndexSettings(settings: Record<string, unknown>): Promise<unknown>;
  meiliSearch(q: string, params: Record<string, unknown>, populate: boolean): Promise<unknown>;
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
 * Factory function to create a MeiliMongooseModel class which extends a Mongoose model.
 * This class contains static and instance methods to synchronize and manage the MeiliSearch index
 * corresponding to the MongoDB collection.
 *
 * @param config - Configuration object.
 * @param config.index - The MeiliSearch index object.
 * @param config.attributesToIndex - List of attributes to index.
 * @returns A class definition that will be loaded into the Mongoose schema.
 */
const createMeiliMongooseModel = ({
  index,
  attributesToIndex,
}: {
  index: Index<MeiliIndexable>;
  attributesToIndex: string[];
}) => {
  const primaryKey = attributesToIndex[0];

  class MeiliMongooseModel {
    /**
     * Synchronizes the data between the MongoDB collection and the MeiliSearch index.
     *
     * The synchronization process involves:
     *   1. Fetching all documents from the MongoDB collection and MeiliSearch index.
     *   2. Comparing documents from both sources.
     *   3. Deleting documents from MeiliSearch that no longer exist in MongoDB.
     *   4. Adding documents to MeiliSearch that exist in MongoDB but not in the index.
     *   5. Updating documents in MeiliSearch if key fields (such as `text` or `title`) differ.
     *   6. Updating the `_meiliIndex` field in MongoDB to indicate the indexing status.
     *
     * Note: The function processes documents in batches because MeiliSearch's
     * `index.getDocuments` requires an exact limit and `index.addDocuments` does not handle
     * partial failures in a batch.
     *
     * @returns {Promise<void>} Resolves when the synchronization is complete.
     */
    static async syncWithMeili(this: SchemaWithMeiliMethods): Promise<void> {
      try {
        let moreDocuments = true;
        const mongoDocuments = await this.find().lean();

        const format = (doc: Record<string, unknown>) =>
          _.omitBy(_.pick(doc, attributesToIndex), (v, k) => k.startsWith('$'));

        const mongoMap = new Map(
          mongoDocuments.map((doc) => {
            const typedDoc = doc as Record<string, unknown>;
            return [typedDoc[primaryKey], format(typedDoc)];
          }),
        );
        const indexMap = new Map<unknown, Record<string, unknown>>();
        let offset = 0;
        const batchSize = 1000;

        while (moreDocuments) {
          const batch = await index.getDocuments({ limit: batchSize, offset });
          if (batch.results.length === 0) {
            moreDocuments = false;
          }
          for (const doc of batch.results) {
            indexMap.set(doc[primaryKey], format(doc));
          }
          offset += batchSize;
        }

        logger.debug('[syncWithMeili]', { indexMap: indexMap.size, mongoMap: mongoMap.size });

        const updateOps: Array<{
          updateOne: {
            filter: Record<string, unknown>;
            update: { $set: { _meiliIndex: boolean } };
          };
        }> = [];

        // Process documents present in the MeiliSearch index
        for (const [id, doc] of indexMap) {
          const update: Record<string, unknown> = {};
          update[primaryKey] = id;
          if (mongoMap.has(id)) {
            const mongoDoc = mongoMap.get(id);
            if (
              (doc.text && doc.text !== mongoDoc?.text) ||
              (doc.title && doc.title !== mongoDoc?.title)
            ) {
              logger.debug(
                `[syncWithMeili] ${id} had document discrepancy in ${
                  doc.text ? 'text' : 'title'
                } field`,
              );
              updateOps.push({
                updateOne: { filter: update, update: { $set: { _meiliIndex: true } } },
              });
              await index.addDocuments([doc]);
            }
          } else {
            await index.deleteDocument(id as string);
            updateOps.push({
              updateOne: { filter: update, update: { $set: { _meiliIndex: false } } },
            });
          }
        }

        // Process documents present in MongoDB
        for (const [id, doc] of mongoMap) {
          const update: Record<string, unknown> = {};
          update[primaryKey] = id;
          if (!indexMap.has(id)) {
            await index.addDocuments([doc]);
            updateOps.push({
              updateOne: { filter: update, update: { $set: { _meiliIndex: true } } },
            });
          } else if (doc._meiliIndex === false) {
            updateOps.push({
              updateOne: { filter: update, update: { $set: { _meiliIndex: true } } },
            });
          }
        }

        if (updateOps.length > 0) {
          await this.collection.bulkWrite(updateOps);
          logger.debug(
            `[syncWithMeili] Finished indexing ${
              primaryKey === 'messageId' ? 'messages' : 'conversations'
            }`,
          );
        }
      } catch (error) {
        logger.error('[syncWithMeili] Error adding document to Meili:', error);
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
    ): Promise<unknown> {
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
     * Adds the current document to the MeiliSearch index
     */
    async addObjectToMeili(
      this: DocumentWithMeiliIndex,
      next: CallbackWithoutResultAndOptionalError,
    ): Promise<void> {
      const object = this.preprocessObjectForIndex!();
      try {
        await index.addDocuments([object]);
      } catch (error) {
        logger.error('[addObjectToMeili] Error adding document to Meili:', error);
        return next();
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

  const client = new MeiliSearch({ host, apiKey });
  client.createIndex(indexName, { primaryKey });
  const index = client.index<MeiliIndexable>(indexName);

  // Collect attributes from the schema that should be indexed
  const attributesToIndex: string[] = [
    ...Object.entries(schema.obj).reduce<string[]>((results, [key, value]) => {
      const schemaValue = value as { meiliIndex?: boolean };
      return schemaValue.meiliIndex ? [...results, key] : results;
    }, []),
  ];

  schema.loadClass(createMeiliMongooseModel({ index, attributesToIndex }));

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

      if (Object.prototype.hasOwnProperty.call(schema.obj, 'messages')) {
        const convoIndex = client.index('convos');
        const deletedConvos = await mongoose
          .model('Conversation')
          .find(conditions as FilterQuery<unknown>)
          .lean();
        const promises = deletedConvos.map((convo: Record<string, unknown>) =>
          convoIndex.deleteDocument(convo.conversationId as string),
        );
        await Promise.all(promises);
      }

      if (Object.prototype.hasOwnProperty.call(schema.obj, 'messageId')) {
        const messageIndex = client.index('messages');
        const deletedMessages = await mongoose
          .model('Message')
          .find(conditions as FilterQuery<unknown>)
          .lean();
        const promises = deletedMessages.map((message: Record<string, unknown>) =>
          messageIndex.deleteDocument(message.messageId as string),
        );
        await Promise.all(promises);
      }
      return next();
    } catch (error) {
      if (meiliEnabled) {
        logger.error(
          '[MeiliMongooseModel.deleteMany] There was an issue deleting conversation indexes upon deletion. Next startup may be slow due to syncing.',
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
