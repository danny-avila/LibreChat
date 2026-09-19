import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Redis, Cluster } from 'ioredis';

export type RedisScriptArg = string | number | Buffer;
export type RedisScriptResult = string | number | boolean | null | undefined | RedisScriptResult[];
export type RedisScriptClient = Pick<Redis | Cluster, 'eval' | 'evalsha'>;

const scriptShas = new Map<string, string>();
const unsupportedEvalshaClients = new WeakSet<object>();
const inFlightClientLoads = new WeakMap<object, Promise<RedisScriptResult>>();

const evalshaFallbackContext = new AsyncLocalStorage<boolean>();

function scriptUsesEvalOnly(client: RedisScriptClient): boolean {
  return unsupportedEvalshaClients.has(client);
}

function markClientEvalOnly(client: RedisScriptClient): void {
  unsupportedEvalshaClients.add(client);
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
  const evalshaCall = () =>
    evalshaFallbackContext.run(true, () => client.evalsha(sha, numberOfKeys, ...args));
  const inFlight = inFlightClientLoads.get(client);
  if (inFlight) {
    try {
      await inFlight;
    } catch {
      // A failed load belongs to the caller that issued it; retry independently.
    }
    return evalScript(client, script, numberOfKeys, ...args);
  }

  try {
    return (await evalshaCall()) as RedisScriptResult;
  } catch (error) {
    if (!isEvalshaFallbackError(error)) {
      throw error;
    }

    const existingLoad = inFlightClientLoads.get(client);
    if (existingLoad) {
      try {
        await existingLoad;
      } catch {
        // Retry with this call's own Redis keys after another caller's load failed.
      }
      return evalScript(client, script, numberOfKeys, ...args);
    }

    if (isEvalshaPermissionError(error)) {
      markClientEvalOnly(client);
    }
    const load = Promise.resolve(
      client.eval(script, numberOfKeys, ...args),
    ) as Promise<RedisScriptResult>;
    const trackedLoad = load.finally(() => {
      if (inFlightClientLoads.get(client) === trackedLoad) {
        inFlightClientLoads.delete(client);
      }
    });
    inFlightClientLoads.set(client, trackedLoad);
    return await trackedLoad;
  }
}
