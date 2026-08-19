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

  it('disables the offline queue on cluster node connections', () => {
    const client = new IoRedis.Cluster([{ host: '127.0.0.1', port: 6379 }], {
      lazyConnect: true,
    });
    const duplicate = duplicateIoRedisClient(client, { enableOfflineQueue: false });
    const node = new IoRedis({
      host: '127.0.0.1',
      port: 6380,
      lazyConnect: true,
      enableOfflineQueue: true,
    });
    try {
      expect(node.options.enableOfflineQueue).toBe(true);
      duplicate.emit('+node', node);
      expect(node.options.enableOfflineQueue).toBe(false);
    } finally {
      node.disconnect();
      duplicate.disconnect();
      client.disconnect();
    }
  });
});
