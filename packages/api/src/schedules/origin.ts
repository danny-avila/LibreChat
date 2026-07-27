/** A listener's `server.address()`. `family` is a string on modern Node and a
 *  number on older ones, so both are accepted. */
export interface BoundAddress {
  address: string;
  family?: string | number;
  port: number;
}

/**
 * The origin that reaches THIS process's own listener, derived from the address it
 * actually bound. A hardcoded `127.0.0.1:$PORT` is wrong twice: the shipped
 * `HOST=localhost` resolves to `::1` on dual-stack hosts, so the server binds v6-only
 * and every loopback fire is refused; and `PORT=0` only learns its port after listen.
 * Returns null for a pipe/socket bind, which no HTTP origin can address.
 */
export function selfOriginFromAddress(
  address: BoundAddress | string | null | undefined,
): string | null {
  if (address == null || typeof address === 'string' || !address.port) {
    return null;
  }
  const bound = address.address;
  const isIPv6 = address.family === 'IPv6' || address.family === 6 || bound.includes(':');
  const loopback = isIPv6 ? '::1' : '127.0.0.1';
  const isWildcard = bound === '' || bound === '::' || bound === '0.0.0.0';
  const host = isWildcard ? loopback : bound;
  return `http://${isIPv6 ? `[${host}]` : host}:${address.port}`;
}
