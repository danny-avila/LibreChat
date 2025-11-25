// WoodlandAISearchCatalogRefactored.js - Example refactored Catalog tool using shared utilities
const { z } = require('zod');
const {
  WoodlandSearchBase,
  parseToolConfig,
  normalizeAliasMap,
  extractCompatFromText,
  buildCompatibilityObject,
  createTelemetry,
  createTimer,
  executeTwoTierSearch,
  buildRakeContextFallback,
  relaxSearchParams,
  applyUrlPolicy,
} = require('./util');
const { applyCatalogPolicy, canonicalizeModel } = require('./util/woodlandCatalogPolicy');

const DEFAULT_RAKE_NAME_ALIASES = {
  classic: [
    'classic',
    'classic cyclone rake',
    'cyclone rake classic',
    'classic rake',
    '101',
    '101 classic',
    '101 standard',
    '101 standard complete',
    '101 standard complete platinum',
    'standard complete',
    'standard complete platinum',
  ],
  commander: [
    'commander',
    'cyclone rake commander',
    'commander rake',
    '103',
    '103 commander',
    'commander pro',
  ],
  'commander crs': ['commander crs', 'commander_crs', 'crs commander'],
  'commercial pro': [
    'commercial pro',
    'cyclone rake commercial pro',
    'commercial-pro',
    'commercial',
    '102 commercial',
    '104 commercial pro',
    'commercial d',
  ],
  'commercial pro crs': ['commercial pro crs', 'commercial_pro_crs'],
  xl: ['xl', 'cyclone rake xl', 'xl rake', '106 xl'],
  'xl crs': ['xl crs', 'xl_crs'],
  'z-10': [
    'z-10',
    'z10',
    'z 10',
    'cyclone rake z-10',
    'cyclone rake z 10',
    'zr-10',
    'zr10',
    'zr 10',
    '112',
  ],
  'z-10 crs': ['z-10 crs', 'z10 crs', 'z_10_crs'],
};

const DEFAULT_INTENT_KEYWORDS = {
  pricing: ['price', 'cost', 'how much', 'pricing', 'buy', 'purchase'],
  selector: ['choose', 'which', 'option', 'select', 'version'],
  replacement: ['replacement', 'replace', 'upgrade', 'supersede'],
  policy: ['warranty', 'return', 'guarantee', 'policy'],
  availability: ['in stock', 'available', 'availability', 'ship', 'delivery'],
};

/**
 * Refactored Catalog search tool using shared utilities
 */
class WoodlandAISearchCatalogRefactored extends WoodlandSearchBase {
  static DEFAULT_VECTOR_FIELDS = '';

