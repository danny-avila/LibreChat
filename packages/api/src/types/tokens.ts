/** Configuration object mapping model keys to their respective prompt, completion rates, and context limit
 *
 * Note: the [key: string]: unknown is not in the original JSDoc typedef in /api/typedefs.js, but I've included it since
 * getModelMaxOutputTokens calls getModelTokenValue with a key of 'output', which was not in the original JSDoc typedef,
 * but would be referenced in a TokenConfig in the if(matchedPattern) portion of getModelTokenValue.
 * So in order to preserve functionality for that case and any others which might reference an additional key I'm unaware of,
 * I've included it here until the interface can be typed more tightly.
 */
export interface TokenConfig {
  prompt: number;
  completion: number;
  context: number;
  [key: string]: unknown;
}

/** An endpoint's config object mapping model keys to their respective prompt, completion rates, and context limit */
export type EndpointTokenConfig = Record<string, TokenConfig>;
