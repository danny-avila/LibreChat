const KeyvRedis = require('@keyv/redis');
const redis = require('./redis');

const keyvRedis = new KeyvRedis(redis, { useRedisSets: false });

keyvRedis.on('error', (err) => console.error('KeyvRedis connection error:', err));

module.exports = keyvRedis;
