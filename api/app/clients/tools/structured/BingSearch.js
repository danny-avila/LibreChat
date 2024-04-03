const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');

class BingSearch extends Tool {
  static lc_name() {
    return 'BingSearch';
  }

  constructor(fields = {}) {
    super(fields);
    this.envVarApiKey = 'BING_SEARCH_API_KEY';
    this.apiKey = fields.apiKey ?? getEnvironmentVariable(this.envVarApiKey);

    this.kwargs = fields?.kwargs ?? {};
    this.name = 'bing';
    this.description =
      'A search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events.';

    this.schema = z.object({
      query: z.string().min(1).describe('The search query string.'),
      max_results: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe('The maximum number of search results to return. Defaults to 10.'),
      market: z
        .string()
        .optional()
        .describe('The market where the results come from. Defaults to "en-US".'),
    });
  }

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const { query, max_results = 15 } = validationResult.data;

    try {
      const response = await fetch(
        `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(
          query,
        )}&count=${max_results}`,
        {
          method: 'GET',
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();

      if (json.error) {
        throw new Error(`Request failed: ${json.error.message}`);
      }

      const webPages = json.webPages?.value || [];
      const rankingResponse = json.rankingResponse?.value || [];
      const entities = json.entities?.value || [];
      const news = json.news?.value || [];
      const computation = json.computation?.value || [];
      const timeZone = json.timeZone?.value || [];
      const spellSuggestion = json.spellSuggestion?.value || '';
      const translations = json.translations?.value || [];

      const results = {
        webPages,
        entities,
        news,
        computation,
        timeZone,
        translations,
        spellSuggestion,
        rankingResponse,
      };

      return JSON.stringify(results);
    } catch (error) {
      throw new Error(`Request failed: ${error.message}`);
    }
  }
}

module.exports = BingSearch;
