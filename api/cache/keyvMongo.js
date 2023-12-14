const KeyvMongo = require('@keyv/mongo');
const { logger } = require('~/config');

const { MONGO_URI } = process.env ?? {};

const keyvMongo = new KeyvMongo(MONGO_URI, { collection: 'logs' });
keyvMongo.on('error', (err) => logger.error('KeyvMongo connection error:', err));

module.exports = keyvMongo;
