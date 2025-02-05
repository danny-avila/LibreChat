const KeyvRedis = require('@keyv/redis');
const { isEnabled } = require('~/server/utils');
<<<<<<< HEAD
const logger = require('~/config/winston');
=======
const fs = require('fs');
const ioredis = require('ioredis');
>>>>>>> 82717228 (feat: Enhance Redis support with cluster configuration and TLS options)

const { REDIS_URI, USE_REDIS, USE_REDIS_CLUSTER, REDIS_CA } = process.env;

let keyvRedis;

if (REDIS_URI && isEnabled(USE_REDIS)) {
  let redisOptions = null;
  let keyvOpts = { useRedisSets: false };
  let keyvRedis;
  if (REDIS_CA) {
    const ca = fs.readFileSync(REDIS_CA);
    redisOptions = { tls: { ca } };
  }
  if (USE_REDIS_CLUSTER) {
    const hosts = REDIS_URI.split(',').map((host) => {return { url: host }});
    const cluster = new ioredis.Cluster(hosts, { redisOptions });
    keyvRedis = new KeyvRedis(cluster, keyvOpts);
  } else {
    keyvRedis = new KeyvRedis(REDIS_URI, keyvOpts);
  }
  keyvRedis.on('error', (err) => logger.error('KeyvRedis connection error:', err));
  keyvRedis.setMaxListeners(20);
  logger.info(
    '[Optional] Redis initialized. Note: Redis support is experimental. If you have issues, disable it. Cache needs to be flushed for values to refresh.',
  );
} else {
  logger.info('[Optional] Redis not initialized. Note: Redis support is experimental.');
}

module.exports = keyvRedis;
