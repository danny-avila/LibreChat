// woodland-ai-search-all.js (aggregator)
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('~/config');

const WoodlandAISearch = require('./WoodlandAISearch');
const WoodlandAISearchTractor = require('./WoodlandAISearchTractor');
const WoodlandAISearchCases = require('./WoodlandAISearchCases');

class WoodlandAISearchAll extends Tool {
  static DEFAULT_TOP = 18;

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search-all';
    this.description =
      "Aggregates results from 'woodland-ai-search', 'woodland-ai-search-tractor', and 'woodland-ai-search-cases' in one call.";

    this.schema = z.object({
      query: z.string().describe('Search word or phrase to Woodland All-Tools'),
      top: z.number().int().positive().optional(),
      perToolTop: z.number().int().positive().optional(),
    });

    // Allow disabling specific sub-tools via env if desired
    this.enableWoodland = String(fields.WOODLAND_ALL_ENABLE_WOODLAND ?? process.env.WOODLAND_ALL_ENABLE_WOODLAND ?? 'true').toLowerCase() === 'true';
    this.enableTractor = String(fields.WOODLAND_ALL_ENABLE_TRACTOR ?? process.env.WOODLAND_ALL_ENABLE_TRACTOR ?? 'true').toLowerCase() === 'true';
    this.enableCases = String(fields.WOODLAND_ALL_ENABLE_CASES ?? process.env.WOODLAND_ALL_ENABLE_CASES ?? 'true').toLowerCase() === 'true';

    logger.info('[woodland-ai-search-all] Initialized', {
      enableWoodland: this.enableWoodland,
      enableTractor: this.enableTractor,
      enableCases: this.enableCases,
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
    // Favor balanced breadth across subtools
    const perToolTop = typeof perToolTopIn === 'number' && Number.isFinite(perToolTopIn)
      ? Math.max(1, Math.floor(perToolTopIn))
      : Math.min(10, Math.max(8, Math.ceil(finalTop / 2)));

    const tasks = [];
    try {
      if (this.enableWoodland) {
        const w = new WoodlandAISearch();
        tasks.push(
          w
            ._call({ query, top: perToolTop })
            .then((s) => ({ tool: 'woodland-ai-search', ok: true, docs: JSON.parse(s) }))
            .catch((e) => ({ tool: 'woodland-ai-search', ok: false, err: e })),
        );
      }
      if (this.enableTractor) {
        const t = new WoodlandAISearchTractor();
        tasks.push(
          t
            ._call({ query, top: perToolTop })
            .then((s) => ({ tool: 'woodland-ai-search-tractor', ok: true, docs: JSON.parse(s) }))
            .catch((e) => ({ tool: 'woodland-ai-search-tractor', ok: false, err: e })),
        );
      }
      if (this.enableCases) {
        const c = new WoodlandAISearchCases();
        tasks.push(
          c
            ._call({ query, top: perToolTop })
            .then((s) => ({ tool: 'woodland-ai-search-cases', ok: true, docs: JSON.parse(s) }))
            .catch((e) => ({ tool: 'woodland-ai-search-cases', ok: false, err: e })),
        );
      }

      const settled = await Promise.all(tasks);
      const buckets = [];
      for (const r of settled) {
        if (!r?.ok) {
          logger.warn('[woodland-ai-search-all] Subtool failed', { tool: r?.tool, error: r?.err?.message || String(r?.err) });
          continue;
        }
        const arr = Array.isArray(r.docs) ? r.docs : [];
        // Tag provenance
        for (const d of arr) {
          if (!d) continue;
          if (!d.source_tool) d.source_tool = r.tool;
          // Add normalized provenance to help downstream reasoning
          try {
            const url = (typeof d.url === 'string' && d.url) || (typeof d.website_url_primary === 'string' && d.website_url_primary) || '';
            const host = url ? new URL(url).hostname : undefined;
            d.provenance = {
              source_tool: d.source_tool,
              index: d.index,
              site: d.site,
              page_type: d.page_type,
              host,
              url: url || undefined,
            };
          } catch (_) {
            d.provenance = {
              source_tool: d.source_tool,
              index: d.index,
              site: d.site,
              page_type: d.page_type,
            };
          }
        }
        buckets.push({ tool: r.tool, docs: arr });
      }

      // Merge strategy:
      // 1) Guarantee minimum per-tool coverage, then 2) fill remaining by priority (woodland -> cases -> tractor)
      const priority = ['woodland-ai-search', 'woodland-ai-search-cases', 'woodland-ai-search-tractor'];
      buckets.sort((a, b) => priority.indexOf(a.tool) - priority.indexOf(b.tool));

      const minPerTool = { 'woodland-ai-search': 3, 'woodland-ai-search-cases': 1, 'woodland-ai-search-tractor': 1 };
      const out = [];
      const seen = new Set();

      const addDoc = (doc) => {
        const k = this._strongKeyOf(doc);
        if (seen.has(k)) return false;
        seen.add(k);
        out.push(doc);
        return true;
      };

      // Phase 1: satisfy minimum quotas per tool (if available)
      for (const b of buckets) {
        const quota = minPerTool[b.tool] || 0;
        if (quota <= 0) continue;
        let added = 0;
        for (const d of b.docs) {
          if (out.length >= finalTop) break;
          if (addDoc(d)) {
            added += 1;
            if (added >= quota) break;
          }
        }
        if (out.length >= finalTop) break;
      }

      // Phase 2: fill remaining by priority order
      for (const b of buckets) {
        for (const d of b.docs) {
          if (out.length >= finalTop) break;
          addDoc(d);
        }
        if (out.length >= finalTop) break;
      }

      logger.info('[woodland-ai-search-all] Aggregated results', {
        totalMerged: out.length,
        sources: buckets.map((b) => ({ tool: b.tool, count: b.docs.length })),
      });

      return JSON.stringify(out);
    } catch (error) {
      logger.error('[woodland-ai-search-all] Failed', { error: error?.message || String(error) });
      return `AZURE_SEARCH_FAILED: ${error?.message || String(error)}`;
    }
  }
}

module.exports = WoodlandAISearchAll;
