
/**
 * WoodlandAISearchAll.js — from scratch
 *
 * Aggregates search results across:
 *  - Cases (AZURE_AI_SEARCH_CASES_INDEX)          -> tool: woodland-ai-search-cases
 *  - Woodland (Catalog/Cyclopedia/Website group)  -> tool: woodland-ai-search
 *  - Tractor (Airtable/Azure Tractors)            -> tool: woodland-ai-search-tractor
 *
 * Default priority (general): Cases → Woodland → Tractor
 * Tractor-like queries: Tractor → Cases → Woodland
 *
 * Features:
 *  - Per-tool minimum quotas (ratio + base)
 *  - Within-Woodland sub-index minimums: Catalog > Cyclopedia > Website
 *  - Relaxed retry to reach quotas (optional)
 *  - Per-source URL selection for citations (never sanitize/replace)
 *  - Slimmed llm_candidates (caps per source) to reduce LLM token use
 *  - Returns { merged, llm_candidates, query, priority_used, llm_caps }
 */

const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('~/config');

// Sub-tools: must exist in your project
const WoodlandAISearch = require('./WoodlandAISearch');
const WoodlandAISearchTractor = require('./WoodlandAISearchTractor');
const WoodlandAISearchCases = require('./WoodlandAISearchCases');

const parseNumber = (value, fallback, { min, max } = {}) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  let out = num;
  if (typeof min === 'number' && out < min) out = min;
  if (typeof max === 'number' && out > max) out = max;
  return out;
};

const parseBool = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  const v = String(value).toLowerCase();
  if (['true','1','yes','y','on'].includes(v)) return true;
  if (['false','0','no','n','off'].includes(v)) return false;
  return fallback;
};

class WoodlandAISearchAll extends Tool {
  static DEFAULT_TOP = 18;
  static DEFAULT_PRIORITY = [
    'woodland-ai-search-cases',
    'woodland-ai-search',
    'woodland-ai-search-tractor',
  ];
  static DEFAULT_MIN_BASE = {
    'woodland-ai-search': 3,
    'woodland-ai-search-cases': 1,
    'woodland-ai-search-tractor': 1,
  };
  static DEFAULT_MIN_RATIO = {
    'woodland-ai-search': 1/3,
    'woodland-ai-search-cases': 1/6,
    'woodland-ai-search-tractor': 1/6,
  };
  static DEFAULT_RELAXED_TOP_BOOST = 4;

  // Within Woodland group
  static DEFAULT_WOODLAND_INDEX_MIN_BASE = { catalog: 2, cyclopedia: 1, website: 1 };
  static DEFAULT_WOODLAND_INDEX_MIN_RATIO = { catalog: 1/4, cyclopedia: 1/6, website: 1/6 };

  // LLM caps
  static DEFAULT_CAP_CASES = 5;
  static DEFAULT_CAP_WOODLAND = 10;
  static DEFAULT_CAP_TRACTOR = 5;

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search-all';
    this.description = 'Aggregate search across Cases, Catalog/Cyclopedia/Website, and Tractor with governed priority.';

    this.fields = { ...fields };

    this.schema = z.object({
      query: z.string().describe('Search phrase'),
      top: z.number().int().positive().optional(),
      perToolTop: z.number().int().positive().optional(),
    });

    const env = (key) => (fields?.[key] ?? process.env?.[key]);

    // toggles
    this.enableWoodland = String(env('WOODLAND_ALL_ENABLE_WOODLAND') ?? 'true').toLowerCase() === 'true';
    this.enableTractor  = String(env('WOODLAND_ALL_ENABLE_TRACTOR')  ?? 'true').toLowerCase() === 'true';
    this.enableCases    = String(env('WOODLAND_ALL_ENABLE_CASES')    ?? 'true').toLowerCase() === 'true';

