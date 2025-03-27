const fs = require('fs');
const ioredis = require('ioredis');
const KeyvRedis = require('@keyv/redis');
const { isEnabled } = require('~/server/utils');
const logger = require('~/config/winston');

const { REDIS_URI, USE_REDIS, USE_REDIS_CLUSTER, REDIS_CA, REDIS_KEY_PREFIX, REDIS_MAX_LISTENERS } =
  process.env;

let keyvRedis;
const redis_prefix = REDIS_KEY_PREFIX || '';
const redis_max_listeners = Number(REDIS_MAX_LISTENERS) || 40;

function mapURI(uri) {
  const regex =
    /^(?:(?<scheme>\w+):\/\/)?(?:(?<user>[^:@]+)(?::(?<password>[^@]+))?@)?(?<host>[\w.-]+)(?::(?<port>\d{1,5}))?$/;
  const match = uri.match(regex);

  if (match) {
    const { scheme, user, password, host, port } = match.groups;

    return {
      scheme: scheme || 'none',
      user: user || null,
      password: password || null,
      host: host || null,
      port: port || null,
    };
  } else {
    const parts = uri.split(':');
    if (parts.length === 2) {
      return {
        scheme: 'none',
        user: null,
        password: null,
        host: parts[0],
        port: parts[1],
      };
    }

    return {
      scheme: 'none',
      user: null,
      password: null,
      host: uri,
      port: null,
    };
  }
}

if (REDIS_URI && isEnabled(USE_REDIS)) {
  let redisOptions = null;
  let keyvOpts = {
    useRedisSets: false,
    keyPrefix: redis_prefix,
  };

  if (REDIS_CA) {
    const ca = fs.readFileSync(REDIS_CA);
    redisOptions = { tls: { ca } };
  }

  if (isEnabled(USE_REDIS_CLUSTER)) {
    const hosts = REDIS_URI.split(',').map((item) => {
      var value = mapURI(item);

      return {
        host: value.host,
        port: value.port,
      };
    });
    const cluster = new ioredis.Cluster(hosts, { redisOptions });
    keyvRedis = new KeyvRedis(cluster, keyvOpts);
  } else {
    keyvRedis = new KeyvRedis(REDIS_URI, keyvOpts);
  }
  keyvRedis.on('error', (err) => logger.error('KeyvRedis connection error:', err));
  keyvRedis.setMaxListeners(redis_max_listeners);
  logger.info(
    '[Optional] Redis initialized. If you have issues, or seeing older values, disable it or flush cache to refresh values.',
  );
} else {
  logger.info('[Optional] Redis not initialized.');
}

module.exports = keyvRedis;
