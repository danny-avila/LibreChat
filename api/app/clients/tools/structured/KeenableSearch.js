const { ProxyAgent, fetch } = require('undici');
const { Tool } = require('@librechat/agents/langchain/tools');
const { getEnvironmentVariable } = require('@librechat/agents/langchain/utils/env');

const KEENABLE_DEFAULT_API_URL = 'https://api.keenable.ai/v1/search';

const keenableSearchJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description: 'The search query string.',
    },
    max_results: {
      type: 'number',
      minimum: 1,
      maximum: 20,
      description: 'The maximum number of search results to return. Defaults to 10.',
    },
  },
  required: ['query'],
};

class KeenableSearch extends Tool {
  static lc_name() {
    return 'KeenableSearch';
  }

  constructor(fields = {}) {
    super(fields);
    this.envVar = 'KEENABLE_API_KEY';
    this.urlEnvVar = 'KEENABLE_API_URL';
    /* Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;
    this.apiKey = fields[this.envVar] ?? this.getApiKey();
    this.apiUrl =
      fields[this.urlEnvVar] ?? getEnvironmentVariable(this.urlEnvVar) ?? KEENABLE_DEFAULT_API_URL;

    this.kwargs = fields?.kwargs ?? {};
    this.name = 'keenable_search';
    this.description =
      "Keenable is a search engine built for AI agents. Returns relevant web pages with titles, URLs, and content snippets. Use it to answer questions about current events, recent information, or anything beyond the model's training data.";

    this.schema = keenableSearchJsonSchema;
  }

  static get jsonSchema() {
    return keenableSearchJsonSchema;
  }

  getApiKey() {
    const apiKey = getEnvironmentVariable(this.envVar);
    if (!apiKey && !this.override) {
      throw new Error(`Missing ${this.envVar} environment variable.`);
    }
    return apiKey;
  }

  async _call(input) {
    const { query, max_results, ...rest } = input;

    const requestBody = {
      query,
      max_results: max_results ?? 10,
      ...rest,
      ...this.kwargs,
    };

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    };

    if (process.env.PROXY) {
      fetchOptions.dispatcher = new ProxyAgent(process.env.PROXY);
    }

    const response = await fetch(this.apiUrl, fetchOptions);

    const json = await response.json();
    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}: ${json?.detail?.error || json?.error || JSON.stringify(json)}`,
      );
    }

    return JSON.stringify(json);
  }
}

module.exports = KeenableSearch;
