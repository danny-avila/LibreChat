import IoRedis from 'ioredis';
import { duplicateIoRedisClient } from './redisUtils';

describe('duplicateIoRedisClient', () => {
  it('applies overrides to a single-node duplicate', () => {
    const client = new IoRedis({ host: '127.0.0.1', port: 6379, lazyConnect: true });
    const duplicate = duplicateIoRedisClient(client, { enableOfflineQueue: false });
    try {
      expect(duplicate.options.enableOfflineQueue).toBe(false);
      expect(client.options.enableOfflineQueue).not.toBe(false);
    } finally {
      duplicate.disconnect();
      client.disconnect();
    }
  });

  it('applies overrides to a cluster duplicate, whose options come second', () => {
    const client = new IoRedis.Cluster([{ host: '127.0.0.1', port: 6379 }], {
      lazyConnect: true,
    });
    const duplicate = duplicateIoRedisClient(client, { enableOfflineQueue: false });
    try {
      /** `Cluster.duplicate` reads its first argument as startup nodes, so passing the
       * overrides positionally silently keeps the original's queueing behaviour. */
      expect(duplicate.options.enableOfflineQueue).toBe(false);
      expect(client.options.enableOfflineQueue).not.toBe(false);
    } finally {
      duplicate.disconnect();
      client.disconnect();
    }
  });
});
