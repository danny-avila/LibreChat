const dns = require('node:dns').promises;
const { isPrivateIP } = require('@librechat/api');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validates that a user-supplied baseURL is safe to fetch from.
 *
 * Throws when the URL is malformed, uses a non-http(s) protocol, or
 * resolves (now) to a private/loopback/link-local address. The DNS
 * check is best-effort and does not protect against rebinding at
 * fetch time — runtime call sites should still use SSRF-safe agents.
 *
 * @param {string} rawBaseURL
 * @returns {Promise<void>}
 */
async function validateUserBaseURL(rawBaseURL) {
  let parsed;
  try {
    parsed = new URL(rawBaseURL);
  } catch {
    throw new Error('baseURL is not a valid URL');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`baseURL must use http or https, got "${parsed.protocol}"`);
  }

  let addresses;
  try {
    addresses = await dns.lookup(parsed.hostname, { all: true });
  } catch {
    throw new Error('baseURL hostname could not be resolved');
  }

  for (const { address } of addresses) {
    if (isPrivateIP(address)) {
      throw new Error('baseURL resolves to a private or reserved IP address');
    }
  }
}

module.exports = { validateUserBaseURL };