  constructor(fields = {}) {
    super(fields);

    this.name = 'woodland-ai-search-catalog';
    this.description =
      "Use the 'woodland-ai-search-catalog' tool to answer questions from the Catalog Azure AI Search index";

    // Initialize telemetry
    this.telemetry = createTelemetry(this.name, { logLevel: 'info' });

    // Define schema using Zod
    this.schema = z.object({
      query: z.string().optional().describe('Question or search phrase for Catalog index'),
      top: z.number().int().positive().optional(),
      select: z.string().optional().describe('Comma-separated list of fields to return'),
      filter: z.string().optional().describe('OData filter'),
      embedding: z
        .array(z.number())
        .min(8)
        .optional()
        .describe('Optional dense embedding for hybrid/vector search'),
      vectorK: z.number().int().positive().optional().describe('k for vector search'),
      answers: z.enum(['extractive', 'none']).optional(),
      captions: z.enum(['extractive', 'none']).optional(),
      speller: z.enum(['lexicon', 'simple', 'none']).optional(),
      queryLanguage: z.string().optional(),
      searchFields: z.string().optional().describe('Comma-separated search fields override'),
      disableCache: z.boolean().optional().describe('Skips shared result caching when true'),
      model: z
        .string()
        .optional()
        .describe('Cyclone Rake model focus (Classic, Commander, Commercial Pro, XL, Z-10)'),
      hitch: z
        .string()
        .optional()
        .describe('Hitch type (dual-pin or CRS) when enforcing catalog fitment rules'),
      rakeName: z
        .string()
        .optional()
        .describe('Explicit rake name to filter results (e.g., Classic Cyclone Rake)'),
      rakeSku: z.string().optional().describe('Explicit rake SKU to filter results (e.g., 105)'),
      relaxed: z.boolean().optional().describe('Use relaxed search mode (broader recall)'),
    });

    // Azure Search configuration
    this.serviceEndpoint = this._env(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
    );
    this.apiKey = this._env(fields.AZURE_AI_SEARCH_API_KEY, process.env.AZURE_AI_SEARCH_API_KEY);

    this.indexName =
      this._env(fields.AZURE_AI_SEARCH_CATALOG_INDEX, process.env.AZURE_AI_SEARCH_CATALOG_INDEX) ||
      this._env(
        fields.AZURE_AI_SEARCH_CATALOG_INDEX_NAME,
        process.env.AZURE_AI_SEARCH_CATALOG_INDEX_NAME,
      ) ||
      this._env(fields.AZURE_AI_SEARCH_INDEX_NAME, process.env.AZURE_AI_SEARCH_INDEX_NAME);

    this.baseUrl =
      this._env(
        fields.AZURE_AI_SEARCH_CATALOG_BASE_URL,
        process.env.AZURE_AI_SEARCH_CATALOG_BASE_URL,
      ) || this._env(fields.AZURE_AI_SEARCH_BASE_URL, process.env.AZURE_AI_SEARCH_BASE_URL);

    this.apiVersion = this._env(
      fields.AZURE_AI_SEARCH_API_VERSION,
      process.env.AZURE_AI_SEARCH_API_VERSION || WoodlandSearchBase.DEFAULT_API_VERSION,
    );

    // Initialize search client
    this.client = this._initializeSearchClient();

    // Search configuration
    this.top = WoodlandSearchBase.DEFAULT_TOP;
    this.select = WoodlandSearchBase.DEFAULT_SELECT.split(',').map((s) => s.trim());

    this.searchFields = this._initializeSearchFields(fields);
    this.semanticConfiguration = this._parseSemanticConfiguration(
      this._env(
        fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
        process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
      ),
    );
    this.enableSemantic = !!this.semanticConfiguration;

    this.queryLanguage = this._env(
      fields.AZURE_AI_SEARCH_QUERY_LANGUAGE,
      process.env.AZURE_AI_SEARCH_QUERY_LANGUAGE || 'en-us',
    );
    this.scoringProfile = this._env(
      fields.AZURE_AI_SEARCH_SCORING_PROFILE,
      process.env.AZURE_AI_SEARCH_SCORING_PROFILE,
    );

    // Vector configuration
    this.vectorFields = this._initializeVectorFields(fields);
    this.vectorK = Number(
      this._env(
        fields.AZURE_AI_SEARCH_CATALOG_VECTOR_K,
        process.env.AZURE_AI_SEARCH_CATALOG_VECTOR_K,
      ) ||
        this._env(fields.AZURE_AI_SEARCH_VECTOR_K, process.env.AZURE_AI_SEARCH_VECTOR_K) ||
        WoodlandSearchBase.DEFAULT_VECTOR_K,
    );

    // Rake aliases and intent keywords
    this.rakeAliasMap = normalizeAliasMap(DEFAULT_RAKE_NAME_ALIASES);
    this.intentKeywords = DEFAULT_INTENT_KEYWORDS;

    // Cache initialization
    this.cache = this._initializeCache({
      ttl: Number(process.env.WOODLAND_SEARCH_CACHE_TTL_MS || 10000),
      maxEntries: Number(process.env.WOODLAND_SEARCH_CACHE_MAX_ENTRIES || 200),
    });

    // Extractive answer/caption defaults
    const extractiveEnabled = this._parseBoolEnv(
      process.env.WOODLAND_SEARCH_ENABLE_EXTRACTIVE,
      false,
    );
    this.defaultAnswerMode = extractiveEnabled ? 'extractive' : 'none';
    this.defaultCaptionMode = extractiveEnabled ? 'extractive' : 'none';

    this._logInitialization({
      searchFields: this.searchFields,
      vectorFields: this.vectorFields,
      defaultAnswerMode: this.defaultAnswerMode,
      defaultCaptionMode: this.defaultCaptionMode,
    });
  }

  _initializeSearchFields(fields) {
    const fieldValue =
      this._env(
        fields.AZURE_AI_SEARCH_CATALOG_SEARCH_FIELDS,
        process.env.AZURE_AI_SEARCH_CATALOG_SEARCH_FIELDS,
      ) ||
      this._env(fields.AZURE_AI_SEARCH_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_SEARCH_FIELDS);

    if (fieldValue) {
      return this._sanitizeFieldList(
        fieldValue.split(',').map((s) => s.trim()),
        'searchFields',
      );
    }

    return this._sanitizeFieldList(
      [
        'title',
        'content',
        'sku',
        'normalized_sku',
        'tags',
        'categories',
        'category_paths',
        'images_alt',
      ],
      'searchFields-default',
    );
  }

