const KeyvMongo = require('@keyv/mongo');
const { MONGO_URI } = process.env ?? {};

const keyvMongo = new KeyvMongo(MONGO_URI, { collection: 'cache' });
keyvMongo.on('error', (err) => console.error('KeyvMongo connection error:', err));

module.exports = keyvMongo;
