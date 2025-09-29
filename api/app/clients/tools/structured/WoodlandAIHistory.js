// /api/app/clients/tools/structured/WoodlandAIHistory.js
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const fetch = require('node-fetch');
const MAX_GROUPS = Number(process.env.WOODLAND_MAX_GROUPS || 20);
const PASS_THROUGH_FIELDS = [
  // non-URL data we surface in answers
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

  // URL fields: ENGINE index
  'engine_maintenance_kit_url',

  // URL fields: PRODUCT index
  'replacement_side_tubes_set1_url',
  'replacement_side_tubes_set2_url',
  'replacement_top_brace_url',
  'replacement_bag_option_1_url',
  'replacement_bag_option_2_url',
  'latch_upgrade_kit_for_exit_chute_url',
  'replacement_collector_complete_url',
  'chassis_url',
  'replacement_impeller_option_1_url',
  'replacement_impeller_option_2_url',
  'impeller_hardware_kit_url',
  'replacement_blower_housing_option_1_url',
  'replacement_blower_housing_option_2_url',
  'replacement_blower_w_impeller_option_1_url',
  'replacement_blower_w_impeller_option_2_url',
  'replacement_engine_option_1_url',
  'replacement_engine_option_2_url',
  'engine_blower_complete_option_1_url',
  'engine_blower_complete_option_2_url',
  'engine_blower_complete_option_3_url',
  'engine_blower_complete_option_4_url',
  'replacement_air_filters_url',
  'mda_collar_url',
  'blower_inlet_url',
  'exit_chute_url',
  'band_clamp_url',
  'pvp_coupling_url',
  'estate_vac_coupling_url',
  'power_unloader_chute_url',
  'roof_rack_carrier_url',
  'pvp_pvc_url',
  'pvp_urethane_url',
  'estate_vac_pvc_url',
  'estate_vac_urethane_url',
  'power_unloader_pvc_url',
  'power_unloader_urethane_url',

  // General/source URL fields
  'airtable_record_url',
  'doc360_url',
  'installation_pdf_url',
  'troubleshooting_pdf_url',
  'safety_pdf_url',
  'video_url',
  'exploded_view_url',
  'url',
  'source_url',
  'link',
];

/**
 * Default URL extraction priority order. Highest priority first.
 */
const URL_PRIORITY_DEFAULT = [
  // Doc360 & docs first
  'doc360_url',
  'installation_pdf_url',
  'troubleshooting_pdf_url',
  'safety_pdf_url',
  'video_url',
  'exploded_view_url',

  // Engine URLs
  'engine_maintenance_kit_url',

  // Product URLs
  'replacement_side_tubes_set1_url',
  'replacement_side_tubes_set2_url',
  'replacement_top_brace_url',
  'replacement_bag_option_1_url',
  'replacement_bag_option_2_url',
  'latch_upgrade_kit_for_exit_chute_url',
  'replacement_collector_complete_url',
  'chassis_url',
  'replacement_impeller_option_1_url',
  'replacement_impeller_option_2_url',
  'impeller_hardware_kit_url',
  'replacement_blower_housing_option_1_url',
  'replacement_blower_housing_option_2_url',
  'replacement_blower_w_impeller_option_1_url',
  'replacement_blower_w_impeller_option_2_url',
  'replacement_engine_option_1_url',
  'replacement_engine_option_2_url',
  'engine_blower_complete_option_1_url',
  'engine_blower_complete_option_2_url',
  'engine_blower_complete_option_3_url',
  'engine_blower_complete_option_4_url',
  'replacement_air_filters_url',
  'mda_collar_url',
  'blower_inlet_url',
  'exit_chute_url',
  'band_clamp_url',
  'pvp_coupling_url',
  'estate_vac_coupling_url',
  'power_unloader_chute_url',
  'roof_rack_carrier_url',
  'pvp_pvc_url',
  'pvp_urethane_url',
  'estate_vac_pvc_url',
  'estate_vac_urethane_url',
  'power_unloader_pvc_url',
  'power_unloader_urethane_url',

  // Generic fallbacks
  'airtable_record_url',
  'url',
  'source_url',
  'link',
];

/**
 * Map of part categories to their fields and corresponding *_url fields.
 * Used to surface per-part URLs and to build all possible combinations.
 */
