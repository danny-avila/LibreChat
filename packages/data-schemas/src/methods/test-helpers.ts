/**
 * Inlined utility functions previously imported from @librechat/api.
 * These are used only by test files in data-schemas.
 */

/**
 * Finds the first matching pattern in a tokens/values map by reverse-iterating
 * and checking if the model name (lowercased) includes the key.
 *
 * Inlined from @librechat/api findMatchingPattern
 */
export function findMatchingPattern(
  modelName: string,
  tokensMap: Record<string, unknown>,
): string | undefined {
  const keys = Object.keys(tokensMap);
  const lowerModelName = modelName.toLowerCase();
  for (let i = keys.length - 1; i >= 0; i--) {
    const modelKey = keys[i];
    if (lowerModelName.includes(modelKey)) {
      return modelKey;
    }
  }
  return undefined;
}

/**
 * Matches a model name to a canonical key. When no maxTokensMap is available
 * (as in data-schemas tests), returns the model name as-is.
 *
 * Inlined from @librechat/api matchModelName (simplified for test use)
 */
export function matchModelName(modelName: string, _endpoint?: string): string | undefined {
  if (typeof modelName !== 'string') {
    return undefined;
  }
  return modelName;
}
