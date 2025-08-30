const dns = require('dns').promises;
const ipaddr = require('ipaddr.js');

const PRIVATE_RANGES = new Set(['private', 'loopback', 'linkLocal', 'uniqueLocal', 'unspecified', 'reserved']);

/**
 * Validates a URL to prevent SSRF by restricting protocols and private IP ranges.
 * @param {string} urlString
 * @throws {Error} if URL is invalid or points to a private/internal address
 */
async function validateExternalUrl(urlString) {
  const url = new URL(urlString);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Invalid URL protocol');
  }
  const { address } = await dns.lookup(url.hostname);
  const ip = ipaddr.parse(address);
  if (PRIVATE_RANGES.has(ip.range())) {
    throw new Error('Disallowed IP address');
  }
}

module.exports = { validateExternalUrl };
