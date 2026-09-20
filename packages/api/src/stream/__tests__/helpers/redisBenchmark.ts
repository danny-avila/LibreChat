import net from 'node:net';
import Redis from 'ioredis';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, open } from 'node:fs/promises';
import type { Socket } from 'node:net';

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function waitUntil(predicate: () => boolean, timeoutMs = 15000): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() > deadline) {
      throw new Error('Benchmark delivery deadline exceeded');
    }
    await sleep(5);
  }
}

export function infoNumber(info: string, key: string): number {
  const line = info.split('\r\n').find((item) => item.startsWith(`${key}:`));
  if (!line) {
    throw new Error(`Missing Redis INFO field: ${key}`);
  }
  return Number(line.slice(key.length + 1));
}

/** Always owns its server. Never accepts a REDIS_URI or flushes an existing service. */
export async function startBenchmarkRedis(binary: string, outputDirectory: string) {
  await mkdir(outputDirectory, { recursive: true });
  const directory = await mkdtemp(path.join(outputDirectory, 'server-'));
  const socketPath = path.relative(process.cwd(), path.join(directory, 'redis.sock'));
  const log = await open(path.join(directory, 'redis.log'), 'w');
  const server = spawn(
    path.resolve(binary),
    ['--port', '0', '--unixsocket', 'redis.sock', '--save', '', '--appendonly', 'no'],
    { cwd: directory, stdio: ['ignore', log.fd, log.fd] },
  );
  let spawnError: Error | undefined;
  server.on('error', (error) => {
    spawnError = error;
  });
  const admin = new Redis({
    path: socketPath,
    lazyConnect: true,
    retryStrategy: () => 25,
    maxRetriesPerRequest: 20,
  });
  admin.on('error', () => undefined);
  try {
    await sleep(100);
    if (spawnError || server.exitCode !== null)
      throw spawnError ?? new Error(`Redis exited: ${server.exitCode}`);
    await admin.connect();
    await admin.ping();
  } catch (error) {
    admin.disconnect();
    server.kill();
    await log.close();
    throw error;
  }
  return {
    admin,
    socketPath,
    async stop(): Promise<void> {
      admin.disconnect();
      if (server.exitCode === null && server.signalCode === null) {
        const stopped = once(server, 'exit');
        server.kill('SIGTERM');
        await stopped;
      }
      await log.close();
    },
  };
}

/** Symmetric per-chunk delay, not bandwidth shaping. Both publisher and subscriber use it. */
export async function startLatencyProxy(socketPath: string, oneWayMs: number) {
  const sockets = new Set<Socket>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const bytes = { sent: 0, received: 0 };
  const proxy = net.createServer((front) => {
    const back = net.connect(socketPath);
    for (const socket of [front, back]) {
      sockets.add(socket);
      socket.setNoDelay(true);
      socket.on('error', () => {
        front.destroy();
        back.destroy();
      });
      socket.on('close', () => sockets.delete(socket));
    }
    const forward = (destination: Socket, data: Buffer): void => {
      if (oneWayMs === 0) {
        if (!destination.destroyed) destination.write(data);
        return;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!destination.destroyed) destination.write(data);
      }, oneWayMs);
      timers.add(timer);
    };
    front.on('data', (data: Buffer) => {
      bytes.sent += data.length;
      forward(back, data);
    });
    back.on('data', (data: Buffer) => {
      bytes.received += data.length;
      forward(front, data);
    });
    front.on('close', () => back.destroy());
    back.on('close', () => front.destroy());
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const address = proxy.address();
  if (address == null || typeof address === 'string') throw new Error('Missing proxy port');
  return {
    port: address.port,
    bytes,
    async stop(): Promise<void> {
      for (const timer of timers) clearTimeout(timer);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        proxy.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
