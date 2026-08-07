import { logger } from '@librechat/data-schemas';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { MCPOptions } from './types';

const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 30_000;

/** A complete tool-list snapshot and the cache scope it belongs to. */
export interface MCPToolsChangedEvent {
  serverName: string;
  tools: Tool[];
  serverConfig: MCPOptions;
  userId?: string;
}

export type MCPToolsChangedHandler = (event: MCPToolsChangedEvent) => Promise<void> | void;

interface PendingToolsChange {
  latest: MCPToolsChangedEvent;
  generation: number;
  handledGeneration: number;
  failures: number;
  refreshPromise: Promise<void> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

let handler: MCPToolsChangedHandler | null = null;
const pendingChanges = new Map<string, PendingToolsChange>();

function getChangeKey(event: MCPToolsChangedEvent): string {
  return JSON.stringify([event.userId ?? null, event.serverName]);
}

function clearRetryTimer(change: PendingToolsChange): void {
  if (change.retryTimer) {
    clearTimeout(change.retryTimer);
    change.retryTimer = null;
  }
}

function scheduleRetry(key: string, change: PendingToolsChange): void {
  if (change.retryTimer || !handler) {
    return;
  }

  const delay = Math.min(
    RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, change.failures - 1)),
    RETRY_MAX_DELAY_MS,
  );
  change.retryTimer = setTimeout(() => {
    change.retryTimer = null;
    startDispatch(key, change);
  }, delay);
  change.retryTimer.unref?.();
}

async function dispatchPendingChange(key: string, change: PendingToolsChange): Promise<void> {
  while (handler && change.handledGeneration < change.generation) {
    const targetGeneration = change.generation;
    const event = change.latest;
    try {
      await handler(event);
      change.handledGeneration = targetGeneration;
      change.failures = 0;
    } catch (error) {
      change.failures++;
      logger.error(
        `[MCP][${event.serverName}] Failed to publish tools after list_changed; retrying:`,
        error,
      );
      scheduleRetry(key, change);
      return;
    }
  }
}

function startDispatch(key: string, change: PendingToolsChange): Promise<void> {
  if (change.refreshPromise) {
    return change.refreshPromise;
  }

  change.refreshPromise = dispatchPendingChange(key, change).finally(() => {
    change.refreshPromise = null;
    if (!handler || pendingChanges.get(key) !== change) {
      return;
    }
    if (change.handledGeneration >= change.generation) {
      pendingChanges.delete(key);
    } else if (!change.retryTimer) {
      return startDispatch(key, change);
    }
  });
  return change.refreshPromise;
}

/** Registers the app-layer publisher for refreshed MCP tool snapshots. */
export function setMCPToolsChangedHandler(fn: MCPToolsChangedHandler | null): void {
  handler = fn;
  if (!fn) {
    for (const change of pendingChanges.values()) {
      clearRetryTimer(change);
    }
    pendingChanges.clear();
  }
}

export function hasMCPToolsChangedHandler(): boolean {
  return handler != null;
}

/**
 * Publishes the latest snapshot for a server. Concurrent notifications are single-flighted and
 * cache-write failures retain the latest snapshot for bounded-backoff retries.
 */
export async function notifyMCPToolsChanged(event: MCPToolsChangedEvent): Promise<void> {
  if (!handler) {
    logger.debug(
      `[MCP][${event.serverName}] Tool list changed but no handler is registered; tools stay as they were`,
    );
    return;
  }

  const key = getChangeKey(event);
  let change = pendingChanges.get(key);
  if (!change) {
    change = {
      latest: event,
      generation: 0,
      handledGeneration: 0,
      failures: 0,
      refreshPromise: null,
      retryTimer: null,
    };
    pendingChanges.set(key, change);
  }

  change.latest = event;
  change.generation++;
  clearRetryTimer(change);
  await startDispatch(key, change);
}
