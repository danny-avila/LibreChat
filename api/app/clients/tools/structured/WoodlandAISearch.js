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
  static GROUPS = ['catalog', 'cyclopedia', 'website'];

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
    this.catalogIndex = this._env(
      fields.AZURE_AI_SEARCH_CATALOG_INDEX,
      process.env.AZURE_AI_SEARCH_CATALOG_INDEX,
    );
    this.websiteIndex = this._env(
      fields.AZURE_AI_SEARCH_WEBSITE_INDEX,
      process.env.AZURE_AI_SEARCH_WEBSITE_INDEX,
    );
    this.cyclopediaIndex = this._env(
      fields.AZURE_AI_SEARCH_CYCLOPEDIA_INDEX,
      process.env.AZURE_AI_SEARCH_CYCLOPEDIA_INDEX,
    );

    if (!this.serviceEndpoint || !this.apiKey || !this.catalogIndex || !this.websiteIndex || !this.cyclopediaIndex) {
      throw new Error(
        'Missing one or more Azure AI Search envs: AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_API_KEY, AZURE_AI_SEARCH_CATALOG_INDEX, AZURE_AI_SEARCH_WEBSITE_INDEX, AZURE_AI_SEARCH_CYCLOPEDIA_INDEX.',
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
      // Prefer configured search fields; otherwise default to high-signal human fields
      const v = this._env(fields.AZURE_AI_SEARCH_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_SEARCH_FIELDS);
      if (v) return String(v).split(',').map(s => s.trim()).filter(Boolean);
      return ['title','content','categories','category_paths','promotion_names','part_numbers','sku'];
    })();
    // Optional per-index search field overrides
    const parseList = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : undefined);
    this.searchFieldOverrides = {
      catalog: parseList(this._env(fields.AZURE_AI_SEARCH_CATALOG_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_CATALOG_SEARCH_FIELDS)),
      website: parseList(this._env(fields.AZURE_AI_SEARCH_WEBSITE_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_WEBSITE_SEARCH_FIELDS)),
      cyclopedia: parseList(this._env(fields.AZURE_AI_SEARCH_CYCLOPEDIA_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_CYCLOPEDIA_SEARCH_FIELDS)),
    };
    this.semanticConfiguration = this._env(fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION, process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION || 'sem1');
    this.queryLanguage = this._env(fields.AZURE_AI_SEARCH_QUERY_LANGUAGE, process.env.AZURE_AI_SEARCH_QUERY_LANGUAGE || 'en-us');
    this.scoringProfile = this._env(fields.AZURE_AI_SEARCH_SCORING_PROFILE, process.env.AZURE_AI_SEARCH_SCORING_PROFILE);
    this.hardFilter = String(this._env(fields.AZURE_AI_SEARCH_HARD_FILTER, process.env.AZURE_AI_SEARCH_HARD_FILTER || 'true')).toLowerCase() === 'true';
    // Always return all fields unless explicitly disabled
    this.returnAllFields = String(this._env(fields.AZURE_AI_SEARCH_RETURN_ALL_FIELDS, process.env.AZURE_AI_SEARCH_RETURN_ALL_FIELDS || 'true')).toLowerCase() === 'true';
    // Link enrichment to attach website/cyclopedia URLs to catalog hits for citations
    this.enableLinkEnrichment = String(this._env(fields.AZURE_AI_SEARCH_ENABLE_LINK_ENRICHMENT, process.env.AZURE_AI_SEARCH_ENABLE_LINK_ENRICHMENT || 'true')).toLowerCase() === 'true';

    // Governance / guardrail flags
    this.enforceReviewedOnly = String(this._env(fields.AZURE_AI_SEARCH_ENFORCE_REVIEWED_ONLY, process.env.AZURE_AI_SEARCH_ENFORCE_REVIEWED_ONLY || 'true')).toLowerCase() === 'true';
    // Comma-separated domains to allow for Website results (e.g., "www.cyclonerake.com")
    this.websiteDomainAllowlist = (this._env(fields.AZURE_AI_SEARCH_WEBSITE_DOMAIN_ALLOWLIST, process.env.AZURE_AI_SEARCH_WEBSITE_DOMAIN_ALLOWLIST) || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Initialize one SearchClient per index
    const credential = new AzureKeyCredential(this.apiKey);
    this.clients = {
      catalog: new SearchClient(this.serviceEndpoint, this.catalogIndex, credential, { apiVersion: this.apiVersion }),
      website: new SearchClient(this.serviceEndpoint, this.websiteIndex, credential, { apiVersion: this.apiVersion }),
      cyclopedia: new SearchClient(this.serviceEndpoint, this.cyclopediaIndex, credential, { apiVersion: this.apiVersion }),
    };

    logger.info('[woodland-ai-search] Initialized', {
      endpoint: this.serviceEndpoint,
      apiVersion: this.apiVersion,
      indexes: {
        catalog: this.catalogIndex,
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
      hardFilter: this.hardFilter,
      enforceReviewedOnly: this.enforceReviewedOnly,
      websiteDomainAllowlist: this.websiteDomainAllowlist,
    });
  }

  // Utility to generate a stable key for deduplication
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
    // Escape single quotes for OData literal strings
    return String(v).replace(/'/g, "''");
  }

  _withReviewed(filter) {
    if (!this.enforceReviewedOnly) return filter;
    // Reviewed applies to website/cyclopedia documents; catalog may not carry 'reviewed'
    const reviewedClause = `reviewed eq true`;
    return this._andFilter(filter, reviewedClause);
  }

  _applySearchFields(indexKey, defaults) {
    const override = this.searchFieldOverrides?.[indexKey];
    if (Array.isArray(override) && override.length) return override;
    return defaults;
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
        logger.warn('[woodland-ai-search] Search failed', { attempt, msg: err?.message || String(err) });
        const msg = (err && (err.message || String(err))) || '';
        const sanitized = { ...opts };
        let changed = false;

        // Keep semantic; only adjust unsupported options
        if (/orderby/i.test(msg) && String(sanitized.queryType).toLowerCase() === 'semantic') {
          if (sanitized.orderBy) {
            delete sanitized.orderBy;
            changed = true;
            logger.info('[woodland-ai-search] Removing orderBy for semantic query and retrying');
          }
        }

        const unknownFieldRegex = /Unknown field '([^']+)'/g;
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
              logger.info('[woodland-ai-search] Dropping filter due to unknown fields and retrying');
            }
            if (sanitized.orderBy) {
              delete sanitized.orderBy;
              changed = true;
            }
          }
          if (changed) logger.info('[woodland-ai-search] Retrying without unknown fields');
        }
        // Final fallback: if still failing and searchFields remain, drop them entirely
        if (!changed && !droppedSearchFields && sanitized.searchFields) {
          delete sanitized.searchFields;
          droppedSearchFields = true;
          changed = true;
          logger.info('[woodland-ai-search] Dropping searchFields entirely and retrying');
        }

        if (!changed) break;
        opts = sanitized;
      }
    }
    throw lastErr;
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
    // Single-pass: always semantic (no downgrade)
    const r = await this._safeSearch(query, baseOptions, client);
    return r.docs ?? [];
  }

  // Run tiered search against a specific index, with per-index options
  async _searchIndex(indexName, query, options) {
    const client = this.clients[indexName];
    if (!client) {
      logger.warn('[woodland-ai-search] Unknown index for _searchIndex', { index: indexName });
      return [];
    }
    const docs = await this._tieredSearch(query, options, client);
    // Verbose logging: print a compact sample of Azure results for this index
    try {
      const sample = Array.isArray(docs)
        ? docs.slice(0, 5).map((d) => ({ id: d?.id, title: d?.title, url: d?.url }))
        : [];
      logger.info('[woodland-ai-search] Azure results sample', {
        index: indexName,
        count: Array.isArray(docs) ? docs.length : 0,
        sample,
      });
    } catch (e) {
      logger.debug('[woodland-ai-search] Failed to log results sample', { index: indexName, error: e?.message || String(e) });
    }
    // Annotate provenance
    const annotated = (docs || []).map(d => ({ ...d, index: indexName }));
    logger.info('[woodland-ai-search] Index query done', { index: indexName, docs: annotated.length });
    return annotated;
  }

  // Multi-index search and interleave
  async _searchAcrossIndexes(query, baseOptions, indexList, perIndexTop, finalTop, perIndexOptionsMap = {}, intent = 'general') {
    logger.info('[woodland-ai-search] Running per-index queries (ordered concat)', {
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

    // Build results ensuring at least some docs from each index (when available),
    // then fill remaining slots by priority: catalog → cyclopedia → website
    const out = [];
    const seen = new Set();

    // Minimum quotas per index to guarantee Cyclopedia presence for SOP
    const minQuota = (() => {
      const q = { catalog: 1, cyclopedia: 1, website: 1 };
      if (intent === 'sop') {
        q.cyclopedia = Math.min(2, finalTop); // prioritize at least two SOP docs when possible
      }
      return q;
    })();

    // 1) Priming pass: satisfy per-index minimum quotas in priority order
    for (const idx of indexList) {
      const need = Math.max(0, Math.min(minQuota[idx] || 0, finalTop - out.length));
      if (need <= 0) continue;
      const bucket = results.find(r => r.index === idx)?.docs || [];
      let taken = 0;
      for (let i = 0; i < bucket.length && taken < need && out.length < finalTop; i++) {
        const d = bucket[i];
        const k = this._keyOf(d);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(d);
        taken++;
      }
      if (out.length >= finalTop) break;
    }

    // 2) Fill remaining slots by priority order
    if (out.length < finalTop) {
      for (const idx of indexList) {
        const bucket = results.find(r => r.index === idx)?.docs || [];
        for (let i = 0; i < bucket.length && out.length < finalTop; i++) {
          const d = bucket[i];
          const k = this._keyOf(d);
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(d);
        }
        if (out.length >= finalTop) break;
      }
    }

    logger.debug('[woodland-ai-search] Per-index merged results (quota+priority)', {
      total: out.length,
      breakdown: results.map(r => ({ index: r.index, count: r.docs.length })),
    });

    return out;
  }

  // Enrich results with cross-index links so the agent can always show Website (View/Buy) and Cyclopedia URLs in tables
  _enrichWithLinks(intent, extracted, results) {
    try {
      if (intent !== 'parts' || !Array.isArray(results) || results.length === 0) return results;

      // Build quick lookups by part number from website & cyclopedia
      const toArray = (x) => (Array.isArray(x) ? x : (x != null ? [x] : []));
      const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
      const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

      const websiteByPart = new Map();
      const cyclopediaByPart = new Map();

      for (const d of results) {
        const idx = d.index;
        if (idx === 'website') {
          const skus = new Set([...(toArray(d.skus)), d.sku]);
          const mentioned = new Set([...(toArray(d.mentioned_parts))]);
          const cands = uniq([...skus, ...mentioned].map(norm));
          for (const p of cands) {
            if (!p) continue;
            // Strict: only use the exact URL returned by search (do not synthesize)
            const u = typeof d.url === 'string' ? d.url : undefined;
            if (!u) continue;
            const arr = websiteByPart.get(p) || [];
            arr.push(u);
            websiteByPart.set(p, uniq(arr));
          }
        } else if (idx === 'cyclopedia') {
          const cands = new Set([...(toArray(d.mentioned_parts))]);
          // Fallback: try to detect part numbers mentioned in title/content
          const text = `${d.title || ''}\n${d.content || ''}`;
          const re = /\b\d{2}-[a-z0-9]{2}-[a-z0-9]{3,}\b/gi;
          let m;
          while ((m = re.exec(text)) !== null) {
            cands.add(m[0]);
          }
          for (const pRaw of cands) {
            const p = norm(pRaw);
            if (!p) continue;
            // Strict: only use the exact URL returned by search
            const u = typeof d.url === 'string' ? d.url : undefined;
            if (!u) continue;
            const arr = cyclopediaByPart.get(p) || [];
            arr.push(u);
            cyclopediaByPart.set(p, uniq(arr));
          }
        }
      }

      // Enrich Catalog part/SKU docs with website & cyclopedia links
      const out = results.map((d) => {
        if (d.index !== 'catalog') return d;
        // Prefer first part number; fallback to SKU
        const pn = (() => {
          const firstPn = Array.isArray(d.part_numbers) && d.part_numbers.length ? d.part_numbers[0] : '';
          if (firstPn) return norm(firstPn);
          return d.sku ? norm(d.sku) : '';
        })();
        if (!pn) return d;

        // Use URLs exactly as returned by Azure Search (no allowlist or modification)
        const primaryWebsite = typeof d.url === 'string' ? d.url : undefined;
        const crossWebsite = websiteByPart.get(pn) || [];
        const website_urls = uniq([primaryWebsite, ...crossWebsite].filter(Boolean));

        const crossCyclopedia = cyclopediaByPart.get(pn) || [];
        const cyclopedia_urls = uniq(crossCyclopedia.filter((u) => typeof u === 'string' && u));

        return {
          ...d,
          website_urls,
          website_url_primary: website_urls[0] || undefined,
          cyclopedia_urls,
        };
      });

      return out;
    } catch (e) {
      // If enrichment fails for any reason, return original results untouched
      return results;
    }
  }

  // Build per-index selects/filters based on detected intent and extracted entities
  _optionsByIndexForIntent(intent, extracted = {}) {
    const opts = {};
    const partNum = extracted.partNumber;
    const partType = extracted.partType; // e.g., 'collector bag', 'impeller', 'hose', 'recoil starter', 'boot plate', 'side tube'
    const family = extracted.family; // e.g., 'Classic', 'Commander Pro', 'Commercial PRO', 'Standard Complete Platinum'
    const wantsPromo = extracted.wantsPromo;
    const maybe = (o, sel) => (this.returnAllFields ? o : { ...o, select: sel });

    // Helper to constrain Website results to allowlisted domains
    const websiteDomainFilter = this.websiteDomainAllowlist.length
      ? this.websiteDomainAllowlist.map(d => `site eq '${d}'`).join(' or ')
      : undefined;

    if (intent === 'parts') {
      // Catalog: treat as primary part/SKU context for now
      const pn = partNum || '';
      const pnNoHyphen = pn ? pn.replace(/-/g, '') : '';
      const filters = [];
      if (pn) filters.push(`part_numbers/any(p: p eq '${this._escapeLiteral(pn)}') or part_numbers_hyphenless/any(p: p eq '${this._escapeLiteral(pnNoHyphen)}') or sku eq '${this._escapeLiteral(pn)}' or normalized_sku eq '${this._escapeLiteral(pnNoHyphen)}'`);
      if (partType) filters.push(`part_type/any(p: p eq '${this._escapeLiteral(partType)}')`);
      if (family) filters.push(`family eq '${this._escapeLiteral(family)}'`);
      const catalogFilter = filters.length ? filters.map(f => `(${f})`).join(' and ') : undefined;
      opts.catalog = maybe({
        filter: catalogFilter,
        orderBy: ['promotion_active desc','price_after_promo asc','price asc','last_updated desc'],
        searchFields: this._applySearchFields('catalog', ['title','content','sku','part_numbers'])
      }, ['id','title','content','url','sku','part_numbers','part_type','family','categories','category_paths','price','price_after_promo','promotion_names','availability','stock_quantity','installation_pdf_url','troubleshooting_pdf_url','safety_pdf_url','video_url','exploded_view_url']);

      // Website: prefer exact SKU/part hits; else fall back to product pages, reviewed only, allowlist
      const websiteFilterBase = partNum
        ? `mentioned_parts/any(p: p eq '${partNum}') or sku eq '${partNum}' or skus/any(s: s eq '${partNum}')`
        : `page_type eq 'product_marketing' or page_type eq 'other'`;
      const websiteFilter = this._withReviewed(this._andFilter(websiteFilterBase, websiteDomainFilter));
      opts.website = maybe({
        filter: websiteFilter,
        orderBy: ['last_crawled desc'],
        searchFields: this._applySearchFields('website', ['title','content','breadcrumb','page_type','headings','sku','skus','mentioned_parts'])
      }, ['title','content','url','site','last_crawled','sku','skus','mentioned_parts','id']);

      // Cyclopedia: include even without explicit part number, reviewed only
      const cycloBase = partNum
        ? `mentioned_parts/any(p: p eq '${partNum}')`
        : `search.ismatch('part OR replacement OR install OR hose OR bag OR clamp OR key OR electric start OR troubleshooting', 'title,content', 'simple', 'any')`;
      opts.cyclopedia = maybe({
        filter: this._withReviewed(cycloBase),
        orderBy: ['last_updated desc'],
        searchFields: this._applySearchFields('cyclopedia', ['title','content','breadcrumb','page_type','toc_items','mentioned_parts','audience'])
      }, ['title','content','url','site','page_type','breadcrumb','audience','last_updated','mentioned_parts','id']);
    } else if (intent === 'compatibility') {
      // Catalog: compatibility context (family/models)
      const filters = [];
      if (family) filters.push(`family eq '${this._escapeLiteral(family)}'`);
      if (partType) filters.push(`part_type/any(p: p eq '${this._escapeLiteral(partType)}')`);
      opts.catalog = maybe({
        filter: filters.length ? filters.map(f => `(${f})`).join(' and ') : undefined,
        orderBy: ['last_updated desc'],
        searchFields: this._applySearchFields('catalog', ['title','content'])
      }, ['id','title','content','url','categories','category_paths','family','compatible_models','part_type']);

      // Website: reviewed only, allowlist
      opts.website = maybe({
        filter: this._withReviewed(websiteDomainFilter),
        orderBy: ['last_crawled desc'],
        searchFields: this._applySearchFields('website', ['title','content','breadcrumb','page_type','headings'])
      }, ['title','content','url','site','page_type','breadcrumb','last_crawled','id']);

      // Cyclopedia: reviewed only
      opts.cyclopedia = maybe({
        filter: this._withReviewed(`audience eq 'internal' or page_type eq 'maintenance_guide' or page_type eq 'troubleshooting'`),
        orderBy: ['last_updated desc','section_order asc'],
        searchFields: this._applySearchFields('cyclopedia', ['title','content','breadcrumb','page_type','toc_items','audience'])
      }, ['title','content','url','site','page_type','breadcrumb','audience','last_updated','toc_items','id']);
    } else if (intent === 'sop') {
      // Cyclopedia SOP/support, reviewed only
      opts.cyclopedia = maybe({
        filter: this._withReviewed(`audience eq 'internal' or page_type eq 'maintenance_guide'`),
        orderBy: ['last_updated desc','section_order asc'],
        searchFields: this._applySearchFields('cyclopedia', ['title','content','breadcrumb','page_type','toc_items','audience'])
      }, ['title','content','url','site','page_type','breadcrumb','audience','last_updated','toc_items','id']);
      // Catalog doc pointers (if present)
      opts.catalog = maybe({
        filter: undefined,
        orderBy: ['last_updated desc'],
        searchFields: this._applySearchFields('catalog', ['title','content'])
      }, ['id','title','content','url','categories','category_paths','installation_pdf_url','troubleshooting_pdf_url','safety_pdf_url','video_url','exploded_view_url']);
      // Website generic, reviewed only, allowlist
      opts.website = maybe({
        filter: this._withReviewed(websiteDomainFilter),
        orderBy: ['last_crawled desc'],
      }, ['title','content','url','site','page_type','breadcrumb','last_crawled','id']);
    } else if (intent === 'marketing') {
      opts.website = maybe({
        filter: this._withReviewed(this._andFilter(`page_type eq 'product_marketing'`, websiteDomainFilter)),
        orderBy: ['last_crawled desc'],
        searchFields: this._applySearchFields('website', ['title','content','breadcrumb','page_type','headings'])
      }, ['title','content','url','site','page_type','headings','breadcrumb','last_crawled','id']);
      const promoFilter = wantsPromo ? `promotion_active eq true` : undefined;
      opts.catalog = maybe({
        filter: promoFilter,
        orderBy: ['promotion_active desc','price_after_promo asc','last_updated desc'],
      }, ['id','title','content','url','categories','category_paths','family','price_after_promo','promotion_names']);
      opts.cyclopedia = maybe({
        filter: this._withReviewed(undefined),
        orderBy: ['last_updated desc'],
        searchFields: this._applySearchFields('cyclopedia', ['title','content','breadcrumb','page_type'])
      }, ['title','content','url','site','page_type','breadcrumb','last_updated','id']);
    } else {
      // general
      opts.catalog = maybe({
        filter: undefined,
        orderBy: ['last_updated desc'],
        searchFields: this._applySearchFields('catalog', ['title','content'])
      }, ['id','title','content','url','categories','category_paths']);
      opts.website = maybe({
        filter: this._withReviewed(websiteDomainFilter),
        orderBy: ['last_crawled desc'],
        searchFields: this._applySearchFields('website', ['title','content','breadcrumb','page_type','headings'])
      }, ['title','content','url','site','last_crawled','id']);
      opts.cyclopedia = maybe({
        filter: this._withReviewed(undefined),
        orderBy: ['last_updated desc'],
        searchFields: this._applySearchFields('cyclopedia', ['title','content','breadcrumb','page_type'])
      }, ['title','content','url','site','page_type','last_updated','id']);
    }

    return opts;
  }

  // Detect intent and entities
  _detectIntent(query) {
    const q = (query || '').toString().toLowerCase();
    const containsAny = (arr) => arr.some(w => q.includes(w));
    const yearRegex = /\b(19|20)\d{2}\b/;
    // e.g., 05-03-308 or 01-xx-xxx
    const partRegex = /\b\d{2}-[a-z0-9]{2}-[a-z0-9]{3,}\b/i;
    const partMatch = q.match(partRegex);
    const extracted = {};
    if (partMatch) extracted.partNumber = partMatch[0];

    // Extract part type tokens
    const partTypes = [
      'collector bag','impeller','hose','recoil starter','starter','boot plate','side tube','side discharge'
    ];
    for (const t of partTypes) {
      if (q.includes(t)) { extracted.partType = t === 'starter' ? 'recoil starter' : t; break; }
    }

    // Extract family names
    if (q.includes('commercial pro')) extracted.family = 'Commercial PRO';
    else if (q.includes('commander pro') || q.includes('commander')) extracted.family = 'Commander Pro';
    else if (q.includes('standard complete platinum') || q.includes('platinum')) extracted.family = 'Standard Complete Platinum';
    else if (q.includes('classic')) extracted.family = 'Classic';

    // Promotions intent flag
    if (containsAny(['promotion','sale','discount','coupon','financing'])) extracted.wantsPromo = true;

    // Parts / purchase signals → WEBSITE first to ensure View/Buy pages show up early; always include cyclopedia
    if (partMatch || containsAny(['part','replacement','buy','order','sku','view/buy','add to cart','price','bag','hose','clamp','mda','key'])) {
      return { intent: 'parts', indexes: ['catalog','cyclopedia','website'], extracted };
    }

    // Compatibility / fitment / engine-by-year
    if (containsAny(['engine','fit','fits','fitment','compatible','compatibility','which engine','used in','hose size','diameter','model history','product history']) || yearRegex.test(q)) {
      return { intent: 'compatibility', indexes: ['catalog','cyclopedia','website'], extracted };
    }

    // SOP / How-to
    if (containsAny(['how to','install','installation','guide','manual','troubleshoot','troubleshooting','winterization','sop'])) {
      return { intent: 'sop', indexes: ['catalog','cyclopedia','website'], extracted };
    }

    // Marketing / benefits
    if (containsAny(['compare','benefits','why choose','financing','promotion','warranty'])) {
      return { intent: 'marketing', indexes: ['catalog','cyclopedia','website'], extracted };
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
        intent,
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
          'general',
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

      // Optionally enrich with cross-index links to ensure real URLs from Azure results
      const payload = this.enableLinkEnrichment ? this._enrichWithLinks(intent, extracted, result) : result;
      // Match AzureAISearch: return raw array of documents
      return JSON.stringify(payload);
    } catch (error) {
      logger.error('Azure AI Search request failed', { error: error?.message || String(error) });
      const msg = (error && (error.message || String(error))) || 'Unknown error';
      return `AZURE_SEARCH_FAILED: ${msg}`;
    }
  }
}

module.exports = WoodlandAISearch;
