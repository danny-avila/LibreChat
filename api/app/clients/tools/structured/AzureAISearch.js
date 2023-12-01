const { StructuredTool } = require('langchain/tools');
const { z } = require('zod');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');

const DEFAULT_API_VERSION = '2020-06-30';
const DEFAULT_QUERY_TYPE = 'simple';
const DEFAULT_TOP = 5;

class AzureAISearch extends StructuredTool {
  constructor(fields = {}) {
    super();
    this.serviceEndpoint = this.getEnvVar('AZURE_COGNITIVE_SEARCH_SERVICE_ENDPOINT', fields);
    this.indexName = this.getEnvVar('AZURE_COGNITIVE_SEARCH_INDEX_NAME', fields);
    this.apiKey = this.getEnvVar('AZURE_COGNITIVE_SEARCH_API_KEY', fields);
    this.apiVersion = this.getEnvVar('AZURE_COGNITIVE_SEARCH_API_VERSION', fields, DEFAULT_API_VERSION);
    this.queryType = this.getEnvVar('AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_QUERY_TYPE', fields, DEFAULT_QUERY_TYPE);
    this.top = Number(this.getEnvVar('AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_TOP', fields, DEFAULT_TOP));
    this.select = this.getSelect(fields);

    this.client = new SearchClient(
      this.serviceEndpoint,
      this.indexName,
      new AzureKeyCredential(this.apiKey),
      { apiVersion: this.apiVersion },
    );
    this.schema = z.object({
      query: z.string().describe('Search word or phrase to Azure AI Search'),
    });
  }

  getEnvVar(name, fields, defaultValue = '') {
    const value = fields[name] || process.env[name] || defaultValue;
    if (!value) {
      throw new Error(`Missing ${name} environment variable.`);
    }
    return value;
  }

  getSelect(fields) {
    const select = fields.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_SELECT || process.env.AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_SELECT;
    return select ? select.split(',') : null;
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
      console.error(`Azure AI Search request failed: ${error}`);
      return 'There was an error with Azure AI Search.';
    }
  }
}

module.exports = AzureAISearch;