const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');

class AzureAISearch extends Tool {
  // Constants for default values
  static DEFAULT_API_VERSION = '2025-09-01';
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
      "Use the 'azure-ai-search' tool to retrieve search results relevant to your input";
    /* Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;

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
    const vectorFieldValue = this._initializeField(
      fields.AZURE_AI_SEARCH_VECTOR_FIELDS,
      'AZURE_AI_SEARCH_VECTOR_FIELDS',
    );
    // Parse comma-separated vector fields
    this.vectorFields = vectorFieldValue
      ? vectorFieldValue
          .split(',')
          .map((field) => field.trim())
          .filter((field) => field.length > 0)
      : [];

    // Define schema conditionally based on vectorFields configuration
    const schemaFields = {
      query: z.string().describe('Text for keyword search'),
      filter: z
        .string()
        .optional()
        .describe('The OData $filter expression to apply to the search query.'),
    };
    if (this.vectorFields.length > 0) {
      schemaFields.vectorQueryText = z
        .string()
        .optional()
        .describe('The text to be vectorized to perform a vector search query.');
    }
    this.schema = z.object(schemaFields);

    // Check for required fields
    if (!this.override && (!this.serviceEndpoint || !this.indexName || !this.apiKey)) {
      throw new Error(
        'Missing AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_INDEX_NAME, or AZURE_AI_SEARCH_API_KEY environment variable.',
      );
    }

    if (this.override) {
      return;
    }

    // Create SearchClient
    this.client = new SearchClient(
      this.serviceEndpoint,
      this.indexName,
      new AzureKeyCredential(this.apiKey),
      { apiVersion: this.apiVersion },
    );
  }

  // Improved error handling and logging
  async _call(data) {
    const { query, filter, vectorQueryText } = data;
    try {
      const searchOption = {
        queryType: this.queryType,
        top: typeof this.top === 'string' ? Number(this.top) : this.top,
        filter: filter,
      };
      if (vectorQueryText) {
        if (this.vectorFields.length === 0) {
          throw new Error(
            'AZURE_AI_SEARCH_VECTOR_FIELDS must be configured when using vector search queries.',
          );
        }
        searchOption.vectorSearchOptions = {
          queries: [
            {
              kind: 'text',
              text: vectorQueryText,
              fields: this.vectorFields,
            },
          ],
        };
      }
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
