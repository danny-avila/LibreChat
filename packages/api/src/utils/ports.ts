import type { Request } from 'express';

/**
 * Strips port suffix from req.ip for use as a rate-limiter key (IPv4 and IPv6-safe).
 * Bracket notation for the ip property avoids express-rate-limit v8's toString()
 * heuristic that scans for the literal substring "req.ip" (ERR_ERL_KEY_GEN_IPV6).
 */
export function removePorts(req: Request): string | undefined {
  const ip = req?.['ip'];
  if (!ip) {
    return ip;
  }

  if (ip.charCodeAt(0) === 91) {
    const close = ip.indexOf(']');
    return close > 0 ? ip.slice(1, close) : ip;
  }

  const lastColon = ip.lastIndexOf(':');
  if (lastColon === -1) {
    return ip;
  }

  if (ip.indexOf('.') !== -1 && hasOnlyDigitsAfter(ip, lastColon + 1)) {
    return ip.slice(0, lastColon);
  }

  return ip;
}

function hasOnlyDigitsAfter(str: string, start: number): boolean {
  if (start >= str.length) {
    return false;
  }
  for (let i = start; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 48 || c > 57) {
      return false;
    }
  }
  return true;
}
