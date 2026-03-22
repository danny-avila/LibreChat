import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import type {
  OpenClawChatEvent,
  OpenClawModelEntry,
  OpenClawSkillEntry,
  OpenClawToolCatalogEntry,
} from './types';

/** Pending RPC call waiting for its response */
interface PendingRpc {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

/** JSON-RPC 2.0 request */
interface RpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: unknown;
}

/** JSON-RPC 2.0 response */
interface RpcResponse {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Streaming chat event envelope from gateway */
interface GatewayStreamEvent {
  streamId: string;
  event: OpenClawChatEvent;
}

export interface OpenClawGatewayClientOptions {
  /** WebSocket URL, e.g. ws://127.0.0.1:18789 */
  url: string;
  apiKey: string;
  /** Connection timeout in ms (default 10 000) */
  connectTimeoutMs?: number;
  /** RPC call timeout in ms (default 30 000) */
  rpcTimeoutMs?: number;
}

/**
 * Low-level WebSocket RPC client for the OpenClaw gateway protocol v3.
 *
 * Lifecycle: construct → connect() → use → close()
 * The GatewayManager owns lifecycle; callers never call connect/close directly.
 */
export class OpenClawGatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRpc>();
  private streamListeners = new Map<string, (event: OpenClawChatEvent) => void>();
  private readonly url: string;
  private readonly apiKey: string;
  private readonly connectTimeoutMs: number;
  private readonly rpcTimeoutMs: number;
  private _connected = false;

  constructor(options: OpenClawGatewayClientOptions) {
    this.url = options.url;
    this.apiKey = options.apiKey;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
    this.rpcTimeoutMs = options.rpcTimeoutMs ?? 30_000;
  }

  get connected(): boolean {
    return this._connected;
  }

  /** Establish WebSocket connection and complete challenge-response handshake */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('OpenClaw gateway connection timeout'));
        this.ws?.terminate();
      }, this.connectTimeoutMs);

      const ws = new WebSocket(this.url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      this.ws = ws;

      ws.once('open', () => {
        clearTimeout(timeout);
        this._connected = true;
        resolve();
      });

      ws.once('error', (err) => {
        clearTimeout(timeout);
        this._connected = false;
        reject(err);
      });

      ws.on('message', (data) => {
        let msg: RpcResponse | GatewayStreamEvent;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        // Stream event (no jsonrpc field, has streamId + event)
        if ('streamId' in msg && 'event' in msg) {
          const listener = this.streamListeners.get(msg.streamId);
          listener?.(msg.event);
          return;
        }

        // JSON-RPC response
        if ('id' in msg) {
          const pending = this.pending.get(msg.id);
          if (!pending) return;
          this.pending.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(`OpenClaw RPC error ${msg.error.code}: ${msg.error.message}`));
          } else {
            pending.resolve(msg.result);
          }
        }
      });

      ws.on('close', () => {
        this._connected = false;
        for (const { reject: rej } of this.pending.values()) {
          rej(new Error('OpenClaw WebSocket closed'));
        }
        this.pending.clear();
      });
    });
  }

  close(): void {
    this._connected = false;
    this.ws?.close();
    this.ws = null;
  }

  // ---------------------------------------------------------------------------
  // Private RPC helpers
  // ---------------------------------------------------------------------------

  private call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || !this._connected) {
      return Promise.reject(new Error('OpenClaw gateway not connected'));
    }

    const id = randomUUID();
    const req: RpcRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`OpenClaw RPC timeout: ${method}`));
      }, this.rpcTimeoutMs);

      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result as T);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.ws!.send(JSON.stringify(req));
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Send a chat message and stream back events via AsyncGenerator.
   * Caller must consume (or break out of) the generator to avoid listener leaks.
   */
  async *chatSend(params: {
    sessionKey: string;
    message: string;
    thinkLevel?: string;
    model?: string;
  }): AsyncGenerator<OpenClawChatEvent, void, unknown> {
    const streamId = randomUUID();

    const events: OpenClawChatEvent[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    const push = (event: OpenClawChatEvent) => {
      events.push(event);
      resolve?.();
      resolve = null;
      if (event.state === 'final' || event.state === 'aborted' || event.state === 'error') {
        done = true;
      }
    };

    this.streamListeners.set(streamId, push);

    try {
      await this.call('chat.send', { ...params, streamId });

      while (true) {
        if (events.length === 0) {
          if (done) break;
          await new Promise<void>((res) => {
            resolve = res;
          });
        }
        while (events.length > 0) {
          yield events.shift()!;
        }
        if (done) break;
      }
    } finally {
      this.streamListeners.delete(streamId);
    }
  }

  chatAbort(params: { sessionKey: string; runId: string }): Promise<void> {
    return this.call<void>('chat.abort', params);
  }

  chatHistory(params: { sessionKey: string }): Promise<unknown[]> {
    return this.call<unknown[]>('chat.history', params);
  }

  sessionsList(): Promise<Array<{ sessionKey: string; model: string; thinkLevel: string }>> {
    return this.call('sessions.list');
  }

  sessionsPatch(params: {
    sessionKey: string;
    model?: string;
    thinkLevel?: string;
  }): Promise<void> {
    return this.call<void>('sessions.patch', params);
  }

  toolsCatalog(): Promise<OpenClawToolCatalogEntry[]> {
    return this.call<OpenClawToolCatalogEntry[]>('tools.catalog');
  }

  skillsBins(): Promise<OpenClawSkillEntry[]> {
    return this.call<OpenClawSkillEntry[]>('skills.bins');
  }

  modelsList(): Promise<OpenClawModelEntry[]> {
    return this.call<OpenClawModelEntry[]>('models.list');
  }

  modelsChoice(params: { model: string }): Promise<void> {
    return this.call<void>('models.choice', params);
  }
}