const PART_FIELD_GROUPS = {
// Safety caps for rendering

  side_tubes: [
    { field: 'replacement_side_tubes_set1', url: 'replacement_side_tubes_set1_url', label: 'replacement side tubes set1' },
    { field: 'replacement_side_tubes_set2', url: 'replacement_side_tubes_set2_url', label: 'replacement side tubes set2' },
  ],
  top_brace: [
    { field: 'replacement_top_brace', url: 'replacement_top_brace_url', label: 'replacement top brace' },
  ],
  bag: [
    { field: 'replacement_bag_option_1', url: 'replacement_bag_option_1_url', label: 'replacement bag option 1' },
    { field: 'replacement_bag_option_2', url: 'replacement_bag_option_2_url', label: 'replacement bag option 2' },
  ],
  impeller: [
    { field: 'replacement_impeller_option_1', url: 'replacement_impeller_option_1_url', label: 'replacement impeller option 1' },
    { field: 'replacement_impeller_option_2', url: 'replacement_impeller_option_2_url', label: 'replacement impeller option 2' },
  ],
  impeller_hardware: [
    { field: 'impeller_hardware_kit', url: 'impeller_hardware_kit_url', label: 'impeller hardware kit' },
  ],
  blower_housing: [
    { field: 'replacement_blower_housing_option_1', url: 'replacement_blower_housing_option_1_url', label: 'replacement blower housing option 1' },
    { field: 'replacement_blower_housing_option_2', url: 'replacement_blower_housing_option_2_url', label: 'replacement blower housing option 2' },
  ],
  blower_with_impeller: [
    { field: 'replacement_blower_w_impeller_option_1', url: 'replacement_blower_w_impeller_option_1_url', label: 'replacement blower w/ impeller option 1' },
    { field: 'replacement_blower_w_impeller_option_2', url: 'replacement_blower_w_impeller_option_2_url', label: 'replacement blower w/ impeller option 2' },
  ],
  engine: [
    { field: 'replacement_engine_option_1', url: 'replacement_engine_option_1_url', label: 'replacement engine option 1' },
    { field: 'replacement_engine_option_2', url: 'replacement_engine_option_2_url', label: 'replacement engine option 2' },
  ],
  engine_blower_complete: [
    { field: 'engine_blower_complete_option_1', url: 'engine_blower_complete_option_1_url', label: 'engine blower complete option 1' },
    { field: 'engine_blower_complete_option_2', url: 'engine_blower_complete_option_2_url', label: 'engine blower complete option 2' },
    { field: 'engine_blower_complete_option_3', url: 'engine_blower_complete_option_3_url', label: 'engine blower complete option 3' },
    { field: 'engine_blower_complete_option_4', url: 'engine_blower_complete_option_4_url', label: 'engine blower complete option 4' },
  ],
  air_filters: [
    { field: 'replacement_air_filters', url: 'replacement_air_filters_url', label: 'replacement air filters' },
  ],
  maintenance_kit: [
    { field: 'engine_maintenance_kit', url: 'engine_maintenance_kit_url', label: 'engine maintenance kit' },
  ],
  mda_collar: [
    { field: 'mda_collar', url: 'mda_collar_url', label: 'mda collar' },
  ],
  blower_inlet: [
    { field: 'blower_inlet', url: 'blower_inlet_url', label: 'blower inlet' },
  ],
  exit_chute: [
    { field: 'exit_chute', url: 'exit_chute_url', label: 'exit chute' },
  ],
  band_clamp: [
    { field: 'band_clamp', url: 'band_clamp_url', label: 'band clamp' },
  ],
  pvp_coupling: [
    { field: 'pvp_coupling', url: 'pvp_coupling_url', label: 'pvp coupling' },
  ],
  estate_vac_coupling: [
    { field: 'estate_vac_coupling', url: 'estate_vac_coupling_url', label: 'estate vac coupling' },
  ],
  power_unloader_chute: [
    { field: 'power_unloader_chute', url: 'power_unloader_chute_url', label: 'power unloader chute' },
  ],
  roof_rack_carrier: [
    { field: 'roof_rack_carrier', url: 'roof_rack_carrier_url', label: 'roof rack carrier' },
  ],
  pvp_pvc: [
    { field: 'pvp_pvc', url: 'pvp_pvc_url', label: 'pvp pvc' },
  ],
  pvp_urethane: [
    { field: 'pvp_urethane', url: 'pvp_urethane_url', label: 'pvp urethane' },
  ],
  estate_vac_pvc: [
    { field: 'estate_vac_pvc', url: 'estate_vac_pvc_url', label: 'estate vac pvc' },
  ],
  estate_vac_urethane: [
    { field: 'estate_vac_urethane', url: 'estate_vac_urethane_url', label: 'estate vac urethane' },
  ],
  power_unloader_pvc: [
    { field: 'power_unloader_pvc', url: 'power_unloader_pvc_url', label: 'power unloader pvc' },
  ],
  power_unloader_urethane: [
    { field: 'power_unloader_urethane', url: 'power_unloader_urethane_url', label: 'power unloader urethane' },
  ],
};

