// woodland-ai-search-all.js (aggregator)
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('~/config');

const WoodlandAISearch = require('./WoodlandAISearch');
const WoodlandAISearchTractor = require('./WoodlandAISearchTractor');
const WoodlandAISearchCases = require('./WoodlandAISearchCases');

const parseNumber = (value, fallback, { min, max } = {}) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  let result = num;
  if (typeof min === 'number' && result < min) result = min;
  if (typeof max === 'number' && result > max) result = max;
  return result;
};

const parseBool = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
};

class WoodlandAISearchAll extends Tool {
  static DEFAULT_TOP = 18;
  static DEFAULT_PRIORITY = ['woodland-ai-search', 'woodland-ai-search-cases', 'woodland-ai-search-tractor'];
  static DEFAULT_MIN_BASE = {
    'woodland-ai-search': 3,
    'woodland-ai-search-cases': 1,
    'woodland-ai-search-tractor': 1,
  };
  static DEFAULT_MIN_RATIO = {
    'woodland-ai-search': 1 / 3,
    'woodland-ai-search-cases': 1 / 6,
    'woodland-ai-search-tractor': 1 / 6,
  };
  static DEFAULT_RELAXED_TOP_BOOST = 4;

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search-all';
    this.description =
      "Aggregates results from 'woodland-ai-search', 'woodland-ai-search-tractor', and 'woodland-ai-search-cases' in one call.";

    // Persist the caller-provided configuration so sub-tools receive the same overrides.
    this.fields = { ...fields };

    this.schema = z.object({
      query: z.string().describe('Search word or phrase to Woodland All-Tools'),
      top: z.number().int().positive().optional(),
      perToolTop: z.number().int().positive().optional(),
    });

    // Allow disabling specific sub-tools via env if desired
    this.enableWoodland = String(fields.WOODLAND_ALL_ENABLE_WOODLAND ?? process.env.WOODLAND_ALL_ENABLE_WOODLAND ?? 'true').toLowerCase() === 'true';
    this.enableTractor = String(fields.WOODLAND_ALL_ENABLE_TRACTOR ?? process.env.WOODLAND_ALL_ENABLE_TRACTOR ?? 'true').toLowerCase() === 'true';
    this.enableCases = String(fields.WOODLAND_ALL_ENABLE_CASES ?? process.env.WOODLAND_ALL_ENABLE_CASES ?? 'true').toLowerCase() === 'true';

    const env = (key) => fields?.[key] ?? process.env?.[key];

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

    this.enableRelaxedRetry = parseBool(env('WOODLAND_ALL_ENABLE_RELAXED_RETRY'), true);
    this.relaxedTopBoost = Math.max(0, Math.floor(parseNumber(env('WOODLAND_ALL_RELAXED_TOP_BOOST'), WoodlandAISearchAll.DEFAULT_RELAXED_TOP_BOOST, { min: 0 })));
    this.relaxedDisableReviewed = parseBool(env('WOODLAND_ALL_RELAXED_DISABLE_REVIEWED'), true);

