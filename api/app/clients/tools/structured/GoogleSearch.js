const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');

class GoogleSearchResults extends Tool {
  static lc_name() {
    return 'GoogleSearchResults';
  }

  constructor(fields = {}) {
    super(fields);
    this.envVarApiKey = 'GOOGLE_SEARCH_API_KEY';
    this.envVarSearchEngineId = 'GOOGLE_CSE_ID';
    this.override = fields.override ?? false;
    this.apiKey = fields.apiKey ?? getEnvironmentVariable(this.envVarApiKey);
    this.searchEngineId =
      fields.searchEngineId ?? getEnvironmentVariable(this.envVarSearchEngineId);

    this.kwargs = fields?.kwargs ?? {};
    this.name = 'google';
    this.description =
      'A search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events.';

    this.schema = z.object({
      query: z.string().min(1).describe('The search query string.'),
      max_results: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe('The maximum number of search results to return. Defaults to 10.'),
      // Note: Google API has its own parameters for search customization, adjust as needed.
    });
  }

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const { query, max_results = 5 } = validationResult.data;

    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${this.apiKey}&cx=${
        this.searchEngineId
      }&q=${encodeURIComponent(query)}&num=${max_results}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    const json = await response.json();
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${json.error.message}`);
    }

    return JSON.stringify(json);
  }
}

module.exports = GoogleSearchResults;
