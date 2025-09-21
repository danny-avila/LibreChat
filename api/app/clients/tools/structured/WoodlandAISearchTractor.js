// woodland-ai-search-tractor.js (single-index)
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

class WoodlandAISearchTractor extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 9;
  static DEFAULT_SELECT = 'id,title,content,url';

  _env(v, fallback) {
    return v ?? fallback;
  }

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search-tractor';
    this.description = "Use the 'woodland-ai-search-tractor' tool to retrieve search results from the Tractor Azure AI Search index";

    this.schema = z.object({
      query: z.string().describe('Search word or phrase for Tractor Azure AI Search'),
      top: z.number().int().positive().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
      deck_size: z.union([z.string(), z.number()]).optional(),
      family: z.union([z.string(), z.array(z.string())]).optional(),
      sku: z.string().optional(),
      part_type: z.string().optional(),
      require_active: z.boolean().optional(),
      // When true, perform a relaxed (free) search: no strict filters; broader recall
      relaxed: z.boolean().optional(),
    });

    // Shared endpoint + key
    this.serviceEndpoint = this._env(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
    );
    this.apiKey = this._env(fields.AZURE_AI_SEARCH_API_KEY, process.env.AZURE_AI_SEARCH_API_KEY);

    // Single Tractor index name (supports multiple possible env names, falls back to generic index name)
    this.indexName =
      this._env(fields.AZURE_AI_SEARCH_TRACTOR_INDEX, process.env.AZURE_AI_SEARCH_TRACTOR_INDEX) ||
      this._env(fields.AZURE_AI_SEARCH_TRACTOR_INDEX_NAME, process.env.AZURE_AI_SEARCH_TRACTOR_INDEX_NAME) ||
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
        ) || this._env(fields.AZURE_AI_SEARCH_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_SEARCH_FIELDS);
      if (v) return String(v).split(',').map((s) => s.trim()).filter(Boolean);
      // Keep to known searchable fields in the Tractors index
      return ['title', 'content', 'mda_instructions', 'hitch_instructions'];
    })();
    this.semanticConfiguration = this._env(
      fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
      process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION || 'sem1',
    );
    this.queryLanguage = this._env(
      fields.AZURE_AI_SEARCH_QUERY_LANGUAGE,
      process.env.AZURE_AI_SEARCH_QUERY_LANGUAGE || 'en-us',
    );
    this.scoringProfile = this._env(
      fields.AZURE_AI_SEARCH_SCORING_PROFILE,
      process.env.AZURE_AI_SEARCH_SCORING_PROFILE,
    );
    this.returnAllFields = String(
      this._env(
        fields.AZURE_AI_SEARCH_RETURN_ALL_FIELDS,
        process.env.AZURE_AI_SEARCH_RETURN_ALL_FIELDS || 'true',
      ),
    )
      .toLowerCase()
      .trim() === 'true';

    // Initialize SearchClient
    const credential = new AzureKeyCredential(this.apiKey);
    this.client = new SearchClient(this.serviceEndpoint, this.indexName, credential, {
      apiVersion: this.apiVersion,
    });

    logger.info('[woodland-ai-search-tractor] Initialized', {
      endpoint: this.serviceEndpoint,
      apiVersion: this.apiVersion,
      index: this.indexName,
      select: this.select,
      searchFields: this.searchFields,
      semanticConfiguration: this.semanticConfiguration,
      queryLanguage: this.queryLanguage,
      scoringProfile: this.scoringProfile,
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
    const map = new Map([
      ['commander', 'Commander'],
      ['commander pro', 'Commander'],
      ['xl', 'XL'],
      ['z-10', 'Z_10'],
      ['z10', 'Z_10'],
      ['z 10', 'Z_10'],
      ['commercial pro', 'Commercial_Pro'],
      ['commercial_pro', 'Commercial_Pro'],
    ]);
    const key = String(f || '').trim().toLowerCase();
    return map.get(key) || f;
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
      const addMany = (arr) => arr.forEach((s) => {
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

  _normalizeDoc(d) {
    const bool = (v) => (typeof v === 'boolean' ? v : undefined);
    const str = (v) => (v == null ? undefined : String(v));
    const list = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : undefined);

    const tractor = [d?.tractor_make, d?.tractor_model, d?.tractor_deck_size]
      .filter((x) => x != null && String(x).trim().length > 0)
      .join(' ')
      .trim() || undefined;

    const normalized = {
      tractor, // e.g., "AMF 836 36"
      kit_or_assembly: str(d?.title) || str(d?.group_name),
      deck_opening_measurements_required: bool(d?.need_deck_open_measurements),
      mda_pre_cut: bool(d?.is_boot_pre_cut),
      customer_drilling_required: bool(d?.need_to_drill_deck),
      exhaust_deflection_needed: bool(d?.need_to_deflect_mower),
      compatible_with_large_rakes: bool(d?.can_connect_to_large_rakes),
      aftermarket: {
        mda: str(d?.ammda_sku) || str(d?.mda_sku),
        hitch: str(d?.amhitch_sku) || str(d?.hitch_sku),
        hose: str(d?.amhose_sku) || str(d?.hose_sku),
        upgrade_hose: str(d?.amupgradehose_sku) || str(d?.upgradehose_sku),
        rubber_collar: str(d?.rubbercollar_sku),
      },
      compatible_with:
        list(d?.compatible_models) ||
        list(d?.compatible_series) ||
        this._extractCompatFromText(d?.content, d?.tags) ||
        undefined,
      notes: str(d?.content),
      picture_thumbnail_url: str(d?.picture_thumbnail_url),
      tags: list(d?.tags),
      provenance: this._provenance(d),
    };

    return { ...d, normalized_compat: normalized };
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
      logger.debug('[woodland-ai-search-tractor] Sending request', {
        query,
        options: JSON.stringify(send, null, 2),
      });
      const rs = await this.client.search(query, send);
      const items = [];
      for await (const r of rs.results) items.push(r.document);
      logger.debug('[woodland-ai-search-tractor] Received response', {
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
        logger.warn('[woodland-ai-search-tractor] Search failed', { attempt, msg });

        const sanitized = { ...opts };
        let changed = false;

        // Remove orderBy for semantic queries (Azure restriction)
        if (/orderby/i.test(msg) && String(sanitized.queryType).toLowerCase() === 'semantic') {
          if (sanitized.orderBy) {
            delete sanitized.orderBy;
            changed = true;
            logger.info('[woodland-ai-search-tractor] Removing orderBy for semantic query and retrying');
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
              logger.info('[woodland-ai-search-tractor] Dropping filter due to unknown fields and retrying');
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
    const q = (query || '').toString().toLowerCase();
    const containsAny = (arr) => arr.some((w) => q.includes(w));
    const yearRegex = /\b(19|20)\d{2}\b/;
    const partRegex = /\b\d{2}-[a-z0-9]{2}-[a-z0-9]{3,}\b/i;
    const partMatch = q.match(partRegex);
    const extracted = {};
    if (partMatch) extracted.partNumber = partMatch[0];

    const partTypes = ['collector bag', 'impeller', 'hose', 'recoil starter', 'starter', 'boot plate', 'side tube'];
    for (const t of partTypes) {
      if (q.includes(t)) {
        extracted.partType = t === 'starter' ? 'recoil starter' : t;
        break;
      }
    }

    if (q.includes('commercial pro')) extracted.family = 'Commercial PRO';
    else if (q.includes('commander pro') || q.includes('commander')) extracted.family = 'Commander Pro';
    else if (q.includes('standard complete platinum') || q.includes('platinum')) extracted.family = 'Standard Complete Platinum';
    else if (q.includes('classic')) extracted.family = 'Classic';

    if (containsAny(['promotion', 'sale', 'discount', 'coupon', 'financing'])) extracted.wantsPromo = true;

    if (
      partMatch ||
      containsAny(['part', 'replacement', 'buy', 'order', 'sku', 'view/buy', 'add to cart', 'price', 'bag', 'hose', 'clamp'])
    ) {
      return { intent: 'parts', extracted };
    }
    if (containsAny(['engine', 'fit', 'fits', 'fitment', 'compatible', 'compatibility', 'which engine', 'used in']) || yearRegex.test(q)) {
      return { intent: 'compatibility', extracted };
    }
    if (containsAny(['how to', 'install', 'installation', 'guide', 'manual', 'troubleshoot', 'troubleshooting', 'winterization', 'sop'])) {
      return { intent: 'sop', extracted };
    }
    if (containsAny(['compare', 'benefits', 'why choose', 'financing', 'promotion', 'warranty'])) {
      return { intent: 'marketing', extracted };
    }
    return { intent: 'general', extracted };
  }

  // Per-intent options for the single Tractor index.
  _optionsForIntent(intent, extracted = {}) {
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
      'last_updated',
      'tractor_make',
      'tractor_model',
      'tractor_deck_size',
      'group_name',
      'is_active',
      'mda_sku',
      'ammda_sku',
      'hitch_sku',
      'amhitch_sku',
      'rubbercollar_sku',
      'hose_sku',
      'amhose_sku',
      'upgradehose_sku',
      'amupgradehose_sku',
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
      let filter;
      if (pn) {
        const eqs = skuFields.map((f) => `${f} eq '${this._escapeLiteral(pn)}'`).join(' or ');
        filter = eqs || undefined;
      }
      return maybe({ filter, searchFields: this.searchFields }, baseSelect);
    }

    if (intent === 'compatibility') {
      // Build progressively strict filters
      const filts = [];
      if (extracted.make) filts.push(`tractor_make eq '${this._escapeLiteral(extracted.make)}'`);
      if (extracted.model) filts.push(`tractor_model eq '${this._escapeLiteral(extracted.model)}'`);
      if (extracted.deckSize) filts.push(`tractor_deck_size eq '${this._escapeLiteral(extracted.deckSize)}'`);
      if (extracted.family) filts.push(`group_name eq '${this._escapeLiteral(this._familyAliases(extracted.family))}'`);
      const filter = filts.length ? filts.map((f) => `(${f})`).join(' and ') : undefined;
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

  async _call(data) {
    const { query, top: topIn, make, model, deck_size, family, sku, part_type, require_active, relaxed } = data;
    const finalTop = typeof topIn === 'number' && Number.isFinite(topIn) ? Math.max(1, Math.floor(topIn)) : this.top;

    try {
      const inferredMode = (() => {
        const q = (query || '').toString();
        if (/".+"/.test(q) || /\b(AND|OR|NOT)\b/i.test(q)) return 'all';
        return 'any';
      })();

      const baseOptions = {
        queryType: 'semantic',
        searchMode: inferredMode,
        top: finalTop,
        semanticSearchOptions: {
          configurationName: this.semanticConfiguration,
          queryLanguage: this.queryLanguage,
        },
        answers: 'extractive',
        captions: 'extractive',
        speller: 'lexicon',
        select: this.returnAllFields ? undefined : this.select,
      };
      if (this.scoringProfile) baseOptions.scoringProfile = this.scoringProfile;

      const { intent, extracted } = this._detectIntent(query);
      const merged = {
        ...extracted,
        make: make || extracted.make,
        model: model || extracted.model,
        deckSize: this._normalizeDeckSize(deck_size) || extracted.deckSize,
        family: Array.isArray(family)
          ? (family.find(Boolean) ? this._familyAliases(family[0]) : undefined)
          : (family ? this._familyAliases(family) : extracted.family),
        partType: part_type || extracted.partType,
        partNumber: sku || extracted.partNumber,
      };

      const intentOptions = this._optionsForIntent(intent, merged);
      let options = { ...baseOptions, ...intentOptions };

      // Relaxed mode: remove strict filters and broaden recall
      if (relaxed === true) {
        delete options.filter;
        options.top = Math.max(options.top || this.top, 18);
        // Prefer any-mode to catch more matches in broad searches
        options.searchMode = 'any';
      }
      // SKU prioritization
      if (merged.partNumber) {
        const skuFields = ['mda_sku','ammda_sku','hitch_sku','amhitch_sku','rubbercollar_sku','hose_sku','amhose_sku','upgradehose_sku','amupgradehose_sku'];
        const eqs = skuFields.map((f) => `${f} eq '${this._escapeLiteral(merged.partNumber)}'`).join(' or ');
        options.filter = options.filter ? `(${options.filter}) and (${eqs})` : `(${eqs})`;
      }
      if (require_active === true) {
        options.filter = options.filter ? `(${options.filter}) and (is_active eq true)` : '(is_active eq true)';
      }

      // orderBy not supported with semantic ranking
      if (String(options.queryType).toLowerCase() === 'semantic' && options.orderBy) {
        delete options.orderBy;
      }

      let docs = await this._tieredSearch(query, options);
      // If no hits, relax filters: drop family -> deck -> model
      if (Array.isArray(docs) && docs.length === 0 && options.filter && relaxed !== true) {
        const dropOne = (flt, key) => {
          // remove the first occurrence of a condition with the given key
          const re = new RegExp(`\\(\n?\s*${key}[^)]*\)`, 'i');
          return flt.replace(re, '').replace(/\)\s*and\s*\(/g, ') and (').replace(/\(\s*\)/g, '');
        };
        const keys = ['group_name', 'tractor_deck_size', 'tractor_model'];
        for (const k of keys) {
          if (!options.filter) break;
          const nf = dropOne(options.filter, k + '\\s+eq');
          const relaxed = { ...options, filter: nf };
          const r = await this._tieredSearch(query, relaxed);
          if (Array.isArray(r) && r.length > 0) {
            docs = r;
            break;
          }
        }
      }
      // Attach normalized compatibility projection and provenance to each doc
      if (Array.isArray(docs)) {
        docs = docs.map((d) => (d ? this._normalizeDoc(d) : d));
      }
      logger.info('[woodland-ai-search-tractor] Query done', { count: Array.isArray(docs) ? docs.length : 0 });

      return JSON.stringify(docs || []);
    } catch (error) {
      logger.error('[woodland-ai-search-tractor] Azure AI Search request failed', {
        error: error?.message || String(error),
      });
      const msg = (error && (error.message || String(error))) || 'Unknown error';
      return `AZURE_SEARCH_FAILED: ${msg}`;
    }
  }
}

module.exports = WoodlandAISearchTractor;
