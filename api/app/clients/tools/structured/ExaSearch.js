const { fetch } = require('undici');
const { Tool } = require('@librechat/agents/langchain/tools');
const { getEnvironmentVariable } = require('@librechat/agents/langchain/utils/env');
const { getEnvProxyDispatcher } = require('@librechat/api');

const exaSearchJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description: 'The search query string.',
    },
    numResults: {
      type: 'number',
      minimum: 1,
      maximum: 25,
      description: 'The maximum number of search results to return. Defaults to 10.',
    },
    type: {
      type: 'string',
      enum: ['auto', 'fast', 'instant', 'deep-lite', 'deep', 'deep-reasoning'],
      description:
        'The search mode. `auto` balances speed and quality (default). `fast` and `instant` trade quality for lower latency. `deep-lite`, `deep`, and `deep-reasoning` trade higher latency for more reasoning and synthesis depth.',
    },
    category: {
      type: 'string',
      enum: ['company', 'research paper', 'news', 'personal site', 'financial report'],
      description: 'Restrict results to a specialized index. Omit for general web search.',
    },
    includeDomains: {
      type: 'array',
      items: { type: 'string' },
      description: 'A list of domains to specifically include in the search results.',
    },
    excludeDomains: {
      type: 'array',
      items: { type: 'string' },
      description: 'A list of domains to specifically exclude from the search results.',
    },
    text: {
      type: 'boolean',
      description:
        'Whether to return the full page text instead of highlights. Highlights are returned by default and are more token-efficient.',
    },
    maxAgeHours: {
      type: 'number',
      minimum: 0,
      description:
        'Maximum age of the page content in hours before it is crawled again. Use a small value only when freshness matters, as crawling increases response time.',
    },
  },
  required: ['query'],
};

class ExaSearch extends Tool {
  static lc_name() {
    return 'ExaSearch';
  }

  constructor(fields = {}) {
    super(fields);
    this.envVar = 'EXA_API_KEY';
    /* Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;
    this.apiKey = fields[this.envVar] ?? this.getApiKey();

    this.kwargs = fields?.kwargs ?? {};
    this.name = 'exa_search';
    this.description =
      'A neural search engine that finds web pages by meaning, returning relevant excerpts or full page content. Useful for when you need to answer questions about current events or research a topic in depth.';

    this.schema = exaSearchJsonSchema;
  }

  static get jsonSchema() {
    return exaSearchJsonSchema;
  }

  getApiKey() {
    const apiKey = getEnvironmentVariable(this.envVar);
    if (!apiKey && !this.override) {
      throw new Error(`Missing ${this.envVar} environment variable.`);
    }
    return apiKey;
  }

  async _call(input) {
    const { query, text, maxAgeHours, ...rest } = input;

    const contents = text === true ? { text: true } : { highlights: true };
    if (maxAgeHours != null) {
      contents.maxAgeHours = maxAgeHours;
    }

    const requestBody = {
      query,
      type: 'auto',
      ...rest,
      contents,
      ...this.kwargs,
    };

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    };

    const dispatcher = getEnvProxyDispatcher();
    if (dispatcher) {
      fetchOptions.dispatcher = dispatcher;
    }

    const response = await fetch('https://api.exa.ai/search', fetchOptions);

    const json = await response.json();
    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}: ${json?.message || json?.error}`,
      );
    }

    return JSON.stringify(json);
  }
}

module.exports = ExaSearch;
