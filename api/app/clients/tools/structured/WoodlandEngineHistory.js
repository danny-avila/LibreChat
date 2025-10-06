const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

class WoodlandEngineHistory extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_QUERY_TYPE = 'simple';
  static DEFAULT_TOP = 20;
  static DEFAULT_SELECT = '*';
  static DEFAULT_VECTOR_K = 15;

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-engine-history';
    this.description = 'Query the Woodland engine history index (Airtable sourced).';

    this.schema = z.object({
      query: z.string().default(''),
      engineModel: z.string().optional(),
      rakeModel: z.string().optional(),
      horsepower: z.string().optional(),
      filterShape: z.string().optional(),
      blowerColor: z.string().optional(),
      airFilter: z.string().optional(),
      engineMaintenanceKit: z.string().optional(),
      top: z.number().int().positive().max(100).optional(),
      format: z.enum(['json']).default('json'),
    });

    this.serviceEndpoint = fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT || process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT;
    this.apiKey = fields.AZURE_AI_SEARCH_API_KEY || process.env.AZURE_AI_SEARCH_API_KEY;
    this.indexName =
      fields.AZURE_AI_SEARCH_ENGINE_HISTORY_INDEX || process.env.AZURE_AI_SEARCH_ENGINE_HISTORY_INDEX ||
      fields.AZURE_AI_SEARCH_INDEX_NAME ||
      process.env.AZURE_AI_SEARCH_INDEX_NAME;

    if (!this.serviceEndpoint || !this.apiKey || !this.indexName) {
      throw new Error('Missing Azure Search configuration for engine history.');
    }

    this.apiVersion = fields.AZURE_AI_SEARCH_API_VERSION || process.env.AZURE_AI_SEARCH_API_VERSION || WoodlandEngineHistory.DEFAULT_API_VERSION;

    const semanticConfiguration = fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION || process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION;
    const queryLanguage = fields.AZURE_AI_SEARCH_QUERY_LANGUAGE || process.env.AZURE_AI_SEARCH_QUERY_LANGUAGE;
    this.semanticConfiguration = typeof semanticConfiguration === 'string' ? semanticConfiguration.trim() : semanticConfiguration;
    this.queryLanguage = typeof queryLanguage === 'string' ? queryLanguage.trim() : queryLanguage;

    this.queryType = this._resolveQueryType(fields);

    this.topDefault = Number(fields.WOODLAND_HISTORY_DEFAULT_TOP || process.env.WOODLAND_HISTORY_DEFAULT_TOP || WoodlandEngineHistory.DEFAULT_TOP);
    const selectFields = this._stringArray(
      fields.WOODLAND_HISTORY_SELECT || process.env.WOODLAND_HISTORY_SELECT || WoodlandEngineHistory.DEFAULT_SELECT,
    );
    this.select = selectFields.length ? selectFields : ['*'];

    const configuredSearchFields = fields.WOODLAND_HISTORY_SEARCH_FIELDS || process.env.WOODLAND_HISTORY_SEARCH_FIELDS;
    const searchFields = configuredSearchFields ? this._stringArray(configuredSearchFields) : [];
    this.searchFields = searchFields.length ? searchFields : undefined;

    const vectorFields = fields.AZURE_AI_SEARCH_VECTOR_FIELDS || process.env.AZURE_AI_SEARCH_VECTOR_FIELDS;
    this.vectorFields = vectorFields
      ? String(vectorFields)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    this.vectorK = Number(fields.AZURE_AI_SEARCH_VECTOR_K || process.env.AZURE_AI_SEARCH_VECTOR_K || WoodlandEngineHistory.DEFAULT_VECTOR_K);

    this.client = new SearchClient(
      this.serviceEndpoint,
      this.indexName,
      new AzureKeyCredential(this.apiKey),
      { apiVersion: this.apiVersion }, 
    );

    logger.info('[woodland-ai-engine-history] Initialized', {
      endpoint: this.serviceEndpoint,
      index: this.indexName,
      apiVersion: this.apiVersion,
      queryType: this.queryType,
      topDefault: this.topDefault,
      select: this.select,
      searchFields: this.searchFields,
      vectorFields: this.vectorFields,
      vectorK: this.vectorK,
      semanticConfiguration: this.semanticConfiguration,
      queryLanguage: this.queryLanguage,
    });
  }

  _buildFilter(input) {
    const filters = [];
    const add = (field, value) => {
      if (!value) return;
      const sanitized = String(value).replace(/'/g, "''").trim();
      if (!sanitized) return;
      filters.push(`${field} eq '${sanitized}'`);
    };
    add('engine_model', input.engineModel);
    add('rake_model', input.rakeModel);
    add('engine_horsepower', input.horsepower);
    add('filter_shape', input.filterShape);
    add('blower_color', input.blowerColor);
    add('air_filter', input.airFilter);
    add('engine_maintenance_kit', input.engineMaintenanceKit);
    return filters.join(' and ');
  }

  _collectUrls(doc) {
    const urls = new Set();
    const prioritized = [];
    const push = (val, priority = false) => {
      if (!val) return;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) {
          return;
        }
        if (priority) {
          prioritized.push(trimmed);
        } else {
          urls.add(trimmed);
        }
      } else if (Array.isArray(val)) {
        val.forEach((item) => push(item, priority));
      }
    };

    const airtableCandidates = [
      doc.airtable_url,
      doc.airtableUrl,
      doc.airtable_link,
      doc.airtableLink,
      doc.airtable_record_url,
      doc.airtableRecordUrl,
    ];
    airtableCandidates.forEach((value) => push(value, true));

    ['document_url', 'source_url', 'url', 'engine_maintenance_kit_url'].forEach((key) => push(doc[key]));
    Object.keys(doc).forEach((key) => {
      if (/airtable/i.test(key)) {
        push(doc[key], true);
      } else if (/(_url)$/i.test(key)) {
        push(doc[key]);
      }
    });

    const ordered = [...prioritized.filter(Boolean), ...Array.from(urls)];
    const seen = new Set();
    const deduped = ordered.filter((url) => {
      const lower = url.toLowerCase();
      if (seen.has(lower)) {
        return false;
      }
      seen.add(lower);
      return true;
    });

    return { primaryUrl: deduped[0] || '', supplementalUrls: deduped.slice(1) };
  }

  _shapeDocument(doc) {
    const { primaryUrl, supplementalUrls } = this._collectUrls(doc);
    const normalized = {
      engine_model: doc.engine_model,
      rake_model: doc.rake_model,
      inuse_date: doc.inuse_date,
      engine_horsepower: doc.engine_horsepower,
      filter_shape: doc.filter_shape,
      blower_color: doc.blower_color,
      air_filter: doc.air_filter,
      engine_maintenance_kit: doc.engine_maintenance_kit,
      engine_maintenance_kit_url: doc.engine_maintenance_kit_url,
    };

    return {
      ...doc,
      citations: [primaryUrl, ...supplementalUrls].filter(Boolean),
      normalized_engine: normalized,
    };
  }

  _stringArray(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
        .filter(Boolean);
    }
    if (value == null) {
      return [];
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return [];
      }
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return String(value)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  _resolveQueryType(fields = {}) {
    const raw = (fields.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE || process.env.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE || WoodlandEngineHistory.DEFAULT_QUERY_TYPE);
    const normalized = String(raw || '').toLowerCase().trim();
    if (normalized === 'semantic' && !this._hasSemanticConfig()) {
      logger.warn('[woodland-ai-engine-history] Semantic queryType requested but semantic configuration is missing. Using simple.', {
        semanticConfiguration: this.semanticConfiguration,
        queryLanguage: this.queryLanguage,
      });
      return 'simple';
    }
    return normalized || 'simple';
  }

  _hasSemanticConfig() {
    return Boolean(this.semanticConfiguration && this.queryLanguage);
  }

  _collectTerms(...values) {
    const terms = [];
    const visit = (val) => {
      if (val == null) {
        return;
      }
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed) {
          terms.push(trimmed);
        }
        return;
      }
      if (typeof val === 'number' || typeof val === 'boolean') {
        terms.push(String(val));
        return;
      }
      if (Array.isArray(val)) {
        val.forEach(visit);
        return;
      }
      if (typeof val === 'object') {
        if (typeof val.value === 'string') {
          visit(val.value);
          return;
        }
        if (Array.isArray(val.value)) {
          visit(val.value);
        }
      }
    };

    values.forEach(visit);
    return terms;
  }

  _extractFilterTerms(filter) {
    if (!filter || typeof filter !== 'string') {
      return [];
    }
    const matches = filter.matchAll(/'([^']*)'/g);
    return Array.from(matches, (match) => match[1]?.replace(/''/g, "'")?.trim()).filter(Boolean);
  }

  async _performSearch(queryString, options) {
    const opts = { ...options };

    if (this.queryType === 'semantic') {
      opts.semanticSearchOptions = {
        configurationName: this.semanticConfiguration,
        queryLanguage: this.queryLanguage,
      };
    }

    logger.debug('[woodland-ai-engine-history] Executing search', {
      queryString,
      filter: opts.filter,
      top: opts.top,
      hasVector: Array.isArray(opts.vectorQueries) && opts.vectorQueries.length > 0,
      searchFields: opts.searchFields,
      select: opts.select,
      queryType: opts.queryType,
      searchMode: opts.searchMode,
      semanticConfiguration: opts.semanticSearchOptions?.configurationName,
    });

    const results = [];
    const seen = new Set();

    const iterator = await this.client.search(queryString, opts);
    for await (const result of iterator.results) {
      const doc = result.document || {};
      const key = String(doc.record_id || doc.id || doc.key || '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(this._shapeDocument({ ...doc, ['@search.score']: result.score }));
    }

    return results;
  }

  async _call(data) {
    const parsed = this.schema.safeParse(data);
    if (!parsed.success) {
      return `INPUT_VALIDATION_FAILED: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    }

    const input = parsed.data;
    const top = Number.isFinite(input.top) ? Math.floor(input.top) : this.topDefault;
    const filter = this._buildFilter(input);
    const fallbackTerms = this._collectTerms(
      input.engineModel,
      input.rakeModel,
      input.horsepower,
      input.filterShape,
    );
    const filterTerms = this._extractFilterTerms(filter);
    const queryString =
      (input.query || '').trim() ||
      (fallbackTerms.length ? fallbackTerms.join(' ') : '') ||
      (filterTerms.length ? filterTerms.join(' ') : '') ||
      '*';

    const inferredMode = (() => {
      const q = (input.query || '').toString();
      if (/".+"/.test(q) || /\b(AND|OR|NOT)\b/i.test(q)) {
        return 'all';
      }
      return 'any';
    })();

    const options = {
      queryType: this.queryType,
      searchMode: inferredMode,
      top,
      includeTotalCount: false,
      filter: filter || undefined,
    };

    const selectFields = Array.isArray(this.select) ? this.select : this._stringArray(this.select);
    if (selectFields.length && !(selectFields.length === 1 && selectFields[0] === '*')) {
      options.select = selectFields;
    }

    if (Array.isArray(this.searchFields) && this.searchFields.length) {
      options.searchFields = this.searchFields;
    }

    if (Array.isArray(input.embedding) && input.embedding.length && this.vectorFields.length) {
      options.vectorQueries = this.vectorFields.map((field) => ({
        kind: 'vector',
        vector: input.embedding,
        fields: field,
        kNearestNeighborsCount: this.vectorK,
      }));
    }

    try {
      let results = await this._performSearch(queryString, options);

      if (results.length === 0 && options.filter) {
        const retryOptions = { ...options };
        delete retryOptions.filter;
        logger.info('[woodland-ai-engine-history] No results with filter, retrying without filter');
        results = await this._performSearch(queryString, retryOptions);
      }

      if (results.length === 0 && queryString !== '*' && !options.filter) {
        logger.info('[woodland-ai-engine-history] No results with query terms, retrying with wildcard');
        results = await this._performSearch('*', { ...options, filter: undefined });
      }

      if (results.length === 0) {
        return 'NEEDS_HUMAN_REVIEW: No reviewed records found.';
      }

      results.sort((a, b) => (b['@search.score'] || 0) - (a['@search.score'] || 0));
      return JSON.stringify(results.slice(0, top));
    } catch (error) {
      logger.error('[woodland-ai-engine-history] Search request failed', error);
      return `AZURE_SEARCH_FAILED: ${error?.message || error}`;
    }
  }
}

module.exports = WoodlandEngineHistory;
