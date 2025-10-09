/**
 * Checks if a string is a valid URL (absolute or relative)
 * @param str - The string to check
 * @returns true if the string is a valid absolute URL or starts with '/'
 */
export function isUrl(str: string): boolean {
  if (!str || typeof str !== 'string') {
    return false;
  }

  try {
    // Try to create a URL object - this will throw if not a valid absolute URL
    new URL(str);
    return true;
  } catch {
    // If URL constructor fails, check if it's a relative URL starting with '/'
    return str.startsWith('/');
  }
}
