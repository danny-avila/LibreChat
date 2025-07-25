import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { logger } from '@librechat/data-schemas';

export interface GoogleServiceKey {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
  [key: string]: unknown;
}

/**
 * Load Google service key from file path, URL, or stringified JSON
 * @param keyPath - The path to the service key file, URL to fetch it from, or stringified JSON
 * @returns The parsed service key object or null if failed
 */
export async function loadServiceKey(keyPath: string): Promise<GoogleServiceKey | null> {
  if (!keyPath) {
    return null;
  }

  let serviceKey: unknown;

  // Check if it's base64 encoded (common pattern for storing in env vars)
  if (keyPath.trim().match(/^[A-Za-z0-9+/]+=*$/)) {
    try {
      const decoded = Buffer.from(keyPath.trim(), 'base64').toString('utf-8');
      // Try to parse the decoded string as JSON
      serviceKey = JSON.parse(decoded);
    } catch {
      // Not base64 or not valid JSON after decoding, continue with other methods
      // Silent failure - not critical
    }
  }

  // Check if it's a stringified JSON (starts with '{')
  if (!serviceKey && keyPath.trim().startsWith('{')) {
    try {
      serviceKey = JSON.parse(keyPath);
    } catch (error) {
      logger.error('Failed to parse service key from stringified JSON', error);
      return null;
    }
  }
  // Check if it's a URL
  else if (!serviceKey && /^https?:\/\//.test(keyPath)) {
    try {
      const response = await axios.get(keyPath);
      serviceKey = response.data;
    } catch (error) {
      logger.error(`Failed to fetch the service key from URL: ${keyPath}`, error);
      return null;
    }
  } else if (!serviceKey) {
    // It's a file path
    try {
      const absolutePath = path.isAbsolute(keyPath) ? keyPath : path.resolve(keyPath);
      const fileContent = fs.readFileSync(absolutePath, 'utf8');
      serviceKey = JSON.parse(fileContent);
    } catch (error) {
      logger.error(`Failed to load service key from file: ${keyPath}`, error);
      return null;
    }
  }

  // If the response is a string (e.g., from a URL that returns JSON as text), parse it
  if (typeof serviceKey === 'string') {
    try {
      serviceKey = JSON.parse(serviceKey);
    } catch (parseError) {
      logger.error(`Failed to parse service key JSON from ${keyPath}`, parseError);
      return null;
    }
  }

  // Validate the service key has required fields
  if (!serviceKey || typeof serviceKey !== 'object') {
    logger.error(`Invalid service key format from ${keyPath}`);
    return null;
  }

  // Fix private key formatting if needed
  const key = serviceKey as GoogleServiceKey;
  if (key.private_key && typeof key.private_key === 'string') {
    // Replace escaped newlines with actual newlines
    // When JSON.parse processes "\\n", it becomes "\n" (single backslash + n)
    // When JSON.parse processes "\n", it becomes an actual newline character
    key.private_key = key.private_key.replace(/\\n/g, '\n');

    // Also handle the String.raw`\n` case mentioned in Stack Overflow
    key.private_key = key.private_key.split(String.raw`\n`).join('\n');

    // Ensure proper PEM format
    if (!key.private_key.includes('\n')) {
      // If no newlines are present, try to format it properly
      const privateKeyMatch = key.private_key.match(
        /^(-----BEGIN [A-Z ]+-----)(.*)(-----END [A-Z ]+-----)$/,
      );
      if (privateKeyMatch) {
        const [, header, body, footer] = privateKeyMatch;
        // Add newlines after header and before footer
        key.private_key = `${header}\n${body}\n${footer}`;
      }
    }
  }

  return key;
}
