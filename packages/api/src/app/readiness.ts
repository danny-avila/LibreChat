import type { RedisClientType, RedisClusterType } from '@redis/client';
import type { Request, Response } from 'express';
import type { Redis, Cluster } from 'ioredis';
import { ioredisClient, keyvRedisClient } from '~/cache/redisClients';
import { cacheConfig } from '~/cache/cacheConfig';

export type RedisReadinessClients = {
  useRedis: boolean;
  ioredis: Pick<Redis | Cluster, 'status'> | null;
  keyv: Pick<RedisClientType, 'isReady'> | Pick<RedisClusterType, 'isOpen'> | null;
};

/**
 * Whether the shared Redis clients can serve commands. Always true when Redis is disabled.
 * A configured client that is missing, reconnecting, closed or ended counts as not ready,
 * because requests that touch the cache (sessions, OAuth state, rate limits) fail until it
 * recovers. Node Redis clusters expose only `isOpen`, so that is the signal used for them.
 */
export function isRedisReady(
  clients: RedisReadinessClients = {
    useRedis: cacheConfig.USE_REDIS,
    ioredis: ioredisClient,
    keyv: keyvRedisClient,
  },
): boolean {
  if (!clients.useRedis) {
    return true;
  }
  const { ioredis, keyv } = clients;
  if (ioredis?.status !== 'ready' || keyv == null) {
    return false;
  }
  return 'isReady' in keyv ? keyv.isReady : keyv.isOpen;
}

/**
 * `/readyz` handler: 503 until startup completes, and again whenever Redis is configured
 * but disconnected, so readiness-gated orchestration stops routing to a pod that cannot
 * serve authenticated traffic. `/livez` stays unconditional so a Redis blip does not
 * trigger a liveness restart loop.
 */
export const createReadinessHandler =
  (isServerReady: () => boolean, isDependencyReady: () => boolean = isRedisReady) =>
  (_req: Request, res: Response): void => {
    if (!isServerReady() || !isDependencyReady()) {
      res.status(503).send('NOT_READY');
      return;
    }
    res.status(200).send('OK');
  };
