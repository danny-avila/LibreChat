import type { RedisClientType } from '@redis/client';
import { scanKeys } from './redisUtils';

describe('scanKeys', () => {
  it('flattens node-redis v5 scan pages', async () => {
    const client = {
      scanIterator: async function* () {
        yield ['first', 'second'];
        yield ['third'];
      },
    } as unknown as RedisClientType;

    await expect(scanKeys(client, 'cache:*')).resolves.toEqual(['first', 'second', 'third']);
  });
});
