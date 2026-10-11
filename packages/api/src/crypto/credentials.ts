import { encryptV3, decryptV3, decrypt } from '@librechat/data-schemas';

const V3_PREFIX = 'v3:';

/**
 * Encrypts a stored user credential (plugin, tool, or MCP custom user variable)
 * with a random IV per value. Output carries the `v3:` prefix.
 */
export function encryptCredential(value: string): string {
  return encryptV3(value);
}

/**
 * Decrypts a stored user credential by format: `v3:` values use `decryptV3`,
 * anything else is a legacy fixed-IV value (hex only, so it can never start
 * with `v3:`) and uses the legacy `decrypt`.
 */
export async function decryptCredential(value: string): Promise<string> {
  if (value.startsWith(V3_PREFIX)) {
    return decryptV3(value);
  }
  return decrypt(value);
}
