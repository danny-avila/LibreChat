const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');
let AbortControllerCtor;
try {
  AbortControllerCtor = global.AbortController || require('abort-controller');
} catch (_) {
  AbortControllerCtor = global.AbortController; // final fallback
}

class WoodlandAISearch extends Tool {
  // Constants for default values
  static DEFAULT_API_VERSION = '2023-11-01';
  static DEFAULT_QUERY_TYPE = 'simple';
  static DEFAULT_TOP = 5;
  static DEFAULT_TIMEOUT_MS = 3500;

  // Helper function for initializing properties
  _initializeField(field, envVar, defaultValue) {
    return field || process.env[envVar] || defaultValue;
  }

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search';
    this.description =
      'Use the \'woodland-ai-search\' tool to retrieve search results relevant to your input';
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
    this.indexName = this._initializeField(
      fields.AZURE_AI_SEARCH_INDEX_NAME,
      'AZURE_AI_SEARCH_INDEX_NAME',
    );
    this.apiKey = this._initializeField(fields.AZURE_AI_SEARCH_API_KEY, 'AZURE_AI_SEARCH_API_KEY');
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
    this.top = this._initializeField(
      fields.AZURE_AI_SEARCH_SEARCH_OPTION_TOP,
      'AZURE_AI_SEARCH_SEARCH_OPTION_TOP',
      WoodlandAISearch.DEFAULT_TOP,
    );
    this.select = this._initializeField(
      fields.AZURE_AI_SEARCH_SEARCH_OPTION_SELECT,
      'AZURE_AI_SEARCH_SEARCH_OPTION_SELECT',
    );

    // Optional ranking & semantic controls (all env-driven, non-breaking)
    this.scoringProfile = this._initializeField(
      fields.AZURE_AI_SEARCH_SCORING_PROFILE,
      'AZURE_AI_SEARCH_SCORING_PROFILE',
      undefined // changed from 'boost_reviewed_recent' to undefined
    );
    this.scoringParameters = this._initializeField(
      fields.AZURE_AI_SEARCH_SCORING_PARAMETERS,
      'AZURE_AI_SEARCH_SCORING_PARAMETERS'
    ); // comma-separated list like: tag:reviewed,true;freshnessBoostingDuration:P30D
    this.orderBy = this._initializeField(
      fields.AZURE_AI_SEARCH_ORDER_BY,
      'AZURE_AI_SEARCH_ORDER_BY'
    ); // e.g., "updated_at desc"
    this.minimumCoverage = this._initializeField(
      fields.AZURE_AI_SEARCH_MINIMUM_COVERAGE,
      'AZURE_AI_SEARCH_MINIMUM_COVERAGE'
    );

    // Semantic options (enabled only if envs provided)
    this.semanticConfiguration = this._initializeField(
      fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
      'AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION',
      undefined // changed from 'sem1' to undefined
    );
    // Normalize: if blank/whitespace, fall back to undefined (no semantic)
    if (typeof this.semanticConfiguration === 'string') {
      const trimmed = this.semanticConfiguration.trim();
      this.semanticConfiguration = trimmed.length ? trimmed : undefined;
    }
    this.queryLanguage = this._initializeField(
      fields.AZURE_AI_SEARCH_QUERY_LANGUAGE,
      'AZURE_AI_SEARCH_QUERY_LANGUAGE',
      'en-us'
    );
    this.queryAnswer = this._initializeField(
      fields.AZURE_AI_SEARCH_QUERY_ANSWER,
      'AZURE_AI_SEARCH_QUERY_ANSWER' // e.g., 'extractive' or 'none'
    );
    this.answersCount = Number(
      this._initializeField(
        fields.AZURE_AI_SEARCH_ANSWERS_COUNT,
        'AZURE_AI_SEARCH_ANSWERS_COUNT',
        3
      )
    );
    this.queryCaption = this._initializeField(
      fields.AZURE_AI_SEARCH_QUERY_CAPTION,
      'AZURE_AI_SEARCH_QUERY_CAPTION' // e.g., 'extractive' or 'none'
    );
    this.captionsHighlightEnabled = this._initializeField(
      fields.AZURE_AI_SEARCH_CAPTIONS_HIGHLIGHT,
      'AZURE_AI_SEARCH_CAPTIONS_HIGHLIGHT',
      true
    );
    this.speller = this._initializeField(
      fields.AZURE_AI_SEARCH_SPELLER,
      'AZURE_AI_SEARCH_SPELLER' // e.g., 'lexicon' (if supported on your API version)
    );
    this.timeoutMs = Number(
      this._initializeField(
        fields.AZURE_AI_SEARCH_TIMEOUT_MS,
        'AZURE_AI_SEARCH_TIMEOUT_MS',
        WoodlandAISearch.DEFAULT_TIMEOUT_MS,
      ),
    );

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

