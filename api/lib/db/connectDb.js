require('dotenv').config();
const mongoose = require('mongoose');
const { registerModels } = require('@librechat/data-schemas');

if (!process.env.MONGO_URI) {
  throw new Error('Please define the MONGO_URI environment variable');
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDb(mongoUri = process.env.MONGO_URI) {
  if (cached.conn && cached.conn?._readyState === 1) {
    return cached.conn;
  }

  const disconnected = cached.conn && cached.conn?._readyState !== 1;
  if (!cached.promise || disconnected) {
    const opts = {
      bufferCommands: false,
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      // bufferMaxEntries: 0,
      // useFindAndModify: true,
      // useCreateIndex: true
    };

    mongoose.set('strictQuery', true);
    cached.promise = mongoose.connect(mongoUri, opts).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;

  // Register models once
  if (!cached.models) {
    cached.models = registerModels(mongoose);
  }

  return cached.conn;
}

function getModels() {
  return cached.models;
}
module.exports = {
  connectDb,
  getModels,
  get models() {
    if (!cached.models) {
      throw new Error('Models not registered. ');
    }
    return cached.models;
  },
};
