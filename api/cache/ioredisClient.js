const fs = require('fs');
const Redis = require('ioredis');
const { isEnabled } = require('~/server/utils');
const logger = require('~/config/winston');

const { REDIS_URI, USE_REDIS, USE_REDIS_CLUSTER, REDIS_CA, REDIS_MAX_LISTENERS } = process.env;

/** @type {import('ioredis').Redis | import('ioredis').Cluster} */
let ioredisClient;
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
    ioredisClient = new Redis.Cluster(hosts, { redisOptions });
  } else {
    ioredisClient = new Redis(REDIS_URI, redisOptions);
  }

  ioredisClient.on('ready', () => {
    logger.info('IoRedis connection ready');
  });
  ioredisClient.on('reconnecting', () => {
    logger.info('IoRedis connection reconnecting');
  });
  ioredisClient.on('end', () => {
    logger.info('IoRedis connection ended');
  });
  ioredisClient.on('close', () => {
    logger.info('IoRedis connection closed');
  });
  ioredisClient.on('error', (err) => logger.error('IoRedis connection error:', err));
  ioredisClient.setMaxListeners(redis_max_listeners);
  logger.info(
    '[Optional] IoRedis initialized for rate limiters. If you have issues, disable Redis or restart the server.',
  );
} else {
  logger.info('[Optional] IoRedis not initialized for rate limiters.');
}

module.exports = ioredisClient;
