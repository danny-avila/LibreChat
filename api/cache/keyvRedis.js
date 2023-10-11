const KeyvRedis = require('@keyv/redis');
const { REDIS_URI = '' } = process.env ?? {};

const keyvRedis = new KeyvRedis(REDIS_URI, { useRedisSets: false });

keyvRedis.on('error', (err) => console.error('KeyvRedis connection error:', err));

module.exports = keyvRedis;
