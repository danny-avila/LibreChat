import { logger } from '@librechat/data-schemas';
import { OpenClawGatewayClient } from './client';

const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

interface GatewayEntry {
  client: OpenClawGatewayClient;
  reconnectMs: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connecting: Promise<void> | null;
}

/**
 * Singleton manager that maintains one persistent WebSocket connection per gateway URL.
 * Auto-reconnects with exponential backoff on disconnect.
 */
class OpenClawGatewayManager {
  private entries = new Map<string, GatewayEntry>();

  /**
   * Return a connected client for the given gateway URL, creating and connecting
   * one if it doesn't exist yet.
   */
  async getClient(url: string, apiKey: string): Promise<OpenClawGatewayClient> {
    const key = `${url}::${apiKey}`;
    let entry = this.entries.get(key);

    if (!entry) {
      const client = new OpenClawGatewayClient({ url, apiKey });
      entry = { client, reconnectMs: MIN_RECONNECT_MS, reconnectTimer: null, connecting: null };
      this.entries.set(key, entry);
      this.scheduleConnect(key, entry, 0);
    }

    // If currently connecting, wait for it
    if (entry.connecting) {
      await entry.connecting;
    } else if (!entry.client.connected) {
      await this.doConnect(key, entry);
    }

    return entry.client;
  }

  private scheduleConnect(key: string, entry: GatewayEntry, delayMs: number): void {
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      this.doConnect(key, entry).catch(() => {
        /* already logged inside doConnect */
      });
    }, delayMs);
  }

  private doConnect(key: string, entry: GatewayEntry): Promise<void> {
    if (entry.connecting) return entry.connecting;

    entry.connecting = entry.client
      .connect()
      .then(() => {
        entry.connecting = null;
        entry.reconnectMs = MIN_RECONNECT_MS;
        logger.info('[OpenClawGateway] Connected to gateway');

        // Watch for disconnect and schedule reconnect
        const checkInterval = setInterval(() => {
          if (!entry.client.connected) {
            clearInterval(checkInterval);
            logger.warn(
              `[OpenClawGateway] Disconnected, reconnecting in ${entry.reconnectMs}ms`,
            );
            this.scheduleConnect(key, entry, entry.reconnectMs);
            entry.reconnectMs = Math.min(entry.reconnectMs * 2, MAX_RECONNECT_MS);
          }
        }, 5_000);
      })
      .catch((err: Error) => {
        entry.connecting = null;
        logger.warn(
          `[OpenClawGateway] Connection failed (${err.message}), retrying in ${entry.reconnectMs}ms`,
        );
        this.scheduleConnect(key, entry, entry.reconnectMs);
        entry.reconnectMs = Math.min(entry.reconnectMs * 2, MAX_RECONNECT_MS);
        throw err;
      });

    return entry.connecting;
  }
}

export const gatewayManager = new OpenClawGatewayManager();
