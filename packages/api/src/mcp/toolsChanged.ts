import { logger } from '@librechat/data-schemas';

/**
 * Which server changed, and whose tool cache it affects. No `userId` means an app-level
 * connection, shared by everyone.
 */
export interface MCPToolsChangedEvent {
  serverName: string;
  userId?: string;
}

export type MCPToolsChangedHandler = (event: MCPToolsChangedEvent) => Promise<void> | void;

let handler: MCPToolsChangedHandler | null = null;

/**
 * Registers what to do when a server reports a changed tool list.
 *
 * The connection layer knows *that* the list changed; only the app layer owns the tool caches and
 * can refresh them, so the reaction is injected rather than reached for across that boundary.
 * Pass null to unregister (tests, shutdown).
 */
export function setMCPToolsChangedHandler(fn: MCPToolsChangedHandler | null): void {
  handler = fn;
}

/** Whether a handler is registered - lets callers skip work nobody would consume. */
export function hasMCPToolsChangedHandler(): boolean {
  return handler != null;
}

/**
 * Dispatches a tool-list change. Never throws: this runs from a notification handler, where an
 * error has nowhere to go and must not take the connection down with it.
 */
export async function notifyMCPToolsChanged(event: MCPToolsChangedEvent): Promise<void> {
  if (!handler) {
    logger.debug(
      `[MCP][${event.serverName}] Tool list changed but no handler is registered; tools stay as they were`,
    );
    return;
  }
  try {
    await handler(event);
  } catch (error) {
    logger.error(`[MCP][${event.serverName}] Failed to refresh tools after list_changed:`, error);
  }
}
