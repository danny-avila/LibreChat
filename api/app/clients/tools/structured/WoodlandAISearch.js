// woodland-ai-search.js
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

class WoodlandAISearch extends Tool {
  // Defaults keep your current behavior; you can override via envs.
  static DEFAULT_API_VERSION = '2023-11-01'; // For semantic, consider 2024-07-01 or 2025-05-01-preview
  static DEFAULT_QUERY_TYPE = 'simple';
  static DEFAULT_TOP = 5;

  _initializeField(field, envVar, defaultValue) {
    return field ?? process.env[envVar] ?? defaultValue;
  }

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search';
    this.description = "Use the 'woodland-ai-search' tool to retrieve search results relevant to your input";
    this.override = fields.override ?? false;

    // Schema: minimal; optional knobs to flip to semantic when needed.
    this.schema = z.object({
      query: z.string().describe('Search word or phrase to woodland-ai-search'),
      queryType: z.enum(['simple', 'semantic']).optional(),
      semanticConfiguration: z.string().optional().describe('Semantic configuration name (e.g., "sem1")'),
      queryLanguage: z.string().optional().describe('BCP-47 tag, e.g., "en-us"'),
      scoringProfile: z.string().optional(),
      top: z.number().int().positive().optional(),
      select: z.string().optional().describe('Comma-separated list of fields to select'),
    });

    // Required
    this.serviceEndpoint = this._initializeField(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      'AZURE_AI_SEARCH_SERVICE_ENDPOINT',
    );
    this.indexName = this._initializeField(
      fields.AZURE_AI_SEARCH_INDEX_NAME,
      'AZURE_AI_SEARCH_INDEX_NAME',
    );
    this.apiKey = this._initializeField(
      fields.AZURE_AI_SEARCH_API_KEY,
      'AZURE_AI_SEARCH_API_KEY',
    );

    // Optional
    this.apiVersion = this._initializeField(
      fields.AZURE_AI_SEARCH_API_VERSION,
      'AZURE_AI_SEARCH_API_VERSION',
      WoodlandAISearch.DEFAULT_API_VERSION,
    );
    this.queryType = this._initializeField(
      fields.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE,
      'AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE',
      WoodlandAISearch.DEFAULT_QUERY_TYPE,
    );
    this.top = Number(
      this._initializeField(
        fields.AZURE_AI_SEARCH_SEARCH_OPTION_TOP,
        'AZURE_AI_SEARCH_SEARCH_OPTION_TOP',
        WoodlandAISearch.DEFAULT_TOP,
      ),
    );
    this.select = this._initializeField(
      fields.AZURE_AI_SEARCH_SEARCH_OPTION_SELECT,
      'AZURE_AI_SEARCH_SEARCH_OPTION_SELECT',
    );
    this.scoringProfile = this._initializeField(
      fields.AZURE_AI_SEARCH_SCORING_PROFILE,
      'AZURE_AI_SEARCH_SCORING_PROFILE',
    );

    // Semantic (optional). If you keep simple, these are ignored.
    this.semanticConfiguration = this._initializeField(
      fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
      'AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION',
    );
    if (typeof this.semanticConfiguration === 'string') {
      const t = this.semanticConfiguration.trim();
      this.semanticConfiguration = t.length ? t : undefined;
    }
    this.queryLanguage = this._initializeField(
      fields.AZURE_AI_SEARCH_QUERY_LANGUAGE,
      'AZURE_AI_SEARCH_QUERY_LANGUAGE',
      'en-us',
    );

    if (!this.override && (!this.serviceEndpoint || !this.indexName || !this.apiKey)) {
      throw new Error(
        'Missing AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_INDEX_NAME, or AZURE_AI_SEARCH_API_KEY environment variable.',
      );
    }
    if (this.override) return;

    this.client = new SearchClient(
      this.serviceEndpoint,
      this.indexName,
      new AzureKeyCredential(this.apiKey),
      { apiVersion: this.apiVersion },
    );
  }

  async _call(data) {
    const {
      query,
      queryType: qTypeIn,
      semanticConfiguration: semIn,
      queryLanguage: langIn,
      scoringProfile: spIn,
      top: topIn,
      select: selectIn,
    } = data;

    try {
      // Base options mirror AzureAISearch behavior
      const searchOption = {
        queryType:
          (qTypeIn || this.queryType || 'simple').toString().toLowerCase() === 'semantic'
            ? 'semantic'
            : 'simple',
        top: typeof (topIn ?? this.top) === 'string' ? Number(topIn ?? this.top) : (topIn ?? this.top),
      };

      // Optional select (comma-separated string → array)
      const selectStr = selectIn || this.select;
      if (selectStr) {
        searchOption.select = String(selectStr)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      // Optional scoringProfile
      const scoringProfile = spIn || this.scoringProfile;
      if (scoringProfile) {
        searchOption.scoringProfile = scoringProfile;
      }

      // If semantic is requested, set both new (2024+) and legacy fields safely.
      if (searchOption.queryType === 'semantic') {
        const semResolved =
          (typeof semIn === 'string' && semIn.trim()) ||
          (typeof this.semanticConfiguration === 'string' && this.semanticConfiguration.trim()) ||
          'sem1';

        const qLang = langIn || this.queryLanguage || 'en-us';

        // New canonical shape (for 2024+/2025 API versions)
        searchOption.semanticSearchOptions = {
          configurationName: semResolved,
          queryLanguage: qLang,
        };

        // Legacy fields (back-compat with older SDK/service)
        searchOption.semanticConfiguration = semResolved;
        searchOption.semanticConfigurationName = semResolved;
        searchOption.queryLanguage = qLang;
      }

      const searchResults = await this.client.search(query, searchOption);

      const resultDocuments = [];
      for await (const result of searchResults.results) {
        resultDocuments.push(result.document);
      }

      return JSON.stringify(resultDocuments);
    } catch (error) {
      logger.error('Azure AI Search request failed', error);
      const msg = (error && (error.message || String(error))) || 'Unknown error';
      return `AZURE_SEARCH_FAILED: ${msg}`;
    }
  }
}

module.exports = WoodlandAISearch;