    logger.info('[woodland-ai-search-all] Initialized', {
      enableWoodland: this.enableWoodland,
      enableTractor: this.enableTractor,
      enableCases: this.enableCases,
      minBase: this.minBase,
      minRatio: this.minRatio,
      enableRelaxedRetry: this.enableRelaxedRetry,
      relaxedTopBoost: this.relaxedTopBoost,
      relaxedDisableReviewed: this.relaxedDisableReviewed,
    });
  }

  _keyOf(d) {
    return (
      (typeof d?.url === 'string' && d.url) ||
      (typeof d?.website_url_primary === 'string' && d.website_url_primary) ||
      d?.id ||
      d?.record_id ||
      d?.key ||
      JSON.stringify(d)
    );
  }

  // Stronger key that attempts to avoid duplicates when url/id are missing
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
    } catch (_) {
      return JSON.stringify(d);
    }
  }

  async _call(data) {
    const { query, top: topIn, perToolTop: perToolTopIn } = data;
    const finalTop = typeof topIn === 'number' && Number.isFinite(topIn)
      ? Math.max(1, Math.floor(topIn))
      : WoodlandAISearchAll.DEFAULT_TOP;
    const perToolTop = typeof perToolTopIn === 'number' && Number.isFinite(perToolTopIn)
      ? Math.max(1, Math.floor(perToolTopIn))
      : Math.min(10, Math.max(8, Math.ceil(finalTop / 2)));

    try {
      const subTools = [];
      if (this.enableWoodland) subTools.push({ tool: 'woodland-ai-search', Ctor: WoodlandAISearch });
      if (this.enableTractor) subTools.push({ tool: 'woodland-ai-search-tractor', Ctor: WoodlandAISearchTractor });
      if (this.enableCases) subTools.push({ tool: 'woodland-ai-search-cases', Ctor: WoodlandAISearchCases });

      const bucketMap = new Map(subTools.map(({ tool }) => [tool, { tool, docs: [] }]));

      const initialResults = await Promise.all(
        subTools.map(({ tool, Ctor }) => this._executeSubtool({ tool, Ctor, query, top: perToolTop })),
      );

      for (const result of initialResults) {
        if (!result?.ok) {
          logger.warn('[woodland-ai-search-all] Subtool failed', { tool: result?.tool, error: result?.err?.message || String(result?.err) });
          continue;
        }
        const bucket = bucketMap.get(result.tool);
        const prepared = this._prepareDocs(result.tool, result.docs);
        if (bucket) bucket.docs.push(...prepared);
      }

      const buckets = Array.from(bucketMap.values());
      const minPerTool = this._computeMinimums(finalTop);

      if (this.enableRelaxedRetry) {
        for (const { tool, Ctor } of subTools) {
          const bucket = bucketMap.get(tool);
          const current = bucket?.docs?.length || 0;
          const target = minPerTool[tool] || 0;
          if (current >= target) continue;
          const overrides = this._relaxedOverridesFor(tool);
          if (!overrides) continue;
          const relaxedTop = Math.max(perToolTop + this.relaxedTopBoost, target);
          const retry = await this._executeSubtool({ tool, Ctor, query, top: relaxedTop, overrides });
          if (retry?.ok && Array.isArray(retry.docs) && retry.docs.length) {
            logger.info('[woodland-ai-search-all] Relaxed retry succeeded', { tool, count: retry.docs.length });
            const prepared = this._prepareDocs(tool, retry.docs);
            bucket.docs.push(...prepared);
          } else if (retry && !retry.ok) {
            logger.warn('[woodland-ai-search-all] Relaxed retry failed', { tool, error: retry?.err?.message || String(retry?.err) });
          }
        }
      }

      // Merge strategy: minimum quotas first, then round-robin by normalized score.
      const priority = WoodlandAISearchAll.DEFAULT_PRIORITY;
      buckets.sort((a, b) => priority.indexOf(a.tool) - priority.indexOf(b.tool));

      const maxScores = this._computeMaxScores(buckets);
      const out = [];
      const seen = new Set();

      const addDoc = (doc) => {
        const key = this._strongKeyOf(doc);
        if (seen.has(key)) return false;
        seen.add(key);
        const normScore = typeof doc.source_score === 'number'
          ? (doc.source_score / (maxScores[doc.source_tool] || 1)) || 0
          : 0;
        const provenance = typeof doc.provenance === 'object' && doc.provenance !== null ? { ...doc.provenance } : {};
        provenance.normalized_score = normScore;
        provenance.source_tool = doc.source_tool || provenance.source_tool;
        doc.provenance = provenance;
        out.push(doc);
        return true;
      };

      const sortByScoreDesc = (docs) => [...docs].sort((a, b) => {
        const scoreA = typeof a?.source_score === 'number' ? a.source_score : -Infinity;
        const scoreB = typeof b?.source_score === 'number' ? b.source_score : -Infinity;
        if (scoreA === scoreB) return 0;
        return scoreB - scoreA;
      });

      const bucketState = new Map();
      for (const bucket of buckets) {
        bucketState.set(bucket.tool, {
          tool: bucket.tool,
          docs: sortByScoreDesc(bucket.docs || []),
          cursor: 0,
        });
      }

      // Phase 1: satisfy minimum quotas per tool (if available)
      for (const { tool } of buckets) {
        const quota = minPerTool[tool] || 0;
        if (quota <= 0) continue;
        let added = 0;
        const state = bucketState.get(tool);
        if (!state) continue;
        while (state.cursor < state.docs.length) {
          if (out.length >= finalTop) break;
          const doc = state.docs[state.cursor++];
          if (addDoc(doc)) {
            added += 1;
            if (added >= quota) break;
          }
        }
        if (out.length >= finalTop) break;
      }

      // Phase 2: round-robin by normalized score bands
      outer: while (out.length < finalTop) {
        let addedInCycle = false;
        for (const tool of priority) {
          const state = bucketState.get(tool);
          if (!state) continue;
          while (state.cursor < state.docs.length) {
            const candidate = state.docs[state.cursor++];
            if (addDoc(candidate)) {
              addedInCycle = true;
              if (out.length >= finalTop) break outer;
              break;
            }
          }
        }
        if (!addedInCycle) break;
      }

      out.forEach((doc, idx) => {
        doc.source_rank = idx + 1;
        if (doc.provenance) {
          doc.provenance.rank = doc.source_rank;
        } else {
          doc.provenance = { rank: doc.source_rank };
        }
      });

      logger.info('[woodland-ai-search-all] Aggregated results', {
        totalMerged: out.length,
        sources: buckets.map((b) => ({ tool: b.tool, count: b.docs.length })),
        quotas: minPerTool,
      });

      return JSON.stringify(out);
    } catch (error) {
      logger.error('[woodland-ai-search-all] Failed', { error: error?.message || String(error) });
      return `AZURE_SEARCH_FAILED: ${error?.message || String(error)}`;
    }
  }

  _prepareDocs(tool, docs) {
    if (!Array.isArray(docs)) return [];
    const prepared = [];
    for (const doc of docs) {
      if (!doc) continue;
      if (!doc.source_tool) doc.source_tool = tool;
      const existingProv = typeof doc.provenance === 'object' && doc.provenance !== null ? { ...doc.provenance } : {};
      let url;
      let host;
      try {
        url = (typeof doc.url === 'string' && doc.url) || (typeof doc.website_url_primary === 'string' && doc.website_url_primary) || '';
        host = url ? new URL(url).hostname : undefined;
      } catch (_) {
        url = undefined;
        host = undefined;
      }
      const rawScore = typeof doc['@search.score'] === 'number' ? doc['@search.score'] : undefined;
      if (rawScore !== undefined) doc.source_score = rawScore;
      doc.provenance = {
        ...existingProv,
        source_tool: doc.source_tool,
        index: doc.index ?? existingProv.index,
        site: doc.site ?? existingProv.site,
        page_type: doc.page_type ?? existingProv.page_type,
        host: host ?? existingProv.host,
        url: url || existingProv.url,
        score: rawScore ?? existingProv.score,
      };
      prepared.push(doc);
    }
    return prepared;
  }

  _computeMinimums(finalTop) {
    const minimums = {};
    for (const key of Object.keys(WoodlandAISearchAll.DEFAULT_MIN_BASE)) {
      const base = this.minBase[key] || 0;
      const ratio = this.minRatio[key] || 0;
      const ratioCount = Math.ceil(finalTop * ratio);
      minimums[key] = Math.max(base, ratioCount);
    }
    return minimums;
  }

  _computeMaxScores(buckets) {
    const maxScores = {};
    for (const bucket of buckets) {
      const docs = Array.isArray(bucket?.docs) ? bucket.docs : [];
      let max = 0;
      for (const doc of docs) {
        const score = typeof doc?.source_score === 'number' ? doc.source_score : 0;
        if (score > max) max = score;
      }
      maxScores[bucket.tool] = max || 1;
    }
    return maxScores;
  }

  _relaxedOverridesFor(tool) {
    if (!this.relaxedDisableReviewed) return undefined;
    if (!['woodland-ai-search', 'woodland-ai-search-cases', 'woodland-ai-search-tractor'].includes(tool)) return undefined;
    return { AZURE_AI_SEARCH_ENFORCE_REVIEWED_ONLY: 'false' };
  }

  async _executeSubtool({ tool, Ctor, query, top, overrides = {} }) {
    try {
      const instance = new Ctor({ ...this.fields, ...overrides });
      const raw = await instance._call({ query, top });
      const docs = JSON.parse(raw);
      return { tool, ok: true, docs };
    } catch (err) {
      return { tool, ok: false, err };
    }
  }
}

module.exports = WoodlandAISearchAll;
