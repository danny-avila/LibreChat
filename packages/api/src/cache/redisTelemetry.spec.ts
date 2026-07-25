import { CacheKeys } from 'librechat-data-provider';
import type { Span } from '@opentelemetry/api';
import {
  createRedisRequestTelemetry,
  finishRedisRequestTelemetry,
  instrumentIORedisClient,
  instrumentRedisCache,
  normalizeRedisUseCase,
  observeRedisOperation,
  RedisUseCases,
  runWithRedisRequestTelemetry,
} from './redisTelemetry';
import { isMetricsConfigured, recordRedisOperation } from '~/app/metrics';

jest.mock('~/app/metrics', () => ({
  isMetricsConfigured: jest.fn(() => false),
  recordRedisOperation: jest.fn(),
}));

const mockIsMetricsConfigured = jest.mocked(isMetricsConfigured);
const mockRecordRedisOperation = jest.mocked(recordRedisOperation);

function createSpan(): jest.Mocked<Pick<Span, 'setAttributes'>> {
  return {
    setAttributes: jest.fn().mockReturnThis(),
  };
}

describe('redisTelemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMetricsConfigured.mockReturnValue(false);
  });

  it('normalizes only bounded cache and explicit use cases', () => {
    expect(normalizeRedisUseCase(CacheKeys.AUTH_USER_DOC)).toBe('auth_user_doc');
    expect(normalizeRedisUseCase('MCP::ServersRegistry::Servers::tenant-123')).toBe(
      RedisUseCases.MCP_REGISTRY,
    );
    expect(normalizeRedisUseCase('violations:concurrent')).toBe(RedisUseCases.VIOLATIONS);
    expect(normalizeRedisUseCase('user-controlled-namespace')).toBe('other');
  });

  it('aggregates successful and failed operations onto the request span', async () => {
    const span = createSpan();
    const telemetry = createRedisRequestTelemetry(span as unknown as Span);

    await runWithRedisRequestTelemetry(telemetry, async () => {
      await expect(
        observeRedisOperation('keyv', CacheKeys.AUTH_USER_DOC, 'GET', async () => 'cached'),
      ).resolves.toBe('cached');
      await expect(
        observeRedisOperation('ioredis', RedisUseCases.RATE_LIMIT, 'EVAL', async () => {
          throw new Error('redis unavailable');
        }),
      ).rejects.toThrow('redis unavailable');
    });

    finishRedisRequestTelemetry(telemetry);

    expect(mockRecordRedisOperation).toHaveBeenNthCalledWith(
      1,
      'keyv',
      'auth_user_doc',
      'get',
      'success',
      expect.any(Number),
    );
    expect(mockRecordRedisOperation).toHaveBeenNthCalledWith(
      2,
      'ioredis',
      'rate_limit',
      'eval',
      'error',
      expect.any(Number),
    );

    const attributes = Object.assign({}, ...span.setAttributes.mock.calls.map(([value]) => value));
    expect(attributes).toMatchObject({
      'librechat.redis.calls': 2,
      'librechat.redis.errors': 1,
      'librechat.redis.operations': ['eval', 'get'],
      'librechat.redis.use_cases': ['auth_user_doc', 'rate_limit'],
      'librechat.redis.auth_user_doc.calls': 1,
      'librechat.redis.auth_user_doc.errors': 0,
      'librechat.redis.rate_limit.calls': 1,
      'librechat.redis.rate_limit.errors': 1,
    });
    expect(attributes['librechat.redis.duration_ms']).toEqual(expect.any(Number));
    expect(attributes['librechat.redis.max_call_ms']).toEqual(expect.any(Number));
  });

  it('does not time operations when neither metrics nor request tracing is active', async () => {
    await expect(
      observeRedisOperation('keyv', CacheKeys.APP_CONFIG, 'get', async () => 'value'),
    ).resolves.toBe('value');

    expect(mockRecordRedisOperation).not.toHaveBeenCalled();
  });

  it('counts nested Keyv delegation as one logical operation', async () => {
    const span = createSpan();
    const telemetry = createRedisRequestTelemetry(span as unknown as Span);
    const cache = instrumentRedisCache(
      {
        getMany: jest.fn(async () => ['cache-value']),
        async get() {
          return (await this.getMany())[0];
        },
      },
      CacheKeys.TOOL_CACHE,
    );

    await runWithRedisRequestTelemetry(telemetry, async () => {
      await expect(cache.get()).resolves.toBe('cache-value');
    });

    expect(telemetry.calls).toBe(1);
    expect(telemetry.operations).toEqual(new Set(['get']));
    expect(mockRecordRedisOperation).toHaveBeenCalledTimes(1);
  });

  it('records resolved ioredis pipeline command errors', async () => {
    const span = createSpan();
    const telemetry = createRedisRequestTelemetry(span as unknown as Span);
    const commandError = new Error('command failed');
    const pipeline = {
      exec: jest.fn(async () => [[commandError, null]]),
    };
    const redis = instrumentIORedisClient(
      {
        pipeline: jest.fn(() => pipeline),
      },
      RedisUseCases.GENERATION_STREAM,
    );

    await runWithRedisRequestTelemetry(telemetry, async () => {
      await expect(redis.pipeline().exec()).resolves.toEqual([[commandError, null]]);
    });

    expect(telemetry.errors).toBe(1);
    expect(mockRecordRedisOperation).toHaveBeenCalledWith(
      'ioredis',
      RedisUseCases.GENERATION_STREAM,
      'pipeline',
      'error',
      expect.any(Number),
    );
  });

  it('preserves the ioredis client constructor', () => {
    class FakeRedisClient {}

    const client = new FakeRedisClient();
    const redis = instrumentIORedisClient(client, RedisUseCases.GENERATION_STREAM);

    expect(redis.constructor).toBe(client.constructor);
    expect(redis.constructor.name).toBe('FakeRedisClient');
    expect(redis).toBeInstanceOf(FakeRedisClient);
  });

  it('instruments Keyv methods and ioredis pipelines without changing their results', async () => {
    const span = createSpan();
    const telemetry = createRedisRequestTelemetry(span as unknown as Span);
    const cache = instrumentRedisCache(
      {
        get: jest.fn(async () => 'cache-value'),
      },
      CacheKeys.TOOL_CACHE,
    );
    const pipeline = {
      get: jest.fn().mockReturnThis(),
      exec: jest.fn(async () => [['ok', 'pipeline-value']]),
    };
    const redis = instrumentIORedisClient(
      {
        get: jest.fn(async () => 'redis-value'),
        on: jest.fn().mockReturnThis(),
        pipeline: jest.fn(() => pipeline),
      },
      RedisUseCases.GENERATION_STREAM,
    );

    await runWithRedisRequestTelemetry(telemetry, async () => {
      await expect(cache.get()).resolves.toBe('cache-value');
      await expect(redis.get()).resolves.toBe('redis-value');
      await expect(redis.on().get()).resolves.toBe('redis-value');
      await expect(redis.pipeline().get('key').exec()).resolves.toEqual([['ok', 'pipeline-value']]);
    });

    expect(telemetry.calls).toBe(4);
    expect(telemetry.operations).toEqual(new Set(['get', 'pipeline']));
    expect(telemetry.useCases.has('tool_cache')).toBe(true);
    expect(telemetry.useCases.has(RedisUseCases.GENERATION_STREAM)).toBe(true);
  });
});
