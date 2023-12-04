const mongoose = require('mongoose');
const { MeiliSearch } = require('meilisearch');
const { cleanUpPrimaryKeyValue } = require('../../lib/utils/misc');
const _ = require('lodash');
const searchEnabled = process.env.SEARCH && process.env.SEARCH.toLowerCase() === 'true';
const meiliEnabled = process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY && searchEnabled;

const validateOptions = function (options) {
  const requiredKeys = ['host', 'apiKey', 'indexName'];
  requiredKeys.forEach((key) => {
    if (!options[key]) {
      throw new Error(`Missing mongoMeili Option: ${key}`);
    }
  });
};

// const createMeiliMongooseModel = function ({ index, indexName, client, attributesToIndex }) {
const createMeiliMongooseModel = function ({ index, attributesToIndex }) {
  const primaryKey = attributesToIndex[0];
  // MeiliMongooseModel is of type Mongoose.Model
  class MeiliMongooseModel {
    /**
     * `syncWithMeili`: synchronizes the data between a MongoDB collection and a MeiliSearch index,
     * only triggered if there's ever a discrepancy determined by `api\lib\db\indexSync.js`.
     *
     * 1. Fetches all documents from the MongoDB collection and the MeiliSearch index.
     * 2. Compares the documents from both sources.
     * 3. If a document exists in MeiliSearch but not in MongoDB, it's deleted from MeiliSearch.
     * 4. If a document exists in MongoDB but not in MeiliSearch, it's added to MeiliSearch.
     * 5. If a document exists in both but has different `text` or `title` fields (depending on the `primaryKey`), it's updated in MeiliSearch.
     * 6. After all operations, it updates the `_meiliIndex` field in MongoDB to indicate whether the document is indexed in MeiliSearch.
     *
     * Note: This strategy does not use batch operations for Meilisearch as the `index.addDocuments` will discard
     * the entire batch if there's an error with one document, and will not throw an error if there's an issue.
     * Also, `index.getDocuments` needs an exact limit on the amount of documents to return, so we build the map in batches.
     *
     * @returns {Promise} A promise that resolves when the synchronization is complete.
     *
     * @throws {Error} Throws an error if there's an issue with adding a document to MeiliSearch.
     */
    static async syncWithMeili() {
      try {
        let moreDocuments = true;
        const mongoDocuments = await this.find().lean();
        const format = (doc) => _.pick(doc, attributesToIndex);

        // Prepare for comparison
        const mongoMap = new Map(mongoDocuments.map((doc) => [doc[primaryKey], format(doc)]));
        const indexMap = new Map();
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

        console.log('indexMap', indexMap.size);
        console.log('mongoMap', mongoMap.size);

        const updateOps = [];

        // Iterate over Meili index documents
        for (const [id, doc] of indexMap) {
          const update = {};
          update[primaryKey] = id;
          if (mongoMap.has(id)) {
            // Case: Update
            // If document also exists in MongoDB, would be update case
            if (
              (doc.text && doc.text !== mongoMap.get(id).text) ||
              (doc.title && doc.title !== mongoMap.get(id).title)
            ) {
              console.log(`${id} had document discrepancy in ${doc.text ? 'text' : 'title'} field`);
              updateOps.push({
                updateOne: { filter: update, update: { $set: { _meiliIndex: true } } },
              });
              await index.addDocuments([doc]);
            }
          } else {
            // Case: Delete
            // If document does not exist in MongoDB, its a delete case from meili index
            await index.deleteDocument(id);
            updateOps.push({
              updateOne: { filter: update, update: { $set: { _meiliIndex: false } } },
            });
          }
        }

        // Iterate over MongoDB documents
        for (const [id, doc] of mongoMap) {
          const update = {};
          update[primaryKey] = id;
          // Case: Insert
          // If document does not exist in Meili Index, Its an insert case
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
          console.log(
            `[Meilisearch] Finished indexing ${
              primaryKey === 'messageId' ? 'messages' : 'conversations'
            }`,
          );
        }
      } catch (error) {
        console.log('[Meilisearch] Error adding document to Meili');
        console.error(error);
      }
    }

    // Set one or more settings of the meili index
    static async setMeiliIndexSettings(settings) {
      return await index.updateSettings(settings);
    }

    // Search the index
    static async meiliSearch(q, params, populate) {
      const data = await index.search(q, params);

      // Populate hits with content from mongodb
      if (populate) {
        // Find objects into mongodb matching `objectID` from Meili search
        const query = {};
        // query[primaryKey] = { $in: _.map(data.hits, primaryKey) };
        query[primaryKey] = _.map(data.hits, (hit) => cleanUpPrimaryKeyValue(hit[primaryKey]));
        // console.log('query', query);
        const hitsFromMongoose = await this.find(
          query,
          _.reduce(
            this.schema.obj,
            function (results, value, key) {
              return { ...results, [key]: 1 };
            },
            { _id: 1 },
          ),
        ).lean();

        // Add additional data from mongodb into Meili search hits
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

    preprocessObjectForIndex() {
      const object = _.pick(this.toJSON(), attributesToIndex);
      // NOTE: MeiliSearch does not allow | in primary key, so we replace it with - for Bing convoIds
      // object.conversationId = object.conversationId.replace(/\|/g, '-');
      if (object.conversationId && object.conversationId.includes('|')) {
        object.conversationId = object.conversationId.replace(/\|/g, '--');
      }
      return object;
    }

    // Push new document to Meili
    async addObjectToMeili() {
      const object = this.preprocessObjectForIndex();
      try {
        // console.log('Adding document to Meili', object);
        await index.addDocuments([object]);
      } catch (error) {
        // console.log('Error adding document to Meili');
        // console.error(error);
      }

      await this.collection.updateMany({ _id: this._id }, { $set: { _meiliIndex: true } });
    }

    // Update an existing document in Meili
    async updateObjectToMeili() {
      const object = _.pick(this.toJSON(), attributesToIndex);
      await index.updateDocuments([object]);
    }

    // Delete a document from Meili
    async deleteObjectFromMeili() {
      await index.deleteDocument(this._id);
    }

    // * schema.post('save')
    postSaveHook() {
      if (this._meiliIndex) {
        this.updateObjectToMeili();
      } else {
        this.addObjectToMeili();
      }
    }

    // * schema.post('update')
    postUpdateHook() {
      if (this._meiliIndex) {
        this.updateObjectToMeili();
      }
    }

    // * schema.post('remove')
    postRemoveHook() {
      if (this._meiliIndex) {
        this.deleteObjectFromMeili();
      }
    }
  }

  return MeiliMongooseModel;
};

module.exports = function mongoMeili(schema, options) {
  // Vaidate Options for mongoMeili
  validateOptions(options);

  // Add meiliIndex to schema
  schema.add({
    _meiliIndex: {
      type: Boolean,
      required: false,
      select: false,
      default: false,
    },
  });

  const { host, apiKey, indexName, primaryKey } = options;

  // Setup MeiliSearch Client
  const client = new MeiliSearch({ host, apiKey });

  // Asynchronously create the index
  client.createIndex(indexName, { primaryKey });

  // Setup the index to search for this schema
  const index = client.index(indexName);

  const attributesToIndex = [
    ..._.reduce(
      schema.obj,
      function (results, value, key) {
        return value.meiliIndex ? [...results, key] : results;
        // }, []), '_id'];
      },
      [],
    ),
  ];

  schema.loadClass(createMeiliMongooseModel({ index, indexName, client, attributesToIndex }));

  // Register hooks
  schema.post('save', function (doc) {
    doc.postSaveHook();
  });
  schema.post('update', function (doc) {
    doc.postUpdateHook();
  });
  schema.post('remove', function (doc) {
    doc.postRemoveHook();
  });

  schema.pre('deleteMany', async function (next) {
    if (!meiliEnabled) {
      next();
    }

    try {
      if (Object.prototype.hasOwnProperty.call(schema.obj, 'messages')) {
        const convoIndex = client.index('convos');
        const deletedConvos = await mongoose.model('Conversation').find(this._conditions).lean();
        let promises = [];
        for (const convo of deletedConvos) {
          promises.push(convoIndex.deleteDocument(convo.conversationId));
        }
        await Promise.all(promises);
      }

      if (Object.prototype.hasOwnProperty.call(schema.obj, 'messageId')) {
        const messageIndex = client.index('messages');
        const deletedMessages = await mongoose.model('Message').find(this._conditions).lean();
        let promises = [];
        for (const message of deletedMessages) {
          promises.push(messageIndex.deleteDocument(message.messageId));
        }
        await Promise.all(promises);
      }
      return next();
    } catch (error) {
      if (meiliEnabled) {
        console.log(
          '[Meilisearch] There was an issue deleting conversation indexes upon deletion, next startup may be slow due to syncing',
        );
        console.error(error);
      }
      return next();
    }
  });

  schema.post('findOneAndUpdate', async function (doc) {
    if (!meiliEnabled) {
      return;
    }

    if (doc.unfinished) {
      return;
    }

    let meiliDoc;
    // Doc is a Conversation
    if (doc.messages) {
      try {
        meiliDoc = await client.index('convos').getDocument(doc.conversationId);
      } catch (error) {
        console.log('[Meilisearch] Convo not found and will index', doc.conversationId);
      }
    }

    if (meiliDoc && meiliDoc.title === doc.title) {
      return;
    }

    doc.postSaveHook();
  });
};
