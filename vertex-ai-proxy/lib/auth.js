import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'fs';

let authClient = null;
let cachedToken = null;
let tokenExpiry = 0;

/**
 * Initialize the Google Auth client with service account credentials
 * @param {string} keyFilePath - Path to the service account JSON key file
 */
export async function initAuth(keyFilePath) {
  const auth = new GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  
  authClient = await auth.getClient();
  console.log('[Auth] Service account initialized');
}

/**
 * Get a valid access token, refreshing if necessary
 * @returns {Promise<string>} Access token
 */
export async function getAccessToken() {
  if (!authClient) {
    throw new Error('Auth client not initialized. Call initAuth() first.');
  }

  const now = Date.now();
  
  // Return cached token if still valid (with 5 minute buffer)
  if (cachedToken && tokenExpiry > now + 300000) {
    return cachedToken;
  }

  // Get new token
  const tokenResponse = await authClient.getAccessToken();
  cachedToken = tokenResponse.token;
  
  // Tokens typically expire in 1 hour
  tokenExpiry = now + 3600000;
  
  console.log('[Auth] Access token refreshed');
  return cachedToken;
}

/**
 * Get project ID from service account key file
 * @param {string} keyFilePath - Path to the service account JSON key file
 * @returns {string} Project ID
 */
export function getProjectId(keyFilePath) {
  const keyFile = JSON.parse(readFileSync(keyFilePath, 'utf8'));
  return keyFile.project_id;
}
