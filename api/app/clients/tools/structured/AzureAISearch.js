const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

class AzureAISearch extends Tool {
  // Constants for default values
  static DEFAULT_API_VERSION = '2023-11-01';
  static DEFAULT_QUERY_TYPE = 'simple';
  static DEFAULT_TOP = 5;

  // Helper function for initializing properties
  _initializeField(field, envVar, defaultValue) {
    return field || process.env[envVar] || defaultValue;
  }

  constructor(fields = {}) {
    super();
    this.name = 'azure-ai-search';
    this.description =
      'Use the \'azure-ai-search\' tool to retrieve search results relevant to your input';
    /* Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;

    // Define schema
    this.schema = z.object({
      query: z.string().describe('Search word or phrase to Azure AI Search'),
    });

    // Initialize properties using helper function
    this.serviceEndpoint = this._initializeField(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      'AZURE_AI_SEARCH_SERVICE_ENDPOINT',
    );
    // Get the indexes as a comma-separated string
    this.indexNames = this._initializeField(
      fields.AZURE_AI_SEARCH_INDEX_NAME,
      'AZURE_AI_SEARCH_INDEX_NAME',
    );
    this.apiKey = this._initializeField(
      fields.AZURE_AI_SEARCH_API_KEY,
      'AZURE_AI_SEARCH_API_KEY',
    );
    this.apiVersion = this._initializeField(
      fields.AZURE_AI_SEARCH_API_VERSION,
      'AZURE_AI_SEARCH_API_VERSION',
      AzureAISearch.DEFAULT_API_VERSION,
    );
    this.queryType = this._initializeField(
      fields.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE,
      'AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE',
      AzureAISearch.DEFAULT_QUERY_TYPE,
    );
    this.top = this._initializeField(
      fields.AZURE_AI_SEARCH_SEARCH_OPTION_TOP,
      'AZURE_AI_SEARCH_SEARCH_OPTION_TOP',
      AzureAISearch.DEFAULT_TOP,
    );
    this.select = this._initializeField(
      fields.AZURE_AI_SEARCH_SEARCH_OPTION_SELECT,
      'AZURE_AI_SEARCH_SEARCH_OPTION_SELECT',
    );

    // Check for required fields
    if (!this.override && (!this.serviceEndpoint || !this.indexNames || !this.apiKey)) {
      throw new Error(
        'Missing AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_INDEX_NAME, or AZURE_AI_SEARCH_API_KEY environment variable.',
      );
    }

    if (this.override) {
      return;
    }

    // Split the indexNames by comma to support multiple indexes, trim whitespace,
    // convert to lowercase, and filter out any empty strings.
    const indexes = this.indexNames
      .split(',')
      .map(index => index.trim().toLowerCase())
      .filter(index => index.length > 0);

    if (indexes.length === 0) {
      throw new Error('No valid index names provided in AZURE_AI_SEARCH_INDEX_NAME.');
    }

    // Create a client for each index.
    this.clients = indexes.map(index =>
      new SearchClient(
        this.serviceEndpoint,
        index,
        new AzureKeyCredential(this.apiKey),
        { apiVersion: this.apiVersion },
      ),
    );
  }

  // Improved error handling and logging
  async _call(data) {
    const { query } = data;
    try {
      const searchOption = {
        queryType: this.queryType,
        top: typeof this.top === 'string' ? Number(this.top) : this.top,
      };
      if (this.select) {
        searchOption.select = this.select.split(',');
      }

      // Query all indexes concurrently
      const searchPromises = this.clients.map(async (client) => {
        const resultDocuments = [];
        const searchResults = await client.search(query, searchOption);
        for await (const result of searchResults.results) {
          resultDocuments.push(result.document);
        }
        return resultDocuments;
      });

      // Wait for all search promises to complete and flatten the results
      const resultsByIndex = await Promise.all(searchPromises);
      const combinedResults = resultsByIndex.flat();
      return JSON.stringify(combinedResults);
    } catch (error) {
      logger.error('Azure AI Search request failed', error);
      return 'There was an error with Azure AI Search.';
    }
  }
}

module.exports = AzureAISearch;