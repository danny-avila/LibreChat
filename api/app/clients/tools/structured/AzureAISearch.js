const { StructuredTool } = require('langchain/tools');
const { z } = require('zod');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');

class AzureAISearch extends StructuredTool {
  constructor(fields = {}) {
    super();
    this.serviceEndpoint = fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT || process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT || process.env.AZURE_COGNITIVE_SEARCH_SERVICE_ENDPOINT;
    this.indexName = fields.AZURE_AI_SEARCH_INDEX_NAME || process.env.AZURE_AI_SEARCH_INDEX_NAME || process.env.AZURE_COGNITIVE_SEARCH_INDEX_NAME;
    this.apiKey = fields.AZURE_AI_SEARCH_API_KEY || process.env.AZURE_AI_SEARCH_API_KEY || process.env.AZURE_COGNITIVE_SEARCH_API_KEY;

    this.apiVersion = fields.AZURE_AI_SEARCH_API_VERSION || process.env.AZURE_AI_SEARCH_API_VERSION || process.env.AZURE_COGNITIVE_SEARCH_API_VERSION || '2023-11-01';

    this.queryType = fields.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE || process.env.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE || process.env.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_QUERY_TYPE || 'simple';
    this.top = fields.AZURE_AI_SEARCH_SEARCH_OPTION_TOP || process.env.AZURE_AI_SEARCH_SEARCH_OPTION_TOP || process.env.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_TOP || 5;
    this.select = fields.AZURE_AI_SEARCH_SEARCH_OPTION_SELECT || process.env.AZURE_AI_SEARCH_SEARCH_OPTION_SELECT || process.env.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_SELECT;

    if (!this.serviceEndpoint || !this.indexName || !this.apiKey) {
      throw new Error('Missing AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_INDEX_NAME or AZURE_AI_SEARCH_API_KEY environment variable.');
    }

    this.client = new SearchClient(
      this.serviceEndpoint,
      this.indexName,
      new AzureKeyCredential(this.apiKey),
      {
        apiVersion: this.apiVersion,
      },
    );
    this.schema = z.object({
      query: z.string().describe('Search word or phrase to Azure AI Search'),
    });
  }

  /**
   * The name of the tool.
   * @type {string}
   */
  name = 'azure-ai-search';

  /**
   * A description for the agent to use
   * @type {string}
   */
  description =
    'Use the \'azure-ai-search\' tool to retrieve search results relevant to your input';

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
      console.error(`Azure AI Search request failed: ${error}`);
      return 'There was an error with Azure AI Search.';
    }
  }
}

module.exports = AzureAISearch;