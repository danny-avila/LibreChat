const net = require('net');
const { URL } = require('url');

const BLOCKED_PROTOCOLS = new Set(['file:', 'ftp:', 'data:', 'ws:', 'wss:', 'mailto:', 'javascript:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const isPrivateIPv4 = (ip) => {
  const octets = ip.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some(Number.isNaN)) {
    return false;
  }

  const [first, second] = octets;

  if (first === 10) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 169 && second === 254) return true;
  return false;
};

const isPrivateIP = (host) => {
  if (!host) {
    return true;
  }
  if (LOOPBACK_HOSTS.has(host)) {
    return true;
  }
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    return isPrivateIPv4(host);
  }
  if (ipVersion === 6) {
    return host === '::1' || host.startsWith('fc') || host.startsWith('fd');
  }
  return false;
};

const normalizeUrl = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url;
  } catch {
    return null;
  }
};

const isSafeUrl = (url) => {
  const parsed = normalizeUrl(url);
  if (!parsed) {
    return { safe: false, reason: 'invalid_url' };
  }

  if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
    return { safe: false, reason: 'blocked_protocol' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { safe: false, reason: 'unsupported_protocol' };
  }

  if (isPrivateIP(parsed.hostname)) {
    return { safe: false, reason: 'private_address' };
  }

  return { safe: true, parsed };
};

const dedupeByPath = (items) => {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const parsed = normalizeUrl(item.url ?? item);
    if (!parsed) {
      continue;
    }
    const key = `${parsed.hostname}${parsed.pathname}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
};

const filterUnsafeUrls = (urls) => {
  const allowed = [];
  const blocked = [];

  for (const url of urls) {
    const result = isSafeUrl(url);
    if (!result.safe) {
      blocked.push({ url, reason: result.reason });
      continue;
    }
    allowed.push(result.parsed.toString());
  }

  return { allowed, blocked };
};

module.exports = {
  dedupeByPath,
  filterUnsafeUrls,
  isSafeUrl,
  normalizeUrl,
};
