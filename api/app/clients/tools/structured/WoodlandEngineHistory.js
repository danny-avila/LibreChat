const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
let logger;
try {
  ({ logger } = require('~/config'));
} catch (_) {
  ({ logger } = require('@librechat/data-schemas'));
}

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

    this.serviceEndpoint =
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT || process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT;
    this.apiKey = fields.AZURE_AI_SEARCH_API_KEY || process.env.AZURE_AI_SEARCH_API_KEY;
    this.indexName =
      fields.AZURE_AI_SEARCH_ENGINE_HISTORY_INDEX ||
      process.env.AZURE_AI_SEARCH_ENGINE_HISTORY_INDEX ||
      fields.AZURE_AI_SEARCH_INDEX_NAME ||
      process.env.AZURE_AI_SEARCH_INDEX_NAME;

    if (!this.serviceEndpoint || !this.apiKey || !this.indexName) {
      throw new Error('Missing Azure Search configuration for engine history.');
    }

    this.apiVersion =
      fields.AZURE_AI_SEARCH_API_VERSION ||
      process.env.AZURE_AI_SEARCH_API_VERSION ||
      WoodlandEngineHistory.DEFAULT_API_VERSION;

    const rawSemanticConfiguration =
      fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION ||
      process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION;
    const semanticConfiguration = (() => {
      if (rawSemanticConfiguration == null) return undefined;
      const str = String(rawSemanticConfiguration).trim();
      if (!str || str.toLowerCase() === 'none') return undefined;
      return str;
    })();
    this.semanticConfiguration = semanticConfiguration;
    const rawQueryLanguage =
      fields.AZURE_AI_SEARCH_QUERY_LANGUAGE || process.env.AZURE_AI_SEARCH_QUERY_LANGUAGE;
    this.queryLanguage =
      typeof rawQueryLanguage === 'string' ? rawQueryLanguage.trim() : rawQueryLanguage;

    this.queryType = this._resolveQueryType(fields);

    this.topDefault = Number(
      fields.WOODLAND_HISTORY_DEFAULT_TOP ||
        process.env.WOODLAND_HISTORY_DEFAULT_TOP ||
        WoodlandEngineHistory.DEFAULT_TOP,
    );
    const selectFields = this._stringArray(
      fields.WOODLAND_HISTORY_SELECT ||
        process.env.WOODLAND_HISTORY_SELECT ||
        WoodlandEngineHistory.DEFAULT_SELECT,
    );
    this.select = selectFields.length ? selectFields : ['*'];

    const configuredSearchFields =
      fields.WOODLAND_HISTORY_SEARCH_FIELDS || process.env.WOODLAND_HISTORY_SEARCH_FIELDS;
    const searchFields = configuredSearchFields ? this._stringArray(configuredSearchFields) : [];
    this.searchFields = searchFields.length ? searchFields : undefined;

    const vectorFields =
      fields.AZURE_AI_SEARCH_VECTOR_FIELDS || process.env.AZURE_AI_SEARCH_VECTOR_FIELDS;
    this.vectorFields = vectorFields
      ? String(vectorFields)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    this.vectorK = Number(
      fields.AZURE_AI_SEARCH_VECTOR_K ||
        process.env.AZURE_AI_SEARCH_VECTOR_K ||
        WoodlandEngineHistory.DEFAULT_VECTOR_K,
    );

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
      semanticConfiguration: this.semanticConfiguration || null,
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

  _sanitizeUrl(value, associatedValue) {
    const s = typeof value === 'string' ? value.trim() : '';
    if (!/^https?:\/\//i.test(s)) {
      return undefined;
    }
    if (/^https?:\/\/(www\.)?cyclonerake\.com\/?$/i.test(s)) {
      return undefined;
    }
    try {
      const parsed = new URL(s);
      const host = (parsed.hostname || '').toLowerCase();
      const path = (parsed.pathname || '').toLowerCase();
      if (host.endsWith('cyclonerake.com') && associatedValue) {
        const token = String(associatedValue)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        const pathNormalized = path.replace(/[^a-z0-9]/g, '');
        const pathHasDigit = /\d/.test(path);
        const matchesToken = token ? pathNormalized.includes(token) : false;
        if (!pathHasDigit && !matchesToken) {
          return undefined;
        }
      }
      return s;
    } catch (_) {
      return undefined;
    }
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
        const sanitized = this._sanitizeUrl(trimmed);
        if (!sanitized) {
          return;
        }
        if (priority) {
          prioritized.push(sanitized);
        } else {
          urls.add(sanitized);
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

    ['document_url', 'source_url', 'url', 'engine_maintenance_kit_url'].forEach((key) =>
      push(doc[key]),
    );
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
    const normalized = this._normalizeAttributes(doc);
    const citationLabel = doc.engine_model || doc.rake_model || 'Engine History';
    const citationMarkdown = primaryUrl ? `[${citationLabel}](${primaryUrl})` : citationLabel;
    const sanitizedDoc = { ...doc };
    Object.keys(sanitizedDoc).forEach((key) => {
      if (!/(_url)$/i.test(key)) {
        return;
      }
      const baseKey = key.replace(/_url$/i, '');
      const associatedValue = this._isMeaningfulValue(sanitizedDoc[baseKey])
        ? String(sanitizedDoc[baseKey]).trim()
        : undefined;
      const sanitized = this._sanitizeUrl(sanitizedDoc[key], associatedValue);
      sanitizedDoc[key] = sanitized || undefined;
    });

    return {
      ...sanitizedDoc,
      url: primaryUrl || undefined,
      citations: [primaryUrl, ...supplementalUrls].filter(Boolean),
      citation: {
        label: citationLabel,
        url: primaryUrl || undefined,
        markdown: citationMarkdown,
      },
      normalized_catalog: {
        title: doc.engine_model || doc.rake_model || undefined,
        url: primaryUrl || undefined,
        citation: {
          label: citationLabel,
          url: primaryUrl || undefined,
          markdown: citationMarkdown,
        },
      },
      normalized_engine: normalized,
    };
  }

  _isMeaningfulValue(value) {
    if (value == null) {
      return false;
    }
    const str = String(value).trim();
    if (!str) {
      return false;
    }
    return str.toLowerCase() !== 'n/a';
  }

  _lookupUrl(doc, fieldName, associatedValue) {
    if (!fieldName || typeof fieldName !== 'string') {
      return '';
    }
    const variants = new Set([
      `${fieldName}_url`,
      `${fieldName}Url`,
      `${fieldName}URL`,
      `${fieldName.replace(/_/g, '-')}_url`,
      `${fieldName.replace(/[_-]/g, '')}Url`,
    ]);
    for (const key of variants) {
      if (key in doc && this._isMeaningfulValue(doc[key])) {
        return this._sanitizeUrl(String(doc[key]).trim(), associatedValue) || '';
      }
    }
    return '';
  }

  _valueWithUrl(doc, fieldName, label) {
    if (!this._isMeaningfulValue(doc?.[fieldName])) {
      return undefined;
    }
    const value = String(doc[fieldName]).trim();
    const entry = { value };
    const url = this._lookupUrl(doc, fieldName, value);
    if (url) {
      entry.url = url;
    }
    if (label) {
      entry.label = label;
    }
    return entry;
  }

  _collectSingleFieldGroup(doc, fieldName, label) {
    const entry = this._valueWithUrl(doc, fieldName, label);
    return entry ? [entry] : [];
  }

  _normalizeAttributes(doc) {
    const normalized = {
      engine_model: doc.engine_model,
      rake_model: doc.rake_model,
      in_use_date: doc.inuse_date || doc['in_use_date'],
      horsepower: doc.engine_horsepower,
      filter_shape: doc.filter_shape,
      blower_color: doc.blower_color,
      deck_hose: doc.deck_hose_diameter || doc.deck_hose,
      fields: {
        air_filter: this._valueWithUrl(doc, 'air_filter'),
        engine_maintenance_kit: this._valueWithUrl(doc, 'engine_maintenance_kit'),
        filters_and_emk: this._valueWithUrl(doc, 'filters_and_emk'),
        blower_color: this._valueWithUrl(doc, 'blower_color'),
        deck_hose:
          this._valueWithUrl(doc, 'deck_hose_diameter') || this._valueWithUrl(doc, 'deck_hose'),
      },
      groups: {
        maintenance_kits: this._collectSingleFieldGroup(
          doc,
          'engine_maintenance_kit',
          'engine_maintenance_kit',
        ),
        air_filters: this._collectSingleFieldGroup(doc, 'air_filter', 'air_filter'),
        filters_and_emk: this._collectSingleFieldGroup(doc, 'filters_and_emk', 'filters_and_emk'),
        blower_color: this._collectSingleFieldGroup(doc, 'blower_color', 'blower_color'),
        deck_hose: this._collectSingleFieldGroup(doc, 'deck_hose_diameter', 'deck_hose_diameter'),
      },
      tags: Array.isArray(doc.tags) ? doc.tags : this._stringArray(doc.tags),
      content: typeof doc.content === 'string' ? doc.content : undefined,
    };

    return normalized;
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
    const raw =
      fields.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE ||
      process.env.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE ||
      WoodlandEngineHistory.DEFAULT_QUERY_TYPE;
    const normalized = String(raw || '')
      .toLowerCase()
      .trim();
    if (normalized === 'semantic' && !this._hasSemanticConfig()) {
      logger.warn(
        '[woodland-ai-engine-history] Semantic queryType requested but semantic configuration is missing. Using simple.',
        {
          semanticConfiguration: this.semanticConfiguration,
          queryLanguage: this.queryLanguage,
        },
      );
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

  _normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9.\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _extractHorsepowerToken(value) {
    const text = this._normalizeText(value);
    const hpMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:hp|horsepower)\b/i);
    return hpMatch ? hpMatch[1] : '';
  }

  _buildRequestedSignals(input = {}) {
    const query = String(input.query || '');
    const normalizedQuery = this._normalizeText(query);
    const engineKeywords = ['vanguard', 'intek', 'tecumseh', 'briggs', 'kohler', 'honda', 'subaru'];
    const engineFromQuery = engineKeywords.find((keyword) =>
      new RegExp(`\\b${keyword}\\b`, 'i').test(normalizedQuery),
    );
    const hpFromQuery = this._extractHorsepowerToken(query);
    const rakeFromQueryMatch = normalizedQuery.match(
      /\b(classic|commander(?:\s+pro)?|commercial(?:\s+pro)?|xl|z-10|101|102|103|104|105|106|10)\b/i,
    );
    const phaseFromQueryMatch = normalizedQuery.match(/\bphase\s*(i|ii|1|2)\b/i);

    const inferredEngineModel = [engineFromQuery, phaseFromQueryMatch?.[0]].filter(Boolean).join(' ');

    return {
      engineModel: input.engineModel || inferredEngineModel || '',
      rakeModel: input.rakeModel || rakeFromQueryMatch?.[1] || '',
      horsepower: input.horsepower || hpFromQuery || '',
      filterShape: input.filterShape || '',
      blowerColor: input.blowerColor || '',
      airFilter: input.airFilter || '',
      engineMaintenanceKit: input.engineMaintenanceKit || '',
      isAttributeLookup:
        /\b(what\s+models|which\s+models|what\s+years|difference|compare|vs\.?|versus)\b/i.test(
          normalizedQuery,
        ),
    };
  }

  _scoreDocAgainstSignals(doc, signals = {}) {
    const field = (name) => this._normalizeText(doc?.[name]);
    const includes = (haystack, needle) => {
      const n = this._normalizeText(needle);
      if (!n) return false;
      return haystack.includes(n);
    };

    const engineModel = field('engine_model');
    const rakeModel = field('rake_model');
    const horsepower = field('engine_horsepower');
    const filterShape = field('filter_shape');
    const blowerColor = field('blower_color');
    const airFilter = field('air_filter');
    const maintenanceKit = field('engine_maintenance_kit');
    const content = this._normalizeText(doc?.content);

    let score = 0;
    const matched = [];

    if (signals.engineModel) {
      if (includes(engineModel, signals.engineModel) || includes(content, signals.engineModel)) {
        score += 3;
        matched.push('engineModel');
      }
    }

    if (signals.rakeModel) {
      if (includes(rakeModel, signals.rakeModel) || includes(content, signals.rakeModel)) {
        score += 2;
        matched.push('rakeModel');
      }
    }

    if (signals.horsepower) {
      const hpNeedle = this._extractHorsepowerToken(signals.horsepower) || this._normalizeText(signals.horsepower);
      if (hpNeedle && (includes(horsepower, hpNeedle) || includes(content, hpNeedle))) {
        score += 2;
        matched.push('horsepower');
      }
    }

    if (signals.filterShape && (includes(filterShape, signals.filterShape) || includes(content, signals.filterShape))) {
      score += 1;
      matched.push('filterShape');
    }

    if (signals.blowerColor && (includes(blowerColor, signals.blowerColor) || includes(content, signals.blowerColor))) {
      score += 1;
      matched.push('blowerColor');
    }

    if (signals.airFilter && (includes(airFilter, signals.airFilter) || includes(content, signals.airFilter))) {
      score += 2;
      matched.push('airFilter');
    }

    if (
      signals.engineMaintenanceKit &&
      (includes(maintenanceKit, signals.engineMaintenanceKit) ||
        includes(content, signals.engineMaintenanceKit))
    ) {
      score += 2;
      matched.push('engineMaintenanceKit');
    }

    return { score, matched };
  }

  _rankAndFilterResults(results = [], signals = {}) {
    const signalFields = [
      'engineModel',
      'rakeModel',
      'horsepower',
      'filterShape',
      'blowerColor',
      'airFilter',
      'engineMaintenanceKit',
    ];
    const activeSignalCount = signalFields.filter((field) => this._normalizeText(signals[field])).length;

    const scored = results.map((doc) => {
      const { score, matched } = this._scoreDocAgainstSignals(doc, signals);
      return {
        ...doc,
        _match_score: score,
        _matched_signals: matched,
      };
    });

    scored.sort((a, b) => {
      if ((b._match_score || 0) !== (a._match_score || 0)) {
        return (b._match_score || 0) - (a._match_score || 0);
      }
      return (b['@search.score'] || 0) - (a['@search.score'] || 0);
    });

    if (activeSignalCount === 0) {
      return {
        ranked: scored,
        activeSignalCount,
        topScore: scored[0]?._match_score || 0,
        ambiguous: false,
      };
    }

    const topScore = scored[0]?._match_score || 0;
    const filtered = scored.filter((doc) => (doc._match_score || 0) > 0);
    const secondScore = filtered[1]?._match_score || 0;
    const ambiguous = filtered.length > 1 && topScore > 0 && topScore - secondScore <= 1;

    return {
      ranked: filtered.length ? filtered : scored,
      activeSignalCount,
      topScore,
      ambiguous,
    };
  }

  _useOutputEnvelope() {
    return String(process.env.WOODLAND_TOOL_OUTPUT_ENVELOPE || 'false')
      .toLowerCase()
      .trim() === 'true';
  }

  _serializeSuccess(results, top) {
    const sliced = results.slice(0, top);
    if (!this._useOutputEnvelope()) {
      return JSON.stringify(sliced);
    }
    return JSON.stringify({
      status: 'ok',
      tool: this.name,
      count: sliced.length,
      docs: sliced,
      results: sliced,
    });
  }

  _serializeNeedsReview(message) {
    if (!this._useOutputEnvelope()) {
      return message;
    }
    return JSON.stringify({
      status: 'needs_human_review',
      tool: this.name,
      message,
      count: 0,
      docs: [],
      results: [],
    });
  }

  _serializeError(error) {
    const msg = `AZURE_SEARCH_FAILED: ${error?.message || error}`;
    if (!this._useOutputEnvelope()) {
      return msg;
    }
    return JSON.stringify({
      status: 'error',
      tool: this.name,
      message: msg,
      count: 0,
      docs: [],
      results: [],
    });
  }

  async _performSearch(queryString, options) {
    const opts = { ...options };

    if (this.queryType === 'semantic' && this._hasSemanticConfig()) {
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
        logger.info(
          '[woodland-ai-engine-history] No results with query terms, retrying with wildcard',
        );
        results = await this._performSearch('*', { ...options, filter: undefined });
      }

      if (results.length === 0) {
        return this._serializeNeedsReview('NEEDS_HUMAN_REVIEW: No reviewed records found.');
      }

      const requestedSignals = this._buildRequestedSignals(input);
      const { ranked, activeSignalCount, topScore, ambiguous } = this._rankAndFilterResults(
        results,
        requestedSignals,
      );

      if (activeSignalCount > 0 && topScore <= 0) {
        return this._serializeNeedsReview(
          'NEEDS_HUMAN_REVIEW: No confident engine-history match for the provided model/engine cues.',
        );
      }

      if (
        !requestedSignals.isAttributeLookup &&
        activeSignalCount >= 2 &&
        ambiguous &&
        topScore < 4
      ) {
        return this._serializeNeedsReview(
          'NEEDS_HUMAN_REVIEW: Multiple close engine matches found; please confirm one deciding cue (engine label exact model, horsepower, or rake model/year).',
        );
      }

      return this._serializeSuccess(ranked, top);
    } catch (error) {
      logger.error('[woodland-ai-engine-history] Search request failed', error);
      return this._serializeError(error);
    }
  }
}

module.exports = WoodlandEngineHistory;
WoodlandEngineHistory.enableReusableInstance = true;
