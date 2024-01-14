/**
 * Extracts a valid OpenAI baseURL from a given string, matching "url/v1," also an added suffix,
 * ending with "/openai" (to allow the Cloudflare, LiteLLM pattern).
 * Returns the original URL if no match is found.
 *
 * Examples:
 * - `https://open.ai/v1/chat` -> `https://open.ai/v1`
 * - `https://open.ai/v1/chat/completions` -> `https://open.ai/v1`
 * - `https://open.ai/v1/ACCOUNT/GATEWAY/openai/completions` -> `https://open.ai/v1/ACCOUNT/GATEWAY/openai`
 * - `https://open.ai/v1/hi/openai` -> `https://open.ai/v1/hi/openai`
 *
 * @param {string} url - The URL to be processed.
 * @returns {string} The matched pattern or input if no match is found.
 */
function extractBaseURL(url) {
  if (!url.includes('/v1')) {
    return url;
  }

  // Find the index of '/v1' to use it as a reference point.
  const v1Index = url.indexOf('/v1');

  // Extract the part of the URL up to and including '/v1'.
  let baseUrl = url.substring(0, v1Index + 3);

  // Check if the URL has '/openai' immediately after '/v1'.
  const openaiIndex = url.indexOf('/openai', v1Index + 3);

  // If '/openai' is found right after '/v1', include it in the base URL.
  if (openaiIndex === v1Index + 3) {
    // Find the next slash or the end of the URL after '/openai'.
    const nextSlashIndex = url.indexOf('/', openaiIndex + 7);
    if (nextSlashIndex === -1) {
      // If there is no next slash, the rest of the URL is the base URL.
      baseUrl = url.substring(0, openaiIndex + 7);
    } else {
      // If there is a next slash, the base URL goes up to but not including the slash.
      baseUrl = url.substring(0, nextSlashIndex);
    }
  } else if (openaiIndex > 0) {
    // If '/openai' is present but not immediately after '/v1', we need to include the reverse proxy pattern.
    baseUrl = url.substring(0, openaiIndex + 7);
  }

  return baseUrl;
}

module.exports = extractBaseURL; // Export the function for use in your test file.
