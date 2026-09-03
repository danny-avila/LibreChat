import { logger } from '@librechat/data-schemas';

/** The slice of an ioredis `Redis` or `Cluster` client the heartbeat needs. */
export interface HeartbeatClient {
  readonly status: string;
  ping(): Promise<unknown>;
  on(event: 'end', listener: () => void): unknown;
  off(event: 'end', listener: () => void): unknown;
  disconnect(reconnect?: boolean): void;
  /** Present on a standalone client; a cluster owns one socket per node instead. */
  stream?: { readonly destroyed: boolean; destroy(error?: Error): unknown };
}

export interface RedisHeartbeatOptions {
  client: HeartbeatClient;
  /** Milliseconds between probes; a non-positive value disables the heartbeat. */
  intervalMs: number;
  /** Milliseconds a probe may go unanswered before the socket is presumed dead. */
  timeoutMs: number;
  /** Client label used in log lines. */
  label: string;
}

type ProbeOutcome = 'pong' | 'rejected' | 'expired';

/**
 * Drops the current socket without waiting for the peer. `disconnect(true)` calls
 * `stream.end()`, whose FIN a vanished peer never acknowledges, so ioredis would not
 * observe `close` until the kernel retransmission timeout — the very wait a heartbeat
 * exists to avoid. Destroying the stream raises `close` immediately, after which ioredis
 * reconnects through its retry strategy, replays the commands it was holding, and
 * re-subscribes a subscriber's channels. Cluster clients expose no single socket and fall
 * back to the regular reconnect.
 */
export function forceRedisReconnect(client: HeartbeatClient, reason: string): void {
  const stream = client.stream;
  if (stream != null && !stream.destroyed) {
    stream.destroy(new Error(reason));
    return;
  }
  client.disconnect(true);
}

/**
 * Probes a connection with deadline-bounded PINGs and tears the socket down when one
 * goes unanswered. A peer that disappears without a FIN or RST (a dropped NAT entry, a
 * proxy failover, a migrated VM) leaves the socket "connected" from ioredis's point of
 * view: no error fires, every command waits, and only the kernel's retransmission or
 * keepalive timeout — about fifteen minutes at Linux defaults — ends the wait. Dedicated
 * subscriber connections are the worst case, since nothing else ever writes to them.
 *
 * Only a probe that neither resolves nor rejects within `timeoutMs` counts: a rejected
 * probe means ioredis already knows the connection state and is handling it. Probes are
 * skipped while the client is not ready or a previous probe is still waiting, and the
 * heartbeat ends with the client (`end` fires only once ioredis stops reconnecting).
 */
export function startRedisHeartbeat(options: RedisHeartbeatOptions): () => void {
  const { client, intervalMs, timeoutMs, label } = options;
  if (intervalMs <= 0) {
    return () => undefined;
  }

  let inFlight = false;
  let stopped = false;

  const probe = async (): Promise<void> => {
    if (inFlight || stopped || client.status !== 'ready') {
      return;
    }
    inFlight = true;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<ProbeOutcome>((resolve) => {
      deadline = setTimeout(() => resolve('expired'), timeoutMs);
      deadline.unref?.();
    });
    const answered = client.ping().then(
      (): ProbeOutcome => 'pong',
      (): ProbeOutcome => 'rejected',
    );
    try {
      const outcome = await Promise.race([answered, expired]);
      if (outcome !== 'expired' || stopped) {
        return;
      }
      logger.warn(`${label} heartbeat: no PING reply within ${timeoutMs}ms, reconnecting`);
      forceRedisReconnect(client, `${label} heartbeat timed out after ${timeoutMs}ms`);
    } finally {
      clearTimeout(deadline);
      inFlight = false;
    }
  };

  const timer = setInterval(() => {
    void probe();
  }, intervalMs);
  timer.unref?.();

  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(timer);
    client.off('end', stop);
  };
  client.on('end', stop);
  return stop;
}
