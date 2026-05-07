const { logger } = require('@librechat/data-schemas');
const writeDenialAudit = require('./writeDenialAudit');

/**
 * NOTE: This middleware reads `req.ip`, which depends on Express having
 * `trust proxy` configured correctly when LibreChat is deployed behind a
 * reverse proxy / load balancer. We do not modify the app's trust proxy
 * setting here; operators are responsible for configuring it.
 */

function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const num = Number(part);
    if (num < 0 || num > 255) return null;
    n = n * 256 + num;
  }
  return n >>> 0;
}

function expandIPv6(ipIn) {
  let ip = ipIn;
  // strip zone id (e.g. fe80::1%eth0)
  const zoneIdx = ip.indexOf('%');
  if (zoneIdx >= 0) ip = ip.slice(0, zoneIdx);

  // handle embedded IPv4 (e.g. ::ffff:1.2.3.4)
  const lastColon = ip.lastIndexOf(':');
  if (lastColon >= 0 && ip.slice(lastColon + 1).includes('.')) {
    const v4 = ip.slice(lastColon + 1);
    const v4int = ipv4ToInt(v4);
    if (v4int === null) return null;
    const high = (v4int >>> 16) & 0xffff;
    const low = v4int & 0xffff;
    ip = ip.slice(0, lastColon + 1) + high.toString(16) + ':' + low.toString(16);
  }

  // expand ::
  let groups;
  if (ip.includes('::')) {
    const [head, tail] = ip.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return null;
    groups = [...headParts, ...new Array(missing).fill('0'), ...tailParts];
  } else {
    groups = ip.split(':');
  }
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(groups[i])) return null;
    const value = parseInt(groups[i], 16);
    bytes[i * 2] = (value >> 8) & 0xff;
    bytes[i * 2 + 1] = value & 0xff;
  }
  return bytes;
}

function ipv4ToBytes(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return null;
  // map to v4-in-v6 (::ffff:a.b.c.d)
  const bytes = new Uint8Array(16);
  bytes[10] = 0xff;
  bytes[11] = 0xff;
  bytes[12] = (n >>> 24) & 0xff;
  bytes[13] = (n >>> 16) & 0xff;
  bytes[14] = (n >>> 8) & 0xff;
  bytes[15] = n & 0xff;
  return bytes;
}

function toBytes(ip) {
  if (!ip) return null;
  if (ip.includes(':')) return expandIPv6(ip);
  return ipv4ToBytes(ip);
}

function parseEntry(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const slashIdx = trimmed.indexOf('/');
  let addr;
  let prefix;
  if (slashIdx >= 0) {
    addr = trimmed.slice(0, slashIdx);
    prefix = parseInt(trimmed.slice(slashIdx + 1), 10);
    if (!Number.isFinite(prefix) || prefix < 0) return null;
  } else {
    addr = trimmed;
    prefix = addr.includes(':') ? 128 : 32;
  }

  const isV4 = !addr.includes(':');
  const bytes = toBytes(addr);
  if (!bytes) return null;

  // convert to absolute (v6) prefix length
  const absPrefix = isV4 ? prefix + 96 : prefix;
  if (absPrefix > 128) return null;
  return { bytes, prefix: absPrefix };
}

function matches(entry, ipBytes) {
  if (!entry || !ipBytes) return false;
  const { bytes, prefix } = entry;
  let bitsLeft = prefix;
  for (let i = 0; i < 16 && bitsLeft > 0; i++) {
    const bits = bitsLeft >= 8 ? 8 : bitsLeft;
    const mask = bits === 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if ((bytes[i] & mask) !== (ipBytes[i] & mask)) return false;
    bitsLeft -= bits;
  }
  return true;
}

function parseList(envValue) {
  if (!envValue || !envValue.trim()) {
    return { entries: null, malformed: false };
  }
  const raw = envValue.split(',');
  const entries = [];
  let malformed = false;
  for (const r of raw) {
    if (!r.trim()) continue;
    const e = parseEntry(r);
    if (!e) {
      malformed = true;
      continue;
    }
    entries.push(e);
  }
  return { entries, malformed };
}

function buildMiddleware(envValue) {
  const { entries, malformed } = parseList(envValue);
  if (malformed) {
    logger.error(
      '[admin] ADMIN_IP_ALLOWLIST contained one or more malformed entries; failing closed.',
    );
  }
  return function checkAdminIpAllowlist(req, res, next) {
    // No allowlist configured → pass through.
    if (entries === null) return next();

    const deny = (reason) => {
      res.status(403).json({ message: 'Forbidden' });
      writeDenialAudit(req, res, reason);
    };

    // Fail closed if env was malformed.
    if (malformed) {
      return deny('ip_allowlist_malformed');
    }

    const ipBytes = toBytes(req.ip);
    if (!ipBytes) {
      return deny('ip_unparseable');
    }

    for (const entry of entries) {
      if (matches(entry, ipBytes)) {
        return next();
      }
    }
    return deny('ip_blocked');
  };
}

const checkAdminIpAllowlist = buildMiddleware(process.env.ADMIN_IP_ALLOWLIST);

module.exports = checkAdminIpAllowlist;
// exposed for tests
module.exports._internal = {
  parseList,
  parseEntry,
  toBytes,
  matches,
  buildMiddleware,
};
