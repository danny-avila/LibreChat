const _ = require('lodash');
const mongoose = require('mongoose');
const { MeiliSearch } = require('meilisearch');
const { parseTextParts, ContentTypes } = require('librechat-data-provider');
const { cleanUpPrimaryKeyValue } = require('~/lib/utils/misc');
const logger = require('~/config/meiliLogger');

// Environment flags
/**
 * Flag to indicate if search is enabled based on environment variables.
 * @type {boolean}
 */
const searchEnabled = process.env.SEARCH && process.env.SEARCH.toLowerCase() === 'true';

/**
 * Flag to indicate if MeiliSearch is enabled based on required environment variables.
 * @type {boolean}
 */
const meiliEnabled = process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY && searchEnabled;

/**
 * Validates the required options for configuring the mongoMeili plugin.
 *
 * @param {Object} options - The configuration options.
 * @param {string} options.host - The MeiliSearch host.
 * @param {string} options.apiKey - The MeiliSearch API key.
 * @param {string} options.indexName - The name of the index.
 * @throws {Error} Throws an error if any required option is missing.
 */
const validateOptions = function (options) {
  const requiredKeys = ['host', 'apiKey', 'indexName'];
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
 * @param {Object} config - Configuration object.
 * @param {Object} config.index - The MeiliSearch index object.
 * @param {Array<string>} config.attributesToIndex - List of attributes to index.
 * @returns {Function} A class definition that will be loaded into the Mongoose schema.
 */
const createMeiliMongooseModel = function ({ index, attributesToIndex }) {
  // The primary key is assumed to be the first attribute in the attributesToIndex array.
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
    static async syncWithMeili() {
      try {
        let moreDocuments = true;
        // Retrieve all MongoDB documents from the collection as plain JavaScript objects.
        const mongoDocuments = await this.find().lean();

        // Helper function to format a document by selecting only the attributes to index
        // and omitting keys starting with '$'.
        const format = (doc) =>
          _.omitBy(_.pick(doc, attributesToIndex), (v, k) => k.startsWith('$'));

        // Build a map of MongoDB documents for quick lookup based on the primary key.
        const mongoMap = new Map(mongoDocuments.map((doc) => [doc[primaryKey], format(doc)]));
        const indexMap = new Map();
        let offset = 0;
        const batchSize = 1000;

        // Fetch documents from the MeiliSearch index in batches.
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

        const updateOps = [];

        // Process documents present in the MeiliSearch index.
        for (const [id, doc] of indexMap) {
          const update = {};
          update[primaryKey] = id;
          if (mongoMap.has(id)) {
            // If document exists in MongoDB, check for discrepancies in key fields.
            if (
              (doc.text && doc.text !== mongoMap.get(id).text) ||
              (doc.title && doc.title !== mongoMap.get(id).title)
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
            // If the document does not exist in MongoDB, delete it from MeiliSearch.
            await index.deleteDocument(id);
            updateOps.push({
              updateOne: { filter: update, update: { $set: { _meiliIndex: false } } },
            });
          }
        }

        // Process documents present in MongoDB.
        for (const [id, doc] of mongoMap) {
          const update = {};
          update[primaryKey] = id;
          // If the document is missing in the Meili index, add it.
          if (!indexMap.has(id)) {
            await index.addDocuments([doc]);
            updateOps.push({
              updateOne: { filter: update, update: { $set: { _meiliIndex: true } } },
            });
          } else if (doc._meiliIndex === false) {
            // If the document exists but is marked as not indexed, update the flag.
            updateOps.push({
              updateOne: { filter: update, update: { $set: { _meiliIndex: true } } },
            });
          }
        }

        // Execute bulk update operations in MongoDB to update the _meiliIndex flags.
        if (updateOps.length > 0) {
          await this.collection.bulkWrite(updateOps);
          logger.debug(
            `[syncWithMeili] Finished indexing ${
              primaryKey === 'messageId' ? 'messages' : 'conversations'
            }`,
          );
        }
      } catch (error) {
        logger.error('[syncWithMeili] Error adding document to Meili', error);
      }
    }

    /**
     * Updates settings for the MeiliSearch index.
     *
     * @param {Object} settings - The settings to update on the MeiliSearch index.
     * @returns {Promise<Object>} Promise resolving to the update result.
     */
    static async setMeiliIndexSettings(settings) {
      return await index.updateSettings(settings);
    }

    /**
     * Searches the MeiliSearch index and optionally populates the results with data from MongoDB.
     *
     * @param {string} q - The search query.
     * @param {Object} params - Additional search parameters for MeiliSearch.
     * @param {boolean} populate - Whether to populate search hits with full MongoDB documents.
     * @returns {Promise<Object>} The search results with populated hits if requested.
     */
    static async meiliSearch(q, params, populate) {
      const data = await index.search(q, params);

      if (populate) {
        // Build a query using the primary key values from the search hits.
        const query = {};
        query[primaryKey] = _.map(data.hits, (hit) => cleanUpPrimaryKeyValue(hit[primaryKey]));

        // Build a projection object, including only keys that do not start with '$'.
        const projection = Object.keys(this.schema.obj).reduce(
          (results, key) => {
            if (!key.startsWith('$')) {
              results[key] = 1;
            }
            return results;
          },
          { _id: 1, __v: 1 },
        );

        // Retrieve the full documents from MongoDB.
        const hitsFromMongoose = await this.find(query, projection).lean();

        // Merge the MongoDB documents with the search hits.
        const populatedHits = data.hits.map(function (hit) {
          const query = {};
          query[primaryKey] = hit[primaryKey];
          const originalHit = _.find(hitsFromMongoose, query);

          return {
            ...(originalHit ?? {}),
            ...hit,
          };
        });
        data.hits = populatedHits;
      }

      return data;
    }

    /**
     * Preprocesses the current document for indexing.
     *
     * This method:
     *  - Picks only the defined attributes to index.
     *  - Omits any keys starting with '$'.
     *  - Replaces pipe characters ('|') in `conversationId` with '--'.
     *  - Extracts and concatenates text from an array of content items.
     *
     * @returns {Object} The preprocessed object ready for indexing.
     */
    preprocessObjectForIndex() {
      const object = _.omitBy(_.pick(this.toJSON(), attributesToIndex), (v, k) =>
        k.startsWith('$'),
      );
      if (object.conversationId && object.conversationId.includes('|')) {
        object.conversationId = object.conversationId.replace(/\|/g, '--');
      }

      if (object.content && Array.isArray(object.content)) {
        object.text = parseTextParts(object.content);
        delete object.content;
      }

      return object;
    }

    /**
     * Adds the current document to the MeiliSearch index.
     *
     * The method preprocesses the document, adds it to MeiliSearch, and then updates
     * the MongoDB document's `_meiliIndex` flag to true.
     *
     * @returns {Promise<void>}
     */
    async addObjectToMeili() {
      const object = this.preprocessObjectForIndex();
      try {
        await index.addDocuments([object]);
      } catch (error) {
        // Error handling can be enhanced as needed.
        logger.error('[addObjectToMeili] Error adding document to Meili', error);
      }

      await this.collection.updateMany({ _id: this._id }, { $set: { _meiliIndex: true } });
    }

    /**
     * Updates the current document in the MeiliSearch index.
     *
     * @returns {Promise<void>}
     */
    async updateObjectToMeili() {
      const object = _.omitBy(_.pick(this.toJSON(), attributesToIndex), (v, k) =>
        k.startsWith('$'),
      );
      await index.updateDocuments([object]);
    }

    /**
     * Deletes the current document from the MeiliSearch index.
     *
     * @returns {Promise<void>}
     */
    async deleteObjectFromMeili() {
      await index.deleteDocument(this._id);
    }

    /**
     * Post-save hook to synchronize the document with MeiliSearch.
     *
     * If the document is already indexed (i.e. `_meiliIndex` is true), it updates it;
     * otherwise, it adds the document to the index.
     */
    postSaveHook() {
      if (this._meiliIndex) {
        this.updateObjectToMeili();
      } else {
        this.addObjectToMeili();
      }
    }

    /**
     * Post-update hook to update the document in MeiliSearch.
     *
     * This hook is triggered after a document update, ensuring that changes are
     * propagated to the MeiliSearch index if the document is indexed.
     */
    postUpdateHook() {
      if (this._meiliIndex) {
        this.updateObjectToMeili();
      }
    }

    /**
     * Post-remove hook to delete the document from MeiliSearch.
     *
     * This hook is triggered after a document is removed, ensuring that the document
     * is also removed from the MeiliSearch index if it was previously indexed.
     */
    postRemoveHook() {
      if (this._meiliIndex) {
        this.deleteObjectFromMeili();
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
 * @param {mongoose.Schema} schema - The Mongoose schema to which the plugin is applied.
 * @param {Object} options - Configuration options.
 * @param {string} options.host - The MeiliSearch host.
 * @param {string} options.apiKey - The MeiliSearch API key.
 * @param {string} options.indexName - The name of the MeiliSearch index.
 * @param {string} options.primaryKey - The primary key field for indexing.
 */
module.exports = function mongoMeili(schema, options) {
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

  // Setup the MeiliSearch client.
  const client = new MeiliSearch({ host, apiKey });

  // Create the index asynchronously if it doesn't exist.
  client.createIndex(indexName, { primaryKey });

  // Setup the MeiliSearch index for this schema.
  const index = client.index(indexName);

  // Collect attributes from the schema that should be indexed.
  const attributesToIndex = [
    ..._.reduce(
      schema.obj,
      function (results, value, key) {
        return value.meiliIndex ? [...results, key] : results;
      },
      [],
    ),
  ];

  // Load the class methods into the schema.
  schema.loadClass(createMeiliMongooseModel({ index, indexName, client, attributesToIndex }));

  // Register Mongoose hooks to synchronize with MeiliSearch.

  // Post-save: synchronize after a document is saved.
  schema.post('save', function (doc) {
    doc.postSaveHook();
  });

  // Post-update: synchronize after a document is updated.
  schema.post('update', function (doc) {
    doc.postUpdateHook();
  });

  // Post-remove: synchronize after a document is removed.
  schema.post('remove', function (doc) {
    doc.postRemoveHook();
  });

  // Pre-deleteMany hook: remove corresponding documents from MeiliSearch when multiple documents are deleted.
  schema.pre('deleteMany', async function (next) {
    if (!meiliEnabled) {
      return next();
    }

    try {
      // Check if the schema has a "messages" field to determine if it's a conversation schema.
      if (Object.prototype.hasOwnProperty.call(schema.obj, 'messages')) {
        const convoIndex = client.index('convos');
        const deletedConvos = await mongoose.model('Conversation').find(this._conditions).lean();
        const promises = deletedConvos.map((convo) =>
          convoIndex.deleteDocument(convo.conversationId),
        );
        await Promise.all(promises);
      }

      // Check if the schema has a "messageId" field to determine if it's a message schema.
      if (Object.prototype.hasOwnProperty.call(schema.obj, 'messageId')) {
        const messageIndex = client.index('messages');
        const deletedMessages = await mongoose.model('Message').find(this._conditions).lean();
        const promises = deletedMessages.map((message) =>
          messageIndex.deleteDocument(message.messageId),
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

  // Post-findOneAndUpdate hook: update MeiliSearch index after a document is updated via findOneAndUpdate.
  schema.post('findOneAndUpdate', async function (doc) {
    if (!meiliEnabled) {
      return;
    }

    // If the document is unfinished, do not update the index.
    if (doc.unfinished) {
      return;
    }

    let meiliDoc;
    // For conversation documents, try to fetch the document from the "convos" index.
    if (doc.messages) {
      try {
        meiliDoc = await client.index('convos').getDocument(doc.conversationId);
      } catch (error) {
        logger.debug(
          '[MeiliMongooseModel.findOneAndUpdate] Convo not found in MeiliSearch and will index ' +
            doc.conversationId,
          error,
        );
      }
    }

    // If the MeiliSearch document exists and the title is unchanged, do nothing.
    if (meiliDoc && meiliDoc.title === doc.title) {
      return;
    }

    // Otherwise, trigger a post-save hook to synchronize the document.
    doc.postSaveHook();
  });
};
