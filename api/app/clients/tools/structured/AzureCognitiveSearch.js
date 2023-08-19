const { StructuredTool } = require('langchain/tools');
const { z } = require('zod');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');

class AzureCognitiveSearch extends StructuredTool {
  constructor(fields = {}) {
    super();
    this.serviceEndpoint =
      fields.AZURE_COGNITIVE_SEARCH_SERVICE_ENDPOINT || this.getServiceEndpoint();
    this.indexName = fields.AZURE_COGNITIVE_SEARCH_INDEX_NAME || this.getIndexName();
    this.apiKey = fields.AZURE_COGNITIVE_SEARCH_API_KEY || this.getApiKey();

    this.apiVersion = fields.AZURE_COGNITIVE_SEARCH_API_VERSION || this.getApiVersion();

    this.queryType = fields.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_QUERY_TYPE || this.getQueryType();
    this.top = fields.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_TOP || this.getTop();
    this.select = fields.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_SELECT || this.getSelect();

    this.client = new SearchClient(
      this.serviceEndpoint,
      this.indexName,
      new AzureKeyCredential(this.apiKey),
      {
        apiVersion: this.apiVersion,
      },
    );
    this.schema = z.object({
      query: z.string().describe('Search word or phrase to Azure Cognitive Search'),
    });
  }

  /**
   * The name of the tool.
   * @type {string}
   */
  name = 'azure-cognitive-search';

  /**
   * A description for the agent to use
   * @type {string}
   */
  description =
    'Use the \'azure-cognitive-search\' tool to retrieve search results relevant to your input';

  getServiceEndpoint() {
    const serviceEndpoint = process.env.AZURE_COGNITIVE_SEARCH_SERVICE_ENDPOINT || '';
    if (!serviceEndpoint) {
      throw new Error('Missing AZURE_COGNITIVE_SEARCH_SERVICE_ENDPOINT environment variable.');
    }
    return serviceEndpoint;
  }

  getIndexName() {
    const indexName = process.env.AZURE_COGNITIVE_SEARCH_INDEX_NAME || '';
    if (!indexName) {
      throw new Error('Missing AZURE_COGNITIVE_SEARCH_INDEX_NAME environment variable.');
    }
    return indexName;
  }

  getApiKey() {
    const apiKey = process.env.AZURE_COGNITIVE_SEARCH_API_KEY || '';
    if (!apiKey) {
      throw new Error('Missing AZURE_COGNITIVE_SEARCH_API_KEY environment variable.');
    }
    return apiKey;
  }

  getApiVersion() {
    return process.env.AZURE_COGNITIVE_SEARCH_API_VERSION || '2020-06-30';
  }

  getQueryType() {
    return process.env.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_QUERY_TYPE || 'simple';
  }

  getTop() {
    if (process.env.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_TOP) {
      return Number(process.env.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_TOP);
    } else {
      return 5;
    }
  }

  getSelect() {
    if (process.env.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_SELECT) {
      return process.env.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_SELECT.split(',');
    } else {
      return null;
    }
  }

  async _call(data) {
    const { query } = data;
    try {
      const searchOption = {
        queryType: this.queryType,
        top: this.top,
      };
      if (this.select) {
        searchOption.select = this.select;
      }
      const searchResults = await this.client.search(query, searchOption);
      const resultDocuments = [];
      for await (const result of searchResults.results) {
        resultDocuments.push(result.document);
      }
      return JSON.stringify(resultDocuments);
    } catch (error) {
      console.error(`Azure Cognitive Search request failed: ${error}`);
      return 'There was an error with Azure Cognitive Search.';
    }
  }
}

module.exports = AzureCognitiveSearch;
