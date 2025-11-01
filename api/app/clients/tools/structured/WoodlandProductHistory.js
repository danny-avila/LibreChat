const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

class WoodlandProductHistory extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_QUERY_TYPE = 'simple';
  static DEFAULT_TOP = 20;
  static DEFAULT_SELECT = '*';
  static DEFAULT_VECTOR_K = 15;

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-product-history';
    this.description = 'Query the Woodland product history index (Airtable sourced).';

    this.schema = z.object({
      query: z.string().default(''),
      rakeModel: z.string().optional(),
      engineModel: z.string().optional(),
      deckHose: z.string().optional(),
      collectorBag: z.string().optional(),
      blowerColor: z.string().optional(),
      bagColor: z.string().optional(),
      bagShape: z.string().optional(),
      blowerOpening: z.string().optional(),
      top: z.number().int().positive().max(100).optional(),
      format: z.enum(['json']).default('json'),
    });

    this.serviceEndpoint = fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT || process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT;
    this.apiKey = fields.AZURE_AI_SEARCH_API_KEY || process.env.AZURE_AI_SEARCH_API_KEY;
    this.indexName =
      fields.AZURE_AI_SEARCH_PRODUCT_HISTORY_INDEX || process.env.AZURE_AI_SEARCH_PRODUCT_HISTORY_INDEX ||
      fields.AZURE_AI_SEARCH_INDEX_NAME ||
      process.env.AZURE_AI_SEARCH_INDEX_NAME;

    if (!this.serviceEndpoint || !this.apiKey || !this.indexName) {
      throw new Error('Missing Azure Search configuration for product history.');
    }

    this.apiVersion = fields.AZURE_AI_SEARCH_API_VERSION || process.env.AZURE_AI_SEARCH_API_VERSION || WoodlandProductHistory.DEFAULT_API_VERSION;

    const rawSemanticConfiguration =
      fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION || process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION;
    const semanticConfiguration = (() => {
      if (rawSemanticConfiguration == null) return undefined;
      const str = String(rawSemanticConfiguration).trim();
      if (!str || str.toLowerCase() === 'none') return undefined;
      return str;
    })();
    this.semanticConfiguration = semanticConfiguration;
    const rawQueryLanguage =
      fields.AZURE_AI_SEARCH_QUERY_LANGUAGE || process.env.AZURE_AI_SEARCH_QUERY_LANGUAGE;
    this.queryLanguage = typeof rawQueryLanguage === 'string' ? rawQueryLanguage.trim() : rawQueryLanguage;

    this.queryType = this._resolveQueryType(fields);

    this.topDefault = Number(fields.WOODLAND_HISTORY_DEFAULT_TOP || process.env.WOODLAND_HISTORY_DEFAULT_TOP || WoodlandProductHistory.DEFAULT_TOP);
    const selectFields = this._stringArray(
      fields.WOODLAND_HISTORY_SELECT || process.env.WOODLAND_HISTORY_SELECT || WoodlandProductHistory.DEFAULT_SELECT,
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
    this.vectorK = Number(fields.AZURE_AI_SEARCH_VECTOR_K || process.env.AZURE_AI_SEARCH_VECTOR_K || WoodlandProductHistory.DEFAULT_VECTOR_K);

    this.client = new SearchClient(
      this.serviceEndpoint,
      this.indexName,
      new AzureKeyCredential(this.apiKey),
      { apiVersion: this.apiVersion },
    );

    logger.info('[woodland-ai-product-history] Initialized', {
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
    add('rake_model', input.rakeModel);
    add('engine_model', input.engineModel);
    add('deck_hose', input.deckHose);
    add('collector_bag', input.collectorBag);
    add('blower_color', input.blowerColor);
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

    ['document_url', 'source_url', 'url'].forEach((key) => push(doc[key]));
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
    const bagDetails = this._deriveBagDetails(doc.collector_bag ?? doc.collectorBag);
    const blowerOpening = this._deriveBlowerOpening(doc.deck_hose ?? doc.deckHose);
    const normalized = this._normalizeAttributes(doc, {
      bagDetails,
      blowerOpening,
    });

    return {
      ...doc,
      citations: [primaryUrl, ...supplementalUrls].filter(Boolean),
      normalized_product: normalized,
    };
  }

  _deriveBagDetails(rawValue) {
    if (typeof rawValue !== 'string') {
      return {};
    }
    const value = rawValue.trim();
    if (!value) {
      return {};
    }
    const firstSegment = value.split('-')[0]?.trim() || value;
    const match = firstSegment.match(/^(Straight|Tapered|Square)\s+([A-Za-z]+)/i);
    if (!match) {
      return {};
    }
    const [, shape, color] = match;
    return {
      shape: shape ? shape.trim() : undefined,
      color: color ? color.trim() : undefined,
    };
  }

  _deriveBlowerOpening(rawValue) {
    if (typeof rawValue !== 'string') {
      return undefined;
    }
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return undefined;
    }
    const match = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:in|inch|inches)/i);
    if (match) {
      const [, size] = match;
      return `${size}"`;
    }
    return trimmed;
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

  _lookupUrl(doc, fieldName) {
    if (!fieldName || typeof fieldName !== 'string') {
      return '';
    }
    const candidates = new Set([
      `${fieldName}_url`,
      `${fieldName}_Url`,
      `${fieldName}Url`,
      `${fieldName}URL`,
      `${fieldName.replace(/_/g, '-')}_url`,
      `${fieldName.replace(/_/g, '-')}-url`,
      `${fieldName.replace(/_/g, '')}Url`,
      `${fieldName.replace(/[_-]/g, '')}Url`,
    ]);

    for (const candidate of candidates) {
      if (candidate in doc && this._isMeaningfulValue(doc[candidate])) {
        return String(doc[candidate]).trim();
      }
    }
    return '';
  }

  _formatOptionLabel(fieldName, prefix) {
    if (!fieldName || typeof fieldName !== 'string') {
      return '';
    }
    const normalized = fieldName.toLowerCase();
    const normalizedPrefix = typeof prefix === 'string' ? prefix.toLowerCase() : '';
    let labelPart = normalizedPrefix && normalized.startsWith(normalizedPrefix)
      ? fieldName.slice(prefix.length)
      : fieldName;
    labelPart = labelPart.replace(/^[_-]/, '');
    if (!labelPart) {
      return 'primary';
    }
    return labelPart
      .replace(/[_-]/g, ' ')
      .replace(/(\d+)/g, ' $1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _collectOptionGroup(doc, prefixes = []) {
    const prefixList = Array.isArray(prefixes) ? prefixes.filter(Boolean) : [prefixes];
    if (!prefixList.length) {
      return [];
    }
    const seen = new Set();
    const entries = [];
    Object.entries(doc || {}).forEach(([rawKey, value]) => {
      if (!this._isMeaningfulValue(value)) {
        return;
      }
      const key = String(rawKey);
      const lowerKey = key.toLowerCase();
      if (lowerKey.endsWith('_url') || lowerKey.endsWith('url')) {
        return;
      }
      const matchedPrefix = prefixList.find((prefix) => lowerKey.startsWith(String(prefix).toLowerCase()));
      if (!matchedPrefix) {
        return;
      }
      if (seen.has(lowerKey)) {
        return;
      }
      seen.add(lowerKey);
      entries.push({
        field: key,
        label: this._formatOptionLabel(key, matchedPrefix),
        value: String(value).trim(),
        url: this._lookupUrl(doc, key),
      });
    });

    entries.sort((a, b) => a.label.localeCompare(b.label));
    return entries;
  }

  _valueWithUrl(doc, fieldName) {
    if (!this._isMeaningfulValue(doc?.[fieldName])) {
      return undefined;
    }
    const value = String(doc[fieldName]).trim();
    const url = this._lookupUrl(doc, fieldName);
    return url ? { value, url } : { value };
  }

  _normalizeAttributes(doc, { bagDetails, blowerOpening }) {
    const normalized = {
      model: doc.rake_model || doc.model,
      engine_model: doc.engine_model,
      deck_hose: doc.deck_hose,
      collector_bag: doc.collector_bag,
      blower_color: doc.blower_color,
      bag_color: bagDetails?.color || undefined,
      bag_shape: bagDetails?.shape || undefined,
      blower_opening: blowerOpening || undefined,
      groups: {
        replacement_side_tubes: this._collectOptionGroup(doc, ['replacement_side_tubes']),
        collector_bag_options: this._collectOptionGroup(doc, ['replacement_bag_option']),
        latch_upgrades: this._collectOptionGroup(doc, ['latch_upgrade_kit']),
        collector_frames: this._collectOptionGroup(doc, ['collector_frame', 'collector_complete', 'replacement_collector_complete']),
        chassis: this._collectOptionGroup(doc, ['chassis']),
        impellers: this._collectOptionGroup(doc, ['replacement_impeller_option', 'impeller_hardware_kit']),
        blower_housings: this._collectOptionGroup(doc, ['replacement_blower_housing_option', 'blower_housing', 'blower_rebuild']),
        blower_with_impeller: this._collectOptionGroup(doc, ['replacement_blower_w_impeller_option']),
        engines: this._collectOptionGroup(doc, ['engine_model', 'replacement_engine_option']),
        engine_blowers: this._collectOptionGroup(doc, ['engine_blower_complete_option', 'engine_blower_complete']),
        air_filters: this._collectOptionGroup(doc, ['replacement_air_filters']),
        maintenance_kits: this._collectOptionGroup(doc, ['engine_maintenance_kit']),
        couplings: this._collectOptionGroup(doc, ['mda_collar', 'pvp_coupling', 'estate_vac_coupling', 'power_unloader_chute']),
        accessories: this._collectOptionGroup(doc, ['roof_rack_carrier', 'accessories']),
        deck_hose: this._collectOptionGroup(doc, ['deck_hose']),
      },
      fields: {
        roof_rack_carrier: this._valueWithUrl(doc, 'roof_rack_carrier'),
        replacement_air_filters: this._valueWithUrl(doc, 'replacement_air_filters'),
        engine_maintenance_kit: this._valueWithUrl(doc, 'engine_maintenance_kit'),
        mda_collar: this._valueWithUrl(doc, 'mda_collar'),
        blower_inlet: this._valueWithUrl(doc, 'blower_inlet'),
        exit_chute: this._valueWithUrl(doc, 'exit_chute'),
        band_clamp: this._valueWithUrl(doc, 'band_clamp'),
        pvp_coupling: this._valueWithUrl(doc, 'pvp_coupling'),
        estate_vac_coupling: this._valueWithUrl(doc, 'estate_vac_coupling'),
        power_unloader_chute: this._valueWithUrl(doc, 'power_unloader_chute'),
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

    if (this.queryType === 'semantic' && this._hasSemanticConfig()) {
      opts.semanticSearchOptions = {
        configurationName: this.semanticConfiguration,
        queryLanguage: this.queryLanguage,
      };
    }

    logger.debug('[woodland-ai-product-history] Executing search', {
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

  _resolveQueryType(fields = {}) {
    const raw = (fields.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE || process.env.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE || WoodlandProductHistory.DEFAULT_QUERY_TYPE);
    const normalized = String(raw || '').toLowerCase().trim();
    if (normalized === 'semantic' && !this._hasSemanticConfig()) {
      logger.warn('[woodland-ai-product-history] Semantic queryType requested but semantic configuration is missing. Using simple.', {
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

  async _call(data) {
    const parsed = this.schema.safeParse(data);
    if (!parsed.success) {
      return `INPUT_VALIDATION_FAILED: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    }

    const input = parsed.data;
    const top = Number.isFinite(input.top) ? Math.floor(input.top) : this.topDefault;
    const enriched = { ...input };
    if (!enriched.deckHose && input.blowerOpening) {
      enriched.deckHose = input.blowerOpening;
    }
    if (!enriched.collectorBag && (input.bagShape || input.bagColor)) {
      const bagParts = [input.bagShape, input.bagColor].filter(Boolean);
      if (bagParts.length) {
        enriched.collectorBag = bagParts.join(' ');
      }
    }
    const filter = this._buildFilter(enriched);
    const fallbackTerms = this._collectTerms(
      enriched.rakeModel,
      enriched.engineModel,
      enriched.deckHose,
      enriched.collectorBag,
      enriched.blowerColor,
      input.bagColor,
      input.bagShape,
      input.blowerOpening,
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
        logger.info('[woodland-ai-product-history] No results with filter, retrying without filter');
        results = await this._performSearch(queryString, retryOptions);
      }

      if (results.length === 0 && queryString !== '*' && !options.filter) {
        logger.info('[woodland-ai-product-history] No results with query terms, retrying with wildcard');
        results = await this._performSearch('*', { ...options, filter: undefined });
      }

      if (results.length === 0) {
        return 'NEEDS_HUMAN_REVIEW: No reviewed records found.';
      }

      results.sort((a, b) => (b['@search.score'] || 0) - (a['@search.score'] || 0));
      return JSON.stringify(results.slice(0, top));
    } catch (error) {
      logger.error('[woodland-ai-product-history] Search request failed', error);
      return `AZURE_SEARCH_FAILED: ${error?.message || error}`;
    }
  }
}

module.exports = WoodlandProductHistory;
