const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');

/**
 * Tool for the Traversaal AI search API, Ares.
 */
class TraversaalSearch extends Tool {
  static lc_name() {
    return 'TraversaalSearch';
  }
  constructor(fields) {
    super(fields);
    this.name = 'traversaal_search';
    this.description = `An AI search engine optimized for comprehensive, accurate, and trusted results.
    Useful for when you need to answer questions about current events. Input should be a search query.`;
    this.description_for_model =
      '\'Please create a specific sentence for the AI to understand and use as a query to search the web based on the user\'s request. For example, "Find information about the highest mountains in the world." or "Show me the latest news articles about climate change and its impact on polar ice caps."\'';
    this.schema = z.object({
      query: z
        .string()
        .describe(
          "A properly written sentence to be interpreted by an AI to search the web according to the user's request.",
        ),
    });

    this.apiKey = fields?.TRAVERSAAL_API_KEY ?? this.getApiKey();
  }

  getApiKey() {
    const apiKey = getEnvironmentVariable('TRAVERSAAL_API_KEY');
    if (!apiKey && this.override) {
      throw new Error(
        'No Traversaal API key found. Either set an environment variable named "TRAVERSAAL_API_KEY" or pass an API key as "apiKey".',
      );
    }
    return apiKey;
  }

  async _call({ query }, _runManager) {
    const body = {
      query: [query],
    };
    try {
      const response = await fetch('https://api-ares.traversaal.ai/live/predict', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({ ...body }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(
          `Request failed with status code ${response.status}: ${json.error ?? json.message}`,
        );
      }
      if (!json.data) {
        throw new Error('Could not parse Traversaal API results. Please try again.');
      }

      const baseText = json.data?.response_text ?? '';
      const sources = json.data?.web_url;
      const noResponse = 'No response found in Traversaal API results';

      if (!baseText && !sources) {
        return noResponse;
      }

      const sourcesText = sources?.length ? '\n\nSources:\n - ' + sources.join('\n - ') : '';

      const result = baseText + sourcesText;

      if (!result) {
        return noResponse;
      }

      return result;
    } catch (error) {
      logger.error('Traversaal API request failed', error);
      return `Traversaal API request failed: ${error.message}`;
    }
  }
}

module.exports = TraversaalSearch;
