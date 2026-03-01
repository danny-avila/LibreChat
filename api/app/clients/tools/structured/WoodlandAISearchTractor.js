// woodland-ai-search-tractor.js (single-index)
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');
const tractorConfig = require('./util/woodlandTractorConfig.json');

const DEFAULT_EXTRACTIVE =
  String(process.env.WOODLAND_SEARCH_ENABLE_EXTRACTIVE ?? 'false')
    .toLowerCase()
    .trim() === 'true';

const DEFAULT_FAMILY_ALIASES = {
  commander: 'Commander',
  'commander pro': 'Commander',
  xl: 'XL',
  'z-10': 'Z_10',
  z10: 'Z_10',
  'z 10': 'Z_10',
  'commercial pro': 'Commercial_Pro',
  commercial_pro: 'Commercial_Pro',
};

const DEFAULT_FAMILY_SIGNALS = [
  { family: 'Commercial PRO', match: ['commercial pro'] },
  { family: 'Commander Pro', match: ['commander pro', 'commander'] },
  { family: 'Standard Complete Platinum', match: ['standard complete platinum', 'platinum'] },
  { family: 'Classic', match: ['classic'] },
];

const DEFAULT_RAKE_NAME_ALIASES = {
  classic: 'Classic',
  'classic rake': 'Classic',
  'cyclone rake classic': 'Classic',
  // Abbreviations
  cmd: 'Commander',
  cmdr: 'Commander',
  commander: 'Commander',
  'commander rake': 'Commander',
  'cyclone rake commander': 'Commander',
  'comm pro': 'Commercial_Pro',
  compro: 'Commercial_Pro',
  commander_crs: 'Commander_CRS',
  commercial_pro_crs: 'Commercial_Pro_CRS',
  commercialpro_crs: 'Commercial_Pro_CRS',
  'commercial pro crs': 'Commercial_Pro_CRS',
  'commander pro': 'Commander Pro',
  'crs commander': 'Commander_CRS',
  classic_crs: 'Classic_CRS',
  'classic crs': 'Classic_CRS',
  xl: 'XL',
  'xl rake': 'XL',
  'cyclone rake xl': 'XL',
  xl_crs: 'XL_CRS',
  'xl crs': 'XL_CRS',
  'cyclone rake xl crs': 'XL_CRS',
  z10: 'Z_10',
  'z-10': 'Z_10',
  'z 10': 'Z_10',
  'cyclone rake z-10': 'Z_10',
  'cyclone rake z_10': 'Z_10',
  'cyclone rake z 10': 'Z_10',
  z10_crs: 'Z_10_CRS',
  'z-10_crs': 'Z_10_CRS',
  'z 10 crs': 'Z_10_CRS',
  'crs z_10': 'Z_10_CRS',
  'crs z-10': 'Z_10_CRS',
  'cyclone rake z-10 crs': 'Z_10_CRS',
};

// Multi-word tractor brand aliases; ensures proper separation of make vs model.
// Key: lowercase pattern in user query; Value: canonical brand string.
const MULTI_WORD_BRAND_ALIASES = {
  'john deere': 'John Deere',
  'cub cadet': 'Cub Cadet',
  'troy bilt': 'Troy-Bilt',
  'troy-bilt': 'Troy-Bilt',
  'agco allis': 'Agco Allis',
  'briggs & stratton': 'Briggs & Stratton',
  'briggs and stratton': 'Briggs & Stratton',
};

const DEFAULT_PART_TYPES = {
  'collector bag': 'collector bag',
  impeller: 'impeller',
  hose: 'hose',
  'recoil starter': 'recoil starter',
  starter: 'recoil starter',
  'boot plate': 'boot plate',
  'side tube': 'side tube',
  'rubber collar': 'rubber collar',
  'rubber collar kit': 'rubber collar',
  mda: 'mda',
  'mower deck adapter': 'mda',
  hitch: 'hitch',
  'hitch kit': 'hitch',
};

const PART_TYPE_FIELD_MAP = {
  hose: ['hose_sku', 'amhose_sku', 'upgradehose_sku', 'amupgradehose_sku'],
  impeller: ['impeller_sku', 'impeller_retrofit_sku'],
  'rubber collar': ['rubbercollar_sku'],
  'collector bag': ['collector_bag_sku'],
  'boot plate': ['boot_plate_sku'],
  'side tube': ['side_tube_sku'],
  mda: ['mda_sku', 'ammda_sku'],
  hitch: ['hitch_sku', 'amhitch_sku'],
};

const DEFAULT_INTENT_KEYWORDS = {
  parts: [
    'part',
    'replacement',
    'buy',
    'order',
    'sku',
    'view/buy',
    'add to cart',
    'price',
    'bag',
    'hose',
    'clamp',
  ],
  compatibility: [
    'engine',
    'fit',
    'fits',
    'fitment',
    'compatible',
    'compatibility',
    'which engine',
    'used in',
  ],
  sop: [
    'how to',
    'install',
    'installation',
    'guide',
    'manual',
    'troubleshoot',
    'troubleshooting',
    'winterization',
    'sop',
  ],
  marketing: ['compare', 'benefits', 'why choose', 'financing', 'promotion', 'warranty'],
  promo: ['promotion', 'sale', 'discount', 'coupon', 'financing'],
};

const tractorConfigSchema = z
  .object({
    familyAliases: z.record(z.string(), z.string()).optional(),
    familySignals: z
      .array(
        z.object({
          family: z.string(),
          match: z.array(z.string()).nonempty(),
        }),
      )
      .optional(),
    partTypes: z.record(z.string(), z.string()).optional(),
    intentKeywords: z.record(z.string(), z.array(z.string()).nonempty()).optional(),
    partNumberRegex: z.string().optional(),
    yearRegex: z.string().optional(),
  })
  .optional();

const parsedTractorConfig = (() => {
  try {
    const parsed = tractorConfigSchema.parse(tractorConfig) || {};
    return parsed;
  } catch (error) {
    logger?.warn?.('[woodland-ai-search-tractor] Invalid tractor config, using defaults', {
      error: error?.message || String(error),
    });
    return {};
  }
})();

const toLowerList = (arr) =>
  Array.isArray(arr)
    ? arr.map((s) => (typeof s === 'string' ? s.toLowerCase().trim() : '')).filter(Boolean)
    : [];

const mergeObjects = (defaults, overrides) => ({ ...defaults, ...(overrides || {}) });

const FAMILY_ALIAS_ENTRIES = Object.entries(
  mergeObjects(DEFAULT_FAMILY_ALIASES, parsedTractorConfig.familyAliases),
)
  .map(([key, value]) => [String(key).toLowerCase().trim(), value])
  .filter(([key]) => key);

const FAMILY_SIGNALS = [
  ...DEFAULT_FAMILY_SIGNALS,
  ...(Array.isArray(parsedTractorConfig.familySignals) ? parsedTractorConfig.familySignals : []),
]
  .map((signal) => ({
    family: signal?.family,
    keywords: toLowerList(signal?.match),
  }))
  .filter((signal) => signal.family && signal.keywords.length);

const PART_TYPE_ENTRIES = Object.entries(
  mergeObjects(DEFAULT_PART_TYPES, parsedTractorConfig.partTypes),
)
  .map(([needle, canonical]) => [String(needle).toLowerCase().trim(), canonical || needle])
  .filter(([needle]) => needle);

