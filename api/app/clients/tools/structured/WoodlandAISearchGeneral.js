// woodland-ai-search-general.js (grounded two-phase aggregator)
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('~/config');

const WoodlandAISearch = require('./WoodlandAISearch');
const WoodlandAISearchCases = require('./WoodlandAISearchCases');

class WoodlandAISearchGeneral extends Tool {
  static DEFAULT_TOP = 9;
  static DEFAULT_MIN_HITS = 3;

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search-general';
    this.description = "Grounded general Woodland search: query 'woodland-ai-search' first; if results are weak, fall back to 'woodland-ai-search-cases'.";

    this.schema = z.object({
      query: z.string().describe('Search phrase for Woodland General (Grounded)'),
      top: z.number().int().positive().optional(),
      minHits: z.number().int().positive().optional(),
      perToolTop: z.number().int().positive().optional(),
    });

    this.minHits = Number(fields.minHits || process.env.WOODLAND_GENERAL_MIN_HITS || WoodlandAISearchGeneral.DEFAULT_MIN_HITS);
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

  _parseDocs(res) {
    try {
      if (typeof res === 'string') {
        if (res.startsWith('AZURE_SEARCH_FAILED')) return [];
        return JSON.parse(res);
      }
      return Array.isArray(res) ? res : [];
    } catch (_) {
      return [];
    }
  }

  async _call(data) {
    const { query, top: topIn, minHits: minIn, perToolTop: perToolTopIn } = data;
    const finalTop = typeof topIn === 'number' && Number.isFinite(topIn) ? Math.max(1, Math.floor(topIn)) : WoodlandAISearchGeneral.DEFAULT_TOP;
    const perToolTop = typeof perToolTopIn === 'number' && Number.isFinite(perToolTopIn) ? Math.max(1, Math.floor(perToolTopIn)) : finalTop;
    const minHits = typeof minIn === 'number' && Number.isFinite(minIn) ? Math.max(1, Math.floor(minIn)) : this.minHits;

    try {
      // Phase 1: primary multi-index search
      const primary = new WoodlandAISearch();
      const primaryRaw = await primary._call({ query, top: perToolTop });
      const primaryDocs = this._parseDocs(primaryRaw);

      logger.info('[woodland-ai-search-general] Primary woodland hits', { count: primaryDocs.length });

      if ((primaryDocs?.length || 0) >= minHits) {
        // Return best N uniques from woodland only
        const out = [];
        const seen = new Set();
        for (const d of primaryDocs) {
          const k = this._keyOf(d);
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ ...d, source_tool: d?.source_tool || 'woodland-ai-search' });
          if (out.length >= finalTop) break;
        }
        return JSON.stringify(out);
      }

      // Phase 2: fallback to cases (exactly once)
      const cases = new WoodlandAISearchCases();
      const casesRaw = await cases._call({ query, top: perToolTop });
      const casesDocs = this._parseDocs(casesRaw);

      logger.info('[woodland-ai-search-general] Fallback cases hits', { count: casesDocs.length });

      // Merge woodland -> cases with dedupe
      const merged = [];
      const seen = new Set();
      for (const src of [primaryDocs, casesDocs]) {
        for (const d of src) {
          const k = this._keyOf(d);
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push({ ...d, source_tool: d?.source_tool || (src === primaryDocs ? 'woodland-ai-search' : 'woodland-ai-search-cases') });
          if (merged.length >= finalTop) break;
        }
        if (merged.length >= finalTop) break;
      }

      return JSON.stringify(merged);
    } catch (error) {
      logger.error('[woodland-ai-search-general] Failed', { error: error?.message || String(error) });
      return `AZURE_SEARCH_FAILED: ${error?.message || String(error)}`;
    }
  }
}

module.exports = WoodlandAISearchGeneral;

