const { Tool } = require('langchain/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');

class AzureAISearch extends Tool {
  static DEFAULT_API_VERSION = '2023-11-01';
  static DEFAULT_QUERY_TYPE = 'simple';
  static DEFAULT_TOP = 5;

  constructor(fields = {}) {
    super();
    this.initializeProperties(fields);
    this.initializeClient();
  }

  initializeProperties(fields) {
    const getValue = (fieldNames, defaultValue) => {
      for (const name of fieldNames) {
        const value = fields[name] || process.env[name];
        if (value !== undefined && value !== null) return value;
      }
      return defaultValue;
    };

    this.serviceEndpoint = getValue(['AZURE_AI_SEARCH_SERVICE_ENDPOINT', 'AZURE_COGNITIVE_SEARCH_SERVICE_ENDPOINT'], this.getServiceEndpoint());
    this.indexName = getValue(['AZURE_AI_SEARCH_INDEX_NAME', 'AZURE_COGNITIVE_SEARCH_INDEX_NAME'], this.getIndexName());
    this.apiKey = getValue(['AZURE_AI_SEARCH_API_KEY', 'AZURE_COGNITIVE_SEARCH_API_KEY'], this.getApiKey());
    this.apiVersion = getValue(['AZURE_AI_SEARCH_API_VERSION', 'AZURE_COGNITIVE_SEARCH_API_VERSION'], AzureAISearch.DEFAULT_API_VERSION);
    this.queryType = getValue(['AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE', 'AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_QUERY_TYPE'], AzureAISearch.DEFAULT_QUERY_TYPE);
    this.top = getValue(['AZURE_AI_SEARCH_SEARCH_OPTION_TOP', 'AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_TOP'], AzureAISearch.DEFAULT_TOP);
    this.select = this.getSelect();
  }

  initializeClient() {
    this.client = new SearchClient(this.serviceEndpoint, this.indexName, new AzureKeyCredential(this.apiKey), { apiVersion: this.apiVersion });
  }

  name = 'azure-ai-search';

  description =
    'Use the \'azure-ai-search\' tool to retrieve search results relevant to your input';

  async _call(query) {
    try {
      const searchOptions = {
        queryType: this.queryType,
        top: this.top,
        select: this.select
      };

      const searchResults = await this.client.search(query, searchOptions);
      return JSON.stringify(searchResults.results.map(result => result.document));
    } catch (error) {
      console.error(`Azure AI Search request failed: ${error}`);
      return 'There was an error with Azure AI Search.';
    }
  }
}

module.exports = AzureAISearch;
