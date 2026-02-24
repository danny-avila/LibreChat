import { useState, useEffect } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useGetUserQuery, useGetStartupConfig } from '~/data-provider';
import { useAuthContext } from '~/hooks';
import { Md5 } from 'ts-md5';
/**
 * Type definition for the API response structure
 */
export type Permission = {
  provider: string;
  models: string[];
};

export type ApiPermissionsResponse = {
  email: string;
  token: string;
  permissions: Permission[];
};

/**
 * Mock data disabled - API must return valid permissions
 * No fallback to mock data - API failure will result in no permissions
 */

/**
 * API function that fetches permissions from backend
 * Returns raw API response with email, token, and permissions array
 *
 * Example response:
 * {
 *   email: "mohamed.hany@areebgroup.com",
 *   token: "alksdoaushdiuasbdiasbd",
 *   permissions: [
 *     { provider: "openAI", models: ["gpt-4o", "gpt-3.5-turbo"] },
 *     { provider: "google", models: ["gemini-2.0-flash-001"] }
 *   ]
 * }
 */
/**
 * Generate HMAC SHA256 signature for email authentication
 * @param email - User email address
 * @param timestamp - Unix timestamp in seconds
 * @param secretKey - Secret key for HMAC
 * @returns Promise<string> - Hexadecimal signature
 */
// const generateHMACSignature = async (
//   email: string,
//   timestamp: string,
//   secretKey: string,
// ): Promise<string> => {
//   const message = email + timestamp;
//   const encoder = new TextEncoder();
//   const keyData = encoder.encode(secretKey);
//   const messageData = encoder.encode(message);

//   const cryptoKey = await crypto.subtle.importKey(
//     'raw',
//     keyData,
//     { name: 'HMAC', hash: 'SHA-256' },
//     false,
//     ['sign'],
//   );

//   const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
//   const hashArray = Array.from(new Uint8Array(signature));
//   const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

//   return hashHex;
// };

export const getMockPermissions = async (
  userEmail?: string,
  token?: string,
  permissionsAPIURL?: string,
): Promise<ApiPermissionsResponse> => {
  if (!userEmail) {
    throw new Error('No user email provided - cannot fetch permissions');
  }
  
  // Use provided URL or fallback to default
  // permissionsAPIURL is passed from the hook which gets it from startupConfig
  const apiBaseURL = permissionsAPIURL;
  
  const url = new URL(
    `${apiBaseURL}/api/v1/user/permissions/${encodeURIComponent(userEmail)}`,
    window.location.origin,
  );

  // Generate MD5 hash of email
  const emailMD5 = Md5.hashStr(userEmail) as string;
  // Generate random 15-digit number
  const fifteenDigits = Math.floor(100000000000000 + Math.random() * 900000000000000)
    .toString()
    .slice(0, 15);
  // Signature: MD5(email) + 15 digits
  const signature = emailMD5 + fifteenDigits;

  const headers: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-user-email': userEmail,
    'x-user-auth': signature,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    // credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch permissions: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

/**
 * ===================================================
 * CUSTOM - Hook to fetch permissions from backend API
 * Returns providers and models organized by provider
 * No fallback - API must return valid permissions
 * Uses useGetUserQuery to get the logged-in user's email
 *
 * IMPORTANT: This hook should be called ONCE at context level, not per component
 * to avoid multiple API requests (was causing 30-40 requests before fix)
 * ===================================================
 */
export const useMockPermissions = () => {
  const [data, setData] = useState<ApiPermissionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // ===================================================
  // CUSTOM - Get logged-in user's email using useGetUserQuery
  // This automatically gets the current user's email from LibreChat's auth system
  const { data: userData } = useGetUserQuery();
  const { token } = useAuthContext();
  // CUSTOM - Get permissionsAPIURL from startup config (set via PERMISSIONS_API_URL env var)
  const { data: startupConfig } = useGetStartupConfig();
  // ===================================================

  useEffect(() => {
    // ===================================================
    // CUSTOM - Wait for user data and startup config to be available before fetching permissions
    if (!userData || !startupConfig) {
      return;
    }
    // CUSTOM - Extract email from user data and fetch permissions
    // API endpoint uses permissionsAPIURL from startupConfig
    const userEmail = userData.email;
    const permissionsAPIURL = startupConfig.permissionsAPIURL;
    // ===================================================

    // Reset error state when retrying
    setError(null);
    setIsLoading(true);

    getMockPermissions(userEmail, token, permissionsAPIURL)
      .then((result) => {
        setData(result);
        setError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch permissions from API';
        const errorObj = err instanceof Error ? err : new Error(errorMessage);
        console.error('❌ Error fetching permissions:', {
          error: err,
          message: errorMessage,
          userEmail,
          permissionsAPIURL,
        });
        setError(errorObj);
        // No fallback - API must return valid permissions
        // When null, UI will show all endpoints/models (no filtering)
        setData(null);
        setIsLoading(false);
      });
  }, [userData, token, startupConfig]);

  // ===================================================
  // CUSTOM - Extract providers and models from API response
  // providers: Array of provider names (e.g., ['openAI', 'google'])
  // modelsByProvider: Map of provider -> array of model names
  // Example: { 'openAI': ['gpt-4o', 'gpt-3.5-turbo'], 'google': ['gemini-2.0-flash'] }
  // Normalize provider names to match EModelEndpoint values
  const normalizeProviderName = (provider: string): string => {
    const lowerProvider = provider.toLowerCase();
    // Map common variations to EModelEndpoint values
    const providerMap: Record<string, string> = {
      anthropic: EModelEndpoint.anthropic,
      openai: EModelEndpoint.openAI,
      'open-ai': EModelEndpoint.openAI,
      google: EModelEndpoint.google,
      bedrock: EModelEndpoint.bedrock,
      'azure-openai': EModelEndpoint.azureOpenAI,
      azureopenai: EModelEndpoint.azureOpenAI,
    };
    return providerMap[lowerProvider] || provider; // Return normalized or original if not found
  };

  const providers =
    data?.permissions.map((p) => normalizeProviderName(p.provider) as EModelEndpoint) ?? null;
  const modelsByProvider =
    data?.permissions.reduce(
      (acc, permission) => {
        const normalizedProvider = normalizeProviderName(permission.provider);
        acc[normalizedProvider] = permission.models;
        return acc;
      },
      {} as Record<string, string[]>,
    ) ?? null;

  // CUSTOM - Debug logging to help troubleshoot filtering issues
  // if (data?.permissions) {
  //   console.log('🔍 Permissions API Response:', {
  //     providers,
  //     modelsByProvider,
  //     rawPermissions: data.permissions,
  //   });
  // }
  // ===================================================

  return {
    data,
    providers,
    modelsByProvider,
    isLoading,
    error,
  };
};
