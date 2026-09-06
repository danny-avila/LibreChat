import { acquireCompactionLock, withConversationStartLock } from '../lock';
import { cacheConfig } from '~/cache';

const mockRedis = { set: jest.fn(), eval: jest.fn() };

jest.mock('~/cache', () => ({
  cacheConfig: { USE_REDIS: true },
  ioredisClient: {},
  instrumentIORedisClient: () => mockRedis,
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('conversation admission lease', () => {
  beforeEach(() => {
    cacheConfig.USE_REDIS = true;
    mockRedis.set.mockReset();
    mockRedis.eval.mockReset().mockResolvedValue(1);
  });

  it('refuses registration during a Redis outage and permits recovery', async () => {
    const start = jest.fn(async () => undefined);
    mockRedis.set.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(withConversationStartLock('outage', start)).rejects.toMatchObject({
      statusCode: 503,
      code: 'CONVERSATION_LOCK_UNAVAILABLE',
    });
    expect(start).not.toHaveBeenCalled();

    mockRedis.set.mockResolvedValueOnce('OK');
    const recovered = await acquireCompactionLock('outage');
    expect(recovered).not.toBeNull();
    await recovered?.release();
  });

  it('refuses registration when another replica owns the lease', async () => {
    const start = jest.fn(async () => undefined);
    mockRedis.set.mockResolvedValueOnce(null);

    await expect(withConversationStartLock('remote-owner', start)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONVERSATION_BUSY',
    });
    expect(start).not.toHaveBeenCalled();
  });

  it('releases the lease when registration fails', async () => {
    cacheConfig.USE_REDIS = false;
    const failure = new Error('Registration failed');

    await expect(
      withConversationStartLock('failed-start', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    const compaction = await acquireCompactionLock('failed-start');
    expect(compaction).not.toBeNull();
    await compaction?.release();
  });
});
