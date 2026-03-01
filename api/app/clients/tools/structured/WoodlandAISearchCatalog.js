// woodland-ai-search-catalog.js (single-index)
const crypto = require('node:crypto');
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
let logger;
try {
  ({ logger } = require('~/config'));
} catch (_) {
  try {
    ({ logger } = require('@librechat/data-schemas'));
  } catch (_) {
    logger = console;
  }
}
const TTLCache = require('../util/ttlCache');
const { applyCatalogPolicy, canonicalizeModel } = require('./util/woodlandCatalogPolicy');
// Hitch relevance helpers (lazy usage inside matching logic)
const { isHitchRelevant, extractCategory } = require('./util/hitchRelevance');

const DEFAULT_CACHE_TTL_MS = Number(process.env.WOODLAND_SEARCH_CACHE_TTL_MS ?? 10_000);
const DEFAULT_CACHE_MAX = Number(process.env.WOODLAND_SEARCH_CACHE_MAX_ENTRIES ?? 200);
const DEFAULT_EXTRACTIVE =
  String(process.env.WOODLAND_SEARCH_ENABLE_EXTRACTIVE ?? 'false')
    .toLowerCase()
    .trim() === 'true';

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

const normalizeAliasMap = (aliases = {}) => {
  const map = new Map();
  Object.entries(aliases).forEach(([canonical, list]) => {
    const c = String(canonical || '')
      .trim()
      .toLowerCase();
    if (!c) return;
    map.set(c, c);
    (Array.isArray(list) ? list : []).forEach((alias) => {
      const key = String(alias || '')
        .trim()
        .toLowerCase();
      if (!key) return;
      map.set(key, c);
    });
  });
  return map;
};