  // Improved error handling and logging with timeout and retry logic
  async _call(data) {
    const rawQuery = (data?.query ?? '').trim();
    if (!rawQuery) {
      return JSON.stringify({ ok: false, error: 'EMPTY_QUERY', message: 'Query is empty.' });
    }

    // Compose search options with ranking & semantic controls if set
    const sanitize = (opts) => {
      const out = { ...opts };
      // If semantic, orderBy is not supported
      if (out.queryType === 'semantic' && out.orderBy) delete out.orderBy;
      // If no scoringProfile, drop scoringParameters
      if (!out.scoringProfile && out.scoringParameters) delete out.scoringParameters;
      return out;
    };

    const searchOptionsBase = {
      queryType: this.queryType,
      top: typeof this.top === 'string' ? Number(this.top) : this.top,
      includeTotalCount: false,
    };

    if (this.select) searchOptionsBase.select = this.select.split(',').map(s => s.trim()).filter(Boolean);
    if (this.scoringProfile) searchOptionsBase.scoringProfile = this.scoringProfile;
    if (this.scoringParameters) {
      const parts = this.scoringParameters.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length) searchOptionsBase.scoringParameters = parts;
    }
    if (this.orderBy) searchOptionsBase.orderBy = this.orderBy.split(',').map(s => s.trim()).filter(Boolean);
    if (this.minimumCoverage) searchOptionsBase.minimumCoverage = Number(this.minimumCoverage);

    const _semConfig = (typeof this.semanticConfiguration === 'string')
      ? this.semanticConfiguration.trim()
      : this.semanticConfiguration;
    if (_semConfig) {
      searchOptionsBase.queryType = 'semantic';
      searchOptionsBase.semanticConfiguration = _semConfig;
      if (this.queryLanguage) searchOptionsBase.queryLanguage = this.queryLanguage;
      if (this.queryAnswer) {
        searchOptionsBase.queryAnswer = this.queryAnswer;
        if (Number.isFinite(this.answersCount)) searchOptionsBase.answersCount = this.answersCount;
      }
      if (this.queryCaption) {
        searchOptionsBase.queryCaption = this.queryCaption;
        searchOptionsBase.captionsHighlightEnabled = !!this.captionsHighlightEnabled;
      }
      if (this.speller) searchOptionsBase.speller = this.speller;
    } else {
      // if no semanticConfiguration provided, keep queryType as originally set (likely 'simple')
    }

    // Final guard: if queryType is semantic but no valid semanticConfiguration, downgrade to simple
    if (!_semConfig && searchOptionsBase.queryType === 'semantic') {
      searchOptionsBase.queryType = 'simple';
      if (process?.env?.NODE_ENV !== 'production') {
        logger.warn("queryType was 'semantic' but semanticConfiguration is missing/empty; downgraded to 'simple'.");
      }
    }

    // Azure Search limitation: 'orderBy' is not supported with semantic queryType
    if (this.semanticConfiguration && searchOptionsBase.orderBy) {
      delete searchOptionsBase.orderBy;
      if (process?.env?.NODE_ENV !== 'production') {
        logger.warn("'orderBy' ignored because semantic ranking is enabled (queryType='semantic').");
      }
    }

