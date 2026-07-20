import { logger } from '@librechat/data-schemas';

import type { RequestScopedMCPConnectionStore } from './types';

export interface MCPRequestContext extends RequestScopedMCPConnectionStore {
  cleanupStarted: boolean;
  cleanupOnResponse: boolean;
  responseCleanupAttached: boolean;
}

export interface MCPRequestContextOptions {
  cleanupOnResponse?: boolean;
}

interface MCPResponseLike {
  writableEnded?: boolean;
  finished?: boolean;
  destroyed?: boolean;
  once?: (event: 'finish' | 'close', listener: () => void) => unknown;
}

interface Disconnectable {
  disconnect: () => Promise<unknown> | unknown;
}

const contexts = new WeakMap<object, MCPRequestContext>();

export function createMCPRequestContext(): MCPRequestContext {
  return {
    connections: new Map<string, unknown>(),
    pending: new Map<string, Promise<unknown>>(),
    cleanupStarted: false,
    cleanupOnResponse: true,
    responseCleanupAttached: false,
  };
}

function isDisconnectable(value: unknown): value is Disconnectable {
  return (
    value != null &&
    typeof value === 'object' &&
    'disconnect' in value &&
    typeof value.disconnect === 'function'
  );
}

export async function cleanupMCPRequestContext(context?: MCPRequestContext): Promise<void> {
  if (!context || context.cleanupStarted) {
    return;
  }
  context.cleanupStarted = true;

  const connections = new Set<Disconnectable>();
  for (const connection of context.connections.values()) {
    if (isDisconnectable(connection)) {
      connections.add(connection);
    }
  }

  const pending = Array.from(context.pending.values());
  if (pending.length > 0) {
    const settled = await Promise.allSettled(pending);
    for (const result of settled) {
      if (result.status === 'fulfilled' && isDisconnectable(result.value)) {
        connections.add(result.value);
      }
    }
  }

  await Promise.allSettled(
    Array.from(connections).map(async (connection) => {
      try {
        await connection.disconnect();
      } catch (error) {
        logger.warn('[MCP Request Context] Failed to disconnect request-scoped connection', error);
      }
    }),
  );

  context.connections.clear();
  context.pending.clear();
}

function isResponseFinished(res?: MCPResponseLike): boolean {
  return Boolean(res?.writableEnded || res?.finished || res?.destroyed);
}

function runCleanup(context: MCPRequestContext): void {
  cleanupMCPRequestContext(context).catch((error) => {
    logger.warn('[MCP Request Context] Cleanup failed', error);
  });
}

function attachResponseCleanup(context: MCPRequestContext, res?: MCPResponseLike): void {
  if (!res || context.responseCleanupAttached || context.cleanupOnResponse === false) {
    return;
  }

  const cleanup = () => runCleanup(context);
  if (isResponseFinished(res)) {
    cleanup();
    return;
  }

  if (typeof res.once !== 'function') {
    return;
  }

  context.responseCleanupAttached = true;
  res.once('finish', cleanup);
  res.once('close', cleanup);

  if (isResponseFinished(res)) {
    cleanup();
  }
}

export function getMCPRequestContext(
  req?: object,
  res?: MCPResponseLike,
  options: MCPRequestContextOptions = {},
): MCPRequestContext | undefined {
  if (!req) {
    return undefined;
  }

  const cleanupOnResponse = options.cleanupOnResponse !== false;
  let context = contexts.get(req);
  if (!context) {
    if (cleanupOnResponse && isResponseFinished(res)) {
      return undefined;
    }

    context = createMCPRequestContext();
    context.cleanupOnResponse = cleanupOnResponse;
    contexts.set(req, context);
  } else if (!cleanupOnResponse) {
    context.cleanupOnResponse = false;
  }

  if (cleanupOnResponse) {
    attachResponseCleanup(context, res);
  }

  return context.cleanupStarted ? undefined : context;
}

export async function cleanupMCPRequestContextForReq(req?: object): Promise<void> {
  if (!req) {
    return;
  }

  const context = contexts.get(req);
  if (!context) {
    return;
  }

  try {
    await cleanupMCPRequestContext(context);
  } finally {
    contexts.delete(req);
  }
}
