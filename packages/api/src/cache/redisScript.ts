import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Redis, Cluster } from 'ioredis';

export type RedisScriptArg = string | number | Buffer;
export type RedisScriptResult = string | number | boolean | null | undefined | RedisScriptResult[];
export type RedisScriptClient = Pick<Redis | Cluster, 'eval' | 'evalsha'>;

const scriptShas = new Map<string, string>();
const unsupportedEvalshaScripts = new WeakMap<object, Set<string>>();

const evalshaFallbackContext = new AsyncLocalStorage<boolean>();

function scriptUsesEvalOnly(client: RedisScriptClient, script: string): boolean {
  return unsupportedEvalshaScripts.get(client)?.has(script) === true;
}

function markScriptEvalOnly(client: RedisScriptClient, script: string): void {
  const scripts = unsupportedEvalshaScripts.get(client) ?? new Set<string>();
  scripts.add(script);
  unsupportedEvalshaScripts.set(client, scripts);
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
  return (
    error instanceof Error &&
    error.message.toUpperCase().includes('NOPERM') &&
    error.message.toUpperCase().includes('EVALSHA')
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
  if (scriptUsesEvalOnly(client, script)) {
    return (await client.eval(script, numberOfKeys, ...args)) as RedisScriptResult;
  }
  try {
    return (await evalshaFallbackContext.run(true, () =>
      client.evalsha(scriptSha(script), numberOfKeys, ...args),
    )) as RedisScriptResult;
  } catch (error) {
    if (!isEvalshaFallbackError(error)) {
      throw error;
    }
    if (isEvalshaPermissionError(error)) {
      markScriptEvalOnly(client, script);
    }
    return (await client.eval(script, numberOfKeys, ...args)) as RedisScriptResult;
  }
}
