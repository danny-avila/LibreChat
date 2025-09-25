// /api/app/clients/tools/structured/WoodlandAIHistory.js
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const fetch = require('node-fetch');

const PASS_THROUGH_FIELDS = [
  'engine_maintenance_kit',
  'air_filter',
  'inuse_date',
  'replacement_side_tubes_set1',
  'replacement_side_tubes_set2',
  'replacement_top_brace',
  'replacement_bag_option_1',
  'replacement_bag_option_2',
  'latch_upgrade_kit_for_exit_chute',
  'replacement_collector_complete',
  'chassis',
  'replacement_impeller_option_1',
  'replacement_impeller_option_2',
  'replacement_blower_housing_option_1',
  'replacement_blower_housing_option_2',
  'replacement_blower_w_impeller_option_1',
  'replacement_blower_w_impeller_option_2',
  'replacement_engine_option_1',
  'replacement_engine_option_2',
  'engine_blower_complete_option_1',
  'engine_blower_complete_option_2',
  'engine_blower_complete_option_3',
  'engine_blower_complete_option_4',
  'impeller_hardware_kit',
  'replacement_air_filters',
  'mda_collar',
  'blower_inlet',
  'exit_chute',
  'band_clamp',
  'pvp_coupling',
  'estate_vac_coupling',
  'power_unloader_chute',
  'roof_rack_carrier',
  'pvp_pvc',
  'pvp_urethane',
  'estate_vac_pvc',
  'estate_vac_urethane',
  'power_unloader_pvc',
  'power_unloader_urethane',
  'quick_facts',
  'airtable_record_url',
  'doc360_url',
  'installation_pdf_url',
  'troubleshooting_pdf_url',
  'safety_pdf_url',
  'video_url',
  'exploded_view_url',
];

class WoodlandAIHistory extends Tool {
  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-history';
    this.description =
      'Query Airtable Product/Engine history (one or both indexes). Supports text + structured filters; merges results with provenance.';

    this.fields = { ...fields };
    const env = (k, f = undefined) => fields?.[k] ?? process.env?.[k] ?? f;

    this.endpoint = trimSlash(env('AZURE_AI_SEARCH_SERVICE_ENDPOINT'));
    this.apiKey = env('AZURE_AI_SEARCH_API_KEY');

