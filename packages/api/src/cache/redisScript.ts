import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Redis, Cluster } from 'ioredis';

export type RedisScriptArg = string | number | Buffer;
export type RedisScriptResult = string | number | boolean | null | undefined | RedisScriptResult[];
export type RedisScriptClient = Pick<Redis | Cluster, 'eval' | 'evalsha'>;

const scriptShas = new Map<string, string>();
const unsupportedEvalshaClients = new WeakSet<object>();
const inFlightScriptLoads = new WeakMap<object, Map<string, Promise<RedisScriptResult>>>();

function scriptLoadsFor(client: RedisScriptClient): Map<string, Promise<RedisScriptResult>> {
  let loads = inFlightScriptLoads.get(client);
  if (loads == null) {
    loads = new Map<string, Promise<RedisScriptResult>>();
    inFlightScriptLoads.set(client, loads);
  }
  return loads;
}

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
  const inFlight = inFlightScriptLoads.get(client)?.get(sha);
  if (inFlight) {
    await inFlight;
    return evalScript(client, script, numberOfKeys, ...args);
  }

  try {
    return (await evalshaCall()) as RedisScriptResult;
  } catch (error) {
    if (!isEvalshaFallbackError(error)) {
      throw error;
    }

    const loads = scriptLoadsFor(client);
    const existingLoad = loads.get(sha);
    if (existingLoad) {
      await existingLoad;
      return evalScript(client, script, numberOfKeys, ...args);
    }

    if (isEvalshaPermissionError(error)) {
      markClientEvalOnly(client);
    }
    const load = client.eval(script, numberOfKeys, ...args) as Promise<RedisScriptResult>;
    const trackedLoad = load.finally(() => {
      if (loads.get(sha) === trackedLoad) {
        loads.delete(sha);
      }
    });
    loads.set(sha, trackedLoad);
    return await trackedLoad;
  }
}
