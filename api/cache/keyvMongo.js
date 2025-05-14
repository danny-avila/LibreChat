// api/cache/keyvMongo.js
const mongoose = require('mongoose');
const EventEmitter = require('events');
const { GridFSBucket } = require('mongodb');
const { logger } = require('~/config');

const storeMap = new Map();

class KeyvMongoCustom extends EventEmitter {
  constructor(url, options = {}) {
    super();

    url = url || {};
    if (typeof url === 'string') {
      url = { url };
    }
    if (url.uri) {
      url = { url: url.uri, ...url };
    }

    this.opts = {
      url: 'mongodb://127.0.0.1:27017',
      collection: 'keyv',
      ...url,
      ...options,
    };

    this.ttlSupport = false;

    // Filter valid options
    const keyvMongoKeys = new Set([
      'url',
      'collection',
      'namespace',
      'serialize',
      'deserialize',
      'uri',
      'useGridFS',
      'dialect',
    ]);
    this.opts = Object.fromEntries(Object.entries(this.opts).filter(([k]) => keyvMongoKeys.has(k)));
  }

  // Helper to access the store WITHOUT storing a promise on the instance
  _getClient() {
    const storeKey = `${this.opts.collection}:${this.opts.useGridFS ? 'gridfs' : 'collection'}`;

    // If we already have the store initialized, return it directly
    if (storeMap.has(storeKey)) {
      return Promise.resolve(storeMap.get(storeKey));
    }

    // Check mongoose connection state
    if (mongoose.connection.readyState !== 1) {
      return Promise.reject(
        new Error('Mongoose connection not ready. Ensure connectDb() is called first.'),
      );
    }

    try {
      const db = mongoose.connection.db;
      let client;

      if (this.opts.useGridFS) {
        const bucket = new GridFSBucket(db, {
          readPreference: this.opts.readPreference,
          bucketName: this.opts.collection,
        });
        const store = db.collection(`${this.opts.collection}.files`);
        client = { bucket, store, db };
      } else {
        const collection = this.opts.collection || 'keyv';
        const store = db.collection(collection);
        client = { store, db };
      }

      storeMap.set(storeKey, client);
      return Promise.resolve(client);
    } catch (error) {
      this.emit('error', error);
      return Promise.reject(error);
    }
  }

  async get(key) {
    const client = await this._getClient();

    if (this.opts.useGridFS) {
      await client.store.updateOne(
        {
          filename: key,
        },
        {
          $set: {
            'metadata.lastAccessed': new Date(),
          },
        },
      );

      const stream = client.bucket.openDownloadStreamByName(key);

      return new Promise((resolve) => {
        const resp = [];
        stream.on('error', () => {
          resolve(undefined);
        });

        stream.on('end', () => {
          const data = Buffer.concat(resp).toString('utf8');
          resolve(data);
        });

        stream.on('data', (chunk) => {
          resp.push(chunk);
        });
      });
    }

    const document = await client.store.findOne({ key: { $eq: key } });

    if (!document) {
      return undefined;
    }

    return document.value;
  }

  async getMany(keys) {
    const client = await this._getClient();

    if (this.opts.useGridFS) {
      const promises = [];
      for (const key of keys) {
        promises.push(this.get(key));
      }

      const values = await Promise.allSettled(promises);
      const data = [];
      for (const value of values) {
        data.push(value.value);
      }

      return data;
    }

    const values = await client.store
      .find({ key: { $in: keys } })
      .project({ _id: 0, value: 1, key: 1 })
      .toArray();

    const results = [...keys];
    let i = 0;
    for (const key of keys) {
      const rowIndex = values.findIndex((row) => row.key === key);
      results[i] = rowIndex > -1 ? values[rowIndex].value : undefined;
      i++;
    }

    return results;
  }

  async set(key, value, ttl) {
    const client = await this._getClient();
    const expiresAt = typeof ttl === 'number' ? new Date(Date.now() + ttl) : null;

    if (this.opts.useGridFS) {
      const stream = client.bucket.openUploadStream(key, {
        metadata: {
          expiresAt,
          lastAccessed: new Date(),
        },
      });

      return new Promise((resolve) => {
        stream.on('finish', () => {
          resolve(stream);
        });
        stream.end(value);
      });
    }

    await client.store.updateOne(
      { key: { $eq: key } },
      { $set: { key, value, expiresAt } },
      { upsert: true },
    );
  }

  async delete(key) {
    if (typeof key !== 'string') {
      return false;
    }

    const client = await this._getClient();

    if (this.opts.useGridFS) {
      try {
        const bucket = new GridFSBucket(client.db, {
          bucketName: this.opts.collection,
        });
        const files = await bucket.find({ filename: key }).toArray();
        await client.bucket.delete(files[0]._id);
        return true;
      } catch {
        return false;
      }
    }

    const object = await client.store.deleteOne({ key: { $eq: key } });
    return object.deletedCount > 0;
  }

  async deleteMany(keys) {
    const client = await this._getClient();

    if (this.opts.useGridFS) {
      const bucket = new GridFSBucket(client.db, {
        bucketName: this.opts.collection,
      });
      const files = await bucket.find({ filename: { $in: keys } }).toArray();
      if (files.length === 0) {
        return false;
      }

      await Promise.all(files.map(async (file) => client.bucket.delete(file._id)));
      return true;
    }

    const object = await client.store.deleteMany({ key: { $in: keys } });
    return object.deletedCount > 0;
  }

  async clear() {
    const client = await this._getClient();

    if (this.opts.useGridFS) {
      try {
        await client.bucket.drop();
      } catch (error) {
        // Throw error if not "namespace not found" error
        if (!(error.code === 26)) {
          throw error;
        }
      }
    }

    await client.store.deleteMany({
      key: { $regex: this.namespace ? `^${this.namespace}:*` : '' },
    });
  }

  async has(key) {
    const client = await this._getClient();
    const filter = { [this.opts.useGridFS ? 'filename' : 'key']: { $eq: key } };
    const document = await client.store.countDocuments(filter, { limit: 1 });
    return document !== 0;
  }

  // No-op disconnect
  async disconnect() {
    // This is a no-op since we don't want to close the shared mongoose connection
    return true;
  }
}

const keyvMongo = new KeyvMongoCustom({
  collection: 'logs',
});

keyvMongo.on('error', (err) => logger.error('KeyvMongo connection error:', err));

module.exports = keyvMongo;
