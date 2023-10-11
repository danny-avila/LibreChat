const KeyvRedis = require('@keyv/redis');

const { REDIS_URI } = process.env;

let keyvRedis;

if (REDIS_URI) {
  keyvRedis = new KeyvRedis(REDIS_URI, { useRedisSets: false });
  keyvRedis.on('error', (err) => console.error('KeyvRedis connection error:', err));
} else {
  // console.log('REDIS_URI not provided. Redis module will not be initialized.');
}

module.exports = keyvRedis;