    // per-tool minimums
    this.minBase = {
      'woodland-ai-search': parseNumber(env('WOODLAND_ALL_MIN_BASE_WOODLAND'), WoodlandAISearchAll.DEFAULT_MIN_BASE['woodland-ai-search'], { min: 0 }),
      'woodland-ai-search-cases': parseNumber(env('WOODLAND_ALL_MIN_BASE_CASES'), WoodlandAISearchAll.DEFAULT_MIN_BASE['woodland-ai-search-cases'], { min: 0 }),
      'woodland-ai-search-tractor': parseNumber(env('WOODLAND_ALL_MIN_BASE_TRACTOR'), WoodlandAISearchAll.DEFAULT_MIN_BASE['woodland-ai-search-tractor'], { min: 0 }),
    };
    this.minRatio = {
      'woodland-ai-search': parseNumber(env('WOODLAND_ALL_MIN_RATIO_WOODLAND'), WoodlandAISearchAll.DEFAULT_MIN_RATIO['woodland-ai-search'], { min: 0, max: 1 }),
      'woodland-ai-search-cases': parseNumber(env('WOODLAND_ALL_MIN_RATIO_CASES'), WoodlandAISearchAll.DEFAULT_MIN_RATIO['woodland-ai-search-cases'], { min: 0, max: 1 }),
      'woodland-ai-search-tractor': parseNumber(env('WOODLAND_ALL_MIN_RATIO_TRACTOR'), WoodlandAISearchAll.DEFAULT_MIN_RATIO['woodland-ai-search-tractor'], { min: 0, max: 1 }),
    };

    // Within Woodland
    this.woodlandIndexMinBase = {
      catalog: parseNumber(env('WOODLAND_ALL_MIN_BASE_CATALOG'), WoodlandAISearchAll.DEFAULT_WOODLAND_INDEX_MIN_BASE.catalog, { min: 0 }),
      cyclopedia: parseNumber(env('WOODLAND_ALL_MIN_BASE_CYCLOPEDIA'), WoodlandAISearchAll.DEFAULT_WOODLAND_INDEX_MIN_BASE.cyclopedia, { min: 0 }),
      website: parseNumber(env('WOODLAND_ALL_MIN_BASE_WEBSITE'), WoodlandAISearchAll.DEFAULT_WOODLAND_INDEX_MIN_BASE.website, { min: 0 }),
    };
    this.woodlandIndexMinRatio = {
      catalog: parseNumber(env('WOODLAND_ALL_MIN_RATIO_CATALOG'), WoodlandAISearchAll.DEFAULT_WOODLAND_INDEX_MIN_RATIO.catalog, { min: 0, max: 1 }),
      cyclopedia: parseNumber(env('WOODLAND_ALL_MIN_RATIO_CYCLOPEDIA'), WoodlandAISearchAll.DEFAULT_WOODLAND_INDEX_MIN_RATIO.cyclopedia, { min: 0, max: 1 }),
      website: parseNumber(env('WOODLAND_ALL_MIN_RATIO_WEBSITE'), WoodlandAISearchAll.DEFAULT_WOODLAND_INDEX_MIN_RATIO.website, { min: 0, max: 1 }),
    };

    // relaxed retry
    this.enableRelaxedRetry = parseBool(env('WOODLAND_ALL_ENABLE_RELAXED_RETRY'), true);
    this.relaxedTopBoost    = Math.max(0, Math.floor(parseNumber(env('WOODLAND_ALL_RELAXED_TOP_BOOST'), WoodlandAISearchAll.DEFAULT_RELAXED_TOP_BOOST, { min: 0 })));
    this.relaxedDisableReviewed = parseBool(env('WOODLAND_ALL_RELAXED_DISABLE_REVIEWED'), true);