    const execSearch = async (opts) => {
      const controller = new AbortControllerCtor();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const t0 = process.hrtime.bigint();
      try {
        const searchResults = await this.client.search(rawQuery, { ...opts, abortSignal: controller.signal });
        const resultDocuments = [];
        for await (const result of searchResults.results) {
          resultDocuments.push(result.document);
        }
        const res = { ok: true, results: resultDocuments };
        if (opts.queryType === 'semantic') {
          try {
            if (typeof searchResults?.answers !== 'undefined') {
              res.semantic_answers = searchResults.answers;
            }
          } catch (_) { /* ignore */ }
        }
        const t1 = process.hrtime.bigint();
        res.latency_ms = Number((t1 - t0) / 1000000n);
        return res;
      } finally {
        clearTimeout(timer);
      }
    };

    // First attempt (possibly with $select)
    try {
      const res = await execSearch(sanitize(searchOptionsBase));
      return JSON.stringify(res);
    } catch (err) {
      const msg = err?.message || '';
      // If service reports missing/empty semanticConfiguration, auto-downgrade to simple and retry once
      if (/semanticConfiguration\'?\s+must not be empty/i.test(msg)) {
        try {
          const optsNoSemantic = { ...searchOptionsBase };
          delete optsNoSemantic.semanticConfiguration;
          optsNoSemantic.queryType = 'simple';
          delete optsNoSemantic.scoringParameters;
          // ensure orderBy is allowed again under simple
          if (this.orderBy) {
            optsNoSemantic.orderBy = this.orderBy.split(',').map(s => s.trim()).filter(Boolean);
          }
          const res3 = await execSearch(sanitize(optsNoSemantic));
          res3.warning = 'Semantic config missing; downgraded to simple and retried.';
          res3.error_detail = msg;
          return JSON.stringify(res3);
        } catch (err3) {
          logger.error('Retry after semantic downgrade failed', err3);
          return JSON.stringify({ ok: false, error: 'AZURE_SEARCH_FAILED', message: 'Azure AI Search failed after semantic downgrade retry.', detail: String(err3?.message || err3) });
        }
      }
      // If scoringParameters are not expected by the profile, retry without them
      if (/scoringParameter/i.test(msg) && /Expected\s+0\s+parameter\(s\)/i.test(msg)) {
        try {
          const optsNoParams = { ...searchOptionsBase };
          delete optsNoParams.scoringParameters;
          const res4 = await execSearch(sanitize(optsNoParams));
          res4.warning = 'Profile does not accept scoringParameters; retried without scoringParameters.';
          res4.error_detail = msg;
          return JSON.stringify(res4);
        } catch (err4) {
          logger.error('Retry without scoringParameters failed', err4);
          return JSON.stringify({ ok: false, error: 'AZURE_SEARCH_FAILED', message: 'Azure AI Search failed after removing scoringParameters.', detail: String(err4?.message || err4) });
        }
      }
      // Safe retry without $select if schema mismatches happen
      if (searchOptionsBase.select && /(Invalid expression|\$select|Could not find a property)/i.test(msg)) {
        try {
          const { select, ...optsNoSelect } = searchOptionsBase;
          const res2 = await execSearch(sanitize(optsNoSelect));
          res2.warning = 'Retried without $select due to schema mismatch.';
          res2.error_detail = msg;
          return JSON.stringify(res2);
        } catch (err2) {
          logger.error('Azure AI Search retry without $select failed', err2);
          return JSON.stringify({ ok: false, error: 'AZURE_SEARCH_FAILED', message: 'Azure AI Search failed on retry without $select.', detail: String(err2?.message || err2) });
        }
      }

      // Timeout vs other errors
      if (err?.name === 'AbortError') {
        return JSON.stringify({ ok: false, error: 'TIMEOUT', message: `Search aborted after ${this.timeoutMs} ms.` });
      }

      logger.error('Azure AI Search request failed', err);
      return JSON.stringify({ ok: false, error: 'AZURE_SEARCH_FAILED', message: 'Azure AI Search request failed.', detail: msg });
    }
  }
}

module.exports = WoodlandAISearch;
