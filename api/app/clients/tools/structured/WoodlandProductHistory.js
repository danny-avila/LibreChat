const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
let logger;
try {
  ({ logger } = require('~/config'));
} catch (_) {
  ({ logger } = require('@librechat/data-schemas'));
}

class WoodlandProductHistory extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_QUERY_TYPE = 'simple';
  static DEFAULT_TOP = 5;
  static DEFAULT_SELECT = '*';
  static DEFAULT_VECTOR_K = 15;
  static MAX_CONTENT_LENGTH = 2000; // Truncate content to avoid token overflow

  // Canonical casing maps for Azure Search case-sensitive eq filters
  static CANONICAL_COLORS = {
    yellow: 'Yellow',
    orange: 'Orange',
    black: 'Black',
    red: 'Red',
    blue: 'Blue',
    green: 'Green',
    grey: 'Grey',
    gray: 'Grey',
    white: 'White',
  };

  static CANONICAL_SHAPES = {
    tapered: 'Tapered',
    taper: 'Tapered',
    straight: 'Straight',
    square: 'Straight', // square bags are straight-sided
  };

  static OPENING_SYNONYMS = {
    opening: 'intake',
    inlet: 'intake',
    diameter: 'intake',
    blower: 'intake',
  };

  // Regex patterns for NLP extraction
  static COLOR_PATTERN = /\b(yellow|orange|black|red|blue|green|grey|gray|white)\b/gi;
  static SHAPE_PATTERN = /\b(tapered|taper|straight|square)\b/gi;
  static OPENING_PATTERN = /\b(\d+(?:\.\d+)?)[\s-]*(inch|in|"|inches?)(?:\s*(intake|opening|inlet|diameter|blower))?\b/gi;
  static OPENING_PATTERN_ALT = /\b(?:intake|opening|inlet|diameter)[\s:]*(?:of\s*)?(\d+(?:\.\d+)?)[\s-]*(inch|in|"|inches?)?\b/gi;
  static ENGINE_PATTERN = /\b(tecumseh|vanguard|intek|briggs|honda|kohler|xr\s*\d+)[\s-]*(\d+(?:\.\d+)?\s*hp)?\b/gi;

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

    this.serviceEndpoint =
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT || process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT;
    this.apiKey = fields.AZURE_AI_SEARCH_API_KEY || process.env.AZURE_AI_SEARCH_API_KEY;
    this.indexName =
      fields.AZURE_AI_SEARCH_PRODUCT_HISTORY_INDEX ||
      process.env.AZURE_AI_SEARCH_PRODUCT_HISTORY_INDEX ||
      fields.AZURE_AI_SEARCH_INDEX_NAME ||
      process.env.AZURE_AI_SEARCH_INDEX_NAME;

    if (!this.serviceEndpoint || !this.apiKey || !this.indexName) {
      throw new Error('Missing Azure Search configuration for product history.');
    }

    this.apiVersion =
      fields.AZURE_AI_SEARCH_API_VERSION ||
      process.env.AZURE_AI_SEARCH_API_VERSION ||
      WoodlandProductHistory.DEFAULT_API_VERSION;

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
        WoodlandProductHistory.DEFAULT_TOP,
    );
    const selectFields = this._stringArray(
      fields.WOODLAND_HISTORY_SELECT ||
        process.env.WOODLAND_HISTORY_SELECT ||
        WoodlandProductHistory.DEFAULT_SELECT,
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
        WoodlandProductHistory.DEFAULT_VECTOR_K,
    );

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

  _buildFilter(input, options = {}) {
    const { useContains = false } = options;
    const filters = [];
    
    const addExact = (field, value) => {
      if (!value) return;
      const sanitized = String(value).replace(/'/g, "''").trim();
      if (!sanitized) return;
      filters.push(`${field} eq '${sanitized}'`);
    };
    
    const addContains = (field, value) => {
      if (!value) return;
      const sanitized = String(value).replace(/'/g, "''").trim();
      if (!sanitized) return;
      // Use search.ismatch for partial text matching
      filters.push(`search.ismatch('${sanitized}', '${field}')`);
    };
    
    const add = useContains ? addContains : addExact;
    
    addExact('rake_model', input.rakeModel); // Always exact for model
    add('engine_model', input.engineModel);
    add('deck_hose', input.deckHose);
    add('collector_bag', input.collectorBag);
    add('blower_color', input.blowerColor);
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

    // Priority 1: Explicit Airtable URL fields
    const airtableCandidates = [
      doc.airtable_url,
      doc.airtableUrl,
      doc.airtable_link,
      doc.airtableLink,
      doc.airtable_record_url,
      doc.airtableRecordUrl,
      doc.record_url,
      doc.recordUrl,
    ];
    airtableCandidates.forEach((value) => push(value, true));

    // Priority 2: Construct Airtable URL from record_id if no URL found yet
    if (prioritized.length === 0) {
      const recordId = doc.record_id || doc.recordId || doc.airtable_record_id || doc.airtableRecordId;
      const tableId = doc.table_id || doc.tableId || doc.airtable_table_id;
      const baseId = doc.base_id || doc.baseId || doc.airtable_base_id || 
                     process.env.AIRTABLE_PRODUCT_HISTORY_BASE_ID || 
                     process.env.AIRTABLE_BASE_ID;
      
      if (recordId && baseId) {
        // Construct Airtable record URL: https://airtable.com/{baseId}/{tableId}/{recordId}
        const tableIdPart = tableId || 'tbl'; // Default table prefix if not specified
        const airtableUrl = `https://airtable.com/${baseId}/${tableIdPart}/${recordId}`;
        push(airtableUrl, true);
        logger.debug('[woodland-ai-product-history] Constructed Airtable URL from record_id', {
          recordId,
          baseId,
          url: airtableUrl,
        });
      }
    }

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
    const citationLabel = doc.rake_model || doc.model || 'Product History';
    const citationMarkdown = primaryUrl ? `[${citationLabel}](${primaryUrl})` : citationLabel;

    // Extract and truncate content field - this contains all the Airtable product details
    let content = typeof doc.content === 'string' ? doc.content.trim() : '';
    if (content.length > WoodlandProductHistory.MAX_CONTENT_LENGTH) {
      content = content.substring(0, WoodlandProductHistory.MAX_CONTENT_LENGTH) + '...';
    }

    // Build minimal output to avoid token overflow
    return {
      rake_model: doc.rake_model || doc.model,
      engine_model: doc.engine_model,
      deck_hose: doc.deck_hose,
      collector_bag: doc.collector_bag,
      blower_color: doc.blower_color,
      url: primaryUrl || undefined,
      citations: [primaryUrl, ...supplementalUrls].filter(Boolean),
      citation: {
        label: citationLabel,
        url: primaryUrl || undefined,
        markdown: citationMarkdown,
      },
      normalized_catalog: {
        title: doc.rake_model || doc.model || undefined,
        url: primaryUrl || undefined,
        citation: {
          label: citationLabel,
          url: primaryUrl || undefined,
          markdown: citationMarkdown,
        },
      },
      content: content || undefined,
    };
  }

  /**
   * Calculate a match score based on how many requested attributes match the document.
   * Higher score = more attributes matched.
   * @param {Object} doc - Shaped document
   * @param {Object} requestedAttrs - User-requested attributes
   * @returns {Object} { score: number, matches: string[], mismatches: string[] }
   */
  _calculateAttributeMatchScore(doc, requestedAttrs) {
    const matches = [];
    const mismatches = [];
    let score = 0;
    
    // Derive bag details from collector_bag field
    const bagDetails = this._deriveBagDetails(doc.collector_bag);
    
    const compareAttr = (docValue, requestedValue, attrName, weight = 1) => {
      if (!requestedValue) return; // Not requested
      if (!docValue) {
        mismatches.push(`${attrName}: expected "${requestedValue}", got none`);
        return;
      }
      
      const docLower = String(docValue).toLowerCase().trim();
      const reqLower = String(requestedValue).toLowerCase().trim();
      
      // Exact match
      if (docLower === reqLower) {
        score += weight;
        matches.push(`${attrName}: "${requestedValue}"`);
        return;
      }
      
      // Partial match (contains)
      if (docLower.includes(reqLower) || reqLower.includes(docLower)) {
        score += weight * 0.7;
        matches.push(`${attrName}: partial "${requestedValue}" in "${docValue}"`);
        return;
      }
      
      mismatches.push(`${attrName}: expected "${requestedValue}", got "${docValue}"`);
    };
    
    // Check each attribute (weighted by importance)
    compareAttr(doc.engine_model, requestedAttrs.engineModel, 'engine_model', 2);
    compareAttr(doc.deck_hose, requestedAttrs.deckHose, 'deck_hose', 2);
    compareAttr(doc.blower_color, requestedAttrs.blowerColor, 'blower_color', 1.5);
    compareAttr(bagDetails?.color, requestedAttrs.bagColor, 'bag_color', 1.5);
    compareAttr(bagDetails?.shape, requestedAttrs.bagShape, 'bag_shape', 1.5);
    compareAttr(doc.collector_bag, requestedAttrs.collectorBag, 'collector_bag', 2);
    
    return { score, matches, mismatches };
  }

  /**
   * Score and rank results based on attribute matches.
   * @param {Array} results - Array of shaped documents
   * @param {Object} requestedAttrs - User-requested attributes
   * @returns {Array} Results with _matchScore added and sorted by score
   */
  _rankByAttributeMatch(results, requestedAttrs) {
    if (!Array.isArray(results) || results.length === 0) return results;
    
    const hasRequestedAttrs = Object.values(requestedAttrs || {}).some(Boolean);
    if (!hasRequestedAttrs) return results;
    
    const scored = results.map((doc) => {
      const matchInfo = this._calculateAttributeMatchScore(doc, requestedAttrs);
      return {
        ...doc,
        _matchScore: matchInfo.score,
        _matchDetails: matchInfo,
      };
    });
    
    // Sort by match score (desc), then by search score (desc)
    scored.sort((a, b) => {
      const scoreDiff = (b._matchScore || 0) - (a._matchScore || 0);
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
      return (b['@search.score'] || 0) - (a['@search.score'] || 0);
    });
    
    // Log ranking results for debugging
    logger.debug('[woodland-ai-product-history] Attribute ranking results', {
      requestedAttrs,
      topResults: scored.slice(0, 3).map((d) => ({
        model: d.rake_model,
        matchScore: d._matchScore,
        searchScore: d['@search.score'],
        matches: d._matchDetails?.matches,
      })),
    });
    
    return scored;
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
    let labelPart =
      normalizedPrefix && normalized.startsWith(normalizedPrefix)
        ? fieldName.slice(prefix.length)
        : fieldName;
    labelPart = labelPart.replace(/^[_-]/, '');
    if (!labelPart) {
      return 'primary';
    }
    return labelPart.replace(/[_-]/g, ' ').replace(/(\d+)/g, ' $1').replace(/\s+/g, ' ').trim();
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
      const matchedPrefix = prefixList.find((prefix) =>
        lowerKey.startsWith(String(prefix).toLowerCase()),
      );
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
        collector_frames: this._collectOptionGroup(doc, [
          'collector_frame',
          'collector_complete',
          'replacement_collector_complete',
        ]),
        chassis: this._collectOptionGroup(doc, ['chassis']),
        impellers: this._collectOptionGroup(doc, [
          'replacement_impeller_option',
          'impeller_hardware_kit',
        ]),
        blower_housings: this._collectOptionGroup(doc, [
          'replacement_blower_housing_option',
          'blower_housing',
          'blower_rebuild',
        ]),
        blower_with_impeller: this._collectOptionGroup(doc, [
          'replacement_blower_w_impeller_option',
        ]),
        engines: this._collectOptionGroup(doc, ['engine_model', 'replacement_engine_option']),
        engine_blowers: this._collectOptionGroup(doc, [
          'engine_blower_complete_option',
          'engine_blower_complete',
        ]),
        air_filters: this._collectOptionGroup(doc, ['replacement_air_filters']),
        maintenance_kits: this._collectOptionGroup(doc, ['engine_maintenance_kit']),
        couplings: this._collectOptionGroup(doc, [
          'mda_collar',
          'pvp_coupling',
          'estate_vac_coupling',
          'power_unloader_chute',
        ]),
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
      const shaped = this._shapeDocument({ ...doc, ['@search.score']: result.score });
      const merged = await this._maybeMergeFallbackParts(shaped, doc);
      results.push(merged);
    }

    return results;
  }

  /**
   * Determine fallback compatible model for "All other parts" behavior.
   * Supports multiple potential field names to match Airtable export variations.
   */
  _getFallbackModel(doc) {
    const candidates = [
      doc.all_other_parts,
      doc.allOtherParts,
      doc.all_other_parts_model,
      doc.other_parts_model,
      doc.compatible_model_for_other_parts,
      doc.compatibleModelForOtherParts,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) {
        return c.trim();
      }
    }
    return undefined;
  }

  /**
   * If a fallback model is specified, fetch its record and merge content
   * into the shaped result.
   */
  async _maybeMergeFallbackParts(shaped, originalDoc) {
    try {
      const fallbackModel = this._getFallbackModel(originalDoc);
      if (!fallbackModel) {
        return shaped;
      }

      // Fetch the fallback record by model name
      const filter = `rake_model eq '${fallbackModel.replace(/'/g, "''")}'`;
      const opts = {
        top: 1,
        select: this.select?.length ? this.select : undefined,
        searchMode: 'any',
        queryType: this.queryType,
        filter,
      };
      const iterator = await this.client.search('*', opts);
      const first = await iterator.next();
      const fbResult = first?.value;
      const fbDoc = fbResult?.document;
      if (!fbDoc) {
        return shaped;
      }

      const fbShaped = this._shapeDocument({ ...fbDoc });

      // Simple merge: append fallback content if primary is missing details
      const merged = { ...shaped };
      if (fbShaped.content && (!shaped.content || shaped.content.length < 100)) {
        merged.content = shaped.content 
          ? `${shaped.content}\n\n--- Additional parts from ${fallbackModel} ---\n${fbShaped.content}`
          : fbShaped.content;
      }
      merged.fallback_model = fallbackModel;

      return merged;
    } catch (e) {
      logger.warn('[woodland-ai-product-history] Fallback merge failed', e);
      return shaped;
    }
  }

  _resolveQueryType(fields = {}) {
    const raw =
      fields.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE ||
      process.env.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE ||
      WoodlandProductHistory.DEFAULT_QUERY_TYPE;
    const normalized = String(raw || '')
      .toLowerCase()
      .trim();
    if (normalized === 'semantic' && !this._hasSemanticConfig()) {
      logger.warn(
        '[woodland-ai-product-history] Semantic queryType requested but semantic configuration is missing. Using simple.',
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

  /**
   * Extract structured attributes from natural-language query text.
   * Returns inferred values for blowerColor, bagShape, bagColor, blowerOpening, engineModel.
   */
  _inferStructuredFromQuery(query) {
    if (!query || typeof query !== 'string') {
      return {};
    }
    const text = query.toLowerCase();
    const inferred = {};

    // Extract colors - look for context clues
    const colorMatches = text.match(WoodlandProductHistory.COLOR_PATTERN) || [];
    const uniqueColors = [...new Set(colorMatches.map((c) => c.toLowerCase()))];

    // Assign colors based on context
    uniqueColors.forEach((color) => {
      const canonical = WoodlandProductHistory.CANONICAL_COLORS[color];
      if (!canonical) return;

      // Check for blower/housing context
      if (/blower|housing/.test(text) && !inferred.blowerColor) {
        const blowerPattern = new RegExp(`(${color})\\s*(blower|housing)|blower\\s*(housing)?\\s*(${color})|(${color})\\s+blower`, 'i');
        if (blowerPattern.test(query)) {
          inferred.blowerColor = canonical;
        }
      }

      // Check for bag context
      if (/bag/.test(text) && !inferred.bagColor) {
        const bagPattern = new RegExp(`(${color})\\s*bag|bag\\s*(${color})`, 'i');
        if (bagPattern.test(query)) {
          inferred.bagColor = canonical;
        }
      }
    });

    // If only one color and no specific context, try to infer from position
    if (uniqueColors.length === 1 && !inferred.blowerColor && !inferred.bagColor) {
      const singleColor = WoodlandProductHistory.CANONICAL_COLORS[uniqueColors[0]];
      if (/blower|housing/.test(text)) {
        inferred.blowerColor = singleColor;
      } else if (/bag/.test(text)) {
        inferred.bagColor = singleColor;
      }
    }

    // Extract bag shape
    const shapeMatches = text.match(WoodlandProductHistory.SHAPE_PATTERN);
    if (shapeMatches && shapeMatches.length > 0) {
      const shape = shapeMatches[0].toLowerCase();
      inferred.bagShape = WoodlandProductHistory.CANONICAL_SHAPES[shape];
    }

    // Extract blower opening/intake size
    let openingMatch = WoodlandProductHistory.OPENING_PATTERN.exec(query);
    WoodlandProductHistory.OPENING_PATTERN.lastIndex = 0; // Reset regex
    if (!openingMatch) {
      openingMatch = WoodlandProductHistory.OPENING_PATTERN_ALT.exec(query);
      WoodlandProductHistory.OPENING_PATTERN_ALT.lastIndex = 0;
    }
    if (openingMatch) {
      const size = openingMatch[1];
      inferred.blowerOpening = `${size} inch`;
    }

    // Extract engine model
    const engineMatch = WoodlandProductHistory.ENGINE_PATTERN.exec(query);
    WoodlandProductHistory.ENGINE_PATTERN.lastIndex = 0;
    if (engineMatch) {
      const brand = engineMatch[1];
      const hp = engineMatch[2] || '';
      const normalizedBrand = brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
      inferred.engineModel = `${normalizedBrand} ${hp}`.trim();
    }

    logger.debug('[woodland-ai-product-history] _inferStructuredFromQuery', {
      query: query.substring(0, 100),
      inferred,
    });

    return inferred;
  }

  /**
   * Normalize a value to canonical casing for Azure Search eq filters.
   */
  _normalizeToCanonical(value, type) {
    if (!value || typeof value !== 'string') return value;
    const lower = value.toLowerCase().trim();

    switch (type) {
      case 'color':
        return WoodlandProductHistory.CANONICAL_COLORS[lower] || value;
      case 'shape':
        return WoodlandProductHistory.CANONICAL_SHAPES[lower] || value;
      default:
        return value;
    }
  }

  /**
   * Normalize all filter-relevant input values to canonical casing.
   */
  _normalizeInputValues(input) {
    const normalized = { ...input };

    if (input.blowerColor) {
      normalized.blowerColor = this._normalizeToCanonical(input.blowerColor, 'color');
    }
    if (input.bagColor) {
      normalized.bagColor = this._normalizeToCanonical(input.bagColor, 'color');
    }
    if (input.bagShape) {
      normalized.bagShape = this._normalizeToCanonical(input.bagShape, 'shape');
    }

    // Normalize blower opening format
    if (input.blowerOpening) {
      const match = input.blowerOpening.match(/(\d+(?:\.\d+)?)/)
      if (match) {
        normalized.blowerOpening = `${match[1]} inch`;
      }
    }

    return normalized;
  }

  /**
   * Build filter variants for retry logic - returns array of filter strings to try.
   * Starts with full exact filter, then tries partial matches, then drops filters progressively.
   */
  _buildFilterVariants(input) {
    const variants = [];
    const seen = new Set();
    
    const addVariant = (filter, description) => {
      if (!filter || seen.has(filter)) return;
      seen.add(filter);
      variants.push({ filter, description });
    };
    
    // Strategy 1: Full exact match
    const fullFilter = this._buildFilter(input);
    addVariant(fullFilter, 'full exact filter');
    
    // Strategy 2: Full filter with partial matching (search.ismatch)
    const fullContainsFilter = this._buildFilter(input, { useContains: true });
    addVariant(fullContainsFilter, 'full partial match filter');

    // Strategy 3: Without blowerColor (often most restrictive for exact match)
    if (input.blowerColor) {
      const withoutBlower = { ...input, blowerColor: undefined };
      addVariant(this._buildFilter(withoutBlower), 'without blowerColor exact');
      addVariant(this._buildFilter(withoutBlower, { useContains: true }), 'without blowerColor partial');
    }

    // Strategy 4: Core attributes only (collector_bag + deck_hose)
    if (input.collectorBag || input.deckHose) {
      const coreOnly = { 
        collectorBag: input.collectorBag, 
        deckHose: input.deckHose,
        engineModel: input.engineModel 
      };
      addVariant(this._buildFilter(coreOnly), 'core attributes exact');
      addVariant(this._buildFilter(coreOnly, { useContains: true }), 'core attributes partial');
    }

    // Strategy 5: Engine + deck_hose only
    if (input.engineModel && input.deckHose) {
      const engineDeck = { engineModel: input.engineModel, deckHose: input.deckHose };
      addVariant(this._buildFilter(engineDeck), 'engine+deck exact');
      addVariant(this._buildFilter(engineDeck, { useContains: true }), 'engine+deck partial');
    }

    // Strategy 6: Only rakeModel if present
    if (input.rakeModel) {
      const onlyModel = { rakeModel: input.rakeModel };
      addVariant(this._buildFilter(onlyModel), 'only rakeModel');
    }

    // Final: no filter
    variants.push({ filter: undefined, description: 'no filter (fallback)' });

    return variants;
  }

  async _call(data) {
    const parsed = this.schema.safeParse(data);
    if (!parsed.success) {
      return `INPUT_VALIDATION_FAILED: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    }

    const input = parsed.data;
    const top = Number.isFinite(input.top) ? Math.floor(input.top) : this.topDefault;

    // Step 1: Infer attributes from query text (NLP extraction)
    const inferredFromQuery = this._inferStructuredFromQuery(input.query);

    // Step 2: Merge inferred values with explicit input (explicit takes precedence)
    const merged = {
      ...input,
      blowerColor: input.blowerColor || inferredFromQuery.blowerColor,
      bagColor: input.bagColor || inferredFromQuery.bagColor,
      bagShape: input.bagShape || inferredFromQuery.bagShape,
      blowerOpening: input.blowerOpening || inferredFromQuery.blowerOpening,
      engineModel: input.engineModel || inferredFromQuery.engineModel,
    };

    // Step 3: Normalize all values to canonical casing
    const normalized = this._normalizeInputValues(merged);

    logger.info('[woodland-ai-product-history] Attribute extraction complete', {
      explicit: {
        blowerColor: input.blowerColor,
        bagColor: input.bagColor,
        bagShape: input.bagShape,
        blowerOpening: input.blowerOpening,
        engineModel: input.engineModel,
      },
      inferred: inferredFromQuery,
      normalized: {
        blowerColor: normalized.blowerColor,
        bagColor: normalized.bagColor,
        bagShape: normalized.bagShape,
        blowerOpening: normalized.blowerOpening,
        engineModel: normalized.engineModel,
      },
    });

    const enriched = { ...normalized };
    if (!enriched.deckHose && normalized.blowerOpening) {
      enriched.deckHose = normalized.blowerOpening;
    }
    if (!enriched.collectorBag && (normalized.bagShape || normalized.bagColor)) {
      const bagParts = [normalized.bagShape, normalized.bagColor].filter(Boolean);
      if (bagParts.length) {
        enriched.collectorBag = bagParts.join(' ');
      }
    }
    const filter = this._buildFilter(enriched);

    logger.info('[woodland-ai-product-history] Final OData filter', {
      filter: filter || '(none)',
      enrichedAttributes: {
        rakeModel: enriched.rakeModel,
        engineModel: enriched.engineModel,
        deckHose: enriched.deckHose,
        collectorBag: enriched.collectorBag,
        blowerColor: enriched.blowerColor,
      },
    });
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
      let results = [];

      // Build filter variants for retry logic
      const filterVariants = this._buildFilterVariants(enriched);
      logger.debug('[woodland-ai-product-history] Filter variants for retry', {
        variantCount: filterVariants.length,
        variants: filterVariants.map((v) => v.description),
      });

      // Try each filter variant until we get results
      for (const variant of filterVariants) {
        const attemptOptions = { ...options, filter: variant.filter };
        logger.info('[woodland-ai-product-history] Attempting search', {
          strategy: variant.description,
          filter: variant.filter || '(none)',
        });

        results = await this._performSearch(queryString, attemptOptions);

        if (results.length > 0) {
          logger.info('[woodland-ai-product-history] Search succeeded', {
            strategy: variant.description,
            resultCount: results.length,
          });
          break;
        }

        logger.info('[woodland-ai-product-history] No results, trying next variant', {
          triedStrategy: variant.description,
        });
      }

      // Final fallback: wildcard search
      if (results.length === 0 && queryString !== '*') {
        logger.info(
          '[woodland-ai-product-history] No results with query terms, retrying with wildcard',
        );
        results = await this._performSearch('*', { ...options, filter: undefined });
      }

      if (results.length === 0) {
        return 'NEEDS_HUMAN_REVIEW: No reviewed records found.';
      }

      // Rank results by attribute match score (more important than search score)
      const requestedAttrs = {
        engineModel: normalized.engineModel,
        deckHose: enriched.deckHose,
        blowerColor: normalized.blowerColor,
        bagColor: normalized.bagColor,
        bagShape: normalized.bagShape,
        collectorBag: enriched.collectorBag,
      };
      
      results = this._rankByAttributeMatch(results, requestedAttrs);
      
      // Add model differentiation info if multiple models have same top score
      const topScore = results[0]?._matchScore || 0;
      const topMatches = results.filter((r) => Math.abs((r._matchScore || 0) - topScore) < 0.1);
      
      if (topMatches.length > 1) {
        logger.info('[woodland-ai-product-history] Multiple models with same match score', {
          count: topMatches.length,
          models: topMatches.map((m) => m.rake_model),
          missingDifferentiators: topMatches[0]?._matchDetails?.mismatches || [],
        });
      }
      
      return JSON.stringify(results.slice(0, top));
    } catch (error) {
      logger.error('[woodland-ai-product-history] Search request failed', error);
      return `AZURE_SEARCH_FAILED: ${error?.message || error}`;
    }
  }
}

module.exports = WoodlandProductHistory;
WoodlandProductHistory.enableReusableInstance = true;