    // Accept comma-separated indexes in env, or a single name
    const rawIndexEnv =
      env('AZURE_AI_SEARCH_HISTORY_INDEX') || env('AZURE_AI_SEARCH_INDEX_NAME');
    this.allIndexNames = (rawIndexEnv || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    this.apiVersion = env('AZURE_AI_SEARCH_API_VERSION', '2024-07-01');

    if (!this.endpoint || !this.apiKey) {
      throw new Error(
        '[woodland-ai-history] Missing env: AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_API_KEY'
      );
    }

    // Defaults for Airtable history indexes
    this.defaultTop = toInt(env('WOODLAND_HISTORY_DEFAULT_TOP', 20), 20);
    this.maxTop = toInt(env('WOODLAND_HISTORY_MAX_TOP', 50), 50);
    this.searchMode = env('WOODLAND_HISTORY_SEARCH_MODE', 'simple'); // 'simple' | 'semantic'
    this.searchFields = (env('WOODLAND_HISTORY_SEARCH_FIELDS', 'title,content,tags') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // Optional: date field to filter on (set via env if your index has it, e.g., 'created_at' or 'updated_at')
    this.dateField = env('WOODLAND_HISTORY_DATE_FIELD', ''); // when empty, no date filtering or orderby sent to Azure

    // Schema tailored to engine/product history
    this.schema = z.object({
      query: z.string().default('').describe('Text to search (title/content/tags).'),
      top: z.number().int().positive().max(this.maxTop).optional(),

      // Choose which indexes to hit
      indexes: z.enum(['engine', 'product', 'both']).default('both'),

      // Structured filters (mapped to Azure fields)
      rakeModel: z.string().optional(),          // -> rake_model
      engineModel: z.string().optional(),        // -> engine_model
      deckHose: z.string().optional(),           // -> deck_hose or deck_hose_diameter
      collectorBag: z.string().optional(),       // -> collector_bag
      blowerColor: z.string().optional(),        // -> blower_color
      horsepower: z.string().optional(),         // -> engine_horsepower
      filterShape: z.string().optional(),        // -> filter_shape
      airFilter: z.string().optional(),          // -> air_filter (engine history)
      engineMaintenanceKit: z.string().optional(), // -> engine_maintenance_kit
      inUseDate: z.string().optional(),          // -> inuse_date (engine history)

      // Time window
      start: z.string().optional(),
      end: z.string().optional(),
      days: z.number().int().positive().optional(),

      // Pass-through to force specific index names (advanced)
      overrideIndexes: z.array(z.string()).optional(),
    });
  }

  async _call(input) {
    const parsed = this.schema.safeParse(input);
    if (!parsed.success) {
      return `INPUT_VALIDATION_FAILED: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`;
    }
    const {
      query = '',
      top: topIn,
      indexes,
      rakeModel,
      engineModel,
      deckHose,
      collectorBag,
      blowerColor,
      horsepower,
      filterShape,
      airFilter,
      engineMaintenanceKit,
      inUseDate,
      start,
      end,
      days,
      overrideIndexes,
    } = parsed.data;

    const top = Math.max(
      1,
      Math.min(this.maxTop, Number.isFinite(topIn) ? Math.floor(topIn) : this.defaultTop)
    );

    // Resolve which indexes to query
    let candidateIndexes = resolveIndexes({
      indexes,
      overrideIndexes,
      allIndexNames: this.allIndexNames,
    });
    if (candidateIndexes.length === 0) {
      return 'AZURE_SEARCH_FAILED: No history indexes configured or resolved (engine/product).';
    }

    const filters = [];
    // Only add date filters if a date field is configured
    if (this.dateField) {
      if (start && end) filters.push(`${this.dateField} ge ${toODataDate(start)} and ${this.dateField} lt ${toODataDate(end)}`);
      else if (start) filters.push(`${this.dateField} ge ${toODataDate(start)}`);
      else if (end) filters.push(`${this.dateField} lt ${toODataDate(end)}`);
      else if (Number.isFinite(days)) {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        filters.push(`${this.dateField} ge ${toODataDate(since)}`);
      }
    }

    // Structured filters – use the union of fields across both indexes
    // (We only add a filter if a value is provided)
    const addEq = (field, val) => {
      if (!val) return;
      filters.push(`${field} eq '${escapeOData(val)}'`);
    };

    // Map friendly names to index fields
    addEq('rake_model', rakeModel);
    addEq('engine_model', engineModel);
    // Deck hose can be 'deck_hose' (product) or 'deck_hose_diameter' (engine). We OR them.
    if (deckHose) {
      filters.push(
        `(deck_hose eq '${escapeOData(deckHose)}' or deck_hose_diameter eq '${escapeOData(deckHose)}')`
      );
    }
    addEq('collector_bag', collectorBag);
    addEq('blower_color', blowerColor);
    addEq('engine_horsepower', horsepower);
    addEq('filter_shape', filterShape);
    addEq('air_filter', airFilter);
    addEq('engine_maintenance_kit', engineMaintenanceKit);
    addEq('inuse_date', inUseDate);

    const basePayload = {
      search: query || '*',
      top,
      count: true,
    };

    if (this.searchMode === 'semantic') {
      basePayload.queryType = 'semantic';
      basePayload.queryLanguage = 'en-us';
      basePayload.semanticConfiguration = 'default'; // only if configured on the index
    } else {
      basePayload.queryType = 'simple';
      if (this.searchFields.length) {
        basePayload.searchFields = this.searchFields.join(',');
      }
    }
    if (filters.length) basePayload.filter = filters.join(' and ');

    // Fan-out to each index, merge results
    const results = [];
    for (const indexName of candidateIndexes) {
      const url = `${this.endpoint}/indexes/${encodeURIComponent(indexName)}/docs/search?api-version=${this.apiVersion}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': this.apiKey },
          body: JSON.stringify(basePayload),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`${indexName}: ${res.status} ${res.statusText} ${text}`);
        }
        const data = await res.json();
        const docs = Array.isArray(data.value) ? data.value : [];
        for (let i = 0; i < docs.length; i++) {
          const d = docs[i];
          const score = typeof d['@search.score'] === 'number' ? d['@search.score'] : undefined;
          const { primaryUrl, supplementalUrls } = extractUrls(d);
          const recordId = d.record_id || d._recordId || '';

          // Derive clean rake model code/name and helpful summary lines for rendering
          const rakeRaw = (d.rake_model || '').toString();
          let rakeModelCode = '';
          let rakeModelName = '';
          if (rakeRaw) {
            const parts = rakeRaw.split('-').map(s => s.trim()).filter(Boolean);
            if (parts.length > 0) {
              rakeModelCode = parts[0]; // e.g., "112"
              if (parts.length > 1) {
                rakeModelName = parts.slice(1).join(' - '); // e.g., "Z-10" or "XL"
              }
            }
          }
          const engineModelStr = (d.engine_model || '').toString();
          // Build two convenience summary lines consumers can print directly
          const engineOptionLineByModel =
            rakeModelCode || rakeModelName
              ? `${rakeModelCode}${rakeModelName ? ' - ' + rakeModelName : ''} - Equipped with the ${engineModelStr} engine`
              : '';
          const engineOptionLineByEngine =
            engineModelStr
              ? `${engineModelStr} - Used in the ${rakeModelName || rakeModelCode} model`
              : '';

          const obj = {
            id: d.id || d.key || d.record_id,
            title: d.title,
            content: dedupeListText(d.content),
            tags: d.tags || [],
            created_at: d.created_at,
            updated_at: d.updated_at,
            index: indexName,
            site: 'history',
            page_type: indexName.includes('engine') ? 'enginehistory' : 'producthistory',
            '@search.score': score,
            // structured fields (if present on this doc)
            rake_model: d.rake_model,
            engine_model: d.engine_model,
            deck_hose: d.deck_hose,
            deck_hose_diameter: d.deck_hose_diameter,
            collector_bag: d.collector_bag,
            blower_color: d.blower_color,
            engine_horsepower: d.engine_horsepower,
            filter_shape: d.filter_shape,

            // derived helpers for rendering
            rake_model_code: rakeModelCode,
            rake_model_name: rakeModelName,
            engine_option_line_model: engineOptionLineByModel,
            engine_option_line_engine: engineOptionLineByEngine,

            record_id: recordId,

            provenance: {
              index: indexName,
              site: 'history',
              page_type: indexName.includes('engine') ? 'enginehistory' : 'producthistory',
              score,
              rank: i + 1,
              source_tool: 'woodland-ai-history',
            },
            source_tool: 'woodland-ai-history',
            source_score: score,
          };
          for (const field of PASS_THROUGH_FIELDS) {
            if (d[field] !== undefined) {
              const value = d[field];
              obj[field] = typeof value === 'string' ? dedupeListText(value) : value;
            }
          }
          if (primaryUrl) {
            obj.url = primaryUrl;
            obj.provenance.url = primaryUrl;
          }
          if (supplementalUrls.length) {
            obj.links = supplementalUrls;
          }
          results.push(obj);
        }
      } catch (err) {
        // Don’t fail the whole call if one index errors; include an error stub.
        results.push({
          error: `AZURE_SEARCH_FAILED: ${indexName}: ${err?.message || String(err)}`,
          index: indexName,
          source_tool: 'woodland-ai-history',
        });
      }
    }

    // Sort & trim globally
    results.sort((a, b) => {
      // Prefer configured dateField desc if present, else by score desc
      const ta = (this.dateField && a[this.dateField]) ? Date.parse(a[this.dateField]) : 0;
      const tb = (this.dateField && b[this.dateField]) ? Date.parse(b[this.dateField]) : 0;
      if (tb !== ta) return tb - ta;
      const sa = a['@search.score'] ?? 0;
      const sb = b['@search.score'] ?? 0;
      return sb - sa;
    });

    return JSON.stringify(results.slice(0, top));
  }
}

/* helpers */
function escapeOData(s) {
  return String(s).replace(/'/g, "''");
}
function toODataDate(isoLike) {
  const dt = new Date(isoLike);
  if (isNaN(dt.getTime())) return `datetime'${String(isoLike)}'`;
  return `datetime'${dt.toISOString()}'`;
}
function toInt(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}
function trimSlash(v) {
  if (!v) return v;
  return v.endsWith('/') ? v.slice(0, -1) : v;
}
function extractUrls(doc) {
  const preferredOrder = [
    'doc360_url',
    'installation_pdf_url',
    'troubleshooting_pdf_url',
    'safety_pdf_url',
    'video_url',
    'exploded_view_url',
    'airtable_record_url',
    'url',
    'source_url',
    'link',
  ];
  const urls = [];
  for (const field of preferredOrder) {
    const raw = doc[field];
    if (typeof raw === 'string' && looksLikeUrl(raw)) {
      urls.push(normalizeUrl(raw));
    } else if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'string' && looksLikeUrl(item)) {
          urls.push(normalizeUrl(item));
        }
      }
    }
  }
  const unique = [...new Set(urls)];
  return {
    primaryUrl: unique[0] || '',
    supplementalUrls: unique.slice(1),
  };
}
function looksLikeUrl(value) {
  return /^https?:\/\//i.test(value?.trim());
}
function normalizeUrl(value) {
  return value.trim();
}
function dedupeListText(value) {
  if (typeof value !== 'string') return value;
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const seen = new Set();
  const keep = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (keep.length && keep[keep.length - 1] === '') continue;
      keep.push('');
      continue;
    }
    const normalized = trimmed
      .replace(/^[\-*•]+\s*/, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    keep.push(line);
  }
  while (keep.length && keep[0] === '') keep.shift();
  while (keep.length && keep[keep.length - 1] === '') keep.pop();
  return keep.join('\n');
}

/** Resolve desired indexes from user choice + env */
function resolveIndexes({ indexes, overrideIndexes, allIndexNames }) {
  if (Array.isArray(overrideIndexes) && overrideIndexes.length) {
    return overrideIndexes;
  }
  // Heuristics: find names that contain keywords
  const hasEngine = allIndexNames.filter((n) => /engine/i.test(n));
  const hasProduct = allIndexNames.filter((n) => /product/i.test(n));

  if (indexes === 'engine') return hasEngine.length ? hasEngine : allIndexNames;
  if (indexes === 'product') return hasProduct.length ? hasProduct : allIndexNames;

  // both
  const both = [...new Set([...hasEngine, ...hasProduct])];
  return both.length ? both : allIndexNames;
}

module.exports = WoodlandAIHistory;
