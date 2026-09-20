import Redis from 'ioredis';
import path from 'node:path';
import { startBenchmarkRedis, startLatencyProxy } from './helpers/redisBenchmark';

const describeManual = process.env.RUN_REDIS_STREAM_BENCHMARK === 'true' ? describe : describe.skip;

describeManual('private bandwidth fixture FIFO contract', () => {
  test('preserves commands and replies across mixed-size chunks and concurrent connections', async () => {
    const binary = process.env.REDIS_BENCH_BINARY;
    if (!binary) throw new Error('REDIS_BENCH_BINARY is required');
    const instance = await startBenchmarkRedis(
      binary,
      path.resolve('../../.review/shaper-contract'),
    );
    const proxy = await startLatencyProxy(instance.socketPath, 1, 1048576);
    const clients = Array.from(
      { length: 2 },
      () => new Redis({ host: '127.0.0.1', port: proxy.port, lazyConnect: true }),
    );
    try {
      await Promise.all(clients.map((client) => client.connect()));
      await Promise.all(
        clients.map(async (client, clientIndex) => {
          const key = `client-${clientIndex}`;
          const values = Array.from(
            { length: 128 },
            (_, index) => `${index}:` + 'x'.repeat(index % 7 === 0 ? 20000 : 17),
          );
          const replies = await Promise.all(values.map((value) => client.rpush(key, value)));
          expect(replies).toEqual(values.map((_, index) => index + 1));
          expect(await client.lrange(key, 0, -1)).toEqual(values);
        }),
      );
    } finally {
      for (const client of clients) client.disconnect();
      await proxy.stop();
      await instance.stop();
    }
  }, 15000);
});