    // LLM caps
    this.capCases    = parseNumber(env('WOODLAND_ALL_LLM_CAP_CASES'), WoodlandAISearchAll.DEFAULT_CAP_CASES, { min: 0 });
    this.capWoodland = parseNumber(env('WOODLAND_ALL_LLM_CAP_WOODLAND'), WoodlandAISearchAll.DEFAULT_CAP_WOODLAND, { min: 0 });
    this.capTractor  = parseNumber(env('WOODLAND_ALL_LLM_CAP_TRACTOR'), WoodlandAISearchAll.DEFAULT_CAP_TRACTOR, { min: 0 });
  }

  // ----- helpers -----
  _keyOf(d) {
    return (
      (typeof d?.url === 'string' && d.url) ||
      (typeof d?.website_url_primary === 'string' && d.website_url_primary) ||
      d?.id || d?.record_id || d?.key || JSON.stringify(d)
    );
  }

  _strongKeyOf(d) {
    const base = this._keyOf(d);
    if (base && typeof base === 'string') return base;
    try {
      const title = (d?.title || '').toString().trim().toLowerCase();
      const site = (d?.site || '').toString().trim().toLowerCase();
      const pageType = (d?.page_type || '').toString().trim().toLowerCase();
      const sku = (Array.isArray(d?.skus) ? d.skus.join('|') : d?.sku || '').toString().toLowerCase();
      const partNums = (Array.isArray(d?.part_numbers) ? d.part_numbers.join('|') : d?.part_numbers || '').toString().toLowerCase();
      const url = (d?.url || d?.website_url_primary || '').toString().toLowerCase();
      const index = (d?.index || '').toString().toLowerCase();
      if (url) return url;
      const sig = [title, site, pageType, sku, partNums, index].filter(Boolean).join('#');
      return sig || JSON.stringify(d);
    } catch {
      return JSON.stringify(d);
    }
  }

  _docIndex(doc) {
    const idx = (doc?.provenance?.index || doc?.index || '').toString().toLowerCase();
    if (idx.includes('catalog')) return 'catalog';
    if (idx.includes('cyclopedia') || idx.includes('document360')) return 'cyclopedia';
    if (idx.includes('website')) return 'website';
    if (idx.includes('cases')) return 'cases';
    return undefined;
  }

  _candidateUrl(d) {
    const pick = (...keys) => {
      for (const k of keys) {
        const v = d?.[k] ?? d?.provenance?.[k];
        if (typeof v === 'string' && v) return v;
      }
      return undefined;
    };
    switch (d?.source_tool || d?.provenance?.source_tool) {
      case 'woodland-ai-search-cases':
        return pick('display_url', 'case_url', 'url', 'link', 'website_url_primary', 'document_url', 'source_url');
      case 'woodland-ai-search':
        return pick('url', 'website_url_primary', 'page_url', 'document_url', 'source_url', 'link');
      case 'woodland-ai-search-tractor':
        return pick('url', 'website_url_primary', 'document_url', 'source_url');
      default:
        return pick('url', 'website_url_primary', 'document_url', 'source_url', 'link');
    }
  }

  _computeMaxScores(buckets) {
    const out = {};
    for (const b of buckets) {
      const max = Math.max(0, ...((b.docs || []).map(d => (typeof d?.source_score === 'number' ? d.source_score : 0))));
      out[b.tool] = max || 1;
    }
    return out;
  }

  _computeWoodlandIndexMinimums(finalTop) {
    const mins = {};
    for (const k of Object.keys(WoodlandAISearchAll.DEFAULT_WOODLAND_INDEX_MIN_BASE)) {
      const base = this.woodlandIndexMinBase[k] || 0;
      const ratio = this.woodlandIndexMinRatio[k] || 0;
      mins[k] = Math.max(base, Math.ceil(finalTop * ratio));
    }
    return mins;
  }

  _relaxedOverridesFor(tool) {
    if (tool === 'woodland-ai-search') {
      return { reviewedOnly: this.relaxedDisableReviewed ? false : undefined };
    }
    return {};
  }

  _prepareDocs(tool, docs) {
    if (!Array.isArray(docs)) return [];
    return docs.map(d => ({
      ...d,
      source_tool: tool,
      source_score: d?.['@search.score'] ?? d?.['@searchScore'] ?? d?.score ?? d?.source_score ?? 0,
      provenance: { ...(d?.provenance || {}), source_tool: tool, index: d?.index || d?.provenance?.index, index_family: this._docIndex(d) },
    }));
  }

  _intentHints(query) {
    try {
      const q = (query || '').toString().toLowerCase();
      const has = (re) => re.test(q);
      const tractorTokens = [
        /\bdeck\b/, /\bmda\b/, /\bhitch\b/, /\bhose\b/, /\bupgrade\s*hose\b/, /\brubber\s*collar\b/,
        /\bcomm(ander)?\b/, /\bcommercial\s*pro\b/, /\bxl\b/, /\bz-?10\b/,
        /\b(amf|ariens|cub|craftsman|deere|husqvarna|murray|snapper|troy|yard)\b/,
        /\b\d{2}(?:\s*inch|\s*in|")?\b/,
      ];
      const casesTokens = [/\bcase\b/, /\bticket\b/, /\brma\b/, /\breturn\b/, /\bpolicy\b/, /\brefund\b/];
      return { tractorLike: tractorTokens.some(has), casesLike: casesTokens.some(has) };
    } catch {
      return { tractorLike: false, casesLike: false };
    }
  }

  _computeMinimums(finalTop, query) {
    const hints = this._intentHints ? this._intentHints(query) : { tractorLike: false };
    const minimums = {};
    for (const key of Object.keys(WoodlandAISearchAll.DEFAULT_MIN_BASE)) {
      let base = this.minBase[key] || 0;
      let ratio = this.minRatio[key] || 0;
      if (hints.tractorLike && key === 'woodland-ai-search-tractor') {
        base = Math.max(base, 2);
        ratio = Math.max(ratio, 1/4);
      }
      const ratioCount = Math.ceil(finalTop * ratio);
      minimums[key] = Math.max(base, ratioCount);
    }
    return minimums;
  }

  async _executeSubtool({ tool, Ctor, query, top, overrides = {} }) {
    try {
      const t = new Ctor({ ...this.fields, override: true, ...overrides });
      const payload = { query, top };
      const raw = await t.call(payload);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      let docs = [];
      if (Array.isArray(parsed)) docs = parsed;
      else if (parsed && Array.isArray(parsed.docs)) docs = parsed.docs;
      return { ok: true, tool, docs };
    } catch (err) {
      logger?.warn?.('[woodland-ai-search-all] subtool error', { tool, err: String(err?.message || err) });
      return { ok: false, tool, err };
    }
  }

  async _call(data) {
    const { query, top: topIn, perToolTop: perToolTopIn } = data;
    const finalTop = Number.isFinite(topIn) ? Math.max(1, Math.floor(topIn)) : WoodlandAISearchAll.DEFAULT_TOP;
    const perToolTop = Number.isFinite(perToolTopIn) ? Math.max(1, Math.floor(perToolTopIn)) : Math.min(10, Math.max(8, Math.ceil(finalTop / 2)));

    // assemble subtools
    const subTools = [];
    if (this.enableWoodland) subTools.push({ tool: 'woodland-ai-search', Ctor: WoodlandAISearch });
    if (this.enableTractor)  subTools.push({ tool: 'woodland-ai-search-tractor', Ctor: WoodlandAISearchTractor });
    if (this.enableCases)    subTools.push({ tool: 'woodland-ai-search-cases', Ctor: WoodlandAISearchCases });

    const bucketMap = new Map(subTools.map(({ tool }) => [tool, { tool, docs: [] }]));

    // execute
    const initialResults = await Promise.all(
      subTools.map(({ tool, Ctor }) => this._executeSubtool({ tool, Ctor, query, top: perToolTop })),
    );

    // collect
    for (const result of initialResults) {
      if (!result?.ok) continue;
      const bucket = bucketMap.get(result.tool);
      const prepared = this._prepareDocs(result.tool, result.docs);
      if (bucket) bucket.docs.push(...prepared);
    }

    const buckets = Array.from(bucketMap.values());

    // dynamic priority
    let priority = WoodlandAISearchAll.DEFAULT_PRIORITY;
    const hints = this._intentHints(query);
    if (hints && hints.tractorLike) {
      priority = ['woodland-ai-search-tractor', 'woodland-ai-search-cases', 'woodland-ai-search'];
    }

    const minPerTool = this._computeMinimums(finalTop, query);

    // relaxed retry for quotas
    if (this.enableRelaxedRetry) {
      for (const { tool, Ctor } of subTools) {
        const bucket = bucketMap.get(tool);
        const current = bucket?.docs?.length || 0;
        const target = minPerTool[tool] || 0;
        if (current >= target) continue;
        const overrides = this._relaxedOverridesFor(tool);
        const relaxedTop = Math.max(perToolTop + this.relaxedTopBoost, target);
        const retry = await this._executeSubtool({ tool, Ctor, query, top: relaxedTop, overrides });
        if (retry?.ok && Array.isArray(retry.docs) && retry.docs.length) {
          const prepared = this._prepareDocs(tool, retry.docs);
          bucket.docs.push(...prepared);
        }
      }
    }

    // merge
    buckets.sort((a, b) => priority.indexOf(a.tool) - priority.indexOf(b.tool));

    const maxScores = this._computeMaxScores(buckets);
    const woodlandIndexMinimums = this._computeWoodlandIndexMinimums(finalTop);
    const woodlandIndexCounts = Object.fromEntries(Object.keys(WoodlandAISearchAll.DEFAULT_WOODLAND_INDEX_MIN_BASE).map((k) => [k, 0]));

    const out = [];
    const seen = new Set();

    const addDoc = (doc, { allowUnderMin = false } = {}) => {
      const key = this._strongKeyOf(doc);
      if (seen.has(key)) return 'duplicate';
      let idx;
      if (doc.source_tool === 'woodland-ai-search') {
        idx = this._docIndex(doc);
        if (idx && Object.prototype.hasOwnProperty.call(woodlandIndexCounts, idx)) {
          const outstanding = Object.entries(woodlandIndexMinimums).some(([name, min]) => woodlandIndexCounts[name] < min);
          if (!allowUnderMin && woodlandIndexCounts[idx] >= (woodlandIndexMinimums[idx] || 0) && outstanding) {
            return 'defer';
          }
        }
      }
      seen.add(key);
      const normScore = typeof doc.source_score === 'number' ? (doc.source_score / (maxScores[doc.source_tool] || 1)) || 0 : 0;
      const provenance = typeof doc.provenance === 'object' && doc.provenance !== null ? { ...doc.provenance } : {};
      provenance.normalized_score = normScore;
      provenance.source_tool = doc.source_tool || provenance.source_tool;
      doc.provenance = provenance;
      if (doc.source_tool === 'woodland-ai-search' && idx && Object.prototype.hasOwnProperty.call(woodlandIndexCounts, idx)) {
        woodlandIndexCounts[idx] += 1;
      }
      out.push(doc);
      return 'added';
    };

    const sortByScoreDesc = (docs) => [...docs].sort((a, b) => {
      const aS = typeof a?.source_score === 'number' ? a.source_score : -Infinity;
      const bS = typeof b?.source_score === 'number' ? b.source_score : -Infinity;
      return bS - aS;
    });

    const bucketState = new Map();
    const deferredSeen = new WeakSet();
    for (const bucket of buckets) {
      bucketState.set(bucket.tool, { tool: bucket.tool, docs: sortByScoreDesc(bucket.docs || []), cursor: 0, deferred: [] });
    }

    const pullDoc = (state, preferPredicate) => {
      if (!state) return null;
      if (typeof preferPredicate === 'function') {
        for (let i = 0; i < state.deferred.length; i += 1) {
          const item = state.deferred[i];
          if (preferPredicate(item.doc)) { state.deferred.splice(i, 1); return { doc: item.doc, source: item.source }; }
        }
        while (state.cursor < state.docs.length) {
          const doc = state.docs[state.cursor++];
          if (preferPredicate(doc)) return { doc, source: 'main' };
          state.deferred.push({ doc, source: 'main' });
        }
      }
      if (state.deferred.length) { const item = state.deferred.shift(); return { doc: item.doc, source: item.source }; }
      if (state.cursor < state.docs.length) { return { doc: state.docs[state.cursor++], source: 'main' }; }
      return null;
    };

    const needsIndex = (doc) => {
      if (!doc) return false;
      const idx = this._docIndex(doc);
      if (!idx) return false;
      if (!Object.prototype.hasOwnProperty.call(woodlandIndexCounts, idx)) return false;
      return woodlandIndexCounts[idx] < (woodlandIndexMinimums[idx] || 0);
    };

    // Phase 1: per-tool quotas (+ woodland per-index)
    for (const { tool } of buckets) {
      const quota = minPerTool[tool] || 0;
      if (quota <= 0) continue;
      let added = 0;
      const state = bucketState.get(tool);
      if (!state) continue;
      while ((state.cursor < state.docs.length || state.deferred.length) && out.length < finalTop) {
        let pulled;
        if (tool === 'woodland-ai-search') {
          pulled = pullDoc(state, needsIndex) || pullDoc(state);
        } else {
          pulled = pullDoc(state);
        }
        if (!pulled) break;
        const { doc, source } = typeof pulled === 'object' && pulled.doc ? pulled : { doc: pulled, source: 'main' };
        const status = addDoc(doc, { allowUnderMin: tool !== 'woodland-ai-search' });
        if (status === 'added') {
          added += 1;
          if (added >= quota) break;
        } else if (status === 'defer' && tool === 'woodland-ai-search' && source === 'main' && !deferredSeen.has(doc)) {
          deferredSeen.add(doc);
          state.deferred.push({ doc, source: 'deferred' });
        }
      }
      if (out.length >= finalTop) break;
    }

    // Phase 2: fill remaining slots round-robin
    outer: while (out.length < finalTop) {
      let progressed = false;
      for (const { tool } of buckets) {
        const state = bucketState.get(tool);
        if (!state) continue;
        const pulled = pullDoc(state);
        if (!pulled) continue;
        const { doc } = typeof pulled === 'object' && pulled.doc ? pulled : { doc: pulled };
        const status = addDoc(doc, { allowUnderMin: tool !== 'woodland-ai-search' });
        if (status === 'added') { progressed = true; if (out.length >= finalTop) break outer; }
      }
      if (!progressed) break;
    }

    // Slim LLM candidates (per source caps)
    const groups = {};
    for (const d of out || []) {
      const src = d?.source_tool || d?.provenance?.source_tool || 'unknown';
      if (!groups[src]) groups[src] = [];
      groups[src].push(d);
    }
    const takeTop = (arr, n) => (arr || []).slice().sort((a,b)=> (b.source_score||0)-(a.source_score||0)).slice(0, Math.max(0, n));
    const limited = [
      ...takeTop(groups['woodland-ai-search-cases'], this.capCases),
      ...takeTop(groups['woodland-ai-search'], this.capWoodland),
      ...takeTop(groups['woodland-ai-search-tractor'], this.capTractor),
    ];

    const response = {
      merged: out || [],
      llm_candidates: (limited || []).map((d) => ({
        doc_id: d?.id || d?.record_id || d?.key || this._strongKeyOf(d),
        source: d?.source_tool || d?.provenance?.source_tool || 'unknown',
        index: d?.provenance?.index || d?.index || undefined,
        index_family: d?.provenance?.index_family || undefined,
        score: d?.source_score ?? d?.['@search.score'] ?? undefined,
        title: d?.title || d?.name || undefined,
        url: this._candidateUrl(d), // use URL from the same source
        snippet: d?.content || d?.snippet || d?.summary || undefined,
        raw: d,
      })),
      query,
      priority_used: priority,
      llm_caps: { cases: this.capCases, woodland: this.capWoodland, tractor: this.capTractor },
    };
    return JSON.stringify(response);
  }
}

module.exports = WoodlandAISearchAll;
