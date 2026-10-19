import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import type { HashJob, HashReply } from './hash-worker';

type HashRequest =
  | { op: 'hash'; plain: string; rounds: number }
  | { op: 'compare'; plain: string; hash: string };

interface Pending {
  resolve: (value: string | boolean) => void;
  reject: (error: Error) => void;
}

interface HashWorker {
  worker: Worker;
  pending: Map<number, Pending>;
}

export interface HashPool {
  hash: (plain: string, rounds: number) => Promise<string>;
  compare: (plain: string, hash: string) => Promise<boolean>;
  close: () => Promise<void>;
}

/**
 * Runs bcrypt on a small pool of worker threads. bcryptjs is pure JavaScript, so hashing on the
 * main thread (sync, or its chunked async API) stalls every other request for the whole hash.
 * Workers start on demand and hold the process open only while they have work.
 */
export function createHashPool(
  workerPath: string,
  size: number = Math.max(1, Math.min(4, availableParallelism() - 1)),
): HashPool {
  const workers: HashWorker[] = [];
  let nextId = 0;

  const spawn = (): HashWorker => {
    const worker = new Worker(workerPath, { execArgv: [] });
    worker.unref();
    const entry: HashWorker = { worker, pending: new Map() };
    const fail = (): void => {
      const index = workers.indexOf(entry);
      if (index !== -1) workers.splice(index, 1);
      for (const { reject } of entry.pending.values()) {
        reject(new Error('Password hashing worker stopped'));
      }
      entry.pending.clear();
    };
    worker.on('message', (reply: HashReply) => {
      const pending = entry.pending.get(reply.id);
      if (!pending) return;
      entry.pending.delete(reply.id);
      if (entry.pending.size === 0) worker.unref();
      if (reply.ok) pending.resolve(reply.value);
      else pending.reject(new Error('Password hashing failed'));
    });
    worker.on('error', fail);
    worker.on('exit', fail);
    workers.push(entry);
    return entry;
  };

  const pick = (): HashWorker => {
    let least: HashWorker | undefined;
    for (const entry of workers) {
      if (!least || entry.pending.size < least.pending.size) least = entry;
    }
    if (!least || (least.pending.size > 0 && workers.length < size)) return spawn();
    return least;
  };

  const run = (request: HashRequest): Promise<string | boolean> =>
    new Promise((resolve, reject) => {
      const entry = pick();
      const id = nextId++;
      entry.pending.set(id, { resolve, reject });
      if (entry.pending.size === 1) entry.worker.ref();
      entry.worker.postMessage({ id, ...request } satisfies HashJob);
    });

  return {
    hash: async (plain, rounds) => (await run({ op: 'hash', plain, rounds })) as string,
    compare: async (plain, hash) => (await run({ op: 'compare', plain, hash })) as boolean,
    close: async () => {
      await Promise.all(workers.map((entry) => entry.worker.terminate()));
    },
  };
}

let pool: HashPool | undefined;

function getHashPool(): HashPool {
  pool ??= createHashPool(
    path.join(path.dirname(require.resolve('@librechat/api')), 'auth/hash-worker.cjs'),
  );
  return pool;
}

/** bcrypt hash of `plain` at cost `rounds`, computed off the event loop. */
export function hashSecret(plain: string, rounds = 10): Promise<string> {
  return getHashPool().hash(plain, rounds);
}

/** Whether `plain` matches the bcrypt `hash`, checked off the event loop. */
export function compareSecret(plain: string, hash: string): Promise<boolean> {
  return getHashPool().compare(plain, hash);
}
