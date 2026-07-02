const { ProxyAgent, fetch } = require('undici');
const { Tool } = require('@librechat/agents/langchain/tools');
const { getEnvironmentVariable } = require('@librechat/agents/langchain/utils/env');

const KEENABLE_DEFAULT_API_URL = 'https://api.keenable.ai/v1/search';
const KEENABLE_PUBLIC_API_URL = 'https://api.keenable.ai/v1/search/public';

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
    /* Keyless by default: an API key is optional and only lifts rate limits.
     * With a key we hit the authenticated endpoint; without one we fall back to
     * the public endpoint, so the tool works with zero signup. */
    this.apiKey = fields[this.envVar] ?? getEnvironmentVariable(this.envVar);
    this.apiUrl =
      fields[this.urlEnvVar] ??
      getEnvironmentVariable(this.urlEnvVar) ??
      (this.apiKey ? KEENABLE_DEFAULT_API_URL : KEENABLE_PUBLIC_API_URL);

    this.kwargs = fields?.kwargs ?? {};
    this.name = 'keenable_search';
    this.description =
      "Keenable is a search engine built for AI agents. Returns relevant web pages with titles, URLs, and content snippets. Use it to answer questions about current events, recent information, or anything beyond the model's training data.";

    this.schema = keenableSearchJsonSchema;
  }

  static get jsonSchema() {
    return keenableSearchJsonSchema;
  }

  async _call(input) {
    const { query, max_results } = input;

    /* The API accepts the query plus operator-configured kwargs; the result
     * count is applied client-side because the endpoint has no count param. */
    const requestBody = { query, ...this.kwargs };

    const headers = {
      'Content-Type': 'application/json',
      /* Required for keyless requests and used for traffic attribution. */
      'X-Keenable-Title': 'LibreChat',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const fetchOptions = {
      method: 'POST',
      headers,
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

    const limit = max_results ?? 10;
    if (Array.isArray(json.results) && json.results.length > limit) {
      json.results = json.results.slice(0, limit);
    }

    return JSON.stringify(json);
  }
}

module.exports = KeenableSearch;
