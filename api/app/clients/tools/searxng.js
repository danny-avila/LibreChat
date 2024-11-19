const axios = require('axios');
require('dotenv').config();

class SearXNGService {
  constructor() {
    if (!process.env.SEARXNG_QUERY_URL) {
      throw new Error('SEARXNG_QUERY_URL environment variable is not set');
    }
    this.baseURL = process.env.SEARXNG_QUERY_URL;
  }

  async search(query) {
    try {
      const response = await axios.get(this.baseURL, {
        params: {
          q: query,
          engines: 'duckduckgo,google',
          format: 'json',
          count: 15
        }
      });

      return this.processResults(response.data.results);
    } catch (error) {
      console.error('SearXNG search error:', error);
      throw error;
    }
  }

  processResults(results) {
    // Process and summarize results
    const processed = results.map(result => ({
      title: result.title,
      link: result.url,
      snippet: result.content
    }));

    return processed;
  }
}

module.exports = SearXNGService;