const rawIntentKeywords = { ...DEFAULT_INTENT_KEYWORDS };
if (parsedTractorConfig.intentKeywords) {
  for (const [key, list] of Object.entries(parsedTractorConfig.intentKeywords)) {
    if (!Array.isArray(list)) {
      continue;
    }
    rawIntentKeywords[key] = [...(rawIntentKeywords[key] || []), ...list];
  }
}

const INTENT_KEYWORDS = Object.fromEntries(
  Object.entries(rawIntentKeywords).map(([key, list]) => {
    const combined = toLowerList(list);
    const unique = Array.from(new Set(combined));
    return [key, unique];
  }),
);

const safeRegex = (pattern, fallback, flags = 'i') => {
  if (typeof pattern === 'string' && pattern.trim()) {
    try {
      return new RegExp(pattern, flags);
    } catch (_) {
      // fall through to fallback
    }
  }
  return fallback;
};

const PART_NUMBER_REGEX = safeRegex(
  parsedTractorConfig.partNumberRegex,
  /\b\d{2}-[a-z0-9]{2}-[a-z0-9]{3,}\b/i,
);

const YEAR_REGEX = safeRegex(parsedTractorConfig.yearRegex, /\b(19|20)\d{2}\b/, 'i');

class WoodlandAISearchTractor extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 5;
  static DEFAULT_SELECT = 'id,title,content,url';

  _env(v, fallback) {
    return v ?? fallback;
  }

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search-tractor';
    this.description =
      "Use the 'woodland-ai-search-tractor' tool to retrieve search results from the Tractor Azure AI Search index";

    this.schema = z.object({
      query: z
        .string()
        .optional()
        .default('')
        .describe('Search word or phrase for Tractor Azure AI Search'),
      top: z.number().int().positive().optional(),
      make: z.string().optional(),
      tractorMake: z.string().optional(),
      model: z.string().optional(),
      tractorModel: z.string().optional(),
      deck_size: z.union([z.string(), z.number()]).optional(),
      deckWidth: z.union([z.string(), z.number()]).optional(),
      family: z.union([z.string(), z.array(z.string())]).optional(),
      rake_name: z.union([z.string(), z.array(z.string())]).optional(),
      cycloneRakeModel: z.union([z.string(), z.array(z.string())]).optional(),
      rake_sku: z.union([z.string(), z.array(z.string())]).optional(),
      cycloneRakeSku: z.union([z.string(), z.array(z.string())]).optional(),
      sku: z.string().optional(),
      part_type: z.string().optional(),
      require_active: z.boolean().optional(),
      // When true, perform a relaxed (free) search: no strict filters; broader recall
      relaxed: z.boolean().optional(),
      // Optional dense embedding (vector) for hybrid search
      embedding: z.array(z.number()).min(3).optional(),
    });

    this.familyAliasMap = new Map(FAMILY_ALIAS_ENTRIES);
    this.familySignals = FAMILY_SIGNALS;
    this.partTypeEntries = PART_TYPE_ENTRIES;
    this.intentKeywords = INTENT_KEYWORDS;
    this.partNumberRegex = PART_NUMBER_REGEX;
    this.yearRegex = YEAR_REGEX;
    this.rakeNameAliases = { ...DEFAULT_RAKE_NAME_ALIASES };

    // Shared endpoint + key
    this.serviceEndpoint = this._env(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
    );
    this.apiKey = this._env(fields.AZURE_AI_SEARCH_API_KEY, process.env.AZURE_AI_SEARCH_API_KEY);

    // Single Tractor index name (supports multiple possible env names, falls back to generic index name)
    this.indexName =
      this._env(fields.AZURE_AI_SEARCH_TRACTOR_INDEX, process.env.AZURE_AI_SEARCH_TRACTOR_INDEX) ||
      this._env(
        fields.AZURE_AI_SEARCH_TRACTOR_INDEX_NAME,
        process.env.AZURE_AI_SEARCH_TRACTOR_INDEX_NAME,
      ) ||
      this._env(fields.AZURE_AI_SEARCH_INDEX_NAME, process.env.AZURE_AI_SEARCH_INDEX_NAME);

    if (!this.serviceEndpoint || !this.apiKey || !this.indexName) {
      throw new Error(
        'Missing Azure AI Search envs: AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_API_KEY, and Tractor index (AZURE_AI_SEARCH_TRACTOR_INDEX or AZURE_AI_SEARCH_INDEX_NAME).',
      );
    }

    // Optional API version
    this.apiVersion = this._env(
      fields.AZURE_AI_SEARCH_API_VERSION,
      process.env.AZURE_AI_SEARCH_API_VERSION || WoodlandAISearchTractor.DEFAULT_API_VERSION,
    );

    // Defaults
    this.top = WoodlandAISearchTractor.DEFAULT_TOP;
    this.select = WoodlandAISearchTractor.DEFAULT_SELECT.split(',').map((s) => s.trim());

    // Search/semantic options
    this.searchFields = (() => {
      // Prefer tractor-specific override, else global override
      const v =
        this._env(
          fields.AZURE_AI_SEARCH_TRACTOR_SEARCH_FIELDS,
          process.env.AZURE_AI_SEARCH_TRACTOR_SEARCH_FIELDS,
        ) ||
        this._env(fields.AZURE_AI_SEARCH_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_SEARCH_FIELDS);
      if (v)
        return String(v)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      // Keep to known searchable fields in the Tractors index
      return ['title', 'content', 'mda_instructions', 'hitch_instructions'];
    })();
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

    // Vector search field (name of the vector column in the index)
    this.vectorField =
      this._env(
        fields.AZURE_AI_SEARCH_TRACTOR_VECTOR_FIELD,
        process.env.AZURE_AI_SEARCH_TRACTOR_VECTOR_FIELD,
      ) ||
      this._env(fields.AZURE_AI_SEARCH_VECTOR_FIELD, process.env.AZURE_AI_SEARCH_VECTOR_FIELD) ||
      'contentVector';

    // Initialize SearchClient
    const credential = new AzureKeyCredential(this.apiKey);
    this.client = new SearchClient(this.serviceEndpoint, this.indexName, credential, {
      apiVersion: this.apiVersion,
    });

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

    logger.info('[woodland-ai-search-tractor] Initialized', {
      endpoint: this.serviceEndpoint,
      apiVersion: this.apiVersion,
      index: this.indexName,
      select: this.select,
      searchFields: this.searchFields,
      semanticConfiguration: this.semanticConfiguration || null,
      enableSemantic: this.enableSemantic,
      queryLanguage: this.queryLanguage,
      scoringProfile: this.scoringProfile,
      defaultAnswerMode: this.defaultAnswerMode,
      defaultCaptionMode: this.defaultCaptionMode,
    });
  }

  _keyOf(d) {
    return d?.url || d?.id || d?.record_id || d?.key || JSON.stringify(d);
  }

  _andFilter(a, b) {
    if (!a && !b) return undefined;
    if (!a) return b;
    if (!b) return a;
    return `(${a}) and (${b})`;
  }

  _escapeLiteral(v) {
    return String(v).replace(/'/g, "''");
  }

  _normalizeDeckSize(ds) {
    if (ds == null) return undefined;
    const s = String(ds).toLowerCase();
    const m = s.match(/(\d{1,3})(?:\s?(?:in|inch|inches))?/i);
    return m ? m[1] : undefined;
  }

  _familyAliases(f) {
    const key = String(f || '')
      .trim()
      .toLowerCase();
    if (!key) {
      return f;
    }
    return this.familyAliasMap.get(key) || f;
  }

  _provenance(d) {
    try {
      const url = (typeof d?.url === 'string' && d.url) || '';
      const host = url ? new URL(url).hostname : undefined;
      return { url: url || undefined, host, site: d?.site, page_type: d?.page_type };
    } catch (_) {
      return { site: d?.site, page_type: d?.page_type };
    }
  }

  /**
   * Normalize tractor compatibility-related fields for downstream rendering.
   * Does not change original values; attaches a new `normalized_compat` object.
   */
  _extractCompatFromText(text, tags) {
    try {
      const out = new Set();
      const addMany = (arr) =>
        arr.forEach((s) => {
          const v = String(s).trim();
          if (v) out.add(v);
        });
      const t = (text || '').toString();
      // Common patterns: "compatible with X, Y and Z", "fits: X; Y; Z", "models: X, Y"
      const patterns = [
        /compatible\s+with\s*[:\-]?\s*([^\n\.]+)/gi,
        /fits\s*[:\-]?\s*([^\n\.]+)/gi,
        /models?\s*[:\-]?\s*([^\n\.]+)/gi,
        /supported\s+models?\s*[:\-]?\s*([^\n\.]+)/gi,
      ];
      for (const re of patterns) {
        let m;
        while ((m = re.exec(t)) !== null) {
          const list = (m[1] || '')
            .replace(/\band\b/gi, ',')
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean);
          addMany(list);
        }
      }
      if (Array.isArray(tags)) {
        // Heuristic: tags that look like model/series names (contain letters/numbers/dashes)
        const tagModels = tags
          .map((x) => String(x).trim())
          .filter((x) => /[A-Za-z0-9]/.test(x) && x.length <= 40);
        addMany(tagModels);
      }
      return out.size ? Array.from(out) : undefined;
    } catch (_) {
      return undefined;
    }
  }

  _cleanCompat(arr) {
    try {
      const a = Array.isArray(arr) ? arr : [];
      return a
        .map((x) => String(x).trim())
        .filter((x) => /^[A-Za-z0-9][A-Za-z0-9 _-]{0,40}$/.test(x) && !x.includes(':'))
        .filter((x, i, self) => x && self.indexOf(x) === i);
    } catch (_) {
      return undefined;
    }
  }

  _parseTagValues(tags = []) {
    const map = new Map();
    if (!Array.isArray(tags)) {
      return map;
    }
    tags.forEach((tag) => {
      if (typeof tag !== 'string') {
        return;
      }
      const idx = tag.indexOf(':');
      if (idx <= 0 || idx === tag.length - 1) {
        return;
      }
      const key = tag.slice(0, idx).trim().toLowerCase();
      const value = tag.slice(idx + 1).trim();
      if (!key || !value) {
        return;
      }
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(value);
    });
    return map;
  }

  _strictUrlForSku(value, sku) {
    const s = typeof value === 'string' ? value.trim() : '';
    if (!/^https?:\/\//i.test(s)) return undefined;
    if (/^https?:\/\/(www\.)?cyclonerake\.com\/?$/i.test(s)) return undefined;
    try {
      const parsed = new URL(s);
      const host = (parsed.hostname || '').toLowerCase();
      const path = (parsed.pathname || '').toLowerCase();
      const normalizedSku = String(sku || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      if (host.endsWith('cyclonerake.com')) {
        const pathHasDigit = /\d/.test(path);
        const pathNormalized = path.replace(/[^a-z0-9]/g, '');
        const matchesSku = normalizedSku ? pathNormalized.includes(normalizedSku) : false;
        if (!pathHasDigit && !matchesSku) {
          return undefined;
        }
      }
    } catch (_) {
      return undefined;
    }
    return s;
  }

  _buildSkuFallbackUrl(sku) {
    const normalizedSku = typeof sku === 'string' ? sku.trim() : '';
    if (!normalizedSku) {
      return undefined;
    }
    const fallbackBase =
      process.env.WOODLAND_TRACTOR_SKU_FALLBACK_URL_BASE ||
      'https://www.cyclonerake.com/search/?q=';
    return `${fallbackBase}${encodeURIComponent(normalizedSku)}`;
  }

  _skuUrlWithFallback(sku, url) {
    const normalizedSku = typeof sku === 'string' ? sku.trim() : '';
    if (!normalizedSku) {
      return undefined;
    }
    return this._strictUrlForSku(url, normalizedSku) || this._buildSkuFallbackUrl(normalizedSku);
  }

  _enforceCompatUrlPolicy(doc) {
    if (!doc || typeof doc !== 'object') {
      return doc;
    }
    const n = doc.normalized_compat;
    if (!n || typeof n !== 'object') {
      return doc;
    }

    const apply = (group, skuKey, urlKey) => {
      const target = n[group];
      if (!target || typeof target !== 'object') {
        return;
      }
      const sku = target[skuKey];
      const url = target[urlKey];
      target[urlKey] = this._skuUrlWithFallback(sku, url);
    };

    apply('oem', 'mda', 'mda_url');
    apply('oem', 'hitch', 'hitch_url');
    apply('oem', 'hose', 'hose_url');
    apply('oem', 'upgrade_hose', 'upgrade_hose_url');
    apply('oem', 'rubber_collar', 'rubber_collar_url');

    apply('aftermarket', 'mda', 'mda_url');
    apply('aftermarket', 'hitch', 'hitch_url');
    apply('aftermarket', 'hose', 'hose_url');
    apply('aftermarket', 'upgrade_hose', 'upgrade_hose_url');

    return doc;
  }

  _normalizeDoc(d) {
    const bool = (v) => (typeof v === 'boolean' ? v : undefined);
    const str = (v) => (v == null ? undefined : String(v));
    const list = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : undefined);
    const listFromAny = (value) => {
      if (Array.isArray(value)) {
        return value
          .map((entry) => (entry == null ? '' : String(entry).trim()))
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
          .map((segment) => segment.trim())
          .filter(Boolean);
      }
      return undefined;
    };

    const tractor =
      [d?.tractor_make, d?.tractor_model, d?.tractor_deck_size]
        .filter((x) => x != null && String(x).trim().length > 0)
        .join(' ')
        .trim() || undefined;

    const tagsList = list(d?.tags) || [];
    const tagValues = this._parseTagValues(tagsList);

    const normalized = {
      tractor, // e.g., "AMF 836 36"
      kit_or_assembly: str(d?.title) || str(d?.group_name),
      deck_opening_measurements_required: bool(d?.need_deck_open_measurements),
      mda_pre_cut: bool(d?.is_boot_pre_cut),
      customer_drilling_required: bool(d?.need_to_drill_deck),
      exhaust_deflection_needed: bool(d?.need_to_deflect_mower),
      compatible_with_large_rakes: bool(d?.can_connect_to_large_rakes),
      aftermarket: {
        mda: str(d?.ammda_sku),
        mda_url: this._skuUrlWithFallback(str(d?.ammda_sku), str(d?.ammda_sku_url)),
        hitch: str(d?.amhitch_sku),
        hitch_url: this._skuUrlWithFallback(str(d?.amhitch_sku), str(d?.amhitch_sku_url)),
        hose: str(d?.amhose_sku),
        hose_url: this._skuUrlWithFallback(str(d?.amhose_sku), str(d?.amhose_sku_url)),
        upgrade_hose: str(d?.amupgradehose_sku),
        upgrade_hose_url: this._skuUrlWithFallback(
          str(d?.amupgradehose_sku),
          str(d?.amupgradehose_sku_url),
        ),
      },
      oem: {
        mda: str(d?.mda_sku),
        mda_url: this._skuUrlWithFallback(str(d?.mda_sku), str(d?.mda_sku_url)),
        hitch: str(d?.hitch_sku),
        hitch_url: this._skuUrlWithFallback(str(d?.hitch_sku), str(d?.hitch_sku_url)),
        hose: str(d?.hose_sku),
        hose_url: this._skuUrlWithFallback(str(d?.hose_sku), str(d?.hose_sku_url)),
        upgrade_hose: str(d?.upgradehose_sku),
        upgrade_hose_url: this._skuUrlWithFallback(str(d?.upgradehose_sku), str(d?.upgradehose_sku_url)),
        rubber_collar: str(d?.rubbercollar_sku),
        rubber_collar_url: this._skuUrlWithFallback(
          str(d?.rubbercollar_sku),
          str(d?.rubbercollar_sku_url),
        ),
      },
      compatible_with:
        this._cleanCompat(list(d?.compatible_models)) ||
        this._cleanCompat(list(d?.compatible_series)) ||
        this._cleanCompat(this._extractCompatFromText(d?.content, d?.tags)) ||
        undefined,
      notes: str(d?.content),
      picture_thumbnail_url: str(d?.picture_thumbnail_url),
      tags: tagsList,
      provenance: this._provenance(d),
    };

    const toSkuEntry = (sku, url, label, source) => {
      if (!sku) {
        return undefined;
      }
      const entry = { sku, label: label || undefined, source: source || 'oem' };
      if (url) {
        entry.url = url;
      }
      return entry;
    };

    const flatten = (...entries) => entries.filter(Boolean);

    const normalizedFitment = {
      tractor,
      make: str(d?.tractor_make),
      model: str(d?.tractor_model),
      deck_size: this._normalizeDeckSize(d?.tractor_deck_size),
      deck_size_raw: str(d?.tractor_deck_size),
      family: this._familyAliases(d?.family || d?.rake_family),
      rake_model: str(d?.rake_model) || (tagValues.get('rake_model') || [])[0],
      rake_names: [
        ...(listFromAny(d?.rake_name) || []),
        ...(listFromAny(d?.rake_names) || []),
        ...(tagValues.get('rake_name') || []),
      ].filter(Boolean),
      rake_skus: [
        ...(listFromAny(d?.rake_sku) || []),
        ...(listFromAny(d?.rake_skus) || []),
        ...(tagValues.get('rake_sku') || []),
      ].filter(Boolean),
      hose_options: flatten(
        toSkuEntry(normalized.oem?.hose, normalized.oem?.hose_url, 'OEM hose', 'oem'),
        toSkuEntry(
          normalized.oem?.upgrade_hose,
          normalized.oem?.upgrade_hose_url,
          'OEM upgrade hose',
          'oem',
        ),
        toSkuEntry(
          normalized.aftermarket?.hose,
          normalized.aftermarket?.hose_url,
          'Aftermarket hose',
          'aftermarket',
        ),
        toSkuEntry(
          normalized.aftermarket?.upgrade_hose,
          normalized.aftermarket?.upgrade_hose_url,
          'Aftermarket upgrade hose',
          'aftermarket',
        ),
      ),
      hitch_options: flatten(
        toSkuEntry(normalized.oem?.hitch, normalized.oem?.hitch_url, 'OEM hitch', 'oem'),
        toSkuEntry(
          normalized.aftermarket?.hitch,
          normalized.aftermarket?.hitch_url,
          'Aftermarket hitch',
          'aftermarket',
        ),
      ),
      mda_options: flatten(
        toSkuEntry(normalized.oem?.mda, normalized.oem?.mda_url, 'OEM MDA', 'oem'),
        toSkuEntry(
          normalized.aftermarket?.mda,
          normalized.aftermarket?.mda_url,
          'Aftermarket MDA',
          'aftermarket',
        ),
      ),
      rubber_collar_options: flatten(
        toSkuEntry(
          normalized.oem?.rubber_collar,
          normalized.oem?.rubber_collar_url,
          'OEM rubber collar',
          'oem',
        ),
      ),
      flags: {
        deck_opening_measurements_required: normalized.deck_opening_measurements_required,
        mda_pre_cut: normalized.mda_pre_cut,
        customer_drilling_required: normalized.customer_drilling_required,
        exhaust_deflection_needed: normalized.exhaust_deflection_needed,
        compatible_with_large_rakes: normalized.compatible_with_large_rakes,
      },
      compatible_with: normalized.compatible_with,
      notes: normalized.notes,
      tags: normalized.tags,
      provenance: normalized.provenance,
    };

    return { ...d, normalized_compat: normalized, normalized_fitment: normalizedFitment };
  }

  _formatSupportAnswer(doc) {
    const n = doc?.normalized_compat;
    if (!n) return 'No compatibility data available.';

    const yn = (v) => (v === true ? 'Yes' : v === false ? 'No' : 'Unknown');
    const strictSku = (value) => {
      const s = typeof value === 'string' ? value.trim() : '';
      return s || undefined;
    };
    const skuWithOwnUrl = (sku, url) => {
      const S = strictSku(sku);
      if (!S) return 'N/A';
      const U = this._skuUrlWithFallback(S, url);
      return U ? `[${S}](${U})` : S;
    };
    const field = (label, sku, url, aftermarketSku, aftermarketUrl) => {
      const main = `${label}: ${skuWithOwnUrl(sku, url)}`;
      const am = strictSku(aftermarketSku)
        ? ` (Aftermarket: ${skuWithOwnUrl(aftermarketSku, aftermarketUrl)})`
        : '';
      return `- **${main}${am}**`;
    };

    const titleRight = n.kit_or_assembly ? ` — ${n.kit_or_assembly}` : '';
    const head = `**${n.tractor || doc.title || 'Tractor'}${titleRight}**`;

    const parts = [
      field('MDA', n.oem?.mda, n.oem?.mda_url, n.aftermarket?.mda, n.aftermarket?.mda_url),
      field(
        'Hitch',
        n.oem?.hitch,
        n.oem?.hitch_url,
        n.aftermarket?.hitch,
        n.aftermarket?.hitch_url,
      ),
      field('Rubber Collar Kit', n.oem?.rubber_collar, n.oem?.rubber_collar_url),
      field('Hose', n.oem?.hose, n.oem?.hose_url, n.aftermarket?.hose, n.aftermarket?.hose_url),
      field(
        'Upgrade Hose',
        n.oem?.upgrade_hose,
        n.oem?.upgrade_hose_url,
        n.aftermarket?.upgrade_hose,
        n.aftermarket?.upgrade_hose_url,
      ),
    ].join('\n');

    const flags =
      `- Deck opening measurements required? → ${yn(n.deck_opening_measurements_required)}\n` +
      `- Is the MDA pre-cut? → ${yn(n.mda_pre_cut)}\n` +
      `- Does the customer have to drill their deck? → ${yn(n.customer_drilling_required)}\n` +
      `- Exhaust deflection needed? → ${yn(n.exhaust_deflection_needed)}\n` +
      `- Compatible with Comm Pro / XL / Z-10? → ${yn(n.compatible_with_large_rakes)}`;

    const img = n.picture_thumbnail_url ? `\n\n![Thumbnail](${n.picture_thumbnail_url})` : '';

    return `${head}\n\n**Parts &amp; Kits**\n${parts}\n\n**Installation / SOP Flags**\n${flags}${img}`;
  }

  // Returns a markdown table grouping OEM vs Aftermarket parts plus a flags table.
  _formatGroupedTable(doc) {
    const n = doc?.normalized_compat;
    if (!n) return '';
    const strictSku = (value) => {
      const s = typeof value === 'string' ? value.trim() : '';
      return s || undefined;
    };
    const toLinkedSku = (sku, url) => {
      const S = strictSku(sku);
      if (!S) return undefined;
      const U = this._skuUrlWithFallback(S, url);
      return U ? `[${S}](${U})` : S;
    };
    const pick = (oemSku, oemUrl, amSku, amUrl) => {
      const oem = toLinkedSku(oemSku, oemUrl);
      if (oem) return oem;
      const am = toLinkedSku(amSku, amUrl);
      if (am) return am;
      return 'N/A';
    };
    const row = (part, oemSku, oemUrl, amSku, amUrl) => `| ${part} | ${pick(oemSku, oemUrl, amSku, amUrl)} |`;
    const lines = [
      '| Part | SKU |',
      '|------|-----|',
      row('MDA', n.oem?.mda, n.oem?.mda_url, n.aftermarket?.mda, n.aftermarket?.mda_url),
      row('Hitch', n.oem?.hitch, n.oem?.hitch_url, n.aftermarket?.hitch, n.aftermarket?.hitch_url),
      row('Rubber Collar', n.oem?.rubber_collar, n.oem?.rubber_collar_url, undefined, undefined),
      row('Hose', n.oem?.hose, n.oem?.hose_url, n.aftermarket?.hose, n.aftermarket?.hose_url),
      row('Upgrade Hose', n.oem?.upgrade_hose, n.oem?.upgrade_hose_url, n.aftermarket?.upgrade_hose, n.aftermarket?.upgrade_hose_url),
    ];
    const yn = (v) => (v === true ? 'Yes' : v === false ? 'No' : 'Unknown');
    const flags = [
      '| Flag | Value |',
      '|------|-------|',
      `| Deck opening measurements required | ${yn(n.deck_opening_measurements_required)} |`,
      `| MDA pre-cut | ${yn(n.mda_pre_cut)} |`,
      `| Customer deck drilling required | ${yn(n.customer_drilling_required)} |`,
      `| Exhaust deflection needed | ${yn(n.exhaust_deflection_needed)} |`,
      `| Compatible with Comm Pro / XL / Z-10 | ${yn(n.compatible_with_large_rakes)} |`,
    ];
    const titleRight = n.kit_or_assembly ? ` — ${n.kit_or_assembly}` : '';
    const head = `### ${n.tractor || doc.title || 'Tractor'}${titleRight}`;
    return [head, '', lines.join('\n'), '', flags.join('\n')].join('\n');
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
    return clean;
  }

  async _safeSearch(query, options) {
    const run = async (opts) => {
      const send = this._sanitizeSearchOptions(opts);
      logger.info('[woodland-ai-search-tractor] Search request (pre-transform)', {
        query,
        options: send,
      });
      const rs = await this.client.search(query, send);
      const items = [];
      for await (const r of rs.results) items.push(r.document);
      logger.info('[woodland-ai-search-tractor] Search response (pre-normalize)', {
        count: items.length,
        docs: items,
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
        logger.warn('[woodland-ai-search-tractor] Search failed', { attempt, msg });

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
            '[woodland-ai-search-tractor] Semantic config missing or empty on index — falling back to simple query',
          );
        }

        // Remove orderBy for semantic queries (Azure restriction)
        if (/orderby/i.test(msg) && String(sanitized.queryType).toLowerCase() === 'semantic') {
          if (sanitized.orderBy) {
            delete sanitized.orderBy;
            changed = true;
            logger.info(
              '[woodland-ai-search-tractor] Removing orderBy for semantic query and retrying',
            );
          }
        }

        // Strip unknown fields from select/searchFields; drop filter if unknown field appears there
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
                '[woodland-ai-search-tractor] Dropping filter due to unknown fields and retrying',
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
          logger.info('[woodland-ai-search-tractor] Dropping searchFields entirely and retrying');
        }

        if (!changed) break;
        opts = sanitized;
      }
    }
    throw lastErr;
  }

  async _tieredSearch(query, baseOptions) {
    const r = await this._safeSearch(query, baseOptions);
    return r.docs ?? [];
  }

  // Intent and entity detection (lightweight heuristics)
  _detectIntent(query) {
    const rawOriginal = (query || '').toString();
    // Abbreviation & synonym expansion prior to downstream extraction
    const normalizeAbbreviations = (text) => {
      if (!text) return '';
      let t = text;
      // Replace whole-word abbreviations only to avoid mid-word corruption
      const replaceWord = (pattern, replacement) => {
        const re = new RegExp(`(^|\b)${pattern}(\b|$)`, 'gi');
        t = t.replace(re, (m, pre, post) => `${pre}${replacement}${post}`);
      };
      replaceWord('jd', 'john deere');
      replaceWord('deere', 'john deere'); // unify "Deere" alone to brand form
      replaceWord('cmd', 'commander');
      replaceWord('cmdr', 'commander');
      replaceWord('comm pro', 'commercial pro');
      replaceWord('compro', 'commercial pro');
      // CRS references remain but ensure consistent hyphenation/spaces
      t = t.replace(/\b(crs)\b/gi, 'crs');
      // Normalize common deck size formats (42in, 42") to "42 in"
      t = t.replace(/\b(\d{2,3})\s?(?:in|inch|inches|"|”)?\b/gi, '$1 in');
      return t;
    };
    const raw = normalizeAbbreviations(rawOriginal);
    const q = raw.toLowerCase();
    const containsAny = (arr = []) => arr.some((w) => w && q.includes(w));
    const partMatch = this.partNumberRegex ? q.match(this.partNumberRegex) : null;
    const extracted = {};
    if (partMatch) extracted.partNumber = partMatch[0];

    const deckSignals = [
      /\bdeck(?:\s+size)?\s*[:=]?\s*(\d{2,3})(?:\s*(?:in|inch|inches|["”]))?/i,
      /(\d{2,3})(?:\s*(?:in|inch|inches|["”]))\s+deck\b/i,
    ];
    for (const re of deckSignals) {
      const match = raw.match(re);
      if (match && match[1]) {
        extracted.deckSize = this._normalizeDeckSize(match[1]);
        break;
      }
    }

    for (const [needle, canonical] of this.partTypeEntries) {
      if (needle && q.includes(needle)) {
        extracted.partType = canonical;
        break;
      }
    }

    for (const signal of this.familySignals) {
      if (signal.keywords.some((kw) => q.includes(kw))) {
        extracted.family = signal.family;
        break;
      }
    }

    // Helper to extract make/model with multi-word brand consideration
    const extractMakeModel = (text) => {
      const lower = text.toLowerCase();
      // Attempt multi-word brand match first; pick longest matching key
      const brandKey = Object.keys(MULTI_WORD_BRAND_ALIASES)
        .sort((a, b) => b.length - a.length)
        .find((k) => lower.includes(k));
      let make;
      let model;
      if (brandKey) {
        make = MULTI_WORD_BRAND_ALIASES[brandKey];
        // Remove brand portion and trim
        const remainder = lower.replace(brandKey, ' ').replace(/\s+/g, ' ').trim();
        // Model candidate: first remaining token sequence with letters/digits/hyphens
        // e.g., '1616', 'x350', 'ytx24v48'
        const m = remainder.match(/([a-z0-9][a-z0-9\-]{1,30})(?:\b|$)/i);
        if (m) {
          model = m[1].toUpperCase();
        }
      } else {
        // Fallback to existing regex approach if no multi-word brand detected
        const mm = text.match(/\b([A-Za-z][A-Za-z&'\-\/ ]{1,40})\s+([A-Za-z0-9]{2,}[A-Za-z0-9\-]*)\b/);
        if (mm) {
          make = mm[1].trim();
          model = mm[2].trim();
        }
      }
      return { make, model };
    };

    // Only attempt extraction if not provided already by caller
    if (!extracted.make || !extracted.model) {
      const { make: autoMake, model: autoModel } = extractMakeModel(raw);
      if (autoMake && !extracted.make) extracted.make = autoMake;
      if (autoModel && !extracted.model) extracted.model = autoModel;
    }

    // Rake name detection (Commander_CRS, Commercial_Pro_CRS, etc.)
    for (const [alias, canonical] of Object.entries(this.rakeNameAliases || {})) {
      if (alias && q.includes(alias)) {
        extracted.rakeName = canonical;
        extracted.rakeNameAlias = alias;
        const aliasRegex = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const aliasMatch = raw.match(aliasRegex);
        if (aliasMatch) {
          extracted.rakeNameRaw = aliasMatch[0].trim();
        }
        break;
      }
    }

    if (!extracted.rakeNameRaw) {
      const rakePhrase = raw.match(
        /((?:[A-Za-z0-9_\-\/]+\s+)*[A-Za-z0-9_\-\/]+)\s*((?:rake)(?:\s+type)?)\b/i,
      );
      if (rakePhrase) {
        extracted.rakeNameRaw = rakePhrase[1].trim();
        extracted.rakeNameRawFull = `${rakePhrase[1]} ${rakePhrase[2] || ''}`.trim();
        if (!extracted.rakeName) {
          extracted.rakeName = extracted.rakeNameRaw;
        }
      }
    }
    // Post-normalization adjustments: collapse repeated brand tokens
    if (extracted.make) {
      extracted.make = extracted.make.replace(/\bjohn\s+deere\b/gi, 'John Deere');
      extracted.make = extracted.make.replace(/\bcub\s+cadet\b/gi, 'Cub Cadet');
      extracted.make = extracted.make.replace(/\btroy[-\s]?bilt\b/gi, 'Troy-Bilt');
      extracted.make = extracted.make.replace(/\bagco\s+allis\b/gi, 'Agco Allis');
    }
    if (extracted.family) {
      extracted.family = extracted.family.replace(/\bcommercial\s+pro\b/i, 'Commercial PRO');
    }
    // Standardize deck size numeric portion if captured as "42 in"
    if (extracted.deckSize) {
      const deckNum = this._normalizeDeckSize(extracted.deckSize);
      if (deckNum) extracted.deckSize = deckNum;
    }

    if (containsAny(this.intentKeywords.promo)) extracted.wantsPromo = true;

    if (partMatch || containsAny(this.intentKeywords.parts)) {
      return { intent: 'parts', extracted };
    }
    if (!extracted.make || !extracted.model) {
      const makeModelMatch = raw.match(
        /\b([A-Za-z][A-Za-z&'\-\/ ]{1,40})\s+([A-Za-z0-9]{2,}[A-Za-z0-9\-]*)\b/,
      );
      if (makeModelMatch) {
        const maybeMake = makeModelMatch[1]?.trim();
        const maybeModel = makeModelMatch[2]?.trim();
        if (maybeMake && !extracted.make) {
          extracted.make = maybeMake;
        }
        if (maybeModel && !extracted.model) {
          extracted.model = maybeModel;
        }
      }
    }

    if (
      containsAny(this.intentKeywords.compatibility) ||
      (this.yearRegex && this.yearRegex.test(q))
    ) {
      return { intent: 'compatibility', extracted };
    }
    if (containsAny(this.intentKeywords.sop)) {
      return { intent: 'sop', extracted };
    }
    if (containsAny(this.intentKeywords.marketing)) {
      return { intent: 'marketing', extracted };
    }
    return { intent: 'general', extracted };
  }

  _combineClauses(clauses) {
    return Array.isArray(clauses) && clauses.length
      ? clauses.map((c) => `(${c})`).join(' and ')
      : undefined;
  }

  _fieldOrTag(field, tagKey, value) {
    const escapedValue = this._escapeLiteral(value);
    const tagLiteral = this._escapeLiteral(`${tagKey}:${value}`);
    const tagClause = `tags/any(t: t eq '${tagLiteral}')`;
    return `((${field} eq '${escapedValue}') or ${tagClause})`;
  }

  _buildMakeModelClauses(extracted = {}) {
    const clauses = [];
    if (extracted.make) {
      clauses.push(this._fieldOrTag('tractor_make', 'make', extracted.make));
    }
    if (extracted.model) {
      clauses.push(this._fieldOrTag('tractor_model', 'model', extracted.model));
    }
    return clauses;
  }

  // Per-intent options for the single Tractor index.
  _buildCompatibilityClauses(extracted = {}) {
    const clauses = [];
    if (extracted.make) {
      clauses.push(this._fieldOrTag('tractor_make', 'make', extracted.make));
    }
    if (extracted.model) {
      clauses.push(this._fieldOrTag('tractor_model', 'model', extracted.model));
    }
    if (extracted.deckSize) {
      clauses.push(this._fieldOrTag('tractor_deck_size', 'deck', extracted.deckSize));
    }
    if (extracted.family) {
      const familyVal = this._familyAliases(extracted.family);
      clauses.push(this._fieldOrTag('group_name', 'group', familyVal));
    }
    if (extracted.rakeName) {
      clauses.push(this._fieldOrTag('rake_name', 'rake_name', extracted.rakeName));
    }
    if (extracted.rakeNameRaw && extracted.rakeNameRaw !== extracted.rakeName) {
      clauses.push(this._fieldOrTag('rake_name', 'rake_name', extracted.rakeNameRaw));
    }
    if (extracted.rakeNameRawFull) {
      clauses.push(this._fieldOrTag('rake_name', 'rake_name', extracted.rakeNameRawFull));
    }
    if (extracted.rakeSku) {
      clauses.push(this._fieldOrTag('rake_sku', 'rake_sku', extracted.rakeSku));
    }
    return clauses;
  }

  _optionsForIntent(intent, extracted = {}, { compatibilityClauses } = {}) {
    const maybe = (o, sel) => (this.returnAllFields ? o : { ...o, select: sel });
    const pn = extracted.partNumber || '';
    const skuFields = [
      'mda_sku',
      'ammda_sku',
      'hitch_sku',
      'amhitch_sku',
      'rubbercollar_sku',
      'hose_sku',
      'amhose_sku',
      'upgradehose_sku',
      'amupgradehose_sku',
    ];

    const baseSelect = [
      'id',
      'title',
      'content',
      'url',
      'last_updated',
      'tractor_make',
      'tractor_model',
      'tractor_deck_size',
      'group_name',
      'is_active',
      'mda_sku',
      'ammda_sku',
      'mda_instructions',
      'mda_sku_url',
      'ammda_sku_url',
      'hitch_sku',
      'amhitch_sku',
      'hitch_instructions',
      'hitch_sku_url',
      'amhitch_sku_url',
      'rubbercollar_sku',
      'rubbercollar_sku_url',
      'hose_sku',
      'amhose_sku',
      'hose_sku_url',
      'amhose_sku_url',
      'upgradehose_sku',
      'amupgradehose_sku',
      'upgradehose_sku_url',
      'amupgradehose_sku_url',
      'is_boot_pre_cut',
      'can_connect_to_large_rakes',
      'need_to_drill_deck',
      'need_to_deflect_mower',
      'need_deck_open_measurements',
      'category',
      'picture_thumbnail_url',
      'tags',
      'mda_instructions',
      'hitch_instructions',
    ];

    if (intent === 'parts') {
      const clauses = Array.isArray(compatibilityClauses)
        ? [...compatibilityClauses]
        : this._buildCompatibilityClauses(extracted);
      if (extracted.partType) {
        const typeKey = String(extracted.partType || '').toLowerCase();
        const fields = PART_TYPE_FIELD_MAP[typeKey] || [];
        if (fields.length) {
          const skuClause = fields.map((f) => `(${f} ne '' and ${f} ne null)`).join(' or ');
          if (skuClause) {
            clauses.push(`(${skuClause})`);
          }
        }
      }
      if (pn) {
        const eqs = skuFields.map((f) => `${f} eq '${this._escapeLiteral(pn)}'`).join(' or ');
        if (eqs) {
          clauses.push(eqs);
        }
      }
      const filter = this._combineClauses(clauses);
      return maybe({ filter, searchFields: this.searchFields }, baseSelect);
    }

    if (intent === 'compatibility') {
      const clauses = Array.isArray(compatibilityClauses)
        ? compatibilityClauses
        : this._buildCompatibilityClauses(extracted);
      const filter = this._combineClauses(clauses);
      return maybe({ filter, searchFields: this.searchFields }, baseSelect);
    }

    if (intent === 'sop') {
      // Prioritize instructional text
      return maybe({ filter: undefined, searchFields: this.searchFields }, baseSelect);
    }

    if (intent === 'marketing') {
      return maybe({ filter: undefined, searchFields: this.searchFields }, baseSelect);
    }

    // general
    return maybe({ filter: undefined, searchFields: this.searchFields }, baseSelect);
  }

  _useOutputEnvelope() {
    return String(process.env.WOODLAND_TOOL_OUTPUT_ENVELOPE || 'false')
      .toLowerCase()
      .trim() === 'true';
  }

  _serializePayload(payload) {
    if (!this._useOutputEnvelope()) {
      return JSON.stringify(payload);
    }

    const docs = Array.isArray(payload?.docs) ? payload.docs : [];
    return JSON.stringify({
      status: 'ok',
      tool: this.name,
      count: docs.length,
      ...payload,
      results: docs,
    });
  }

  _serializeError(error) {
    const msg = (error && (error.message || String(error))) || 'Unknown error';
    if (!this._useOutputEnvelope()) {
      return `AZURE_SEARCH_FAILED: ${msg}`;
    }

    return JSON.stringify({
      status: 'error',
      tool: this.name,
      message: `AZURE_SEARCH_FAILED: ${msg}`,
      count: 0,
      docs: [],
      results: [],
      support_answers: [],
      grouped_tables: [],
    });
  }

  async _call(data) {
    const {
      query,
      top: topIn,
      make,
      tractorMake,
      model,
      tractorModel,
      deck_size,
      deckWidth,
      family,
      rake_name,
      cycloneRakeModel,
      rake_sku,
      cycloneRakeSku,
      sku,
      part_type,
      require_active,
      relaxed,
      embedding,
    } = data;
    const normalizedMake = make || tractorMake;
    const normalizedModel = model || tractorModel;
    const normalizedDeckSize = deck_size ?? deckWidth;
    const normalizedRakeName = rake_name ?? cycloneRakeModel;
    const normalizedRakeSku = rake_sku ?? cycloneRakeSku;
    const finalTop =
      typeof topIn === 'number' && Number.isFinite(topIn)
        ? Math.max(1, Math.floor(topIn))
        : this.top;

    try {
      const inferredMode = (() => {
        const q = (query || '').toString();
        if (/".+"/.test(q) || /\b(AND|OR|NOT)\b/i.test(q)) return 'all';
        return 'any';
      })();

      const baseOptions = {
        searchMode: inferredMode,
        top: finalTop,
        speller: 'lexicon',
        select: this.returnAllFields ? undefined : this.select,
      };
      const semanticConfigName =
        typeof this.semanticConfiguration === 'string' ? this.semanticConfiguration.trim() : '';
      const allowSemantic = !!semanticConfigName;

      if (allowSemantic) {
        baseOptions.queryType = 'semantic';
        baseOptions.semanticSearchOptions = {
          configurationName: semanticConfigName,
          queryLanguage: this.queryLanguage,
        };
      } else {
        baseOptions.queryType = 'simple';
      }
      if (allowSemantic && this.defaultAnswerMode === 'extractive') {
        baseOptions.answers = 'extractive';
      }
      if (allowSemantic && this.defaultCaptionMode === 'extractive') {
        baseOptions.captions = 'extractive';
      }
      if (this.scoringProfile) baseOptions.scoringProfile = this.scoringProfile;

      // If a vector embedding is provided, enable hybrid semantic + vector search
      if (Array.isArray(embedding) && embedding.length >= 3) {
        baseOptions.vectorSearchOptions = {
          queries: [
            {
              kind: 'vector',
              vector: embedding,
              fields: [this.vectorField],
              kNearestNeighborsCount: finalTop,
            },
          ],
        };
      }

      let { intent, extracted } = this._detectIntent(query);
      const pickFirst = (value) => (Array.isArray(value) ? value.find(Boolean) : value);
      const merged = {
        ...extracted,
        make: normalizedMake || extracted.make,
        model: normalizedModel || extracted.model,
        deckSize: this._normalizeDeckSize(normalizedDeckSize) || extracted.deckSize,
        family: Array.isArray(family)
          ? family.find(Boolean)
            ? this._familyAliases(family[0])
            : undefined
          : family
            ? this._familyAliases(family)
            : extracted.family,
        rakeName: pickFirst(normalizedRakeName) || extracted.rakeName,
        rakeSku: pickFirst(normalizedRakeSku) || extracted.rakeSku,
        partType: part_type || extracted.partType,
        partNumber: sku || extracted.partNumber,
        rakeNameAlias: extracted.rakeNameAlias,
        rakeNameRaw: extracted.rakeNameRaw,
        rakeNameRawFull: extracted.rakeNameRawFull,
      };
      // Post-merge adjustment: handle model strings that embed deck size at the end
      // Example: "836 36" => model: "836", deckSize: "36"
      if (merged.model && !merged.deckSize) {
        const tokens = merged.model.trim().split(/\s+/);
        if (tokens.length > 1) {
          const last = tokens[tokens.length - 1];
          const deckPattern = /^(30|32|34|36|38|40|42|44|46|48|50|52|54|60|62|72)$/;
          if (deckPattern.test(last)) {
            merged.deckSize = this._normalizeDeckSize(last);
            merged.model = tokens.slice(0, -1).join(' ');
          }
        }
      }
      if (intent === 'general' && merged.make && merged.model) {
        intent = 'compatibility';
      }
      const compatibilityClauses = this._buildCompatibilityClauses(merged);
      const compatibilityFilter = this._combineClauses(compatibilityClauses);
      const makeModelClauses = this._buildMakeModelClauses(merged);
      const makeModelFilter = this._combineClauses(makeModelClauses);
      const escapeRegex = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sanitizedQuery = (() => {
        if (!query) {
          const seedTerms = [merged.make, merged.model, merged.deckSize]
            .filter(Boolean)
            .join(' ')
            .trim();
          return seedTerms.length ? seedTerms : '*';
        }
        let q = query.toString();
        const removeTerm = (term) => {
          if (!term) return;
          const regex = new RegExp(escapeRegex(term), 'ig');
          q = q.replace(regex, ' ');
        };
        removeTerm(merged.rakeNameAlias);
        if (merged.rakeName && merged.rakeName !== merged.rakeNameAlias) {
          removeTerm(merged.rakeName);
        }
        removeTerm(merged.rakeNameRaw);
        removeTerm(merged.rakeNameRawFull);
        removeTerm(merged.make);
        removeTerm(merged.model);
        q = q.replace(/\brake(?:\s+type)?\b/gi, ' ');
        q = q.replace(/\s+/g, ' ').trim();
        return q.length ? q : '*';
      })();

      const intentOptions = this._optionsForIntent(intent, merged, { compatibilityClauses });
      let options = { ...baseOptions, ...intentOptions };
      const finalQueryString = sanitizedQuery;

      // Relaxed mode: remove strict filters and broaden recall
      if (relaxed === true) {
        if (makeModelFilter) {
          options.filter = makeModelFilter;
        }
        options.top = Math.max(options.top || this.top, 18);
        // Prefer any-mode to catch more matches in broad searches
        options.searchMode = 'any';
      }
      if (!options.filter && compatibilityFilter) {
        options.filter = compatibilityFilter;
      }
      // SKU prioritization
      if (merged.partNumber) {
        const skuFields = [
          'mda_sku',
          'ammda_sku',
          'hitch_sku',
          'amhitch_sku',
          'rubbercollar_sku',
          'hose_sku',
          'amhose_sku',
          'upgradehose_sku',
          'amupgradehose_sku',
        ];
        const eqs = skuFields
          .map((f) => `${f} eq '${this._escapeLiteral(merged.partNumber)}'`)
          .join(' or ');
        options.filter = options.filter ? `(${options.filter}) and (${eqs})` : `(${eqs})`;
      }
      if (require_active === true) {
        options.filter = options.filter
          ? `(${options.filter}) and (is_active eq true)`
          : '(is_active eq true)';
      }

      // orderBy not supported with semantic ranking
      if (String(options.queryType).toLowerCase() === 'semantic' && options.orderBy) {
        delete options.orderBy;
      }

      logger.info('[woodland-ai-search-tractor] Prepared search call', {
        intent,
        originalQuery: query,
        sanitizedQuery: finalQueryString,
        filterApplied: options.filter || null,
        top: options.top,
        searchMode: options.searchMode,
      });

      let docs = await this._tieredSearch(finalQueryString, options);
      if (
        (!Array.isArray(docs) || docs.length === 0) &&
        compatibilityFilter &&
        makeModelFilter &&
        compatibilityFilter !== makeModelFilter &&
        relaxed !== true
      ) {
        const fallbackOptions = { ...options, filter: makeModelFilter };
        logger.info(
          '[woodland-ai-search-tractor] Strict match empty, retrying with make/model filter',
          {
            originalFilter: options.filter,
            fallbackFilter: makeModelFilter,
          },
        );
        docs = await this._tieredSearch(finalQueryString, fallbackOptions);
        options = fallbackOptions;
      }
      // Relaxed fallback (broad recall) if still empty and caller did not request relaxed explicitly.
      if (( !Array.isArray(docs) || docs.length === 0 ) && relaxed !== true) {
        // Rebuild a minimal make/model only filter (drop deck size, rake, family constraints)
        const relaxedClauses = makeModelClauses.length ? makeModelClauses : [];
        let relaxedFilter = this._combineClauses(relaxedClauses);
        // If nothing to filter by, omit filter entirely (broad search)
        const relaxedOptions = {
          ...options,
          filter: relaxedFilter || undefined,
          top: Math.max(options.top || this.top, 20),
          searchMode: 'any',
        };
        // Remove SKU narrowing if present and produced zero results; keep if explicitly searching part number.
        if (!merged.partNumber) {
          // Attempt to drop any appended SKU equality constraints by rebuilding filter from relaxedClauses only
          relaxedOptions.filter = relaxedFilter || undefined;
        }
        logger.info('[woodland-ai-search-tractor] No results after strict/fallback; performing relaxed broad search', {
          priorFilter: options.filter || null,
          relaxedFilter: relaxedOptions.filter || null,
          top: relaxedOptions.top,
        });
        const relaxedDocs = await this._tieredSearch(finalQueryString, relaxedOptions);
        if (Array.isArray(relaxedDocs) && relaxedDocs.length > 0) {
          logger.info('[woodland-ai-search-tractor] Relaxed fallback yielded results', { count: relaxedDocs.length });
          docs = relaxedDocs;
          options = relaxedOptions;
        } else {
          logger.info('[woodland-ai-search-tractor] Relaxed fallback still empty');
        }
      }
      // Attach normalized compatibility projection and provenance to each doc
      if (Array.isArray(docs)) {
        docs = docs.map((d) => (d ? this._enforceCompatUrlPolicy(this._normalizeDoc(d)) : d));
      }
      // Build minimal, safe projection (avoid leaking noisy root fields that may confuse renderers)
      const projectedDocs = Array.isArray(docs)
        ? docs.map((d) => ({
            id: d?.id,
            title: d?.title,
            url: d?.url,
            normalized_compat: d?.normalized_compat,
          }))
        : [];
      logger.info('[woodland-ai-search-tractor] Query done', { count: projectedDocs.length });

      const supportAnswers = Array.isArray(docs)
        ? docs.map((d) => this._formatSupportAnswer(d))
        : [];
      const groupedTables = Array.isArray(docs)
        ? docs.map((d) => this._formatGroupedTable(d))
        : [];
      const includeRawRequested =
        String(
          this._env(
            /* fields override first */ undefined,
            process.env.AZURE_AI_SEARCH_INCLUDE_RAW || 'false',
          ),
        )
          .toLowerCase()
          .trim() === 'true';
      const includeRawUnsafeAllowed =
        String(process.env.WOODLAND_ALLOW_UNSAFE_RAW_DOCS || 'false')
          .toLowerCase()
          .trim() === 'true';
      const includeRaw = includeRawRequested && includeRawUnsafeAllowed;
      if (includeRawRequested && !includeRawUnsafeAllowed) {
        logger.warn(
          '[woodland-ai-search-tractor] Raw docs requested but blocked; set WOODLAND_ALLOW_UNSAFE_RAW_DOCS=true for local debugging only',
        );
      }
      const payload = includeRaw
        ? {
            docs: projectedDocs,
            raw_docs: docs || [],
            support_answers: supportAnswers,
            grouped_tables: groupedTables,
          }
        : { docs: projectedDocs, support_answers: supportAnswers, grouped_tables: groupedTables };
      return this._serializePayload(payload);
    } catch (error) {
      logger.error('[woodland-ai-search-tractor] Azure AI Search request failed', {
        error: error?.message || String(error),
      });
      return this._serializeError(error);
    }
  }
}

module.exports = WoodlandAISearchTractor;
WoodlandAISearchTractor.enableReusableInstance = true;
