/* eslint-disable no-useless-escape */
const axios = require('axios');
const { Tool } = require('langchain/tools');
const { logger } = require('~/config');

class DrupalFAAPI extends Tool {
  constructor(fields) {
    super();
    this.name = 'drupal_fa_api';

    this.apiKey = this.getApiKey();
    this.baseUrl = this.getBaseUrl();
   
    this.description_for_model = `Give a prompt for another assistant to retrieve the query string. For example, "Find the latest articles about climate change."`;

    this.description = `A tool for querying the Drupal FA API. The input should be a prompt for the assistant to retrieve the query string. The output will be the raw text response from the API.`;
    
  }

  async fetchRawText(url) {
    try {
      const response = await axios.get(url, { responseType: 'text' });
      return response.data;
    } catch (error) {
      logger.error('[DrupalFAAPI] Error fetching raw text:', error);
      throw error;
    }
  }

  getApiKey() {
    const apiKey = process.env.DRUPAL_FA_API_KEY || '';
    if (!apiKey) {
      throw new Error('Missing DRUPAL_FA_API_KEY environment variable.');
    }
    return apiKey;
  }

  getBaseUrl() {
    const baseUrl = process.env.DRUPAL_FA_API_BASE_URL || '';
    if (!baseUrl) {
      throw new Error('Missing DRUPAL_FA_API_BASE_URL environment variable.');
    }
    return baseUrl;
  }

  createDrupalJSONAPIURL(query) {
    // Clean up query
    //const formattedQuery = query.replaceAll(/`/g, '').replaceAll(/\n/g, ' ');
    const baseURL = this.baseUrl || this.getBaseUrl();
    //const encodedQuery = encodeURIComponent(formattedQuery);
    const encodedQuery = encodeURIComponent(query);
    const apikey = this.apiKey || this.getApiKey();
    const url = `${baseURL}/node/articolo?api_key=${apikey}`;

    //const url = `${baseURL}?input=${encodedQuery}&api_key=${apikey}`;
    return url;
  }

  async _call(input) {
    try {
      const url = this.createDrupalJSONAPIURL(input);
      logger.info(`[DrupalFAAPI] Querying Drupal FA: ${url}`);
      const response = await this.fetchRawText(url);
      return response;
    } catch (error) {
      if (error.response && error.response.data) {
        logger.error('[DrupalFAAPI] Error data:', error);
        return error.response.data;
      } else {
        logger.error('[DrupalFAAPI] Error querying Drupal FA:', error);
        return 'There was an error querying Drupal FA.';
      }
    }
  }

}

module.exports = DrupalFAAPI;