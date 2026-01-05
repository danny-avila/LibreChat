const { logger } = require('@librechat/data-schemas');

/**
 * Detects if the request is for a Perplexity endpoint
 * @param {string} endpoint - The endpoint name
 * @param {string} [baseURL] - The base URL for the endpoint
 * @returns {boolean} True if this is a Perplexity endpoint
 */
function detectPerplexityResponse(endpoint, baseURL) {
  if (!endpoint && !baseURL) {
    return false;
  }

  // Check endpoint name
  if (endpoint && typeof endpoint === 'string' && endpoint.toLowerCase().includes('perplexity')) {
    return true;
  }

  // Check baseURL contains perplexity
  if (baseURL && typeof baseURL === 'string' && baseURL.toLowerCase().includes('perplexity')) {
    return true;
  }

  return false;
}

/**
 * Transforms Perplexity citations and search_results to LibreChat SearchResultData format
 * @param {string[]} citations - Array of citation URLs from Perplexity
 * @param {Array<{title: string, url: string, date?: string, snippet?: string}>} search_results - Detailed search results from Perplexity
 * @returns {Object} SearchResultData object compatible with LibreChat's frontend
 */
function transformPerplexityCitations(citations, search_results) {
  const searchResultData = {
    organic: [],
    topStories: [],
    images: [],
    videos: [],
    references: [],
  };

  // Prefer search_results if available, fallback to citations
  const sources = search_results && search_results.length > 0 ? search_results : citations;

  if (!sources || sources.length === 0) {
    return searchResultData;
  }

  // Transform to organic search results format
  searchResultData.organic = sources.map((source, index) => {
    // If source is a string (from citations array), create basic object
    if (typeof source === 'string') {
      return {
        link: source,
        title: `Source ${index + 1}`,
        snippet: '',
        date: new Date().toISOString().split('T')[0],
        position: index + 1,
      };
    }

    // If source is an object (from search_results array)
    return {
      link: source.url || source.link || '',
      title: source.title || `Source ${index + 1}`,
      snippet: source.snippet || '',
      date: source.date || new Date().toISOString().split('T')[0],
      position: index + 1,
    };
  });

  return searchResultData;
}

/**
 * Injects Unicode citation markers into response text
 * Replaces [1][2] style markers with Unicode format that frontend expects
 * @param {string} content - Response text with [N] style citation markers
 * @param {number} turnNumber - Current conversation turn number
 * @returns {string} Content with Unicode citation markers injected
 */
function injectCitationMarkers(content, turnNumber) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // Unicode citation marker (U+E202 - Private Use Area)
  // This creates the actual Unicode character, not the escape sequence
  const CITATION_MARKER = String.fromCharCode(0xe202);

  // Replace [1], [2], etc. with Unicode markers
  // Regex to match [number] patterns
  const citationRegex = /\[(\d+)\]/g;

  const processedContent = content.replace(citationRegex, (match, num) => {
    const citationIndex = parseInt(num, 10) - 1; // Convert 1-based to 0-based index
    if (citationIndex < 0) {
      return match; // Keep original if invalid number
    }

    // Create Unicode marker: {U+E202}turn{N}search{index}
    // e.g., turn0search0 for first citation on turn 0
    // The CITATION_MARKER is the actual Unicode character U+E202
    // NOTE: We add a space before the marker to prevent breaking markdown emphasis parsing.
    // Without the space, `**bold**{U+E202}` is not recognized as valid bold by remark-gfm
    // because U+E202 (Private Use Area) is not classified as punctuation or whitespace.
    return ` ${CITATION_MARKER}turn${turnNumber}search${citationIndex}`;
  });

  return processedContent;
}

/**
 * Extracts citation data from API response metadata or raw response
 * @param {Object} metadata - Response metadata object
 * @param {Object} [rawResponse] - Raw API response (if available)
 * @returns {{citations: string[], search_results: Array<Object>}} Extracted citation data
 */
function extractCitationData(metadata, rawResponse) {
  const result = {
    citations: null,
    search_results: null,
  };

  // Try to extract from raw response first
  if (rawResponse) {
    if (Array.isArray(rawResponse.citations)) {
      result.citations = rawResponse.citations;
    }
    if (Array.isArray(rawResponse.search_results)) {
      result.search_results = rawResponse.search_results;
    }
  }

  // Try to extract from metadata
  if (metadata) {
    if (Array.isArray(metadata.citations)) {
      result.citations = metadata.citations;
    }
    if (Array.isArray(metadata.search_results)) {
      result.search_results = metadata.search_results;
    }
  }

  return result;
}

/**
 * Processes Perplexity API response to extract and transform citations
 * This is the main entry point for Perplexity citation processing
 * @param {Object} params - Processing parameters
 * @param {string} params.completion - The completion text from Perplexity
 * @param {Object} params.metadata - Response metadata
 * @param {Object} [params.rawResponse] - Raw API response (if available)
 * @param {number} params.turnNumber - Current conversation turn number
 * @param {string} [params.endpoint] - Endpoint name
 * @param {string} [params.baseURL] - Base URL
 * @returns {{processedCompletion: string, searchResults: Object|null}} Processed response
 */
function processPerplexityResponse({
  completion,
  metadata,
  rawResponse,
  turnNumber,
  endpoint,
  baseURL,
}) {
  // Check if this is a Perplexity response
  if (!detectPerplexityResponse(endpoint, baseURL)) {
    return {
      processedCompletion: completion,
      searchResults: null,
    };
  }

  // Extract citation data
  const citationData = extractCitationData(metadata, rawResponse);

  // If no citations found, return original completion
  if (!citationData.citations && !citationData.search_results) {
    logger.debug('[Perplexity Citations] No citation data found in response');
    return {
      processedCompletion: completion,
      searchResults: null,
    };
  }

  logger.info('[Perplexity Citations] Processing citations', {
    citationsCount: citationData.citations?.length || 0,
    searchResultsCount: citationData.search_results?.length || 0,
    turnNumber,
  });

  // Transform citations to SearchResultData format
  const searchResults = transformPerplexityCitations(
    citationData.citations,
    citationData.search_results,
  );

  // Inject Unicode citation markers into text
  // Handle both string completions and array of content parts
  let processedCompletion;
  if (typeof completion === 'string') {
    processedCompletion = injectCitationMarkers(completion, turnNumber);
  } else if (Array.isArray(completion)) {
    // Process each content part that has text
    processedCompletion = completion.map((part) => {
      if (part && part.type === 'text' && typeof part.text === 'string') {
        return {
          ...part,
          text: injectCitationMarkers(part.text, turnNumber),
        };
      }
      return part;
    });
  } else {
    // Unknown format, return as-is
    processedCompletion = completion;
  }

  return {
    processedCompletion,
    searchResults,
  };
}

module.exports = {
  detectPerplexityResponse,
  transformPerplexityCitations,
  injectCitationMarkers,
  extractCitationData,
  processPerplexityResponse,
};
