const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');

class TavilySearchResults extends Tool {
  static lc_name() {
    return 'TavilySearchResults';
  }

  constructor(fields = {}) {
    super(fields);
    this.envVar = 'TAVILY_API_KEY';
    /* Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;
    this.apiKey = fields.apiKey ?? this.getApiKey();

    this.kwargs = fields?.kwargs ?? {};
    this.name = 'tavily_search_results_json';
    this.description =
      'A search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events.';

    this.schema = z.object({
      query: z.string().min(1).describe('The search query string.'),
      max_results: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe('The maximum number of search results to return. Defaults to 5.'),
      search_depth: z
        .enum(['basic', 'advanced'])
        .optional()
        .describe(
          'The depth of the search, affecting result quality and response time (`basic` or `advanced`). Default is basic for quick results and advanced for indepth high quality results but longer response time. Advanced calls equals 2 requests.',
        ),
      include_images: z
        .boolean()
        .optional()
        .describe(
          'Whether to include a list of query-related images in the response. Default is False.',
        ),
      include_answer: z
        .boolean()
        .optional()
        .describe('Whether to include answers in the search results. Default is False.'),
      // include_raw_content: z.boolean().optional().describe('Whether to include raw content in the search results. Default is False.'),
      // include_domains: z.array(z.string()).optional().describe('A list of domains to specifically include in the search results.'),
      // exclude_domains: z.array(z.string()).optional().describe('A list of domains to specifically exclude from the search results.'),
    });
  }

  getApiKey() {
    const apiKey = getEnvironmentVariable(this.envVar);
    if (!apiKey && !this.override) {
      throw new Error(`Missing ${this.envVar} environment variable.`);
    }
    return apiKey;
  }

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const { query, ...rest } = validationResult.data;

    const requestBody = {
      api_key: this.apiKey,
      query,
      ...rest,
      ...this.kwargs,
    };

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${json.error}`);
    }

    return JSON.stringify(json);
  }
}

module.exports = TavilySearchResults;