  _initializeVectorFields(fields) {
    const fieldValue =
      this._env(
        fields.AZURE_AI_SEARCH_CATALOG_VECTOR_FIELDS,
        process.env.AZURE_AI_SEARCH_CATALOG_VECTOR_FIELDS,
      ) ||
      this._env(
        fields.AZURE_AI_SEARCH_VECTOR_FIELDS,
        process.env.AZURE_AI_SEARCH_VECTOR_FIELDS,
      ) ||
      WoodlandAISearchCatalogRefactored.DEFAULT_VECTOR_FIELDS;

    return String(fieldValue || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Canonical rake name lookup
   */
  _canonicalizeRakeName(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return undefined;
    return this.rakeAliasMap.get(key) || key;
  }

  /**
   * Check if document matches rake context
   */
  _docMatchesRakeContext(doc, canonicalRakeName, rakeSku) {
    if (!canonicalRakeName && !rakeSku) return true;

    const fitment = doc?.normalized_catalog?.fitment || {};
    const namesCanonical = fitment.rake_names_canonical || [];
    const modelsCanonical = fitment.rake_models_canonical || [];
    const rakeSkus = fitment.rake_skus || [];
    const familyCanonical = fitment.family_canonical;

    // Check rake name match
    if (canonicalRakeName) {
      const nameMatches =
        namesCanonical.includes(canonicalRakeName) ||
        modelsCanonical.includes(canonicalRakeName) ||
        familyCanonical === canonicalRakeName;

      if (!nameMatches) return false;
    }

    // Check SKU match
    if (rakeSku) {
      const normalizedTarget = String(rakeSku).trim().toLowerCase();
      const skuMatches = rakeSkus.some(
        (sku) => String(sku).trim().toLowerCase() === normalizedTarget,
      );
      if (!skuMatches) return false;
    }

    return true;
  }

  /**
   * Normalize document with enhanced compatibility extraction
   */
  _normalizeDoc(doc) {
    const fitment = {
      models: this._listFromAny(doc?.models),
      rake_models: this._listFromAny(doc?.rake_models),
      rake_names: this._listFromAny(doc?.rake_name) || this._listFromAny(doc?.rake_names),
      rake_skus: this._listFromAny(doc?.rake_sku) || this._listFromAny(doc?.rake_skus),
      hitch_types: this._listFromAny(doc?.hitch_types),
      notes: this._str(doc?.fitment_notes),
    };

    // Extract compatibility from text if structured data is sparse
    const extractedCompat = extractCompatFromText(doc?.content, doc?.tags, {
      context: 'catalog-compat',
    });
    if (extractedCompat && (!fitment.models || fitment.models.length === 0)) {
      fitment.compatible_models = extractedCompat;
    }

    // Canonicalize rake names/models
    const canonicalNames = this._unique(
      (fitment.rake_names || []).map((n) => this._canonicalizeRakeName(n)).filter(Boolean),
    );
    const canonicalModels = this._unique(
      (fitment.rake_models || []).map((n) => this._canonicalizeRakeName(n)).filter(Boolean),
    );

    if (canonicalNames.length) fitment.rake_names_canonical = canonicalNames;
    if (canonicalModels.length) fitment.rake_models_canonical = canonicalModels;

    const familyRaw = this._str(doc?.family);
    if (familyRaw) {
      fitment.family = familyRaw;
      fitment.family_canonical = this._canonicalizeRakeName(familyRaw);
    }

    const normalized = {
      sku: this._str(doc?.sku) || this._str(doc?.product_sku),
      title: this._str(doc?.title) || this._str(doc?.product_name),
      url: this._provenance(doc, this.baseUrl)?.url,
      price: this._num(doc?.price),
      catalog_price: this._num(doc?.catalog_price),
      categories: this._list(doc?.categories),
      tags: this._list(doc?.tags),
      policy: {
        flags: this._listFromAny(doc?.policy_flags),
        severity: this._str(doc?.policy_severity),
        notes: this._str(doc?.policy_notes),
      },
      kit: {
        type: this._str(doc?.kit_type),
        components: this._listFromAny(doc?.kit_components),
        includes: this._listFromAny(doc?.includes),
      },
      fitment,
      selector: this._extractSelector(doc),
      citation: this._buildCitation(doc, {
        titleField: 'title',
        skuField: 'sku',
        defaultLabel: 'Product',
        baseUrl: this.baseUrl,
      }),
    };

    return { ...doc, normalized_catalog: normalized };
  }

  _extractSelector(doc) {
    const label = this._str(doc?.selector_label);
    const values = this._listFromAny(doc?.selector_values);
    if (!label && (!values || !values.length)) return undefined;

    return {
      label,
      values,
      deciding_attribute:
        this._str(doc?.deciding_attribute) || this._str(doc?.selector_deciding_attribute),
    };
  }

  /**
   * Execute search (overrides base class method)
   */
  async _executeSearch(params) {
    const timer = createTimer('catalog-search');

    try {
      const searchOptions = this._buildSearchOptions(params);
      const results = await this.client.search(params.query || '*', searchOptions);

      const docs = [];
      for await (const result of results.results) {
        docs.push(result.document);
      }

      timer.complete(this.name);
      return docs;
    } catch (error) {
      this.telemetry.queryError(error, params);
      throw error;
    }
  }

  _buildSearchOptions(params) {
    const options = {
      top: params.top || this.top,
      skip: params.skip || 0,
      includeTotalCount: true,
    };

    if (params.filter) {
      options.filter = params.filter;
    }

    if (params.searchFields) {
      const fields = params.searchFields.split(',').map((s) => s.trim());
      options.searchFields = this._sanitizeFieldList(fields, 'runtime-searchFields');
    } else if (this.searchFields.length) {
      options.searchFields = this.searchFields;
    }

    if (this.enableSemantic) {
      options.queryType = 'semantic';
      options.semanticConfiguration = this.semanticConfiguration;
      options.answers = params.answers || this.defaultAnswerMode;
      options.captions = params.captions || this.defaultCaptionMode;
    }

    if (params.embedding && this.vectorFields.length) {
      options.vectorQueries = this._buildVectorQueries(
        params.embedding,
        this.vectorFields,
        params.vectorK || this.vectorK,
      );
    }

    if (params.speller) {
      options.speller = params.speller;
    }

    return options;
  }

  /**
   * Main call method with adaptive search
   */
  async _call(params) {
    const timer = createTimer('catalog-query');
    this.telemetry.queryStart(params);

    try {
      // Classify intent
      const intent = this._classifyIntent(params.query || '', this.intentKeywords);
      if (Object.keys(intent).length > 0) {
        this.telemetry.emit('intent_classified', { intent });
      }

      // Canonicalize rake name
      const canonicalRakeName = params.rakeName
        ? this._canonicalizeRakeName(params.rakeName)
        : undefined;

      // Use adaptive search if not explicitly relaxed
      let results, strategy;
      if (params.relaxed) {
        results = await this._executeSearch(params);
        strategy = 'relaxed';
      } else if (canonicalRakeName || params.rakeSku) {
        // Strict search with rake context, fallback if empty
        const strictParams = { ...params };
        const relaxedParams = buildRakeContextFallback(params, canonicalRakeName);

        const outcome = await executeTwoTierSearch(
          (p) => this._executeSearch(p),
          strictParams,
          relaxedParams,
          { context: this.name },
        );

        results = outcome.results;
        strategy = outcome.strategy;
      } else {
        results = await this._executeSearch(params);
        strategy = 'default';
      }

      // Normalize documents
      let normalized = results.map((doc) => this._normalizeDoc(doc));

      // Filter documents without valid URLs
      normalized = this._filterDocsByValidUrl(normalized, {
        urlFields: ['url', 'link', 'href'],
        baseUrl: this.baseUrl,
        logFiltered: true,
      });

      // Apply URL policy (blocks documents with invalid/broken URLs)
      const urlPolicyResult = applyUrlPolicy(normalized, {
        requireValidUrl: true,
        baseUrl: this.baseUrl,
        logResults: true,
      });

      if (urlPolicyResult.blocked > 0) {
        this.telemetry.emit('url_policy_applied', {
          blocked: urlPolicyResult.blocked,
          warnings: urlPolicyResult.warnings.length,
        });
      }

      normalized = urlPolicyResult.docs;

      // Apply rake context filtering
      if (canonicalRakeName || params.rakeSku) {
        const beforeCount = normalized.length;
        normalized = normalized.filter((doc) =>
          this._docMatchesRakeContext(doc, canonicalRakeName, params.rakeSku),
        );
        if (normalized.length < beforeCount) {
          this.telemetry.resultsFiltered(beforeCount, normalized.length, 'rake-context');
        }
      }

      // Apply catalog policy
      const policyResult = applyCatalogPolicy(normalized, {
        rakeModel: canonicalizeModel(params.model),
        hitchType: params.hitch,
      });

      if (policyResult.blocked > 0 || policyResult.warned > 0) {
        this.telemetry.policyApplied('catalog-policy', policyResult.blocked, 'block');
      }

      const duration = timer.complete(this.name);
      this.telemetry.queryComplete(policyResult.docs, duration, strategy);

      return JSON.stringify({
        results: policyResult.docs,
        count: policyResult.docs.length,
        strategy,
        blocked: policyResult.blocked,
        warnings: policyResult.warnings,
      });
    } catch (error) {
      this.telemetry.queryError(error, params);
      throw error;
    }
  }
}

module.exports = WoodlandAISearchCatalogRefactored;
