const { google } = require('googleapis');
const { Tool } = require('langchain/tools');
const { logger } = require('~/config');

/**
 * Represents a tool that allows an agent to use the Google Custom Search API.
 * @extends Tool
 */
class GoogleSearchAPI extends Tool {
  constructor(fields = {}) {
    super();
    this.cx = fields.GOOGLE_CSE_ID || this.getCx();
    this.apiKey = fields.GOOGLE_API_KEY || this.getApiKey();
    this.customSearch = undefined;
  }

  /**
   * The name of the tool.
   * @type {string}
   */
  name = 'google';

  /**
   * A description for the agent to use
   * @type {string}
   */
  description =
    'Use the \'google\' tool to retrieve internet search results relevant to your input. The results will return links and snippets of text from the webpages';
  description_for_model =
    'Use the \'google\' tool to retrieve internet search results relevant to your input. The results will return links and snippets of text from the webpages';

  getCx() {
    const cx = process.env.GOOGLE_CSE_ID || '';
    if (!cx) {
      throw new Error('Missing GOOGLE_CSE_ID environment variable.');
    }
    return cx;
  }

  getApiKey() {
    const apiKey = process.env.GOOGLE_API_KEY || '';
    if (!apiKey) {
      throw new Error('Missing GOOGLE_API_KEY environment variable.');
    }
    return apiKey;
  }

  getCustomSearch() {
    if (!this.customSearch) {
      const version = 'v1';
      this.customSearch = google.customsearch(version);
    }
    return this.customSearch;
  }

  resultsToReadableFormat(results) {
    let output = 'Results:\n';

    results.forEach((resultObj, index) => {
      output += `Title: ${resultObj.title}\n`;
      output += `Link: ${resultObj.link}\n`;
      if (resultObj.snippet) {
        output += `Snippet: ${resultObj.snippet}\n`;
      }

      if (index < results.length - 1) {
        output += '\n';
      }
    });

    return output;
  }

  /**
   * Calls the tool with the provided input and returns a promise that resolves with a response from the Google Custom Search API.
   * @param {string} input - The input to provide to the API.
   * @returns {Promise<String>} A promise that resolves with a response from the Google Custom Search API.
   */
  async _call(input) {
    try {
      const metadataResults = [];
      const response = await this.getCustomSearch().cse.list({
        q: input,
        cx: this.cx,
        auth: this.apiKey,
        num: 5, // Limit the number of results to 5
      });

      // return response.data;
      // logger.debug(response.data);

      if (!response.data.items || response.data.items.length === 0) {
        return this.resultsToReadableFormat([
          { title: 'No good Google Search Result was found', link: '' },
        ]);
      }

      // const results = response.items.slice(0, numResults);
      const results = response.data.items;

      for (const result of results) {
        const metadataResult = {
          title: result.title || '',
          link: result.link || '',
        };
        if (result.snippet) {
          metadataResult.snippet = result.snippet;
        }
        metadataResults.push(metadataResult);
      }

      return this.resultsToReadableFormat(metadataResults);
    } catch (error) {
      logger.error('[GoogleSearchAPI]', error);
      // throw error;
      return 'There was an error searching Google.';
    }
  }
}

module.exports = GoogleSearchAPI;
