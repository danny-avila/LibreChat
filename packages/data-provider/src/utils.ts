export const envVarRegex = /^\${(.+)}$/;

/** Extracts the environment variable name from a template literal string */
export function extractVariableName(value: string): string | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(envVarRegex);
  return match ? match[1] : null;
}

/** Extracts the value of an environment variable from a string. */
export function extractEnvVariable(value: string) {
  if (!value) {
    return value;
  }

  // Trim the input
  const trimmed = value.trim();

  // Special case: if it's just a single environment variable
  const singleMatch = trimmed.match(envVarRegex);
  if (singleMatch) {
    const varName = singleMatch[1];
    return process.env[varName] || trimmed;
  }

  // For multiple variables, process them using a regex loop
  const regex = /\${([^}]+)}/g;
  let result = trimmed;

  // First collect all matches and their positions
  const matches = [];
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    matches.push({
      fullMatch: match[0],
      varName: match[1],
      index: match.index,
    });
  }

  // Process matches in reverse order to avoid position shifts
  for (let i = matches.length - 1; i >= 0; i--) {
    const { fullMatch, varName, index } = matches[i];
    const envValue = process.env[varName] || fullMatch;

    // Replace at exact position
    result = result.substring(0, index) + envValue + result.substring(index + fullMatch.length);
  }

  return result;
}

/**
 * Normalize the endpoint name to system-expected value.
 * @param name
 */
export function normalizeEndpointName(name = ''): string {
  return name.toLowerCase() === 'ollama' ? 'ollama' : name;
}

/**
 * Validates that a URL uses only safe protocols (http, https, or data:image/*)
 * @param url - The URL string to validate
 * @returns true if the URL is safe, false otherwise
 */
export const isSafeImageUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return true;
    }

    if (parsedUrl.protocol !== 'data:') {
      return false;
    }

    // Restrict data URLs to image payloads only.
    return /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=._+-]+)*(?:;base64)?,/i.test(url);
  } catch {
    return false;
  }
};
