import { createHash } from 'node:crypto';
import calculateSlot from 'cluster-key-slot';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Redis, Cluster } from 'ioredis';

export type RedisScriptArg = string | number | Buffer;
export type RedisScriptResult = string | number | boolean | null | undefined | RedisScriptResult[];
export type RedisScriptClient = Pick<Redis | Cluster, 'eval' | 'evalsha'>;

const scriptShas = new Map<string, string>();
const unsupportedEvalshaClients = new WeakSet<object>();
const confirmedShasByClient = new WeakMap<object, Map<string, Set<string>>>();

const inFlightLoadsByKey = new WeakMap<object, Map<string, Promise<RedisScriptResult>>>();

function confirmedShasFor(client: RedisScriptClient, confirmationKey: string): Set<string> {
  let confirmedByKey = confirmedShasByClient.get(client);
  if (confirmedByKey == null) {
    confirmedByKey = new Map<string, Set<string>>();
    confirmedShasByClient.set(client, confirmedByKey);
  }
  let confirmed = confirmedByKey.get(confirmationKey);
  if (confirmed == null) {
    confirmed = new Set<string>();
    confirmedByKey.set(confirmationKey, confirmed);
  }
  return confirmed;
}

function loadsFor(client: RedisScriptClient): Map<string, Promise<RedisScriptResult>> {
  let loads = inFlightLoadsByKey.get(client);
  if (loads == null) {
    loads = new Map<string, Promise<RedisScriptResult>>();
    inFlightLoadsByKey.set(client, loads);
  }
  return loads;
}

function firstScriptKey(args: RedisScriptArg[]): string | Buffer {
  const firstKey = args[0];
  return typeof firstKey === 'string' || Buffer.isBuffer(firstKey) ? firstKey : '';
}

function scriptOrderingKey(args: RedisScriptArg[]): string {
  const firstKey = firstScriptKey(args);
  const value = Buffer.isBuffer(firstKey) ? firstKey.toString() : firstKey;
  const open = value.indexOf('{');
  const close = value.indexOf('}', open + 1);
  return open >= 0 && close > open ? value.slice(open, close + 1) : value;
}

const evalshaFallbackContext = new AsyncLocalStorage<boolean>();

function scriptUsesEvalOnly(client: RedisScriptClient): boolean {
  return unsupportedEvalshaClients.has(client);
}

function markClientEvalOnly(client: RedisScriptClient): void {
  unsupportedEvalshaClients.add(client);
}

export function resetScriptStateForTests(client: RedisScriptClient): void {
  unsupportedEvalshaClients.delete(client);
  confirmedShasByClient.delete(client);
  inFlightLoadsByKey.delete(client);
}
function scriptSha(script: string): string {
  let sha = scriptShas.get(script);
  if (sha == null) {
    sha = createHash('sha1').update(script).digest('hex');
    scriptShas.set(script, sha);
  }
  return sha;
}
export function isNoScriptError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('NOSCRIPT');
}

export function isEvalshaFallbackError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toUpperCase();
  return (
    message.includes('NOSCRIPT') ||
    (message.includes('NOPERM') && message.includes('EVALSHA')) ||
    (message.includes('UNKNOWN COMMAND') && message.includes('EVALSHA'))
  );
}

function isEvalshaPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toUpperCase();
  return (
    message.includes('EVALSHA') &&
    (message.includes('NOPERM') || message.includes('UNKNOWN COMMAND'))
  );
}

export function isEvalshaFallbackInProgress(): boolean {
  return evalshaFallbackContext.getStore() === true;
}

/**
 * Runs a Lua script by its SHA1 (EVALSHA) so only the 40-byte digest crosses the wire on
 * every call, and falls back to EVAL — which also loads the script into the server cache —
 * when the server reports NOSCRIPT (first use, restart, SCRIPT FLUSH). Same semantics,
 * atomicity, key slotting and return value as `client.eval(script, ...)`.
 */
export async function evalScript(
  client: RedisScriptClient,
  script: string,
  numberOfKeys: number,
  ...args: RedisScriptArg[]
): Promise<RedisScriptResult> {
  if (scriptUsesEvalOnly(client)) {
    return (await client.eval(script, numberOfKeys, ...args)) as RedisScriptResult;
  }
  const sha = scriptSha(script);
  const orderingKey = scriptOrderingKey(args);
  const confirmationKey = (client as RedisScriptClient & { isCluster?: boolean }).isCluster
    ? String(calculateSlot(firstScriptKey(args)))
    : '';
  const confirmed = confirmedShasFor(client, confirmationKey);
  const loads = loadsFor(client);
  const evalshaCall = () =>
    evalshaFallbackContext.run(true, () => client.evalsha(sha, numberOfKeys, ...args));

  const inFlight = loads.get(orderingKey);
  if (inFlight) {
    try {
      await inFlight;
    } catch {
      // A failed load belongs to the caller that issued it; retry independently.
    }
    return evalScript(client, script, numberOfKeys, ...args);
  }

  if (confirmed.has(sha)) {
    try {
      return (await evalshaCall()) as RedisScriptResult;
    } catch (error) {
      if (!isNoScriptError(error)) {
        throw error;
      }
      // SCRIPT FLUSH or a node restart can invalidate a previously confirmed SHA.
      confirmed.delete(sha);
      return evalScript(client, script, numberOfKeys, ...args);
    }
  }

  // Register the gate before issuing EVALSHA. This closes the cold window where a
  // direct append could otherwise overtake a batch call that has not yet returned NOSCRIPT.
  const load = (async () => {
    try {
      const result = await evalshaCall();
      confirmed.add(sha);
      return result as RedisScriptResult;
    } catch (error) {
      if (!isEvalshaFallbackError(error)) {
        throw error;
      }

      if (isEvalshaPermissionError(error)) {
        markClientEvalOnly(client);
      }
      const result = await client.eval(script, numberOfKeys, ...args);
      if (!isEvalshaPermissionError(error)) {
        confirmed.add(sha);
      }
      return result as RedisScriptResult;
    }
  })();
  const trackedLoad = load.finally(() => {
    if (loads.get(orderingKey) === trackedLoad) {
      loads.delete(orderingKey);
    }
  });
  loads.set(orderingKey, trackedLoad);
  return await trackedLoad;
}
