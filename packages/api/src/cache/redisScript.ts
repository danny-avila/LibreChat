import { createHash } from 'node:crypto';
import type { Redis, Cluster } from 'ioredis';

export type RedisScriptArg = string | number | Buffer;
export type RedisScriptResult = string | number | boolean | null | undefined | RedisScriptResult[];
export type RedisScriptClient = Pick<Redis | Cluster, 'eval' | 'evalsha'>;

const scriptShas = new Map<string, string>();

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
  try {
    return (await client.evalsha(scriptSha(script), numberOfKeys, ...args)) as RedisScriptResult;
  } catch (error) {
    if (!isEvalshaFallbackError(error)) {
      throw error;
    }
    return (await client.eval(script, numberOfKeys, ...args)) as RedisScriptResult;
  }
}
