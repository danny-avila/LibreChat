// woodland-ai-search-catalog.js (single-index)
const crypto = require('node:crypto');
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');
const TTLCache = require('../util/ttlCache');

const DEFAULT_CACHE_TTL_MS = Number(process.env.WOODLAND_SEARCH_CACHE_TTL_MS ?? 10_000);
const DEFAULT_CACHE_MAX = Number(process.env.WOODLAND_SEARCH_CACHE_MAX_ENTRIES ?? 200);
const DEFAULT_EXTRACTIVE = String(process.env.WOODLAND_SEARCH_ENABLE_EXTRACTIVE ?? 'false')
  .toLowerCase()
  .trim() === 'true';

class WoodlandAISearchCatalog extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 5;
  static DEFAULT_SELECT ="*";
  static DEFAULT_VECTOR_K = 15;
  static DEFAULT_VECTOR_FIELDS = ''; // e.g., "contentVector,titleVector"

  _env(v, fallback) {
    return v ?? fallback;
  }

  _provenance(d) {
    try {
      let url = (typeof d?.url === 'string' && d.url) || '';
      if (url && this.baseUrl && !/^https?:\/\//i.test(url)) {
        url = this.baseUrl.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
      }
      const host = url ? new URL(url).hostname : undefined;
      return { url: url || undefined, host, site: d?.site, page_type: d?.page_type };
    } catch (_) {
      return { site: d?.site, page_type: d?.page_type };
    }
  }

  _normalizeDoc(d) {
    const str = (v) => (v == null ? undefined : String(v));
    const num = (v) => (v == null || v === '' ? undefined : Number(v));
    const bool = (v) => (v == null ? undefined : Boolean(v));
    const list = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== '').map(String) : undefined);

    const provenance = this._provenance(d);
    const title = str(d?.title) || str(d?.product_name);
    const sku = str(d?.sku) || str(d?.product_sku);
    const thePrice = num(d?.price);
    const availability = str(d?.availability) || str(d?.status);

    const citationLabel = sku ? `${title || 'Product'} — ${sku}` : (title || 'Product');
    const citationUrl = provenance?.url;
    const citationMarkdown = citationUrl ? `[${citationLabel}](${citationUrl})` : citationLabel;

    const normalized = {
      sku,
      title,
      url: provenance?.url,
      price: thePrice,
      old_price: num(d?.old_price),
      catalog_price: num(d?.catalog_price),
      availability,
      stock_quantity: num(d?.stock_quantity),
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
      provenance,
      citation: {
        label: citationLabel,
        url: citationUrl,
        markdown: citationMarkdown,
      },
    };

    return { ...d, normalized_catalog: normalized };
  }

  constructor(fields = {}) {
    super();
    logger.info('[woodland-ai-search-catalog:init] Constructor invoked');
    this.name = 'woodland-ai-search-catalog';
    this.description =
      "Use the 'woodland-ai-search-catalog' tool to answer questions from the Catalog Azure AI Search index";

    this.schema = z.object({
      query: z.string().describe('Question or search phrase for Catalog index'),
      top: z.number().int().positive().optional(),
      select: z.string().optional().describe('Comma-separated list of fields to return'),
      filter: z.string().optional().describe('OData filter'),
      embedding: z.array(z.number()).min(8).optional().describe('Optional dense embedding for hybrid/vector search'),
      vectorK: z.number().int().positive().optional().describe('k for vector search'),
      answers: z.enum(['extractive', 'none']).optional(),
      captions: z.enum(['extractive', 'none']).optional(),
      speller: z.enum(['lexicon', 'simple', 'none']).optional(),
      queryLanguage: z.string().optional(),
      searchFields: z.string().optional().describe('Comma-separated search fields override'),
      disableCache: z.boolean().optional().describe('Skips shared result caching when true'),
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
        ) || this._env(fields.AZURE_AI_SEARCH_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_SEARCH_FIELDS);
      if (v) return String(v).split(',').map((s) => s.trim()).filter(Boolean);
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

    // Vector options
    this.vectorFields = (() => {
      const v =
        this._env(
          fields.AZURE_AI_SEARCH_CATALOG_VECTOR_FIELDS,
          process.env.AZURE_AI_SEARCH_CATALOG_VECTOR_FIELDS,
        ) ||
        this._env(fields.AZURE_AI_SEARCH_VECTOR_FIELDS, process.env.AZURE_AI_SEARCH_VECTOR_FIELDS) ||
        WoodlandAISearchCatalog.DEFAULT_VECTOR_FIELDS;
      return String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
    })();
    this.vectorK = Number(
      this._env(fields.AZURE_AI_SEARCH_CATALOG_VECTOR_K, process.env.AZURE_AI_SEARCH_CATALOG_VECTOR_K) ||
        this._env(fields.AZURE_AI_SEARCH_VECTOR_K, process.env.AZURE_AI_SEARCH_VECTOR_K) ||
        WoodlandAISearchCatalog.DEFAULT_VECTOR_K,
    );

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

    const extractiveEnabled = String(
      this._env(fields.WOODLAND_SEARCH_ENABLE_EXTRACTIVE, process.env.WOODLAND_SEARCH_ENABLE_EXTRACTIVE) ??
        DEFAULT_EXTRACTIVE,
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
      semanticConfiguration: this.semanticConfiguration,
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

        if (/orderby/i.test(msg) && String(sanitized.queryType).toLowerCase() === 'semantic') {
          if (sanitized.orderBy) {
            delete sanitized.orderBy;
            changed = true;
            logger.info('[woodland-ai-search-catalog] Removing orderBy for semantic query and retrying');
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
              logger.info('[woodland-ai-search-catalog] Dropping filter due to unknown fields and retrying');
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
      typeof topIn === 'number' && Number.isFinite(topIn) ? Math.max(1, Math.floor(topIn)) : this.top;

    // Per-call overrides
    const perCallSelect =
      typeof data?.select === 'string'
        ? data.select.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
    const perCallSearchFields =
      typeof data?.searchFields === 'string'
        ? data.searchFields.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
    const perCallAnswers = data?.answers;
    const perCallCaptions = data?.captions;
    const perCallSpeller = data?.speller;
    const perCallQueryLanguage = data?.queryLanguage;
    const filter = typeof data?.filter === 'string' && data.filter.trim() ? data.filter.trim() : undefined;
    const embedding = Array.isArray(data?.embedding) ? data.embedding : undefined;
    const vectorK = Number.isFinite(data?.vectorK) ? Number(data.vectorK) : this.vectorK;
    const disableCache = data?.disableCache === true;

    try {
      const inferredMode = (() => {
        const q = (query || '').toString();
        if (/".+"/.test(q) || /\b(AND|OR|NOT)\b/i.test(q)) return 'all';
        return 'any';
      })();

      const options = {
        queryType: 'semantic',
        searchMode: inferredMode,
        top: finalTop,
        filter,
        semanticSearchOptions: {
          configurationName: this.semanticConfiguration,
          queryLanguage: perCallQueryLanguage || this.queryLanguage,
        },
        speller: perCallSpeller || 'lexicon',
      };

      const answersMode =
        perCallAnswers === 'extractive' || perCallAnswers === 'none'
          ? perCallAnswers
          : this.defaultAnswerMode;
      const captionsMode =
        perCallCaptions === 'extractive' || perCallCaptions === 'none'
          ? perCallCaptions
          : this.defaultCaptionMode;

      if (answersMode === 'extractive') {
        options.answers = 'extractive';
      }

      if (captionsMode === 'extractive') {
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

      let cacheKey;
      if (this.cache && !disableCache && !embedding) {
        const descriptor = {
          query,
          top: finalTop,
          filter,
          select: (perCallSelect || (!this.returnAllFields ? this.select : undefined))?.slice().sort(),
          searchFields: (perCallSearchFields || this.searchFields)?.slice().sort(),
          answers: answersMode,
          captions: captionsMode,
          speller: perCallSpeller || 'lexicon',
          queryLanguage: perCallQueryLanguage || this.queryLanguage,
        };
        cacheKey = crypto.createHash('sha1').update(JSON.stringify(descriptor)).digest('hex');
        const cached = this.cache.get(cacheKey);
        if (cached) {
          logger.debug('[woodland-ai-search-catalog] Returning cached response', {
            query,
            top: finalTop,
          });
          return cached;
        }
      }

      const docs = await this._safeSearch(query, options);
      let payload = docs.docs || [];
      if (Array.isArray(payload)) {
        payload = payload.map((d) => (d ? this._normalizeDoc(d) : d));
      }
      logger.info('[woodland-ai-search-catalog] Query done', {
        count: Array.isArray(payload) ? payload.length : 0,
        vectorUsed: Array.isArray(options.vectorQueries) && options.vectorQueries.length > 0,
        top: finalTop,
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
