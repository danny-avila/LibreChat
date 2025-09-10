// woodland-ai-search.js (simplified)
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

class WoodlandAISearch extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 9;
  static DEFAULT_SELECT = 'source,collection,url,title,chunk,record_id,id';
  static GROUPS = ['airtable', 'cyclopedia', 'website'];
  static SOURCE_ALIASES = {
    airtable: ['airtable'],
    cyclopedia: ['cyclopedia', 'support'],
    website: ['website', 'site']
  };

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

    // Required env/config
    this.serviceEndpoint = this._env(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
    );
    this.indexName = this._env(
      fields.AZURE_AI_SEARCH_INDEX_NAME,
      process.env.AZURE_AI_SEARCH_INDEX_NAME,
    );
    this.apiKey = this._env(fields.AZURE_AI_SEARCH_API_KEY, process.env.AZURE_AI_SEARCH_API_KEY);

    if (!this.serviceEndpoint || !this.indexName || !this.apiKey) {
      throw new Error(
        'Missing AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_INDEX_NAME, or AZURE_AI_SEARCH_API_KEY environment variable.',
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
    this.sourceAliases = WoodlandAISearch.SOURCE_ALIASES;

    this.client = new SearchClient(
      this.serviceEndpoint,
      this.indexName,
      new AzureKeyCredential(this.apiKey),
      { apiVersion: this.apiVersion },
    );

    logger.info('[woodland-ai-search] Initialized', {
      endpoint: this.serviceEndpoint,
      index: this.indexName,
      apiVersion: this.apiVersion,
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

  // Host/field-based source classifier
  _classifySource(doc) {
    try {
      const u = (doc?.url || '').toString();
      try {
        const host = new URL(u).hostname.toLowerCase();
        if (host.includes('airtable.com')) return 'airtable';
        if (host.includes('support.cyclonerake.com')) return 'cyclopedia';
        if (host.includes('cyclonerake.com')) return 'website';
      } catch (_) {}
      const src = (doc?.source || '').toString().toLowerCase();
      const col = (doc?.collection || '').toString().toLowerCase();
      const v = src || col;
      if (v.includes('airtable')) return 'airtable';
      if (v.includes('cyclopedia') || v.includes('support')) return 'cyclopedia';
      if (v.includes('website') || v.includes('site')) return 'website';
      return 'other';
    } catch (_) {
      return 'other';
    }
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
      logger.debug('[woodland-ai-search] Sending request', { query, options: JSON.stringify(send, null, 2) });
      const rs = await this.client.search(query, send);
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
      const unknownFieldRegex = /Unknown field '([^']+)'/g;
      const toRemove = [];
      let m;
      while ((m = unknownFieldRegex.exec(msg)) !== null) {
        const fld = (m[1] || '').trim();
        if (fld) toRemove.push(fld);
      }
      if (toRemove.length === 0 || !/search field list|select/i.test(msg)) {
        throw err;
      }
      const sanitized = { ...options };
      if (Array.isArray(sanitized.select)) {
        sanitized.select = sanitized.select.filter((f) => !toRemove.includes(f));
        if (sanitized.select.length === 0) delete sanitized.select;
      }
      logger.info('[woodland-ai-search] Retrying without unknown fields');
      const docs = await run(sanitized);
      return { docs, retried: true };
    }
  }

  _buildSourceFilter(norm) {
    const aliases = this.sourceAliases?.[String(norm).toLowerCase()] || [norm];
    const list = aliases.join(',');
    const filter = `(
      search.in(source, '${list}', ',') or
      search.in(collection, '${list}', ',')
    )`;
    logger.debug('[woodland-ai-search] Built source/collection filter', { norm, aliases, filter });
    return filter;
  }

  /** Facet snapshot to see actual values present in 'source' and 'collection' */
  async _facetSnapshot() {
    try {
      const opts = {
        top: 0,
        facets: ['source,count:50', 'collection,count:50'],
        queryType: 'simple',
        includeTotalCount: false,
      };
      logger.debug('[woodland-ai-search] Facet snapshot request');
      const rs = await this.client.search('*', opts);
      // iterate once so the request completes
      // eslint-disable-next-line no-empty
      for await (const _ of rs.results) {}
      const out = { source: [], collection: [] };
      if (rs.facets) {
        for (const f of rs.facets) {
          if (f?.name === 'source') out.source = (f.values || []).map(v => v.value);
          if (f?.name === 'collection') out.collection = (f.values || []).map(v => v.value);
        }
      }
      logger.info('[woodland-ai-search] Facet snapshot', out);
      return out;
    } catch (e) {
      logger.warn('[woodland-ai-search] Facet snapshot failed', { error: e?.message || String(e) });
      return { source: [], collection: [] };
    }
  }

  async _tieredSearch(query, baseOptions) {
    // 1) try as-is
    let r = await this._safeSearch(query, baseOptions);
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
      r = await this._safeSearch(query, toSimple(baseOptions));
      if (r.docs?.length) return r.docs;

      const noFields = toSimple(baseOptions);
      if (Array.isArray(noFields.searchFields)) delete noFields.searchFields;
      r = await this._safeSearch(query, noFields);
      if (r.docs?.length) return r.docs;
    }
    return [];
  }

  async _searchPerSource(query, baseOptions, sourceList, perSourceTop, finalTop) {
    logger.info('[woodland-ai-search] Running STRICT per-source queries', {
      sources: sourceList, perSourceTop, finalTop
    });

    const tasks = sourceList.map(async (norm) => {
      const opt = { ...baseOptions, top: perSourceTop };
      opt.filter = this._buildSourceFilter(norm);
      if (Array.isArray(this.searchFields) && this.searchFields.length) {
        opt.searchFields = this.searchFields;
      }
      // Attach semantic options safely
      if (String(opt.queryType).toLowerCase() === 'semantic') {
        opt.semanticSearchOptions = {
          configurationName: this.semanticConfiguration,
          queryLanguage: this.queryLanguage
        };
        opt.answers = 'extractive';
        opt.captions = 'extractive';
        opt.speller = 'lexicon';
      }

      logger.info('[woodland-ai-search] Per-source query start', {
        source: norm, top: perSourceTop, filter: opt.filter, searchFields: opt.searchFields
      });

      const docs = await this._tieredSearch(query, opt);

      // Optional extra client-side guard
      const normMatches = (d) => {
        const src = (d?.source || '').toString().toLowerCase();
        const col = (d?.collection || '').toString().toLowerCase();
        const aliases = this.sourceAliases?.[norm] || [norm];
        return aliases.some(a => src === a || col === a);
      };
      let finalDocs = this.hardFilter ? docs.filter(normMatches) : docs;

      logger.info('[woodland-ai-search] Per-source query done', {
        source: norm, received: docs.length, kept: finalDocs.length
      });

      // Backfill with a global sample if this bucket is underfilled
      if ((finalDocs?.length || 0) < perSourceTop) {
        const needed = perSourceTop - (finalDocs?.length || 0);
        const globalOpt = { ...baseOptions };
        delete globalOpt.filter;
        if (globalOpt.scoringProfile) delete globalOpt.scoringProfile;
        globalOpt.top = Math.max(100, perSourceTop * 10);
        // Try semantic first (already set), then simple, then simple(no searchFields)
        let sample = await this._tieredSearch(query, globalOpt);
        const picked = [];
        const have = new Set((finalDocs || []).map(d => (d?.url || d?.id || d?.record_id || JSON.stringify(d))));
        for (const d of sample || []) {
          if (have.has(d?.url || d?.id || d?.record_id || JSON.stringify(d))) continue;
          if (this._classifySource(d) === norm) {
            picked.push(d);
            if (picked.length >= needed) break;
          }
        }
        if (picked.length) {
          finalDocs = [...(finalDocs || []), ...picked];
          logger.info('[woodland-ai-search] Backfilled from global sample', {
            source: norm, added: picked.length, target: perSourceTop
          });
        }
      }

      return { source: norm, docs: finalDocs };
    });

    const results = await Promise.all(tasks);

    // Interleave
    const out = [];
    const seen = new Set();
    const keyOf = (d) => (d?.url || d?.id || d?.record_id || d?.key || JSON.stringify(d));
    for (let i = 0; out.length < finalTop; i++) {
      let pushedAny = false;
      for (const { docs } of results) {
        if (i < docs.length) {
          const k = keyOf(docs[i]);
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

    logger.debug('[woodland-ai-search] Per-source merged results', {
      total: out.length,
      breakdown: results.map(r => ({ source: r.source, count: r.docs.length })),
    });

    return out;
  }

  async _call(data) {
    const { query, top: topIn } = data;
    const finalTop = typeof topIn === 'number' && Number.isFinite(topIn) ? Math.max(1, Math.floor(topIn)) : this.top;

    try {
      // Log actual facet values once per process invocation to confirm what we can filter on
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
        select: this.select,
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

      if (this.enablePerSourceQueries) {
        // Strict per-source path
        const srcList = (this.defaultSources || WoodlandAISearch.GROUPS).map(s => s.toLowerCase());
        const merged = await this._searchPerSource(query, { ...baseOptions }, srcList, Math.max(1, this.perSourceTop), finalTop);
        logger.debug('[woodland-ai-search] Final merged (strict per-source) results', {
          total: merged.length,
          sourcesSample: merged.map(d => d.source || this._classifySource(d)).slice(0, 10),
        });
        return JSON.stringify(merged);
      }

      // Fallback: global sample (semantic) then bucket/interleave
      const sampleTop = Math.max(120, finalTop * 6);
      const sampleOptions = { ...baseOptions, top: sampleTop };
      const { docs: sampleDocs } = await this._tieredSearch(query, sampleOptions);
      if (!sampleDocs || sampleDocs.length === 0) {
        return JSON.stringify([]);
      }

      // Bucket
      const buckets = new Map();
      for (const g of WoodlandAISearch.GROUPS) buckets.set(g, []);
      const other = [];
      for (const d of sampleDocs) {
        const g = this._classifySource(d);
        if (buckets.has(g)) buckets.get(g).push(d);
        else other.push(d);
      }

      // Interleave
      const perGroupTop = Math.max(1, Math.ceil(finalTop / WoodlandAISearch.GROUPS.length));
      const seen = new Set();
      const keyOf = (d) => (d?.url || d?.id || d?.record_id || d?.key || JSON.stringify(d));
      const result = [];
      for (let i = 0; i < perGroupTop && result.length < finalTop; i++) {
        for (const g of WoodlandAISearch.GROUPS) {
          const arr = buckets.get(g) || [];
          if (i < arr.length) {
            const doc = arr[i];
            const k = keyOf(doc);
            if (!seen.has(k)) {
              seen.add(k);
              result.push(doc);
              if (result.length >= finalTop) break;
            }
          }
        }
      }
      if (result.length < finalTop) {
        for (const g of WoodlandAISearch.GROUPS) {
          const arr = buckets.get(g) || [];
          for (let j = perGroupTop; j < arr.length && result.length < finalTop; j++) {
            const doc = arr[j];
            const k = keyOf(doc);
            if (!seen.has(k)) {
              seen.add(k);
              result.push(doc);
            }
          }
        }
      }
      if (result.length < finalTop) {
        for (const doc of other) {
          const k = keyOf(doc);
          if (!seen.has(k)) {
            seen.add(k);
            result.push(doc);
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
