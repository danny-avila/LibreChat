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

  // Check if it's a stringified JSON (starts with '{')
  if (keyPath.trim().startsWith('{')) {
    try {
      serviceKey = JSON.parse(keyPath);
    } catch (error) {
      logger.error('Failed to parse service key from stringified JSON', error);
      return null;
    }
  }
  // Check if it's a URL
  else if (/^https?:\/\//.test(keyPath)) {
    try {
      const response = await axios.get(keyPath);
      serviceKey = response.data;
    } catch (error) {
      logger.error(`Failed to fetch the service key from URL: ${keyPath}`, error);
      return null;
    }
  } else {
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

  return serviceKey as GoogleServiceKey;
}
