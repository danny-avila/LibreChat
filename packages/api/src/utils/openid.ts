/**
 * Helper function to safely log sensitive data when debug mode is enabled
 * @param obj - Object to stringify
 * @param maxLength - Maximum length of the stringified output
 * @returns Stringified object with sensitive data masked
 */
export function safeStringify(obj: unknown, maxLength = 1000): string {
  try {
    const str = JSON.stringify(obj, (key, value) => {
      // Mask sensitive values
      if (
        key === 'client_secret' ||
        key === 'Authorization' ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('password')
      ) {
        return typeof value === 'string' && value.length > 6
          ? `${value.substring(0, 3)}...${value.substring(value.length - 3)}`
          : '***MASKED***';
      }
      return value;
    });

    if (str && str.length > maxLength) {
      return `${str.substring(0, maxLength)}... (truncated)`;
    }
    return str;
  } catch (error) {
    return `[Error stringifying object: ${(error as Error).message}]`;
  }
}

/**
 * Helper to log headers without revealing sensitive information
 * @param headers - Headers object to log
 * @returns Stringified headers with sensitive data masked
 */
export function logHeaders(headers: Headers | undefined | null): string {
  const headerObj: Record<string, string> = {};
  if (!headers || typeof headers.entries !== 'function') {
    return 'No headers available';
  }
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === 'authorization' || key.toLowerCase().includes('secret')) {
      headerObj[key] = '***MASKED***';
    } else {
      headerObj[key] = value;
    }
  }
  return safeStringify(headerObj);
}
