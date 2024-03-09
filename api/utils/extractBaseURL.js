/**
 * Extracts a valid OpenAI baseURL from a given string, matching "url/v1," followed by an optional suffix.
 * The suffix can be one of several predefined values (e.g., 'openai', 'azure-openai', etc.),
 * accommodating different proxy patterns like Cloudflare, LiteLLM, etc.
 * Returns the original URL if no valid pattern is found.
 *
 * Examples:
 * - `https://open.ai/v1/chat` -> `https://open.ai/v1`
 * - `https://open.ai/v1/chat/completions` -> `https://open.ai/v1`
 * - `https://gateway.ai.cloudflare.com/v1/account/gateway/azure-openai/completions` -> `https://gateway.ai.cloudflare.com/v1/account/gateway/azure-openai`
 * - `https://open.ai/v1/hi/openai` -> `https://open.ai/v1/hi/openai`
 * - `https://api.example.com/v1/replicate` -> `https://api.example.com/v1/replicate`
 *
 * @param {string} url - The URL to be processed.
 * @returns {string | undefined} The matched pattern or input if no match is found.
 */
function extractBaseURL(url) {
  if (!url || typeof url !== 'string') {
    return undefined;
  }

  if (!url.includes('/v1')) {
    return url;
  }

  // Find the index of '/v1' to use it as a reference point.
  const v1Index = url.indexOf('/v1');

  // Extract the part of the URL up to and including '/v1'.
  let baseUrl = url.substring(0, v1Index + 3);

  const openai = 'openai';
  // Find which suffix is present.
  const suffixes = [
    'azure-openai',
    openai,
    'replicate',
    'huggingface',
    'workers-ai',
    'aws-bedrock',
  ];
  const suffixUsed = suffixes.find((suffix) => url.includes(`/${suffix}`));

  if (suffixUsed === 'azure-openai') {
    return url.split(/\/(chat|completion)/)[0];
  }

  // Check if the URL has '/openai' immediately after '/v1'.
  const openaiIndex = url.indexOf(`/${openai}`, v1Index + 3);
  // Find which suffix is present in the URL, if any.
  const suffixIndex =
    suffixUsed === openai ? openaiIndex : url.indexOf(`/${suffixUsed}`, v1Index + 3);

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
  } else if (suffixIndex > 0) {
    // If a suffix is present but not immediately after '/v1', we need to include the reverse proxy pattern.
    baseUrl = url.substring(0, suffixIndex + suffixUsed.length + 1);
  }

  return baseUrl;
}

module.exports = extractBaseURL; // Export the function for use in your test file.
