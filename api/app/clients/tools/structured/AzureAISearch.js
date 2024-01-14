const { z } = require('zod');
const { StructuredTool } = require('langchain/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

class AzureAISearch extends StructuredTool {
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

    // Initialize properties using helper function
    this.serviceEndpoint = this._initializeField(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      'AZURE_AI_SEARCH_SERVICE_ENDPOINT',
    );
    this.indexName = this._initializeField(
      fields.AZURE_AI_SEARCH_INDEX_NAME,
      'AZURE_AI_SEARCH_INDEX_NAME',
    );
    this.apiKey = this._initializeField(fields.AZURE_AI_SEARCH_API_KEY, 'AZURE_AI_SEARCH_API_KEY');
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
    if (!this.serviceEndpoint || !this.indexName || !this.apiKey) {
      throw new Error(
        'Missing AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_INDEX_NAME, or AZURE_AI_SEARCH_API_KEY environment variable.',
      );
    }

    // Create SearchClient
    this.client = new SearchClient(
      this.serviceEndpoint,
      this.indexName,
      new AzureKeyCredential(this.apiKey),
      { apiVersion: this.apiVersion },
    );

    // Define schema
    this.schema = z.object({
      query: z.string().describe('Search word or phrase to Azure AI Search'),
    });
  }

  // Simplified getter methods
  get name() {
    return 'azure-ai-search';
  }

  get description() {
    return 'Use the \'azure-ai-search\' tool to retrieve search results relevant to your input';
  }

  // Improved error handling and logging
  async _call(data) {
    const { query } = data;
    try {
      const searchOption = {
        queryType: this.queryType,
        top: this.top,
      };
      if (this.select) {
        searchOption.select = this.select.split(',');
      }
      const searchResults = await this.client.search(query, searchOption);
      const resultDocuments = [];
      for await (const result of searchResults.results) {
        resultDocuments.push(result.document);
      }
      return JSON.stringify(resultDocuments);
    } catch (error) {
      logger.error('Azure AI Search request failed', error);
      return 'There was an error with Azure AI Search.';
    }
  }
}

module.exports = AzureAISearch;