/**
 * Get allowlist/blocklist for URLs from env or config.
 * @param {string} envVal - Comma-separated string from env.
 * @returns {string[]} Array of trimmed, non-empty prefixes.
 */
function parseUrlList(envVal) {
  return (envVal || '').split(',').map(s => s.trim()).filter(Boolean);
}

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
    // Use model fields by default
    this.searchFields = (env('WOODLAND_HISTORY_SEARCH_FIELDS', 'title,content,tags,rake_model,engine_model') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // Optional: date field to filter on (set via env if your index has it, e.g., 'created_at' or 'updated_at')
    this.dateField = env('WOODLAND_HISTORY_DATE_FIELD', ''); // when empty, no date filtering or orderby sent to Azure

    // Allow/block lists for URL extraction
    this.urlAllowlist = parseUrlList(env('WOODLAND_URL_ALLOWLIST',''));
    this.urlBlocklist = parseUrlList(env('WOODLAND_URL_BLOCKLIST',''));
    // Preferred citation source: 'doc360' | 'airtable' | 'auto'
    this.preferCitations = env('WOODLAND_PREFER_CITATIONS','doc360');

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

      /** Output format: 'json' for raw results, 'answer' for Markdown answer */
      format: z.enum(['json','answer']).default('json'),
      /** Maximum number of citations to include in answer (1-10, default 3) */
      maxCitations: z.number().int().positive().max(10).default(3),
      /** Group answer by: 'rake_model', 'engine_model', or 'none' */
      groupBy: z.enum(['rake_model','engine_model','none']).default('none'),
      /** Numeric deck hose diameter (inches) to filter */
      deckHoseInch: z.number().int().optional(),
      /** Numeric horsepower to filter */
      horsepowerNumeric: z.number().int().optional(),
      /** Filter for in-use year >= from */
      inUseYearFrom: z.number().int().optional(),
      /** Filter for in-use year <= to */
      inUseYearTo: z.number().int().optional(),
      /** Preferred citation URL type */
      prefer: z.enum(['doc360','airtable','auto']).optional(),
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
      format = 'json',
      maxCitations = 3,
      groupBy = 'none',
      deckHoseInch,
      horsepowerNumeric,
      inUseYearFrom,
      inUseYearTo,
      prefer,
    } = parsed.data;

    // Normalize identifiers and set relax threshold
    const rakeModelNorm = normalizeWs(rakeModel);
    const engineModelNorm = normalizeWs(engineModel);
    const MIN_RESULTS_BEFORE_RELAX = Number(process.env.WOODLAND_MIN_RESULTS_BEFORE_RELAX || 1);

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
    const addEq = (field, val) => {
      if (!val) return;
      const v = escapeOData(normalizeWs(val));
      // Use strict equality in $filter (prefix matching handled via search + client-side filtering)
      filters.push(`${field} eq '${v}'`);
    };

    // Map friendly names to index fields (eq-only, no prefix matching in $filter)
    if (rakeModelNorm) {
      filters.push(`rake_model eq '${escapeOData(rakeModelNorm)}'`);
    }
    if (engineModelNorm) {
      filters.push(`engine_model eq '${escapeOData(engineModelNorm)}'`);
    }

    // Other structured filters
    // Deck hose can be 'deck_hose' (product) or 'deck_hose_diameter' (engine). Use eq-only matching.
    if (deckHose) {
      const dh = escapeOData(normalizeWs(deckHose));
      filters.push(`(deck_hose eq '${dh}' or deck_hose_diameter eq '${dh}')`);
    }
    addEq('collector_bag', collectorBag);
    addEq('blower_color', blowerColor);
    addEq('engine_horsepower', horsepower);
    addEq('filter_shape', filterShape);
    addEq('air_filter', airFilter);
    addEq('engine_maintenance_kit', engineMaintenanceKit);
    addEq('inuse_date', inUseDate);

    // Numeric/normalized filters
    if (typeof deckHoseInch === 'number' && Number.isFinite(deckHoseInch)) {
      filters.push(`(deck_hose_inch eq ${deckHoseInch}) or (deck_hose_diameter eq '${deckHoseInch}"')`);
    }
    if (typeof horsepowerNumeric === 'number' && Number.isFinite(horsepowerNumeric)) {
      filters.push(`engine_hp eq ${horsepowerNumeric}`);
    }
    if (typeof inUseYearFrom === 'number' && Number.isFinite(inUseYearFrom)) {
      filters.push(`inuse_year_from ge ${inUseYearFrom}`);
    }
    if (typeof inUseYearTo === 'number' && Number.isFinite(inUseYearTo)) {
      filters.push(`inuse_year_to le ${inUseYearTo}`);
    }

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
          const { primaryUrl, supplementalUrls } = extractUrls(d, {
            allow: this.urlAllowlist,
            block: this.urlBlocklist,
            prefer: prefer || this.preferCitations,
          });
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
            // structured fields
            rake_model: d.rake_model,
            engine_model: d.engine_model,
            deck_hose: d.deck_hose,
            deck_hose_diameter: d.deck_hose_diameter,
            collector_bag: d.collector_bag,
            blower_color: d.blower_color,
            engine_horsepower: d.engine_horsepower,
            filter_shape: d.filter_shape,

            // derived helpers
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

          // Pass through all known fields (including *_url fields)
          for (const field of PASS_THROUGH_FIELDS) {
            if (d[field] !== undefined) {
              const value = d[field];
              obj[field] = typeof value === 'string' ? dedupeListText(value) : value;
            }
          }

          // Attach URL/citations
          if (primaryUrl) {
            obj.url = primaryUrl;
            obj.provenance.url = primaryUrl;
          }
          if (supplementalUrls.length) {
            obj.links = supplementalUrls;
          }
          obj.citations = [primaryUrl, ...supplementalUrls].filter(Boolean);

          // Derive per-part lists and combinations
          const { byCategory, flat } = buildParts(obj);
          if (flat.length) obj.parts = flat;
          if (Object.keys(byCategory).length) obj.part_categories = byCategory;
          const combos = buildCombinations(byCategory);
          if (combos.length) obj.part_combinations = combos;

          results.push(obj);
        }
      } catch (err) {
        results.push({
          error: `AZURE_SEARCH_FAILED: ${indexName}: ${err?.message || String(err)}`,
          index: indexName,
          source_tool: 'woodland-ai-history',
        });
      }
    }

    // ---------- Relaxed retry if nothing matched exactly (model string variants) ----------
    if (results.length < MIN_RESULTS_BEFORE_RELAX && (rakeModelNorm || engineModelNorm)) {
      const code = rakeModelNorm ? getRakeModelCodePrefix(rakeModelNorm) : '';
      const engPrefix = engineModelNorm ? getEngineModelPrefix(engineModelNorm) : '';
      const relaxedPayload = { ...basePayload };
      // Remove filters for this retry (unsupported startswith in $filter); rely on search + client filtering
      delete relaxedPayload.filter;
      // Use full Lucene query so we can include wildcards for prefixes
      relaxedPayload.queryType = 'full';
      const terms = [];
      if (query) terms.push(query);
      if (rakeModelNorm) terms.push(`"${escapeLucene(rakeModelNorm)}"`);
      if (engineModelNorm) terms.push(`"${escapeLucene(engineModelNorm)}"`);
      if (code) terms.push(`${escapeLucene(code)}*`);
      if (engPrefix) terms.push(`${escapeLucene(engPrefix)}*`);
      relaxedPayload.search = terms.join(' ');

      for (const indexName of candidateIndexes) {
        const url = `${this.endpoint}/indexes/${encodeURIComponent(indexName)}/docs/search?api-version=${this.apiVersion}`;
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': this.apiKey },
            body: JSON.stringify(relaxedPayload),
          });
          if (!res.ok) continue;
          const data = await res.json();
          const docs = Array.isArray(data.value) ? data.value : [];
          // Client-side filter: allow match by either rake code OR engine prefix (case-insensitive)
          const clientFiltered = docs.filter(d => {
            const rm = (d.rake_model || '').toString().trim().toLowerCase();
            const em = (d.engine_model || '').toString().trim().toLowerCase();
            const codeOk = code ? rm.startsWith(String(code).toLowerCase()) : false;
            const engOk  = engPrefix ? em.startsWith(String(engPrefix).toLowerCase()) : false;
            // if neither prefix provided, keep all; otherwise OR
            return (code || engPrefix) ? (codeOk || engOk) : true;
          });
          for (let i = 0; i < clientFiltered.length; i++) {
            const d = clientFiltered[i];
            const score = typeof d['@search.score'] === 'number' ? d['@search.score'] : undefined;
            const { primaryUrl, supplementalUrls } = extractUrls(d, {
              allow: this.urlAllowlist,
              block: this.urlBlocklist,
              prefer: prefer || this.preferCitations,
            });

            const recordId = d.record_id || d._recordId || '';
            const rakeRaw = (d.rake_model || '').toString();
            let rakeModelCode = '';
            let rakeModelName = '';
            if (rakeRaw) {
              const parts = rakeRaw.split('-').map(s => s.trim()).filter(Boolean);
              if (parts.length > 0) {
                rakeModelCode = parts[0];
                if (parts.length > 1) rakeModelName = parts.slice(1).join(' - ');
              }
            }
            const engineModelStr = (d.engine_model || '').toString();
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
              rake_model: d.rake_model,
              engine_model: d.engine_model,
              deck_hose: d.deck_hose,
              deck_hose_diameter: d.deck_hose_diameter,
              collector_bag: d.collector_bag,
              blower_color: d.blower_color,
              engine_horsepower: d.engine_horsepower,
              filter_shape: d.filter_shape,

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
            if (supplementalUrls.length) obj.links = supplementalUrls;
            obj.citations = [primaryUrl, ...supplementalUrls].filter(Boolean);

            const { byCategory, flat } = buildParts(obj);
            if (flat.length) obj.parts = flat;
            if (Object.keys(byCategory).length) obj.part_categories = byCategory;
            const combos = buildCombinations(byCategory);
            if (combos.length) obj.part_combinations = combos;

            results.push(obj);
          }
        } catch (_) { /* ignore retry errors */ }
      }
    }
    // ---------- end relaxed retry ----------

    // ---------- second relaxed retry: no filters, broaden search; then client-side filter by rake/engine ----------
    if (results.length < MIN_RESULTS_BEFORE_RELAX && (rakeModelNorm || engineModelNorm)) {
      const code = rakeModelNorm ? getRakeModelCodePrefix(rakeModelNorm) : '';
      const engPrefix = engineModelNorm ? getEngineModelPrefix(engineModelNorm) : '';
      const relaxedPayload2 = { ...basePayload };

      // Remove all filters on the second retry
      delete relaxedPayload2.filter;
      relaxedPayload2.queryType = 'full';

      // Combine query + rakeModel + engineModel to help the scorer
      const qParts = [];
      if (query) qParts.push(query);
      if (rakeModelNorm) qParts.push(rakeModelNorm);
      if (engineModelNorm) qParts.push(engineModelNorm);
      relaxedPayload2.search = qParts.join(' ');

      for (const indexName of candidateIndexes) {
        const url = `${this.endpoint}/indexes/${encodeURIComponent(indexName)}/docs/search?api-version=${this.apiVersion}`;
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': this.apiKey },
            body: JSON.stringify(relaxedPayload2),
          });
          if (!res.ok) continue;

          const data = await res.json();
          const docs = Array.isArray(data.value) ? data.value : [];

          // Client-side filter: allow match by either rake code OR engine prefix (case-insensitive)
          const filteredDocs = docs.filter(d => {
            const rm = (d.rake_model || '').toString().trim().toLowerCase();
            const em = (d.engine_model || '').toString().trim().toLowerCase();
            const codeOk = code ? rm.startsWith(String(code).toLowerCase()) : false;
            const engOk  = engPrefix ? em.startsWith(String(engPrefix).toLowerCase()) : false;
            return codeOk || engOk || (!code && !engPrefix);
          });

          for (let i = 0; i < filteredDocs.length; i++) {
            const d = filteredDocs[i];
            const score = typeof d['@search.score'] === 'number' ? d['@search.score'] : undefined;

            const { primaryUrl, supplementalUrls } = extractUrls(d, {
              allow: this.urlAllowlist,
              block: this.urlBlocklist,
              prefer: prefer || this.preferCitations,
            });

            const recordId = d.record_id || d._recordId || '';
            const rakeRaw = (d.rake_model || '').toString();
            let rakeModelCode = '';
            let rakeModelName = '';
            if (rakeRaw) {
              const parts = rakeRaw.split('-').map(s => s.trim()).filter(Boolean);
              if (parts.length > 0) {
                rakeModelCode = parts[0];
                if (parts.length > 1) rakeModelName = parts.slice(1).join(' - ');
              }
            }
            const engineModelStr = (d.engine_model || '').toString();
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

              rake_model: d.rake_model,
              engine_model: d.engine_model,
              deck_hose: d.deck_hose,
              deck_hose_diameter: d.deck_hose_diameter,
              collector_bag: d.collector_bag,
              blower_color: d.blower_color,
              engine_horsepower: d.engine_horsepower,
              filter_shape: d.filter_shape,

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

            // Pass-through fields, including *_url
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
            if (supplementalUrls.length) obj.links = supplementalUrls;
            obj.citations = [primaryUrl, ...supplementalUrls].filter(Boolean);

            // Derive parts & combinations
            const { byCategory, flat } = buildParts(obj);
            if (flat.length) obj.parts = flat;
            if (Object.keys(byCategory).length) obj.part_categories = byCategory;
            const combos = buildCombinations(byCategory);
            if (combos.length) obj.part_combinations = combos;

            results.push(obj);
          }
        } catch (_) { /* ignore */ }
      }
    }
    // ---------- end second relaxed retry ----------

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

    // If no results, return human review string
    if (results.length === 0) {
      return 'NEEDS_HUMAN_REVIEW: No reviewed records found.';
    }

    // If format=answer, build Markdown answer
    if (format === 'answer') {
      return buildAnswer(
        results.slice(0, top),
        {
          maxCitations,
          prefer: prefer || this.preferCitations,
          groupBy,
        }
      );
    }

    // Otherwise, return JSON (with citations attached)
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
function normalizeWs(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

// Escape Lucene special characters for queryType=full
function escapeLucene(str) {
  return String(str || '').replace(/([+\-!(){}\[\]^"~*?:\\/])/g, '\\$1');
}

/**
 * Extract URLs from a doc and return all URL field values as-is (no filtering, normalization, dedupe, or preference).
 * @param {object} doc
 * @param {object} opts
 * @returns {{primaryUrl: string, supplementalUrls: string[]}}
 */
function extractUrls(doc, opts = {}) {
  const preferredOrder = URL_PRIORITY_DEFAULT;
  let urls = [];
  for (const field of preferredOrder) {
    const raw = doc[field];
    if (typeof raw === 'string') {
      urls.push(raw);
    } else if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'string') urls.push(item);
      }
    }
  }
  return {
    primaryUrl: urls[0] || '',
    supplementalUrls: urls.slice(1),
  };
}

/**
 * Deduplicate and normalize URLs, upgrading http->https.
 * @param {string[]} urls
 * @returns {string[]}
 */
function dedupeUrlsAndHttps(urls) {
  const seen = new Set();
  const out = [];
  for (let u of urls) {
    if (!u) continue;
    if (u.startsWith('http:')) {
      u = 'https:' + u.slice(5);
    }
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

/**
 * Pick a primary and supplemental URLs from a list, honoring preference.
 * (Kept for potential future use.)
 */
function pickPrimaryAndLinks(urls, prefer = 'doc360') {
  let arr = Array.isArray(urls) ? [...urls] : [];
  if (arr.length === 0) return { primaryUrl: '', supplementalUrls: [] };
  if (prefer === 'airtable') {
    const airIdx = arr.findIndex(u => /airtable\.com/.test(u));
    if (airIdx > -1) {
      const airUrl = arr[airIdx];
      arr = [airUrl, ...arr.slice(0, airIdx), ...arr.slice(airIdx+1)];
    }
  } else if (prefer === 'doc360') {
    const docIdx = arr.findIndex(u => /doc360|pdf/i.test(u));
    if (docIdx > -1) {
      const docUrl = arr[docIdx];
      arr = [docUrl, ...arr.slice(0, docIdx), ...arr.slice(docIdx+1)];
    }
  }
  return {
    primaryUrl: arr[0] || '',
    supplementalUrls: arr.slice(1),
  };
}

/**
 * Build a Markdown answer with summary, bullets, and citations.
 * - Renders real per-part URLs from *_url fields when present.
 * - Dedupes parts, groups repeated labels, and allows env-configurable caps (default unlimited).
 */
function buildAnswer(docs, { maxCitations = 3, prefer = 'doc360', groupBy = 'none' } = {}) {
  if (!Array.isArray(docs) || docs.length === 0) {
    return 'NEEDS_HUMAN_REVIEW: No reviewed records found.';
  }

  // Helper: merge all part items across a set of docs, de-duping by (field, sku)
  const collectPartsFromDocs = (arr) => {
    const byCategory = new Map();
    const seen = new Set(); // key: `${field}::${sku}`

    for (const doc of arr) {
      // Prefer the precomputed `parts` array if present
      if (Array.isArray(doc.parts) && doc.parts.length) {
        for (const item of doc.parts) {
          if (!item || !item.field || !item.sku) continue;
          const key = `${item.field}::${item.sku}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (!byCategory.has(item.category)) byCategory.set(item.category, []);
          byCategory.get(item.category).push({
            label: item.label || item.field.replace(/_/g, ' '),
            field: item.field,
            sku: String(item.sku).trim(),
            url: item.url ? String(item.url).trim() : undefined,
          });
        }
        continue; // next doc
      }

      // If `parts` was not built for some reason, fall back to PART_FIELD_GROUPS against raw fields
      for (const [category, specs] of Object.entries(PART_FIELD_GROUPS)) {
        for (const spec of specs) {
          const sku = doc[spec.field];
          if (!sku) continue;
          const key = `${spec.field}::${sku}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const url = doc[spec.url];
          if (!byCategory.has(category)) byCategory.set(category, []);
          byCategory.get(category).push({
            label: spec.label,
            field: spec.field,
            sku: String(sku).trim(),
            url: url ? String(url).trim() : undefined,
          });
        }
      }
    }

    // Sort entries within each category by label then SKU
    for (const list of byCategory.values()) {
      list.sort((a, b) => (a.label || '').localeCompare(b.label || '') || (a.sku || '').localeCompare(b.sku || ''));
    }
    return byCategory;
  };

  // Group docs as needed
  let groups = [];
  if (groupBy === 'rake_model' || groupBy === 'engine_model') {
    const field = groupBy;
    const map = new Map();
    for (const doc of docs) {
      const key = doc[field] || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(doc);
    }
    groups = Array.from(map.entries()).map(([key, arr]) => ({ key, docs: arr }));
  } else {
    groups = [{ key: '', docs }];
  }
  // Cap the number of groups to render to avoid long outputs
  if (Number.isFinite(MAX_GROUPS) && groups.length > MAX_GROUPS) {
    groups.sort((a, b) => {
      const ka = (a.key || '').toString();
      const kb = (b.key || '').toString();
      return ka.localeCompare(kb);
    });
    groups = groups.slice(0, MAX_GROUPS);
  }

  let out = '';
  for (const group of groups) {
    const first = group.docs[0];
    // Skip groups with no meaningful data
    const hasAnyPart = Array.isArray(first.parts) ? first.parts.length > 0 : Object.values(PART_FIELD_GROUPS).some(specs => specs.some(s => first[s.field]));
    const hasKeyInfo = (first.rake_model && String(first.rake_model).trim()) || (first.engine_model && String(first.engine_model).trim());
    if (!hasAnyPart && !hasKeyInfo) {
      continue;
    }

    // Deterministic group header (no narrative text)
    let header = '';
    if (groupBy === 'engine_model') {
      const key = (group.key || first.engine_model || '').toString().trim();
      header = key ? `Engine: ${key}` : 'Engine';
    } else if (groupBy === 'rake_model') {
      const key = (group.key || first.rake_model || '').toString().trim();
      header = key ? `Model: ${key}` : 'Model';
    } else {
      // Fallback to concise label if neither grouping is active
      const rm = (first.rake_model || '').toString().trim();
      const em = (first.engine_model || '').toString().trim();
      if (rm && em) header = `${rm} — ${em}`;
      else if (rm) header = rm;
      else if (em) header = em;
      else header = 'Product Group';
    }
    out += `**${header}**\n`;

    // Parts (preferred) — show all with direct URLs when present
    const partsByCategory = collectPartsFromDocs(group.docs);
    if (partsByCategory.size > 0) {
      for (const [category, items] of partsByCategory.entries()) {
        // Pretty category label
        const catLabel = category.replace(/_/g, ' ');
        out += `- **${catLabel}:**\n`;

        // 1) Deduplicate by (field, sku, url)
        const dedupSeen = new Set();
        const deduped = [];
        for (const it of items) {
          const key = `${it.field || ''}::${it.sku || ''}::${it.url || ''}`;
          if (dedupSeen.has(key)) continue;
          dedupSeen.add(key);
          deduped.push(it);
        }

        // 2) Group by label so repeated labels collapse into one line with multiple SKUs
        const byLabel = new Map(); // label -> [{sku, url}]
        for (const it of deduped) {
          const labelText = (it.label || (it.field || '').replace(/_/g, ' ')).trim();
          if (!byLabel.has(labelText)) byLabel.set(labelText, []);
          byLabel.get(labelText).push({ sku: String(it.sku || '').trim(), url: it.url ? String(it.url).trim() : '' });
        }

        // 3) Sort labels and render; caps are env-configurable (default unlimited)
        const MAX_ITEMS_PER_CATEGORY = Number(process.env.WOODLAND_MAX_ITEMS_PER_CATEGORY || Infinity);
        const MAX_SKUS_PER_LABEL = Number(process.env.WOODLAND_MAX_SKUS_PER_LABEL || Infinity);
        const labels = Array.from(byLabel.keys()).sort((a,b) => a.localeCompare(b));

        let renderedCount = 0;
        for (const labelText of labels) {
          if (Number.isFinite(MAX_ITEMS_PER_CATEGORY) && renderedCount >= MAX_ITEMS_PER_CATEGORY) {
            const remaining = labels.length - renderedCount;
            if (remaining > 0) out += `  - (+${remaining} more)\n`;
            break;
          }
          const entries = byLabel.get(labelText) || [];

          // Dedupe SKUs within a label and preserve first URL per SKU
          const skuMap = new Map(); // sku -> url
          for (const e of entries) {
            if (!e.sku) continue;
            if (!skuMap.has(e.sku)) skuMap.set(e.sku, e.url || '');
          }
          const skus = Array.from(skuMap.keys()).sort((a,b) => a.localeCompare(b));

          // Cap long SKU lists per label
          let line = `  - **${labelText}:** `;
          if (skus.length === 0) {
            line += 'N/A\n';
            out += line;
            renderedCount++;
            continue;
          }

          const shown = Number.isFinite(MAX_SKUS_PER_LABEL) ? skus.slice(0, MAX_SKUS_PER_LABEL) : skus;
          const extra = Number.isFinite(MAX_SKUS_PER_LABEL) ? (skus.length - shown.length) : 0;

          // Render SKUs inline, each optionally with a link
          const partsInline = shown.map(sku => {
            const u = skuMap.get(sku);
            return u ? `${sku} [Link](${u})` : sku;
          }).join(', ');

          line += partsInline;
          if (extra > 0) line += `, +${extra} more`;
          out += line + '\n';
          renderedCount++;
        }
      }
      out += '\n';
    } else {
      // Fallback to top 5 notable fields if no parts resolved
      const fieldOrder = PASS_THROUGH_FIELDS;
      const fieldBullets = [];
      for (const doc of group.docs) {
        for (const field of fieldOrder) {
          if (doc[field] !== undefined && doc[field] !== null) {
            const val = String(doc[field]).trim();
            if (val && !fieldBullets.some(b => b.value === val && b.field === field)) {
              fieldBullets.push({ field, value: val });
              if (fieldBullets.length >= 5) break;
            }
          }
        }
        if (fieldBullets.length >= 5) break;
      }
      for (const b of fieldBullets) {
        out += `- **${b.field.replace(/_/g, ' ')}:** ${b.value}\n`;
      }
      out += '\n';
    }
  }

  // Citations section: use collected citations from docs, capped
  let allCites = [];
  for (const doc of docs) {
    if (Array.isArray(doc.citations)) {
      allCites.push(...doc.citations.filter(Boolean));
    }
  }
  const citeArr = allCites.slice(0, maxCitations);
  if (citeArr.length > 0) {
    out += `**Citations:**\n`;
    for (let i = 0; i < citeArr.length; ++i) {
      out += `[Source ${i+1}](${citeArr[i]})\n`;
    }
  }

  return out.trim();
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

// Extract numeric code prefix from a rake model string (e.g., "107 - Commercial Pro" -> "107")
function getRakeModelCodePrefix(str) {
  if (!str) return '';
  const m = String(str).trim().match(/^(\d{2,3})/);
  return m ? m[1] : '';
}

// Extract leading engine model prefix before a hyphen (e.g., "XR 950 - 130G32-0184-F1" -> "XR 950")
function getEngineModelPrefix(str) {
  if (!str) return '';
  const s = String(str).trim();
  const idx = s.indexOf(' -');
  if (idx > -1) return s.slice(0, idx).trim();
  return s;
}

/** Build parts arrays from a doc using PART_FIELD_GROUPS */
function buildParts(doc) {
  const byCategory = {};
  const flat = [];
  for (const [category, fields] of Object.entries(PART_FIELD_GROUPS)) {
    const items = [];
    for (const spec of fields) {
      const sku = doc[spec.field];
      const url = doc[spec.url];
      if (!sku) continue;
      const item = { category, label: spec.label, field: spec.field, sku: String(sku).trim() };
      if (url) item.url = String(url).trim();
      items.push(item);
      flat.push(item);
    }
    if (items.length) byCategory[category] = items;
  }
  return { byCategory, flat };
}

/** Cartesian product of arrays in byCategory to list all combinations */
function buildCombinations(byCategory) {
  const cats = Object.keys(byCategory);
  if (!cats.length) return [];
  const lists = cats.map(c => byCategory[c]);
  const results = [];
  const backtrack = (idx, acc) => {
    if (idx === lists.length) { results.push({ parts: acc }); return; }
    for (const item of lists[idx]) backtrack(idx + 1, [...acc, item]);
  };
  backtrack(0, []);
  return results;
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