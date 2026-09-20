import os from 'node:os';
import Redis from 'ioredis';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { appendFile, writeFile } from 'node:fs/promises';
import type { RedisScriptArg } from '~/cache/redisScript';
import type { ServerSentEvent } from '~/types';
import {
  infoNumber,
  sleep,
  startBenchmarkRedis,
  startLatencyProxy,
  waitUntil,
} from './helpers/redisBenchmark';
import { RedisEventTransport } from '../implementations/RedisEventTransport';
import { GenerationJobManagerClass } from '../GenerationJobManager';
import { RedisJobStore } from '../implementations/RedisJobStore';

type Mode = 'eval' | 'warm-sha-diagnostic';
type Workload = 'paced' | 'burst';
interface Scenario {
  mode: Mode;
  windowMs: number;
  streams: number;
  oneWayMs: number;
  workload: Workload;
  repetition: number;
  upstreamBytesPerSecond: number;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) throw new Error('Cannot report an empty latency distribution');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

const enabled = process.env.RUN_REDIS_STREAM_BENCHMARK === 'true';
const describeBenchmark = enabled ? describe : describe.skip;

describeBenchmark('real Redis streaming evidence (manual, no production changes)', () => {
  test('measures stable-cache EVAL and a diagnostic SHA ceiling', async () => {
    const binary = process.env.REDIS_BENCH_BINARY;
    if (!binary) throw new Error('REDIS_BENCH_BINARY must name a local redis-server executable');
    const output = path.resolve(process.env.REDIS_BENCH_OUTPUT ?? '../../.review/stream-evidence');
    const smoke = process.env.REDIS_BENCH_SMOKE === 'true';
    const bandwidthProfile = process.env.REDIS_BENCH_PROFILE === 'bandwidth';
    const profileEvents = bandwidthProfile
      ? { paced: 256, burst: 1024 }
      : { paced: 64, burst: 256 };
    const eventCounts = smoke ? { paced: 16, burst: 16 } : profileEvents;
    const profileDelays = bandwidthProfile ? [1] : [0, 1, 5];
    const profileStreams = bandwidthProfile ? [16] : [1, 16];
    const upstreamBytesPerSecond = Number(process.env.REDIS_BENCH_UPSTREAM_BYTES_PER_SECOND ?? 0);
    if (!Number.isFinite(upstreamBytesPerSecond) || upstreamBytesPerSecond < 0)
      throw new Error('Invalid bandwidth budget');
    const repeats = smoke ? 1 : 3;
    const instance = await startBenchmarkRedis(binary, output);
    const originalWindow = process.env.STREAM_DELTA_COALESCE_MS;
    const redisVersion = (await instance.admin.info('server')).match(
      /redis_version:([^\r\n]+)/,
    )?.[1];
    const metadata = {
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      node: process.version,
      harnessSourceHash: createHash('sha256')
        .update(
          execFileSync('git', [
            'diff',
            'HEAD',
            '--',
            'src/stream/__tests__/helpers/redisBenchmark.ts',
            'src/stream/__tests__/redisStreaming.perf_benchmark.manual.spec.ts',
          ]),
        )
        .digest('hex'),
      profile: bandwidthProfile ? 'bandwidth' : 'latency',
      upstreamBytesPerSecond,
      redisVersion,
      date: new Date().toISOString(),
      eventsPerStream: eventCounts,
      cpu: os.cpus()[0]?.model,
      availableParallelism: os.availableParallelism(),
      hostLoadAverage: os.loadavg(),
      matrixFilter: {
        oneWayMs: process.env.REDIS_BENCH_ONE_WAY_MS,
        repetition: process.env.REDIS_BENCH_REPETITION,
      },
      pacedIntervalMs: 20,
      repeats,
      topology: 'private standalone Redis, local Unix socket behind TCP delay proxy',
      limitations:
        'Synthetic provider deltas through real manager/store/transport. No LLM, HTTP/SSE, TLS, Cluster, cloud, or cache-failure claim. Bandwidth budget, when nonzero, is synthetic upstream only, shared by both connections. SHA diagnostic preloads scripts and never retries NOSCRIPT.',
    };
    await writeFile(path.join(output, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
    await writeFile(path.join(output, 'samples.jsonl'), '');
    try {
      if (upstreamBytesPerSecond > 0) {
        const proxy = await startLatencyProxy(instance.socketPath, 1, upstreamBytesPerSecond);
        const clients = Array.from(
          { length: 2 },
          () => new Redis({ host: '127.0.0.1', port: proxy.port, lazyConnect: true }),
        );
        try {
          await Promise.all(clients.map((client) => client.connect()));
          await Promise.all(clients.map((client) => client.ping()));
          const payload = 'x'.repeat(Math.ceil(upstreamBytesPerSecond / 8));
          const before = proxy.bytes.sent;
          const start = performance.now();
          await Promise.all(
            clients.map((client, index) => client.set(`calibration-${index}`, payload)),
          );
          const elapsedMs = performance.now() - start;
          const sentBytes = proxy.bytes.sent - before;
          const budgetMs = (sentBytes / upstreamBytesPerSecond) * 1000;
          expect(elapsedMs).toBeGreaterThanOrEqual(budgetMs * 0.9);
          expect(elapsedMs).toBeLessThan(budgetMs * 2 + 50);
          await writeFile(
            path.join(output, 'calibration.json'),
            JSON.stringify(
              { upstreamBytesPerSecond, clients: 2, sentBytes, elapsedMs, budgetMs },
              null,
              2,
            ) + '\n',
          );
        } finally {
          for (const client of clients) client.disconnect();
          await proxy.stop();
        }
      }
      const cases: Scenario[] = [];
      for (let repetition = 0; repetition < repeats; repetition++) {
        if (
          process.env.REDIS_BENCH_REPETITION != null &&
          repetition !== Number(process.env.REDIS_BENCH_REPETITION)
        )
          continue;
        for (const oneWayMs of smoke ? [0] : profileDelays) {
          if (
            process.env.REDIS_BENCH_ONE_WAY_MS != null &&
            oneWayMs !== Number(process.env.REDIS_BENCH_ONE_WAY_MS)
          )
            continue;
          for (const streams of smoke ? [1] : profileStreams) {
            for (const workload of ['paced', 'burst'] as const) {
              for (const windowMs of bandwidthProfile ? [25] : [0, 25]) {
                // Alternate mode order to reduce systematic warm-up and time drift bias.
                const modes: Mode[] =
                  repetition % 2
                    ? ['warm-sha-diagnostic', 'eval']
                    : ['eval', 'warm-sha-diagnostic'];
                for (const mode of modes)
                  cases.push({
                    mode,
                    windowMs,
                    streams,
                    oneWayMs,
                    workload,
                    repetition,
                    upstreamBytesPerSecond,
                  });
              }
            }
          }
        }
      }
      if (!cases.length) throw new Error('Matrix filters selected no scenarios');
      for (const [caseIndex, scenario] of cases.entries()) {
        const events = eventCounts[scenario.workload];
        process.env.STREAM_DELTA_COALESCE_MS = String(scenario.windowMs);
        // Only this harness's own disposable instance is ever flushed.
        await instance.admin.flushdb();
        const proxy = await startLatencyProxy(
          instance.socketPath,
          scenario.oneWayMs,
          scenario.upstreamBytesPerSecond,
        );
        const redis = new Redis({
          host: '127.0.0.1',
          port: proxy.port,
          lazyConnect: true,
          maxRetriesPerRequest: 2,
        });
        const subscriber = redis.duplicate();
        await Promise.all([redis.connect(), subscriber.connect()]);
        const store = new RedisJobStore(redis);
        const transport = new RedisEventTransport(redis, subscriber);
        const manager = new GenerationJobManagerClass();
        manager.configure({
          jobStore: store,
          eventTransport: transport,
          isRedis: true,
          cleanupOnComplete: false,
        });
        const scripts = new Map<string, { sha: string; calls: number; bytes: number }>();
        const rawEval = redis.eval.bind(redis);
        let measured = false;
        let diagnostic = false;
        let active = 0;
        let peakActive = 0;
        const emissionLatency: number[] = [];
        const deliveredLatency: number[] = [];
        const scheduledLatency: number[] = [];
        const terminalLatency: number[] = [];
        const barrierLatency: number[] = [];
        const errors: unknown[] = [];
        const starts = new Map<string, Map<number, { issued: number; scheduled: number }>>();
        const received = new Map<string, number[]>();
        const terminalStarted = new Map<string, number>();
        const terminalReceived = new Set<string>();
        const subscriptions: Array<{ unsubscribe: () => void }> = [];
        const ids = Array.from({ length: scenario.streams }, (_, i) => `bench-${caseIndex}-${i}`);
        const stepId = (id: string) => `step-${id}`;
        const event = (id: string, index: number): ServerSentEvent => ({
          event: 'on_message_delta',
          data: {
            id: stepId(id),
            benchmarkIndex: index,
            delta: { content: { type: 'text', text: 'x'.repeat(64) } },
          },
        });
        // Benchmark-only substitution. Static preloaded scripts; no fallback or queue.
        redis.eval = ((script: string, count: number, ...args: RedisScriptArg[]) => {
          let record = scripts.get(script);
          if (!record) {
            record = {
              sha: createHash('sha1').update(script).digest('hex'),
              calls: 0,
              bytes: Buffer.byteLength(script),
            };
            scripts.set(script, record);
          }
          if (measured) record.calls++;
          return diagnostic
            ? redis.evalsha(record.sha, count, ...args)
            : rawEval(script, count, ...args);
        }) as Redis['eval'];
        let sampleMemory: ReturnType<typeof setInterval> | undefined;
        const loopDelay = monitorEventLoopDelay({ resolution: 10 });
        try {
          for (const id of ids) {
            await manager.createJob(id, 'benchmark-user', id);
            starts.set(id, new Map());
            received.set(id, []);
            const subscription = await manager.subscribe(
              id,
              (chunk) => {
                const index = (chunk as { data?: { benchmarkIndex?: number } }).data
                  ?.benchmarkIndex;
                if (!measured || index == null || index < 0) return;
                const start = starts.get(id)?.get(index);
                if (!start) {
                  errors.push(new Error('Delivered event without issue timestamp'));
                  return;
                }
                received.get(id)!.push(index);
                deliveredLatency.push(performance.now() - start.issued);
                scheduledLatency.push(performance.now() - start.scheduled);
              },
              () => {
                const start = terminalStarted.get(id);
                if (measured && start != null) {
                  terminalLatency.push(performance.now() - start);
                  terminalReceived.add(id);
                }
              },
              (error) => errors.push(error),
            );
            if (!subscription) throw new Error('Missing subscription');
            subscriptions.push(subscription);
            await manager.emitChunk(id, {
              event: 'on_run_step',
              data: {
                id: stepId(id),
                runId: id,
                index: 0,
                stepDetails: { type: 'message_creation' },
              },
            });
            await manager.emitChunk(id, event(id, -2));
            await store.flushPendingAppends(id);
            await transport.flushPendingChunks(id);
            await manager.emitChunk(id, event(id, -1), { durable: true });
          }
          // Capture terminal scripts on a separate warm-up generation, outside measurement.
          await manager.createJob('terminal-warmup', 'benchmark-user', 'terminal-warmup');
          await manager.emitDone('terminal-warmup', { final: true });
          await sleep(50 + scenario.oneWayMs * 4);
          for (const script of scripts.keys()) await instance.admin.script('LOAD', script);
          const pings: number[] = [];
          for (let i = 0; i < 10; i++) {
            const start = performance.now();
            await redis.ping();
            pings.push(performance.now() - start);
          }
          const beforeInfo = await instance.admin.info();
          const beforeMemory = process.memoryUsage();
          let peakHeap = beforeMemory.heapUsed;
          let peakRss = beforeMemory.rss;
          sampleMemory = setInterval(() => {
            const current = process.memoryUsage();
            peakHeap = Math.max(peakHeap, current.heapUsed);
            peakRss = Math.max(peakRss, current.rss);
          }, 10);
          const beforeCpu = process.cpuUsage();
          const beforeBytes = { ...proxy.bytes };
          await waitUntil(() => proxy.shaping.queuedBytes === 0);
          proxy.shaping.peakQueuedBytes = 0;
          const started = performance.now();
          diagnostic = scenario.mode === 'warm-sha-diagnostic';
          measured = true;
          loopDelay.enable();
          await Promise.all(
            ids.map(async (id) => {
              for (let index = 0; index < events; index++) {
                const scheduled = started + (scenario.workload === 'paced' ? index * 20 : 0);
                if (scheduled > performance.now()) await sleep(scheduled - performance.now());
                const issued = performance.now();
                starts.get(id)!.set(index, { issued, scheduled });
                active++;
                peakActive = Math.max(peakActive, active);
                const barrier = index === Math.floor(events / 2);
                await manager.emitChunk(
                  id,
                  event(id, index),
                  barrier ? { durable: true } : undefined,
                );
                const latency = performance.now() - issued;
                emissionLatency.push(latency);
                if (barrier) barrierLatency.push(latency);
                active--;
              }
              await store.flushPendingAppends(id);
              await transport.flushPendingChunks(id);
              terminalStarted.set(id, performance.now());
              await manager.emitDone(id, { final: true });
            }),
          );
          await waitUntil(
            () =>
              terminalReceived.size === ids.length &&
              deliveredLatency.length >= events * ids.length,
          );
          const elapsedMs = performance.now() - started;
          measured = false;
          diagnostic = false;
          loopDelay.disable();
          clearInterval(sampleMemory);
          const cpu = process.cpuUsage(beforeCpu);
          const afterMemory = process.memoryUsage();
          const traffic = {
            sent: proxy.bytes.sent - beforeBytes.sent,
            received: proxy.bytes.received - beforeBytes.received,
          };
          const afterInfo = await instance.admin.info();
          expect(errors).toEqual([]);
          const expected = Array.from({ length: events }, (_, index) => index);
          for (const id of ids) {
            expect(received.get(id)).toEqual(expected);
            const durable = await redis.xrange(`stream:{${id}}:chunks`, '-', '+');
            const indices = durable
              .map(([, fields]) => JSON.parse(fields[1]) as { data?: { benchmarkIndex?: number } })
              .map((chunk) => chunk.data?.benchmarkIndex)
              .filter((index) => index != null && index >= 0);
            expect(indices).toEqual(expected);
          }
          const evalCalls = [...scripts.values()].reduce((sum, script) => sum + script.calls, 0);
          const scriptBodyBytes = [...scripts.values()].reduce(
            (sum, script) => sum + script.calls * script.bytes,
            0,
          );
          const cpuMs = (field: string) =>
            (infoNumber(afterInfo, field) - infoNumber(beforeInfo, field)) * 1000;
          const result = {
            ...scenario,
            measuredRttMs: percentile(pings, 0.5),
            events: deliveredLatency.length,
            elapsedMs,
            eventsPerSecond: (deliveredLatency.length / elapsedMs) * 1000,
            deliveryP50Ms: percentile(deliveredLatency, 0.5),
            deliveryP95Ms: percentile(deliveredLatency, 0.95),
            deliveryP99Ms: percentile(deliveredLatency, 0.99),
            scheduledP99Ms: percentile(scheduledLatency, 0.99),
            emitP99Ms: percentile(emissionLatency, 0.99),
            barrierP95Ms: percentile(barrierLatency, 0.95),
            terminalP95Ms: percentile(terminalLatency, 0.95),
            evalCalls,
            scriptBodyBytes,
            transmittedScriptBytes: scenario.mode === 'eval' ? scriptBodyBytes : evalCalls * 40,
            sentBytes: traffic.sent,
            receivedBytes: traffic.received,
            redisCommands:
              infoNumber(afterInfo, 'total_commands_processed') -
              infoNumber(beforeInfo, 'total_commands_processed'),
            nodeCpuMs: (cpu.user + cpu.system) / 1000,
            redisCpuMs: cpuMs('used_cpu_sys') + cpuMs('used_cpu_user'),
            heapDeltaBytes: afterMemory.heapUsed - beforeMemory.heapUsed,
            peakHeapDeltaBytes: peakHeap - beforeMemory.heapUsed,
            peakRssDeltaBytes: peakRss - beforeMemory.rss,
            redisMemoryDeltaBytes:
              infoNumber(afterInfo, 'used_memory') - infoNumber(beforeInfo, 'used_memory'),
            eventLoopP99Ms: loopDelay.percentile(99) / 1e6,
            peakActiveEmissions: peakActive,
            peakProxyQueuedBytes: proxy.shaping.peakQueuedBytes,
            scripts: [...scripts.values()].filter((script) => script.calls > 0),
          };
          await appendFile(path.join(output, 'samples.jsonl'), JSON.stringify(result) + '\n');
          console.log(
            JSON.stringify({
              sample: caseIndex + 1,
              total: cases.length,
              ...scenario,
              eventsPerSecond: Math.round(result.eventsPerSecond),
              deliveryP99Ms: Math.round(result.deliveryP99Ms),
              sentBytes: result.sentBytes,
            }),
          );
        } finally {
          measured = false;
          diagnostic = false;
          if (sampleMemory) clearInterval(sampleMemory);
          loopDelay.disable();
          for (const subscription of subscriptions) subscription.unsubscribe();
          await manager.destroy({ settlementBudgetMs: 0 });
          redis.disconnect();
          subscriber.disconnect();
          await proxy.stop();
        }
      }
    } finally {
      if (originalWindow === undefined) delete process.env.STREAM_DELTA_COALESCE_MS;
      else process.env.STREAM_DELTA_COALESCE_MS = originalWindow;
      await instance.stop();
    }
  }, 900000);
});