class WoodlandAISearchCatalog extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 5;
  static DEFAULT_SELECT = '*';
  static DEFAULT_VECTOR_K = 15;
  static DEFAULT_VECTOR_FIELDS = ''; // e.g., "contentVector,titleVector"
  static VALID_FIELD_REGEX = /^[a-zA-Z_][\w.]*$/;

  _env(v, fallback) {
    return v ?? fallback;
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

  _provenance(d) {
    try {
      let url = (typeof d?.url === 'string' && d.url) || '';
      const sku = (typeof d?.sku === 'string' && d.sku) || (typeof d?.product_sku === 'string' && d.product_sku) || '';
      if (url && this.baseUrl && !/^https?:\/\//i.test(url)) {
        url = this.baseUrl.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
      }
      url = this._sanitizeUrl(url, sku);
      const host = url ? new URL(url).hostname : undefined;
      return { url: url || undefined, host, site: d?.site, page_type: d?.page_type };
    } catch (_) {
      return { site: d?.site, page_type: d?.page_type };
    }
  }

  _canonicalizeRakeName(value) {
    const key = String(value || '')
      .trim()
      .toLowerCase();
    if (!key) {
      return undefined;
    }
    return this.rakeAliasMap.get(key) || key;
  }

  _docMatchesRakeContext(doc, canonicalRakeName, rakeSku) {
    if (!canonicalRakeName && !rakeSku) {
      return true;
    }
    // Determine hitch relevance and annotate for downstream consumers.
    try {
      const category = extractCategory(doc);
      const categories = doc?.normalized_catalog?.categories || [];
      const hitchRelevant = isHitchRelevant(category, categories);
      if (doc && typeof doc === 'object') {
        doc.__hitchRelevant = hitchRelevant;
        if (doc.normalized_catalog && typeof doc.normalized_catalog === 'object') {
          doc.normalized_catalog.hitch_relevant = hitchRelevant;
        }
      }
    } catch (_) {
      // Non-fatal; continue.
    }
    const fitment = doc?.normalized_catalog?.fitment || {};
    const namesCanonical = Array.isArray(fitment.rake_names_canonical)
      ? fitment.rake_names_canonical
      : [];
    const modelsCanonical = Array.isArray(fitment.rake_models_canonical)
      ? fitment.rake_models_canonical
      : [];
    const rakeNamesRaw = Array.isArray(fitment.rake_names) ? fitment.rake_names : [];
    const rakeModelsRaw = Array.isArray(fitment.rake_models) ? fitment.rake_models : [];
    const rakeSkus = Array.isArray(fitment.rake_skus) ? fitment.rake_skus : [];
    const familyCanonical = fitment.family_canonical || this._canonicalizeRakeName(fitment.family);
    const compatibleCanonical = Array.isArray(fitment.compatible_models_canonical)
      ? fitment.compatible_models_canonical
      : [];
    const compatibleRaw = Array.isArray(fitment.compatible_models) ? fitment.compatible_models : [];

    if (canonicalRakeName) {
      const canonicalMatches =
        namesCanonical.includes(canonicalRakeName) ||
        modelsCanonical.includes(canonicalRakeName) ||
        (familyCanonical ? familyCanonical === canonicalRakeName : false) ||
        compatibleCanonical.includes(canonicalRakeName);
      const rawMatches =
        rakeNamesRaw.some((name) => this._canonicalizeRakeName(name) === canonicalRakeName) ||
        rakeModelsRaw.some((name) => this._canonicalizeRakeName(name) === canonicalRakeName) ||
        compatibleRaw.some((name) => this._canonicalizeRakeName(name) === canonicalRakeName);
      if (!canonicalMatches && !rawMatches) {
        return false;
      }
    }
    if (rakeSku) {
      const normalizedTarget = String(rakeSku).trim().toLowerCase();
      if (!normalizedTarget) {
        return true;
      }
      const skuMatches = rakeSkus.some(
        (sku) => String(sku).trim().toLowerCase() === normalizedTarget,
      );
      if (!skuMatches) {
        return false;
      }
    }
    return true;
  }

  _normalizeDoc(d) {
    const str = (v) => (v == null ? undefined : String(v));
    const num = (v) => (v == null || v === '' ? undefined : Number(v));
    const bool = (v) => {
      if (v == null || v === '') {
        return undefined;
      }
      if (typeof v === 'boolean') {
        return v;
      }
      if (typeof v === 'number') {
        return v !== 0;
      }
      if (typeof v === 'string') {
        const normalized = v.trim().toLowerCase();
        if (!normalized) return undefined;
        if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
        if (['false', 'no', 'n', '0'].includes(normalized)) return false;
        return undefined;
      }
      return undefined;
    };
    const list = (v) =>
      Array.isArray(v)
        ? v
            .filter((x) => x != null && x !== '')
            .map((x) => String(x).trim())
            .filter(Boolean)
        : undefined;
    const listFromAny = (value) => {
      if (Array.isArray(value)) {
        return value
          .map((entry) => (entry == null ? '' : String(entry).trim()))
          .map((entry) => (entry && entry.includes('|||') ? entry.split('|||') : entry))
          .flat()
          .map((entry) => (entry && entry.includes('|') ? entry.split('|') : entry))
          .flat()
          .map((entry) => (entry && entry.includes(';') ? entry.split(';') : entry))
          .flat()
          .map((entry) => (entry && entry.includes(',') ? entry.split(',') : entry))
          .flat()
          .map((entry) => String(entry).trim())
          .filter(Boolean);
      }
      if (typeof value === 'string') {
        return value
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return undefined;
    };

    const provenance = this._provenance(d);
    const title = str(d?.title) || str(d?.product_name);
    const sku = str(d?.sku) || str(d?.product_sku);
    const thePrice = num(d?.price);

    const citationLabel = sku ? `${title || 'Product'} — ${sku}` : title || 'Product';
    const citationUrl = provenance?.url;
    const citationMarkdown = citationUrl ? `[${citationLabel}](${citationUrl})` : citationLabel;

    const normalized = {
      sku,
      title,
      url: provenance?.url,
      price: thePrice,
      old_price: num(d?.old_price),
      catalog_price: num(d?.catalog_price),
      categories: list(d?.categories),
      category_paths: list(d?.category_paths),
      tags: list(d?.tags),
      media: {
        images_alt: list(d?.images_alt),
        video_url: str(d?.video_url),
        installation_pdf_url: str(d?.installation_pdf_url),
        troubleshooting_pdf_url: str(d?.troubleshooting_pdf_url),
        safety_pdf_url: str(d?.safety_pdf_url),
        exploded_view_url: str(d?.exploded_view_url),
      },
      metadata: {
        last_updated: str(d?.last_updated),
        created_on: str(d?.created_on),
        published: bool(d?.published),
      },
      policy: {
        flags: listFromAny(d?.policy_flags),
        severity: str(d?.policy_severity),
        notes: str(d?.policy_notes),
      },
      kit: {
        type: str(d?.kit_type),
        components: listFromAny(d?.kit_components) || listFromAny(d?.included_components),
        includes: listFromAny(d?.includes),
      },
      fitment: {
        models: listFromAny(d?.models),
        rake_models: listFromAny(d?.rake_models),
        rake_names: listFromAny(d?.rake_name) || listFromAny(d?.rake_names),
        rake_skus: listFromAny(d?.rake_sku) || listFromAny(d?.rake_skus),
        hitch_types: listFromAny(d?.hitch_types),
        notes: str(d?.fitment_notes),
      },
      selector: (() => {
        const label = str(d?.selector_label);
        const values = listFromAny(d?.selector_values);
        if (!label && (!values || !values.length)) {
          return undefined;
        }
        return {
          label,
          values,
          deciding_attribute: str(d?.deciding_attribute) || str(d?.selector_deciding_attribute),
        };
      })(),
      replacements: {
        upgrade_paths: listFromAny(d?.upgrade_paths),
        replacement_skus: listFromAny(d?.replacement_skus),
        supersedes: listFromAny(d?.supersedes),
        superseded_by: listFromAny(d?.superseded_by),
      },
      provenance,
      citation: {
        label: citationLabel,
        url: citationUrl,
        markdown: citationMarkdown,
      },
    };

    const uniq = (arr = []) =>
      Array.isArray(arr) ? arr.filter((item, index, self) => self.indexOf(item) === index) : arr;
    const canonicalNames = uniq(
      (normalized.fitment?.rake_names || [])
        .map((name) => this._canonicalizeRakeName(name))
        .filter(Boolean),
    );
    const canonicalModels = uniq(
      (normalized.fitment?.rake_models || [])
        .map((name) => this._canonicalizeRakeName(name))
        .filter(Boolean),
    );
    const familyRaw = str(d?.family);
    const familyCanonical = this._canonicalizeRakeName(familyRaw);
    const compatibleModels = listFromAny(d?.compatible_models);
    const compatibleModelsCanonical = compatibleModels
      ? uniq(compatibleModels.map((name) => this._canonicalizeRakeName(name)).filter(Boolean))
      : undefined;

    const fitment = { ...(normalized.fitment || {}) };
    if (canonicalNames.length) fitment.rake_names_canonical = canonicalNames;
    if (canonicalModels.length) fitment.rake_models_canonical = canonicalModels;
    if (familyRaw) fitment.family = familyRaw;
    if (familyCanonical) fitment.family_canonical = familyCanonical;
    if (compatibleModels) fitment.compatible_models = compatibleModels;
    if (compatibleModelsCanonical && compatibleModelsCanonical.length) {
      fitment.compatible_models_canonical = compatibleModelsCanonical;
    }
    normalized.fitment = fitment;

    const sanitizedTopLevelUrl = this._sanitizeUrl(str(d?.url), sku);
    const sanitizedCanonicalUrl = this._sanitizeUrl(str(d?.canonical_url), sku);

    return {
      ...d,
      ...(sanitizedTopLevelUrl ? { url: sanitizedTopLevelUrl } : { url: undefined }),
      ...(sanitizedCanonicalUrl
        ? { canonical_url: sanitizedCanonicalUrl }
        : { canonical_url: undefined }),
      normalized_catalog: normalized,
    };
  }

  constructor(fields = {}) {
    super();
    logger.info('[woodland-ai-search-catalog:init] Constructor invoked');
    this.name = 'woodland-ai-search-catalog';
    this.description =
      "Use the 'woodland-ai-search-catalog' tool to answer questions from the Catalog Azure AI Search index";

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
    });

    // Shared endpoint + key
    this.serviceEndpoint = this._env(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
    );
    this.apiKey = this._env(fields.AZURE_AI_SEARCH_API_KEY, process.env.AZURE_AI_SEARCH_API_KEY);

    // Catalog index name (support multiple env names)
    this.indexName =
      this._env(fields.AZURE_AI_SEARCH_CATALOG_INDEX, process.env.AZURE_AI_SEARCH_CATALOG_INDEX) ||
      this._env(
        fields.AZURE_AI_SEARCH_CATALOG_INDEX_NAME,
        process.env.AZURE_AI_SEARCH_CATALOG_INDEX_NAME,
      ) ||
      this._env(fields.AZURE_AI_SEARCH_INDEX_NAME, process.env.AZURE_AI_SEARCH_INDEX_NAME);

    // Base URL for resolving relative URLs
    this.baseUrl =
      this._env(
        fields.AZURE_AI_SEARCH_CATALOG_BASE_URL,
        process.env.AZURE_AI_SEARCH_CATALOG_BASE_URL,
      ) || this._env(fields.AZURE_AI_SEARCH_BASE_URL, process.env.AZURE_AI_SEARCH_BASE_URL);

    if (!this.serviceEndpoint || !this.apiKey || !this.indexName) {
      logger.error('[woodland-ai-search-catalog:init] Missing required envs', {
        serviceEndpoint: !!this.serviceEndpoint,
        apiKey: !!this.apiKey,
        indexName: !!this.indexName,
      });
      throw new Error(
        'Missing Azure AI Search envs: AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_API_KEY, and Catalog index (AZURE_AI_SEARCH_CATALOG_INDEX or AZURE_AI_SEARCH_INDEX_NAME).',
      );
    }

    // Optional API version
    this.apiVersion = this._env(
      fields.AZURE_AI_SEARCH_API_VERSION,
      process.env.AZURE_AI_SEARCH_API_VERSION || WoodlandAISearchCatalog.DEFAULT_API_VERSION,
    );

    // Defaults
    this.top = WoodlandAISearchCatalog.DEFAULT_TOP;
    this.select = WoodlandAISearchCatalog.DEFAULT_SELECT.split(',').map((s) => s.trim());

    // Semantic/search options
    this.searchFields = (() => {
      const v =
        this._env(
          fields.AZURE_AI_SEARCH_CATALOG_SEARCH_FIELDS,
          process.env.AZURE_AI_SEARCH_CATALOG_SEARCH_FIELDS,
        ) ||
        this._env(fields.AZURE_AI_SEARCH_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_SEARCH_FIELDS);
      if (v)
        return String(v)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      return [
        'title',
        'content',
        'sku',
        'normalized_sku',
        'tags',
        'categories',
        'category_paths',
        'images_alt',
      ];
    })();
    this.searchFields = this._sanitizeFieldList(this.searchFields, 'searchFields-default');
    const rawSemanticConfiguration = this._env(
      fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
      process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
    );
    const normalizedSemanticConfiguration = (() => {
      if (rawSemanticConfiguration == null) return undefined;
      const str = String(rawSemanticConfiguration).trim();
      if (!str || str.toLowerCase() === 'none') return undefined;
      return str;
    })();
    this.semanticConfiguration = normalizedSemanticConfiguration;
    this.enableSemantic = !!this.semanticConfiguration;
    this.queryLanguage = this._env(
      fields.AZURE_AI_SEARCH_QUERY_LANGUAGE,
      process.env.AZURE_AI_SEARCH_QUERY_LANGUAGE || 'en-us',
    );
    this.scoringProfile = this._env(
      fields.AZURE_AI_SEARCH_SCORING_PROFILE,
      process.env.AZURE_AI_SEARCH_SCORING_PROFILE,
    );
    this.returnAllFields =
      String(
        this._env(
          fields.AZURE_AI_SEARCH_RETURN_ALL_FIELDS,
          process.env.AZURE_AI_SEARCH_RETURN_ALL_FIELDS || 'true',
        ),
      )
        .toLowerCase()
        .trim() === 'true';

    // Vector options
    this.vectorFields = (() => {
      const v =
        this._env(
          fields.AZURE_AI_SEARCH_CATALOG_VECTOR_FIELDS,
          process.env.AZURE_AI_SEARCH_CATALOG_VECTOR_FIELDS,
        ) ||
        this._env(
          fields.AZURE_AI_SEARCH_VECTOR_FIELDS,
          process.env.AZURE_AI_SEARCH_VECTOR_FIELDS,
        ) ||
        WoodlandAISearchCatalog.DEFAULT_VECTOR_FIELDS;
      return String(v || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    })();
    this.vectorK = Number(
      this._env(
        fields.AZURE_AI_SEARCH_CATALOG_VECTOR_K,
        process.env.AZURE_AI_SEARCH_CATALOG_VECTOR_K,
      ) ||
        this._env(fields.AZURE_AI_SEARCH_VECTOR_K, process.env.AZURE_AI_SEARCH_VECTOR_K) ||
        WoodlandAISearchCatalog.DEFAULT_VECTOR_K,
    );
    this.rakeAliasMap = normalizeAliasMap(DEFAULT_RAKE_NAME_ALIASES);

    const ttlSetting = Number(
      this._env(fields.WOODLAND_SEARCH_CACHE_TTL_MS, process.env.WOODLAND_SEARCH_CACHE_TTL_MS) ||
        DEFAULT_CACHE_TTL_MS,
    );
    const maxSetting = Number(
      this._env(
        fields.WOODLAND_SEARCH_CACHE_MAX_ENTRIES,
        process.env.WOODLAND_SEARCH_CACHE_MAX_ENTRIES,
      ) || DEFAULT_CACHE_MAX,
    );

    const ttlMs = Number.isFinite(ttlSetting) && ttlSetting > 0 ? ttlSetting : 0;
    const maxEntries = Number.isFinite(maxSetting) && maxSetting > 0 ? maxSetting : 0;
    this.cache = ttlMs > 0 && maxEntries > 0 ? new TTLCache({ ttlMs, maxEntries }) : null;

    const extractiveEnabled =
      String(
        this._env(
          fields.WOODLAND_SEARCH_ENABLE_EXTRACTIVE,
          process.env.WOODLAND_SEARCH_ENABLE_EXTRACTIVE,
        ) ?? DEFAULT_EXTRACTIVE,
      )
        .toLowerCase()
        .trim() === 'true';

    this.defaultAnswerMode = extractiveEnabled ? 'extractive' : 'none';
    this.defaultCaptionMode = extractiveEnabled ? 'extractive' : 'none';

    // Client
    const credential = new AzureKeyCredential(this.apiKey);
    this.client = new SearchClient(this.serviceEndpoint, this.indexName, credential, {
      apiVersion: this.apiVersion,
    });

    logger.info('[woodland-ai-search-catalog] Initialized', {
      endpoint: this.serviceEndpoint,
      apiVersion: this.apiVersion,
      index: this.indexName,
      select: this.select,
      searchFields: this.searchFields,
      semanticConfiguration: this.semanticConfiguration || null,
      enableSemantic: this.enableSemantic,
      queryLanguage: this.queryLanguage,
      scoringProfile: this.scoringProfile,
      vectorFields: this.vectorFields,
      vectorK: this.vectorK,
      baseUrl: this.baseUrl,
      cacheEnabled: Boolean(this.cache),
      cacheTtlMs: this.cache?.ttlMs,
      cacheMaxEntries: this.cache?.maxEntries,
      defaultAnswerMode: this.defaultAnswerMode,
      defaultCaptionMode: this.defaultCaptionMode,
    });
  }

  _sanitizeFieldList(fields, context = 'select') {
    if (!Array.isArray(fields)) {
      return undefined;
    }
    const cleaned = [];
    fields.forEach((field) => {
      if (WoodlandAISearchCatalog.VALID_FIELD_REGEX.test(field)) {
        cleaned.push(field);
      } else {
        logger.info('[woodland-ai-search-catalog] Dropping invalid field token', {
          context,
          field,
        });
      }
    });
    return cleaned.length > 0 ? cleaned : undefined;
  }

  _sanitizeFilterExpression(filter) {
    if (!filter || typeof filter !== 'string') {
      return undefined;
    }
    const trimmed = filter.trim();
    if (!trimmed) {
      return undefined;
    }
    if (/\bhitch\b/i.test(trimmed)) {
      logger.info('[woodland-ai-search-catalog] Dropping hitch filter (not indexed field)', {
        filter: trimmed,
      });
      return undefined;
    }
    return trimmed;
  }

  _sanitizeSearchOptions(opts) {
    const clean = { ...opts };
    const asStr = (v) => (typeof v === 'string' ? v.toLowerCase() : undefined);
    const answers = asStr(clean.answers);
    if (answers !== 'extractive' && answers !== 'none') delete clean.answers;
    const captions = asStr(clean.captions);
    if (captions !== 'extractive' && captions !== 'none') delete clean.captions;
    const speller = asStr(clean.speller);
    if (speller !== 'lexicon' && speller !== 'simple' && speller !== 'none') delete clean.speller;
    if (!Array.isArray(clean.vectorQueries) || clean.vectorQueries.length === 0) {
      delete clean.vectorQueries;
    }
    return clean;
  }

  async _safeSearch(query, options) {
    const run = async (opts) => {
      const send = this._sanitizeSearchOptions(opts);
      logger.debug('[woodland-ai-search-catalog] Sending request', {
        query,
        hasVector: Array.isArray(send.vectorQueries) && send.vectorQueries.length > 0,
        options: JSON.stringify({ ...send, vectorQueries: undefined }, null, 2),
      });
      const rs = await this.client.search(query, send);
      const items = [];
      for await (const r of rs.results) items.push(r.document);
      logger.debug('[woodland-ai-search-catalog] Received response', {
        count: items.length,
        sample: items.slice(0, 2),
      });
      return items;
    };

    let attempt = 0;
    let opts = { ...options };
    let lastErr;
    let droppedSearchFields = false;
    while (attempt < 3) {
      try {
        const docs = await run(opts);
        return { docs, retried: attempt > 0 };
      } catch (err) {
        lastErr = err;
        attempt += 1;
        const msg = (err && (err.message || String(err))) || '';
        logger.warn('[woodland-ai-search-catalog] Search failed', { attempt, msg });

        const sanitized = { ...opts };
        let changed = false;

        if (
          /semantic configuration/i.test(msg) ||
          /semanticConfiguration(?:'|\\\")? must not be empty/i.test(msg)
        ) {
          if (sanitized.semanticSearchOptions) delete sanitized.semanticSearchOptions;
          sanitized.queryType = 'simple';
          delete sanitized.answers;
          delete sanitized.captions;
          changed = true;
          logger.info(
            '[woodland-ai-search-catalog] Semantic config missing or empty on index — falling back to simple query',
          );
        }

        if (/orderby/i.test(msg) && String(sanitized.queryType).toLowerCase() === 'semantic') {
          if (sanitized.orderBy) {
            delete sanitized.orderBy;
            changed = true;
            logger.info(
              '[woodland-ai-search-catalog] Removing orderBy for semantic query and retrying',
            );
          }
        }

        const unknownFieldRegex = /Unknown field '([^']+)'/gi;
        const toRemove = [];
        let m;
        while ((m = unknownFieldRegex.exec(msg)) !== null) {
          const fld = (m[1] || '').trim();
          if (fld) toRemove.push(fld);
        }

        if (toRemove.length > 0) {
          if (Array.isArray(sanitized.select)) {
            const before = sanitized.select.length;
            sanitized.select = sanitized.select.filter((f) => !toRemove.includes(f));
            if (sanitized.select.length === 0) delete sanitized.select;
            if (sanitized.select?.length !== before) changed = true;
          }
          if (Array.isArray(sanitized.searchFields)) {
            const before = sanitized.searchFields.length;
            sanitized.searchFields = sanitized.searchFields.filter((f) => !toRemove.includes(f));
            if (sanitized.searchFields.length === 0) delete sanitized.searchFields;
            if (sanitized.searchFields?.length !== before) changed = true;
          }
          if (!/search field list|select/i.test(msg)) {
            if (sanitized.filter) {
              delete sanitized.filter;
              changed = true;
              logger.info(
                '[woodland-ai-search-catalog] Dropping filter due to unknown fields and retrying',
              );
            }
            if (sanitized.orderBy) {
              delete sanitized.orderBy;
              changed = true;
            }
          }
        }
        if (!changed && !droppedSearchFields && sanitized.searchFields) {
          delete sanitized.searchFields;
          droppedSearchFields = true;
          changed = true;
          logger.info('[woodland-ai-search-catalog] Dropping searchFields entirely and retrying');
        }

        if (!changed) break;
        opts = sanitized;
      }
    }
    throw lastErr;
  }

  async _call(data) {
    const { query, top: topIn } = data;
    const finalTop =
      typeof topIn === 'number' && Number.isFinite(topIn)
        ? Math.max(1, Math.floor(topIn))
        : this.top;

    // Per-call overrides
    const perCallSelectRaw =
      typeof data?.select === 'string'
        ? data.select
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    const perCallSelect = this._sanitizeFieldList(perCallSelectRaw, 'select');
    const perCallSearchFieldsRaw =
      typeof data?.searchFields === 'string'
        ? data.searchFields
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    const perCallSearchFields = this._sanitizeFieldList(perCallSearchFieldsRaw, 'searchFields');
    const perCallAnswers = data?.answers;
    const perCallCaptions = data?.captions;
    const perCallSpeller = data?.speller;
    const perCallQueryLanguage = data?.queryLanguage;
    const filter = this._sanitizeFilterExpression(data?.filter);
    const embedding = Array.isArray(data?.embedding) ? data.embedding : undefined;
    const vectorK = Number.isFinite(data?.vectorK) ? Number(data.vectorK) : this.vectorK;
    const disableCache = data?.disableCache === true;
    const modelContext = typeof data?.model === 'string' ? data.model : undefined;
    const hitchContext = typeof data?.hitch === 'string' ? data.hitch : undefined;
    const rakeNameContext = typeof data?.rakeName === 'string' ? data.rakeName : undefined;
    const rakeSkuContext = typeof data?.rakeSku === 'string' ? data.rakeSku : undefined;

    const canonicalModelContext =
      canonicalizeModel(modelContext) || this._canonicalizeRakeName(modelContext);
    const canonicalRakeNameTarget = (() => {
      const explicit = this._canonicalizeRakeName(rakeNameContext);
      if (explicit) {
        return explicit;
      }
      if (canonicalModelContext) {
        return this._canonicalizeRakeName(canonicalModelContext) || canonicalModelContext;
      }
      return undefined;
    })();
    const normalizedRakeSkuTarget = rakeSkuContext
      ? String(rakeSkuContext).trim().toLowerCase()
      : undefined;

    try {
      const inferredMode = (() => {
        const q = (query || '').toString();
        if (/".+"/.test(q) || /\b(AND|OR|NOT)\b/i.test(q)) return 'all';
        return 'any';
      })();

      const options = {
        searchMode: inferredMode,
        top: finalTop,
        filter,
      };

      const semanticConfigName =
        typeof this.semanticConfiguration === 'string' ? this.semanticConfiguration.trim() : '';
      const allowSemantic = !!semanticConfigName;

      if (allowSemantic) {
        options.queryType = 'semantic';
        options.semanticSearchOptions = {
          configurationName: semanticConfigName,
          queryLanguage: perCallQueryLanguage || this.queryLanguage,
        };
        options.speller = perCallSpeller || 'lexicon';
      } else {
        options.queryType = 'simple';
        options.speller = perCallSpeller || 'lexicon';
      }

      const answersMode =
        perCallAnswers === 'extractive' || perCallAnswers === 'none'
          ? perCallAnswers
          : this.defaultAnswerMode;
      const captionsMode =
        perCallCaptions === 'extractive' || perCallCaptions === 'none'
          ? perCallCaptions
          : this.defaultCaptionMode;

      if (allowSemantic && answersMode === 'extractive') {
        options.answers = 'extractive';
      }

      if (allowSemantic && captionsMode === 'extractive') {
        options.captions = 'extractive';
      }

      if (!this.returnAllFields) {
        options.select = perCallSelect || this.select;
      } else if (perCallSelect) {
        options.select = perCallSelect;
      }

      if (this.scoringProfile) options.scoringProfile = this.scoringProfile;
      if (perCallSearchFields) options.searchFields = perCallSearchFields;

      // Vector queries if embedding and vector fields are present
      if (embedding && this.vectorFields.length > 0) {
        options.vectorQueries = this.vectorFields.map((vf) => ({
          kind: 'vector',
          vector: embedding,
          kNearestNeighborsCount: vectorK,
          fields: vf,
        }));
      }

      if (options.orderBy) delete options.orderBy;

      const finalQueryString = (() => {
        const raw = (query ?? '').toString().trim();
        if (raw.length) return raw;
        const seeds = [
          rakeNameContext,
          canonicalRakeNameTarget,
          modelContext,
          canonicalModelContext,
          rakeSkuContext,
        ]
          .map((s) => (typeof s === 'string' ? s.trim() : ''))
          .filter(Boolean);
        return seeds.length ? seeds.join(' ') : '*';
      })();

      let cacheKey;
      if (this.cache && !disableCache && !embedding) {
        const descriptor = {
          query: finalQueryString,
          top: finalTop,
          filter,
          select: (perCallSelect || (!this.returnAllFields ? this.select : undefined))
            ?.slice()
            .sort(),
          searchFields: (perCallSearchFields || this.searchFields)?.slice().sort(),
          answers: answersMode,
          captions: captionsMode,
          speller: perCallSpeller || 'lexicon',
          queryLanguage: perCallQueryLanguage || this.queryLanguage,
          rakeName: canonicalRakeNameTarget,
          rakeSku: normalizedRakeSkuTarget,
        };
        cacheKey = crypto.createHash('sha1').update(JSON.stringify(descriptor)).digest('hex');
        const cached = this.cache.get(cacheKey);
        if (cached) {
          logger.debug('[woodland-ai-search-catalog] Returning cached response', {
            query: finalQueryString,
            top: finalTop,
          });
          return cached;
        }
      }

      const docs = await this._safeSearch(finalQueryString, options);
      let payload = docs.docs || [];
      if (Array.isArray(payload)) {
        payload = payload.map((d) => (d ? this._normalizeDoc(d) : d));
        const { docs: guarded, dropped } = await applyCatalogPolicy(payload, {
          model: modelContext,
          hitch: hitchContext,
          query,
          rakeName: canonicalRakeNameTarget,
        });
        if (Array.isArray(dropped) && dropped.length > 0) {
          logger.info('[woodland-ai-search-catalog] Policy guards dropped catalog rows', {
            query,
            dropped: dropped
              .map((item) => item?.normalized_catalog?.sku || item?.sku)
              .filter(Boolean),
            modelContext,
          });
        }
        payload = guarded;
        if (payload && payload.length && (canonicalRakeNameTarget || normalizedRakeSkuTarget)) {
          const filteredByRake = payload.filter((doc) =>
            this._docMatchesRakeContext(doc, canonicalRakeNameTarget, normalizedRakeSkuTarget),
          );
          if (filteredByRake.length > 0) {
            if (filteredByRake.length !== payload.length) {
              logger.info('[woodland-ai-search-catalog] Filtered catalog rows by rake context', {
                query,
                original: payload.length,
                kept: filteredByRake.length,
                canonicalRakeNameTarget,
                normalizedRakeSkuTarget,
              });
            }
            payload = filteredByRake;
          } else {
            logger.info(
              '[woodland-ai-search-catalog] Rake context filter found no matches; returning unfiltered payload',
              {
                query,
                canonicalRakeNameTarget,
                normalizedRakeSkuTarget,
              },
            );
          }
        }
      }
      logger.info('[woodland-ai-search-catalog] Query done', {
        count: Array.isArray(payload) ? payload.length : 0,
        vectorUsed: Array.isArray(options.vectorQueries) && options.vectorQueries.length > 0,
        top: finalTop,
        canonicalRakeNameTarget,
        normalizedRakeSkuTarget,
      });
      const serialized = JSON.stringify(payload);
      if (cacheKey && this.cache) {
        this.cache.set(cacheKey, serialized);
      }
      return serialized;
    } catch (error) {
      logger.error('[woodland-ai-search-catalog] Azure AI Search request failed', {
        error: error?.message || String(error),
      });
      const msg = (error && (error.message || String(error))) || 'Unknown error';
      return `AZURE_SEARCH_FAILED: ${msg}`;
    }
  }
}

module.exports = WoodlandAISearchCatalog;
WoodlandAISearchCatalog.enableReusableInstance = true;
