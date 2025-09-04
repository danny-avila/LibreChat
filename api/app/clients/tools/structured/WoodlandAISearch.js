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

// --- WoodlandAISearch loop guards (module-level) ---
let __WAS_DISABLE_SCORING_PARAMS__ = false; // once a profile rejects params, stop sending them for future calls
let __WAS_LAST_SIG__ = null;                // dedupe signature of the last executed request
let __WAS_LAST_TS__ = 0;                    // timestamp of last exec
let __WAS_LAST_RESULT__ = null;             // last successful JSON stringified result
const __WAS_DEDUPE_WINDOW_MS__ = 4000;      // ignore exact duplicate calls within this window

function _extractPartNumber(text) {
  if (!text) return null;
  const rx = /(Part\s*#\s*)?(\d{2}-\d{2}-\d{3,4})/i;
  const m = rx.exec(text);
  return m ? m[2] : null;
}
function _firstUrl(docs, pred) {
  for (const d of docs) if (pred(d) && d.url) return d.url;
  return null;
}
function _collectNonAirtableUrls(docs, limit = 4) {
  const urls = [];
  const seen = new Set();
  for (const d of docs) {
    if (d.source === 'airtable') continue;
    if (d.url && !seen.has(d.url)) {
      urls.push(d.url);
      seen.add(d.url);
      if (urls.length >= limit) break;
    }
  }
  return urls;
}
function _buildGovernedAnswer(query, docs) {
  // 1) Prefer Airtable (deterministic)
  const airtableDocs = docs.filter(d => d.source === 'airtable');
  if (airtableDocs.length) {
    // Try to extract SKU and a plain description
    const at = airtableDocs[0];
    const sku = _extractPartNumber(`${at.chunk || ''} ${at.title || ''}`) || _extractPartNumber(query) || 'UNKNOWN';
    const titleBits = (at.chunk || at.title || '').split('|');
    // Try to pull a friendly item name, e.g., "Key - Electric Start"
    let item = 'this item';
    for (const b of titleBits) {
      const t = b.trim();
      if (/key\s*-\s*electric\s*start/i.test(t)) { item = 'Key - Electric Start'; break; }
      if (/\|/.test(t)) continue;
      if (t && !/^Question|ID:|Model:|Component:/i.test(t)) { item = t; break; }
    }
    const citeUrls = _collectNonAirtableUrls(docs);

    const answer = [
      `Answer:`,
      `The part number for ${item} is **${sku}**.`,
      ``,
      `Fit & Compatibility:`,
      `Part Number   Description`,
      `${sku}         ${item}`,
      ``,
      `Citations:`,
      `- Airtable record_id: ${at.record_id || at.title || 'unknown'}`,
      ...(at.url ? [`- ${at.url}`] : []),
      ...citeUrls.map(u => `- ${u}`)
    ].join('\n');
    return answer;
  }

  // 2) Fallback to website/cyclopedia (non-deterministic but helpful)
  return 'needs human review';
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
      undefined
    );
    this.scoringParameters = this._initializeField(
      fields.AZURE_AI_SEARCH_SCORING_PARAMETERS,
      'AZURE_AI_SEARCH_SCORING_PARAMETERS'
    );
    this.orderBy = this._initializeField(
      fields.AZURE_AI_SEARCH_ORDER_BY,
      'AZURE_AI_SEARCH_ORDER_BY'
    );
    this.minimumCoverage = this._initializeField(
      fields.AZURE_AI_SEARCH_MINIMUM_COVERAGE,
      'AZURE_AI_SEARCH_MINIMUM_COVERAGE'
    );

    // Semantic options (enabled only if envs provided)
    this.semanticConfiguration = this._initializeField(
      fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
      'AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION',
      undefined
    );
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
      'AZURE_AI_SEARCH_QUERY_ANSWER'
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
      'AZURE_AI_SEARCH_QUERY_CAPTION'
    );
    this.captionsHighlightEnabled = this._initializeField(
      fields.AZURE_AI_SEARCH_CAPTIONS_HIGHLIGHT,
      'AZURE_AI_SEARCH_CAPTIONS_HIGHLIGHT',
      true
    );
    this.speller = this._initializeField(
      fields.AZURE_AI_SEARCH_SPELLER,
      'AZURE_AI_SEARCH_SPELLER'
    );
    this.timeoutMs = Number(
      this._initializeField(
        fields.AZURE_AI_SEARCH_TIMEOUT_MS,
        'AZURE_AI_SEARCH_TIMEOUT_MS',
        WoodlandAISearch.DEFAULT_TIMEOUT_MS,
      ),
    );

    this.returnMode = this._initializeField(
      fields.WOODLAND_RETURN_MODE,
      'WOODLAND_RETURN_MODE',
      'governed' // default to governed output for LLM-friendly formatting
    );

    this._disableScoringParams = __WAS_DISABLE_SCORING_PARAMS__;

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

  async _call(data) {
    const { query } = data || {};
    const q = (query || '').trim();
    if (!q) {
      return JSON.stringify([]);
    }
    try {
      const searchOption = {
        top: typeof this.top === 'string' ? Number(this.top) : this.top,
      };

      if (this.select) {
        searchOption.select = this.select
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      }

      // ranking options
      if (this.scoringProfile) {
        searchOption.scoringProfile = this.scoringProfile;
      }
      if (!this._disableScoringParams && this.scoringParameters) {
        const parts = this.scoringParameters.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length) searchOption.scoringParameters = parts;
      }
      if (this.orderBy) {
        searchOption.orderBy = this.orderBy.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (this.minimumCoverage) {
        searchOption.minimumCoverage = Number(this.minimumCoverage);
      }

      // semantic options (if provided)
      if (this.semanticConfiguration && String(this.semanticConfiguration).trim().length) {
        searchOption.semanticConfiguration = String(this.semanticConfiguration).trim();
        // Intentionally do NOT set searchOption.queryType here to mirror the working cURL
      } else if (this.queryType) {
        searchOption.queryType = this.queryType;
      }

      delete searchOption.queryLanguage;

      // Build a stable signature (query + options) to prevent runaway loops
      const sigOptions = { ...searchOption };
      // signature should not include scoringParameters array order differences
      if (Array.isArray(sigOptions.scoringParameters)) sigOptions.scoringParameters = [...sigOptions.scoringParameters].sort();
      if (Array.isArray(sigOptions.select)) sigOptions.select = [...sigOptions.select].sort();
      if (Array.isArray(sigOptions.orderBy)) sigOptions.orderBy = [...sigOptions.orderBy].sort();
      const signature = `${q}|${JSON.stringify(sigOptions)}`;
      const now = Date.now();
      if (__WAS_LAST_SIG__ === signature && (now - __WAS_LAST_TS__) < __WAS_DEDUPE_WINDOW_MS__ && __WAS_LAST_RESULT__) {
        logger.warn('WoodlandAISearch: dedupe short-circuit (identical call within window)', { windowMs: __WAS_DEDUPE_WINDOW_MS__ });
        return __WAS_LAST_RESULT__;
      }

      logger.info('WoodlandAISearch: executing search', { query: q, options: searchOption });

      const exec = async (opts) => {
        const res = await this.client.search(q, opts);
        const docs = [];
        for await (const r of res.results) docs.push(r.document);
        return docs;
      };

      let retriedWithoutScoring = false;

      try {
        const docs = await exec(searchOption);
        const payload = (this.returnMode === 'governed') ? _buildGovernedAnswer(q, docs) : JSON.stringify(docs);
        __WAS_LAST_SIG__ = signature; __WAS_LAST_TS__ = Date.now(); __WAS_LAST_RESULT__ = payload;
        return payload;
      } catch (innerErr) {
        const msg = (innerErr && (innerErr.message || String(innerErr))) || '';
        const code = innerErr && (innerErr.statusCode || innerErr.code || innerErr.name);
        const scoringParamError = /scoringParameter/i.test(msg) || /Expected\s*0\s*parameter\(s\)/i.test(msg);
        if (scoringParamError && searchOption.scoringParameters && !retriedWithoutScoring) {
          logger.warn('WoodlandAISearch: retrying without scoringParameters due to profile mismatch', { code, msg });
          const retryOpts = { ...searchOption };
          delete retryOpts.scoringParameters;
          retriedWithoutScoring = true;
          // disable for future calls (module + instance)
          __WAS_DISABLE_SCORING_PARAMS__ = true;
          this._disableScoringParams = true;
          const docs = await exec(retryOpts);
          const payload = (this.returnMode === 'governed') ? _buildGovernedAnswer(q, docs) : JSON.stringify(docs);
          __WAS_LAST_SIG__ = signature; __WAS_LAST_TS__ = Date.now(); __WAS_LAST_RESULT__ = payload;
          return payload;
        }
        throw innerErr;
      }
    } catch (error) {
      logger.error('Azure AI Search request failed', error);
      const msg = (error && (error.message || String(error))) || 'Unknown error';
      const status = error && (error.statusCode || error.code || error.name);
      const resultJson = JSON.stringify([{ _error: 'AZURE_SEARCH_FAILED', message: msg, status }]);
      __WAS_LAST_SIG__ = null; __WAS_LAST_TS__ = Date.now(); __WAS_LAST_RESULT__ = resultJson;
      return resultJson;
    }
  }
}

module.exports = WoodlandAISearch;
