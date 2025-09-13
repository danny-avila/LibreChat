// woodland-ai-search.js (multi-index)
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

class WoodlandAISearch extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 9;
  // Default select is intentionally minimal; per-intent selects override
  static DEFAULT_SELECT = 'id,title,content,url';
  static GROUPS = ['airtable', 'cyclopedia', 'website'];

  _env(v, fallback) {
    return v ?? fallback;
  }

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search';
    this.description = "Use the 'woodland-ai-search' tool to retrieve search results relevant to your input";

    // Minimal schema: the agent provides only the query and optional top
    this.schema = z.object({
      query: z.string().describe('Search word or phrase to woodland-ai-search'),
      top: z.number().int().positive().optional(),
    });

    // Required env/config (shared endpoint + key)
    this.serviceEndpoint = this._env(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
    );
    this.apiKey = this._env(fields.AZURE_AI_SEARCH_API_KEY, process.env.AZURE_AI_SEARCH_API_KEY);

    // Per-index names
    this.airtableIndex = this._env(
      fields.AZURE_AI_SEARCH_AIRTABLE_INDEX,
      process.env.AZURE_AI_SEARCH_AIRTABLE_INDEX,
    );
    this.websiteIndex = this._env(
      fields.AZURE_AI_SEARCH_WEBSITE_INDEX,
      process.env.AZURE_AI_SEARCH_WEBSITE_INDEX,
    );
    this.cyclopediaIndex = this._env(
      fields.AZURE_AI_SEARCH_CYCLOPEDIA_INDEX,
      process.env.AZURE_AI_SEARCH_CYCLOPEDIA_INDEX,
    );

    if (!this.serviceEndpoint || !this.apiKey || !this.airtableIndex || !this.websiteIndex || !this.cyclopediaIndex) {
      throw new Error(
        'Missing one or more Azure AI Search envs: AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_API_KEY, AZURE_AI_SEARCH_AIRTABLE_INDEX, AZURE_AI_SEARCH_WEBSITE_INDEX, AZURE_AI_SEARCH_CYCLOPEDIA_INDEX.',
      );
    }

    // Optional API version
    this.apiVersion = this._env(
      fields.AZURE_AI_SEARCH_API_VERSION,
      process.env.AZURE_AI_SEARCH_API_VERSION || WoodlandAISearch.DEFAULT_API_VERSION,
    );

    // Simple defaults
    this.top = WoodlandAISearch.DEFAULT_TOP;
    this.select = WoodlandAISearch.DEFAULT_SELECT.split(',').map((s) => s.trim());

    // Mode and semantic options
    this.enablePerSourceQueries = String(this._env(fields.AZURE_AI_SEARCH_ENABLE_PER_SOURCE_QUERIES, process.env.AZURE_AI_SEARCH_ENABLE_PER_SOURCE_QUERIES || 'true')).toLowerCase() === 'true';
    this.perSourceTop = Number(this._env(fields.AZURE_AI_SEARCH_PER_SOURCE_TOP, process.env.AZURE_AI_SEARCH_PER_SOURCE_TOP || 3));
    this.defaultSources = (this._env(fields.AZURE_AI_SEARCH_DEFAULT_SOURCES, process.env.AZURE_AI_SEARCH_DEFAULT_SOURCES) || WoodlandAISearch.GROUPS.join(','))
      .split(',').map(s => s.trim()).filter(Boolean);
    this.searchFields = (() => {
      const v = this._env(fields.AZURE_AI_SEARCH_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_SEARCH_FIELDS);
      if (!v) return undefined;
      return String(v).split(',').map(s => s.trim()).filter(Boolean);
    })();
    this.semanticConfiguration = this._env(fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION, process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION || 'sem1');
    this.queryLanguage = this._env(fields.AZURE_AI_SEARCH_QUERY_LANGUAGE, process.env.AZURE_AI_SEARCH_QUERY_LANGUAGE || 'en-us');
    this.scoringProfile = this._env(fields.AZURE_AI_SEARCH_SCORING_PROFILE, process.env.AZURE_AI_SEARCH_SCORING_PROFILE);
    this.hardFilter = String(this._env(fields.AZURE_AI_SEARCH_HARD_FILTER, process.env.AZURE_AI_SEARCH_HARD_FILTER || 'true')).toLowerCase() === 'true';
    // Always return all fields unless explicitly disabled
    this.returnAllFields = String(this._env(fields.AZURE_AI_SEARCH_RETURN_ALL_FIELDS, process.env.AZURE_AI_SEARCH_RETURN_ALL_FIELDS || 'true')).toLowerCase() === 'true';

    // Initialize one SearchClient per index
    const credential = new AzureKeyCredential(this.apiKey);
    this.clients = {
      airtable: new SearchClient(this.serviceEndpoint, this.airtableIndex, credential, { apiVersion: this.apiVersion }),
      website: new SearchClient(this.serviceEndpoint, this.websiteIndex, credential, { apiVersion: this.apiVersion }),
      cyclopedia: new SearchClient(this.serviceEndpoint, this.cyclopediaIndex, credential, { apiVersion: this.apiVersion }),
    };

    logger.info('[woodland-ai-search] Initialized', {
      endpoint: this.serviceEndpoint,
      apiVersion: this.apiVersion,
      indexes: {
        airtable: this.airtableIndex,
        website: this.websiteIndex,
        cyclopedia: this.cyclopediaIndex,
      },
      enablePerSourceQueries: this.enablePerSourceQueries,
      perSourceTop: this.perSourceTop,
      defaultSources: this.defaultSources,
      select: this.select,
      searchFields: this.searchFields,
      semanticConfiguration: this.semanticConfiguration,
      queryLanguage: this.queryLanguage,
      scoringProfile: this.scoringProfile,
      hardFilter: this.hardFilter
    });
  }

  // Utility to generate a stable key for deduplication
  _keyOf(d) {
    return d?.url || d?.id || d?.record_id || d?.key || JSON.stringify(d);
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

  async _safeSearch(query, options, client) {
    const run = async (opts) => {
      const send = this._sanitizeSearchOptions(opts);
      logger.debug('[woodland-ai-search] Sending request', { query, options: JSON.stringify(send, null, 2) });
      const rs = await client.search(query, send);
      const items = [];
      for await (const r of rs.results) items.push(r.document);
      logger.debug('[woodland-ai-search] Received response', {
        count: items.length,
        sample: items.slice(0, 2),
      });
      return items;
    };

    try {
      const docs = await run(options);
      return { docs, retried: false };
    } catch (err) {
      logger.warn('[woodland-ai-search] Initial search failed');
      const msg = (err && (err.message || String(err))) || '';

      const sanitized = { ...options };
      let changed = false;

      // If orderBy not supported with semantic, remove and retry
      if (/orderby/i.test(msg) && String(sanitized.queryType).toLowerCase() === 'semantic') {
        if (sanitized.orderBy) {
          delete sanitized.orderBy;
          changed = true;
          logger.info('[woodland-ai-search] Removing orderBy for semantic query and retrying');
        }
      }

      // Remove unknown fields from select/searchFields
      const unknownFieldRegex = /Unknown field '([^']+)'/g;
      const toRemove = [];
      let m;
      while ((m = unknownFieldRegex.exec(msg)) !== null) {
        const fld = (m[1] || '').trim();
        if (fld) toRemove.push(fld);
      }
      if (toRemove.length > 0 && /search field list|select/i.test(msg)) {
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
        if (changed) {
          logger.info('[woodland-ai-search] Retrying without unknown fields');
        }
      }

      if (!changed) {
        throw err;
      }

      const docs = await run(sanitized);
      return { docs, retried: true };
    }
  }

  // Backwards-compat placeholder: not used in multi-index mode
  _buildSourceFilter() { return undefined; }

  /** Facet snapshot to see actual values present in 'source' and 'collection' */
  async _facetSnapshot() {
    // In multi-index mode, facet snapshot on 'source/collection' is not relevant.
    logger.debug('[woodland-ai-search] Facet snapshot skipped for multi-index');
    return { source: [], collection: [] };
  }

  async _tieredSearch(query, baseOptions, client) {
    // 1) try as-is
    let r = await this._safeSearch(query, baseOptions, client);
    if (r.docs?.length) return r.docs;

    // 2) if semantic, retry simple then simple(no searchFields)
    const toSimple = (opt) => {
      const o = { ...opt, queryType: 'simple' };
      delete o.semanticSearchOptions;
      delete o.semanticConfiguration;
      delete o.semanticConfigurationName;
      return o;
    };
    if (String(baseOptions.queryType).toLowerCase() === 'semantic') {
      r = await this._safeSearch(query, toSimple(baseOptions), client);
      if (r.docs?.length) return r.docs;

      const noFields = toSimple(baseOptions);
      if (Array.isArray(noFields.searchFields)) delete noFields.searchFields;
      r = await this._safeSearch(query, noFields, client);
      if (r.docs?.length) return r.docs;
    }
    return [];
  }

  // Run tiered search against a specific index, with per-index options
  async _searchIndex(indexName, query, options) {
    const client = this.clients[indexName];
    if (!client) {
      logger.warn('[woodland-ai-search] Unknown index for _searchIndex', { index: indexName });
      return [];
    }
    const docs = await this._tieredSearch(query, options, client);
    // Annotate provenance
    const annotated = (docs || []).map(d => ({ ...d, index: indexName }));
    logger.info('[woodland-ai-search] Index query done', { index: indexName, docs: annotated.length });
    return annotated;
  }

  // Multi-index search and interleave
  async _searchAcrossIndexes(query, baseOptions, indexList, perIndexTop, finalTop, perIndexOptionsMap = {}) {
    logger.info('[woodland-ai-search] Running per-index queries', {
      indexes: indexList, perIndexTop, finalTop
    });

    const tasks = indexList.map(async (idx) => {
      const opt = { ...baseOptions, ...(perIndexOptionsMap[idx] || {}), top: perIndexTop };
      // Attach semantic options safely per index
      if (String(opt.queryType).toLowerCase() === 'semantic') {
        opt.semanticSearchOptions = {
          configurationName: this.semanticConfiguration,
          queryLanguage: this.queryLanguage,
        };
        opt.answers = 'extractive';
        opt.captions = 'extractive';
        opt.speller = 'lexicon';
        // Azure doesn't allow orderBy with semantic ranking
        if (opt.orderBy) delete opt.orderBy;
      }

      logger.info('[woodland-ai-search] Per-index query start', {
        index: idx, top: perIndexTop, select: opt.select, filter: opt.filter, orderBy: opt.orderBy
      });
      const docs = await this._searchIndex(idx, query, opt);
      return { index: idx, docs };
    });

    const results = await Promise.all(tasks);

    // Interleave equally across indexes
    const out = [];
    const seen = new Set();
    for (let i = 0; out.length < finalTop; i++) {
      let pushedAny = false;
      for (const { docs } of results) {
        if (i < docs.length) {
          const k = this._keyOf(docs[i]);
          if (!seen.has(k)) {
            seen.add(k);
            out.push(docs[i]);
            pushedAny = true;
            if (out.length >= finalTop) break;
          }
        }
      }
      if (!pushedAny) break;
    }

    logger.debug('[woodland-ai-search] Per-index merged results', {
      total: out.length,
      breakdown: results.map(r => ({ index: r.index, count: r.docs.length })),
    });

    return out;
  }

  // Build per-index selects/filters based on detected intent and extracted entities
  _optionsByIndexForIntent(intent, extracted = {}) {
    const opts = {};
    const partNum = extracted.partNumber;
    const maybe = (o, sel) => (this.returnAllFields ? o : { ...o, select: sel });

    if (intent === 'parts') {
      // Airtable first: only parts
      opts.airtable = maybe({
        filter: partNum ? `(type eq 'part') and (part_number eq '${partNum}')` : `type eq 'part'`,
        orderBy: ['last_updated desc'],
      }, ['title','content','part_number','part_type','categories','canonical_product_url','last_updated','airtable_record_url','id']);
      // Website: product pages, optionally mention part
      opts.website = maybe({
        filter: partNum ? `mentioned_parts/any(p: p eq '${partNum}') or sku eq '${partNum}' or skus/any(s: s eq '${partNum}')` : `page_type eq 'product_marketing'`,
        orderBy: ['last_crawled desc'],
      }, ['title','content','url','site','last_crawled','id']);
      // Cyclopedia usually not primary for parts; leave minimal
      opts.cyclopedia = maybe({
        filter: partNum ? `mentioned_parts/any(p: p eq '${partNum}')` : undefined,
        orderBy: ['last_updated desc'],
      }, ['title','content','url','site','page_type','breadcrumb','last_updated','id']);
    } else if (intent === 'sop') {
      // Cyclopedia SOP/support
      opts.cyclopedia = maybe({
        filter: `audience eq 'internal' or page_type eq 'maintenance_guide'`,
        orderBy: ['last_updated desc','section_order asc'],
      }, ['title','content','url','site','page_type','breadcrumb','audience','last_updated','toc_items','id']);
      // Airtable support
      opts.airtable = maybe({
        filter: `type eq 'support'`,
        orderBy: ['last_updated desc'],
      }, ['title','content','last_updated','type','source_table','airtable_record_url','doc360_url','id']);
      // Website generic
      opts.website = maybe({
        orderBy: ['last_crawled desc'],
      }, ['title','content','url','site','page_type','breadcrumb','last_crawled','id']);
    } else if (intent === 'marketing') {
      opts.website = maybe({
        filter: `page_type eq 'product_marketing'`,
        orderBy: ['last_crawled desc'],
      }, ['title','content','url','site','page_type','headings','breadcrumb','last_crawled','id']);
      // Supplementary indexes, loose filters
      opts.airtable = maybe({ orderBy: ['last_updated desc'] }, ['title','content','last_updated','source_table','airtable_record_url','id']);
      opts.cyclopedia = maybe({ orderBy: ['last_updated desc'] }, ['title','content','url','site','page_type','breadcrumb','last_updated','id']);
    } else {
      // general
      opts.airtable = maybe({ orderBy: ['last_updated desc'] }, ['title','content','last_updated','airtable_record_url','id']);
      opts.website = maybe({ orderBy: ['last_crawled desc'] }, ['title','content','url','site','last_crawled','id']);
      opts.cyclopedia = maybe({ orderBy: ['last_updated desc'] }, ['title','content','url','site','page_type','last_updated','id']);
    }

    return opts;
  }

  // Detect intent and entities
  _detectIntent(query) {
    const q = (query || '').toString().toLowerCase();
    const containsAny = (arr) => arr.some(w => q.includes(w));
    // SKU/part pattern like 05-03-308 or 01-xx-xxx
    const partRegex = /\b\d{2}-[a-z0-9]{2}-[a-z0-9]{3,}\b/i;
    const partMatch = q.match(partRegex);
    const extracted = {};
    if (partMatch) extracted.partNumber = partMatch[0];

    if (partMatch || containsAny(['part','replacement','buy','sku'])) {
      return { intent: 'parts', indexes: ['airtable','website'], extracted };
    }
    if (containsAny(['how to','install','installation','guide','manual'])) {
      return { intent: 'sop', indexes: ['cyclopedia'], extracted };
    }
    if (containsAny(['compare','benefits','why choose'])) {
      return { intent: 'marketing', indexes: ['website'], extracted };
    }
    return { intent: 'general', indexes: WoodlandAISearch.GROUPS, extracted };
  }

  async _call(data) {
    const { query, top: topIn } = data;
    const finalTop = typeof topIn === 'number' && Number.isFinite(topIn) ? Math.max(1, Math.floor(topIn)) : this.top;

    try {
      // No-op in multi-index mode
      await this._facetSnapshot();
      // Heuristic search mode
      const inferredMode = (() => {
        const q = (query || '').toString();
        if (/".+"/.test(q) || /\b(AND|OR|NOT)\b/i.test(q)) return 'all';
        return 'any';
      })();

      // Base options with semantic (new + legacy fields for compatibility)
      const baseOptions = {
        queryType: 'semantic',
        searchMode: inferredMode,
        top: finalTop,
        semanticSearchOptions: {
          configurationName: this.semanticConfiguration,
          queryLanguage: this.queryLanguage
        },
        answers: 'extractive',
        captions: 'extractive',
        speller: 'lexicon'
      };
      if (this.scoringProfile) baseOptions.scoringProfile = this.scoringProfile;
      if (Array.isArray(this.searchFields) && this.searchFields.length) {
        baseOptions.searchFields = this.searchFields;
      }

      // Intent routing
      const { intent, indexes, extracted } = this._detectIntent(query);
      const perIndexOptions = this._optionsByIndexForIntent(intent, extracted);
      const indexList = indexes;

      // Run multi-index queries and interleave
      const perIndexTop = Math.max(1, Math.ceil(finalTop / Math.max(1, indexList.length)));
      const merged = await this._searchAcrossIndexes(
        query,
        { ...baseOptions },
        indexList,
        perIndexTop,
        finalTop,
        perIndexOptions,
      );

      // If we came up short, try a broader pass across all indexes with larger top
      let result = merged;
      if (result.length < finalTop) {
        const broaderIndexes = WoodlandAISearch.GROUPS;
        const broaderPerIndexOptions = this._optionsByIndexForIntent('general', extracted);
        const sampleTop = Math.max(120, finalTop * 6);
        const broader = await this._searchAcrossIndexes(
          query,
          { ...baseOptions, top: sampleTop },
          broaderIndexes,
          Math.max(3, Math.ceil(sampleTop / broaderIndexes.length)),
          finalTop,
          broaderPerIndexOptions,
        );
        // Merge while keeping uniques and limit to finalTop
        const seen = new Set(result.map(d => this._keyOf(d)));
        for (const d of broader) {
          const k = this._keyOf(d);
          if (!seen.has(k)) {
            seen.add(k);
            result.push(d);
            if (result.length >= finalTop) break;
          }
        }
      }

      return JSON.stringify(result);
    } catch (error) {
      logger.error('Azure AI Search request failed', { error: error?.message || String(error) });
      const msg = (error && (error.message || String(error))) || 'Unknown error';
      return `AZURE_SEARCH_FAILED: ${msg}`;
    }
  }
}

module.exports = WoodlandAISearch;
