// /api/app/clients/tools/structured/WoodlandProductHistory.js
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

class WoodlandProductHistory extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_QUERY_TYPE = 'simple';
  static DEFAULT_TOP = 20;

  _initializeField(field, envVar, defaultValue) {
    return field ?? process.env[envVar] ?? defaultValue;
  }

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-product-history';
    this.description =
      'Use to query the Airtable Product History (product indexes only). Strict $filter eq, optional relaxed retry, only index fields used.';
    this.override = fields.override ?? false;

    // Schema: only Azure product index fields (+ output controls)
    this.schema = z.object({
      query: z.string().default(''),

      // Filters (strict equality in $filter)
      rakeModel: z.string().optional(),    // rake_model
      engineModel: z.string().optional(),  // engine_model
      deckHose: z.string().optional(),     // deck_hose
      collectorBag: z.string().optional(), // collector_bag
      blowerColor: z.string().optional(),  // blower_color

      // Output controls
      format: z.enum(['json', 'answer']).default('answer'),
      maxCitations: z.number().int().positive().max(10).default(3),
      groupBy: z.enum(['rake_model', 'engine_model', 'none']).default('rake_model'),

      top: z.number().int().positive().max(100).optional(),
    });

    // Core fields & options
    this.serviceEndpoint = this._initializeField(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      'AZURE_AI_SEARCH_SERVICE_ENDPOINT'
    );
    // Comma-separated allowed; we’ll pick product-only below
    this.indexName = this._initializeField(
      fields.AZURE_AI_SEARCH_HISTORY_INDEX ?? fields.AZURE_AI_SEARCH_INDEX_NAME,
      'AZURE_AI_SEARCH_HISTORY_INDEX',
    );
    this.apiKey = this._initializeField(fields.AZURE_AI_SEARCH_API_KEY, 'AZURE_AI_SEARCH_API_KEY');
    this.apiVersion = this._initializeField(
      fields.AZURE_AI_SEARCH_API_VERSION, 'AZURE_AI_SEARCH_API_VERSION', WoodlandProductHistory.DEFAULT_API_VERSION
    );
    this.queryType = this._initializeField(
      fields.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE,
      'AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE',
      WoodlandProductHistory.DEFAULT_QUERY_TYPE
    );
    this.topDefault = Number(this._initializeField(
      fields.WOODLAND_HISTORY_DEFAULT_TOP,
      'WOODLAND_HISTORY_DEFAULT_TOP',
      WoodlandProductHistory.DEFAULT_TOP
    ));

    this.searchFields = (this._initializeField(
      fields.WOODLAND_HISTORY_SEARCH_FIELDS,
      'WOODLAND_HISTORY_SEARCH_FIELDS',
      'title,content,tags,rake_model,engine_model'
    ) || '').split(',').map(s => s.trim()).filter(Boolean);

    this.enableRelaxedRetry = (this._initializeField(
      fields.WOODLAND_ENABLE_RELAXED_RETRY,
      'WOODLAND_ENABLE_RELAXED_RETRY',
      '1'
    ) !== '0');

    // Requireds
    if (!this.override && (!this.serviceEndpoint || !this.indexName || !this.apiKey)) {
      throw new Error(
        'Missing AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_HISTORY_INDEX (or AZURE_AI_SEARCH_INDEX_NAME), or AZURE_AI_SEARCH_API_KEY.'
      );
    }
    if (this.override) return;

    // Resolve product-only indexes
    const allIndexNames = String(this.indexName)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    this.productIndexes = allIndexNames.filter(n => /product/i.test(n));
    if (this.productIndexes.length === 0 && allIndexNames.length === 1) {
      this.productIndexes = allIndexNames;
    }
    if (this.productIndexes.length === 0) {
      throw new Error('[woodland-product-history] No product index configured (expects name containing "product").');
    }

    // Client per index
    this.clients = this.productIndexes.map(
      name => new SearchClient(this.serviceEndpoint, name, new AzureKeyCredential(this.apiKey), { apiVersion: this.apiVersion })
    );
  }

  _buildFilter(input) {
    const filters = [];
    const addEq = (field, value) => {
      if (!value) return;
      const sanitized = String(value).replace(/'/g, "''").replace(/\s+/g, ' ').trim();
      filters.push(`${field} eq '${sanitized}'`);
    };
    addEq('rake_model', input.rakeModel);
    addEq('engine_model', input.engineModel);
    addEq('deck_hose', input.deckHose);
    addEq('collector_bag', input.collectorBag);
    addEq('blower_color', input.blowerColor);
    return filters.join(' and ');
  }

  /** Collect URLs strictly from *_url fields you defined in the Product index */
  _collectUrls(doc) {
    // Add only the URL siblings you indexed
    const possible = [
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
      'engine_maintenance_kit_url',
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
    ];
    const urls = [];
    for (const f of possible) {
      const v = doc[f];
      if (!v) continue;
      if (typeof v === 'string') urls.push(v);
      else if (Array.isArray(v)) for (const u of v) if (typeof u === 'string') urls.push(u);
    }
    return { primaryUrl: urls[0] || '', supplementalUrls: urls.slice(1) };
  }

  _shapeDoc(d, indexName) {
    const { primaryUrl, supplementalUrls } = this._collectUrls(d);
    const out = {
      id: d.id || d.key || d.record_id,
      title: d.title,
      content: typeof d.content === 'string' ? d.content : '',
      tags: d.tags || [],
      index: indexName,
      page_type: 'producthistory',
      '@search.score': typeof d['@search.score'] === 'number' ? d['@search.score'] : undefined,
      citations: [primaryUrl, ...(supplementalUrls || [])].filter(Boolean),

      // Only product fields from your index
      rake_model: d.rake_model,
      deck_hose: d.deck_hose,
      collector_bag: d.collector_bag,
      blower_color: d.blower_color,
      engine_model: d.engine_model,

      replacement_side_tubes_set1: d.replacement_side_tubes_set1,
      replacement_side_tubes_set2: d.replacement_side_tubes_set2,
      replacement_top_brace: d.replacement_top_brace,
      replacement_bag_option_1: d.replacement_bag_option_1,
      replacement_bag_option_2: d.replacement_bag_option_2,
      latch_upgrade_kit_for_exit_chute: d.latch_upgrade_kit_for_exit_chute,
      replacement_collector_complete: d.replacement_collector_complete,
      chassis: d.chassis,
      replacement_impeller_option_1: d.replacement_impeller_option_1,
      replacement_impeller_option_2: d.replacement_impeller_option_2,
      impeller_hardware_kit: d.impeller_hardware_kit,
      replacement_blower_housing_option_1: d.replacement_blower_housing_option_1,
      replacement_blower_housing_option_2: d.replacement_blower_housing_option_2,
      replacement_blower_w_impeller_option_1: d.replacement_blower_w_impeller_option_1,
      replacement_blower_w_impeller_option_2: d.replacement_blower_w_impeller_option_2,
      replacement_engine_option_1: d.replacement_engine_option_1,
      replacement_engine_option_2: d.replacement_engine_option_2,
      engine_blower_complete_option_1: d.engine_blower_complete_option_1,
      engine_blower_complete_option_2: d.engine_blower_complete_option_2,
      engine_blower_complete_option_3: d.engine_blower_complete_option_3,
      engine_blower_complete_option_4: d.engine_blower_complete_option_4,
      replacement_air_filters: d.replacement_air_filters,
      engine_maintenance_kit: d.engine_maintenance_kit,
      mda_collar: d.mda_collar,
      blower_inlet: d.blower_inlet,
      exit_chute: d.exit_chute,
      band_clamp: d.band_clamp,
      pvp_coupling: d.pvp_coupling,
      estate_vac_coupling: d.estate_vac_coupling,
      power_unloader_chute: d.power_unloader_chute,
      roof_rack_carrier: d.roof_rack_carrier,
      pvp_pvc: d.pvp_pvc,
      pvp_urethane: d.pvp_urethane,
      estate_vac_pvc: d.estate_vac_pvc,
      estate_vac_urethane: d.estate_vac_urethane,
      power_unloader_pvc: d.power_unloader_pvc,
      power_unloader_urethane: d.power_unloader_urethane,

      // URL siblings
      replacement_side_tubes_set1_url: d.replacement_side_tubes_set1_url,
      replacement_side_tubes_set2_url: d.replacement_side_tubes_set2_url,
      replacement_top_brace_url: d.replacement_top_brace_url,
      replacement_bag_option_1_url: d.replacement_bag_option_1_url,
      replacement_bag_option_2_url: d.replacement_bag_option_2_url,
      latch_upgrade_kit_for_exit_chute_url: d.latch_upgrade_kit_for_exit_chute_url,
      replacement_collector_complete_url: d.replacement_collector_complete_url,
      chassis_url: d.chassis_url,
      replacement_impeller_option_1_url: d.replacement_impeller_option_1_url,
      replacement_impeller_option_2_url: d.replacement_impeller_option_2_url,
      impeller_hardware_kit_url: d.impeller_hardware_kit_url,
      replacement_blower_housing_option_1_url: d.replacement_blower_housing_option_1_url,
      replacement_blower_housing_option_2_url: d.replacement_blower_housing_option_2_url,
      replacement_blower_w_impeller_option_1_url: d.replacement_blower_w_impeller_option_1_url,
      replacement_blower_w_impeller_option_2_url: d.replacement_blower_w_impeller_option_2_url,
      replacement_engine_option_1_url: d.replacement_engine_option_1_url,
      replacement_engine_option_2_url: d.replacement_engine_option_2_url,
      engine_blower_complete_option_1_url: d.engine_blower_complete_option_1_url,
      engine_blower_complete_option_2_url: d.engine_blower_complete_option_2_url,
      engine_blower_complete_option_3_url: d.engine_blower_complete_option_3_url,
      engine_blower_complete_option_4_url: d.engine_blower_complete_option_4_url,
      replacement_air_filters_url: d.replacement_air_filters_url,
      engine_maintenance_kit_url: d.engine_maintenance_kit_url,
      mda_collar_url: d.mda_collar_url,
      blower_inlet_url: d.blower_inlet_url,
      exit_chute_url: d.exit_chute_url,
      band_clamp_url: d.band_clamp_url,
      pvp_coupling_url: d.pvp_coupling_url,
      estate_vac_coupling_url: d.estate_vac_coupling_url,
      power_unloader_chute_url: d.power_unloader_chute_url,
      roof_rack_carrier_url: d.roof_rack_carrier_url,
      pvp_pvc_url: d.pvp_pvc_url,
      pvp_urethane_url: d.pvp_urethane_url,
      estate_vac_pvc_url: d.estate_vac_pvc_url,
      estate_vac_urethane_url: d.estate_vac_urethane_url,
      power_unloader_pvc_url: d.power_unloader_pvc_url,
      power_unloader_urethane_url: d.power_unloader_urethane_url,
    };
    return out;
  }

  _buildAnswer(docs, { groupBy = 'rake_model', maxCitations = 3 } = {}) {
    // Grouping
    let groups = [];
    if (groupBy === 'rake_model' || groupBy === 'engine_model') {
      const m = new Map();
      for (const d of docs) {
        const k = d[groupBy] || '';
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(d);
      }
      groups = Array.from(m.entries()).map(([key, arr]) => ({ key, docs: arr }));
    } else {
      groups = [{ key: '', docs }];
    }

    let out = '';
    for (const g of groups) {
      const p = g.docs[0];
      const headerKey =
        groupBy === 'rake_model' ? (g.key || p.rake_model || '') :
        groupBy === 'engine_model' ? (g.key || p.engine_model || '') :
        `${p.rake_model || ''}${p.rake_model && p.engine_model ? ' — ' : ''}${p.engine_model || ''}`;

      const headerLabel = groupBy === 'rake_model' ? 'Model' : groupBy === 'engine_model' ? 'Engine' : 'Product Group';
      out += `**${headerLabel}: ${headerKey || '—'}**\n`;

      const add = (label, sku, url) => {
        if (!sku) return;
        out += `- **${label}:** ${sku}${url ? ` [Link](${url})` : ''}\n`;
      };

      // Render the commonly used parts (add/remove lines as you need)
      add('engine maintenance kit', p.engine_maintenance_kit, p.engine_maintenance_kit_url);
      add('replacement side tubes set1', p.replacement_side_tubes_set1, p.replacement_side_tubes_set1_url);
      add('replacement side tubes set2', p.replacement_side_tubes_set2, p.replacement_side_tubes_set2_url);
      add('replacement top brace', p.replacement_top_brace, p.replacement_top_brace_url);
      add('replacement bag option 1', p.replacement_bag_option_1, p.replacement_bag_option_1_url);
      add('replacement bag option 2', p.replacement_bag_option_2, p.replacement_bag_option_2_url);
      add('latch upgrade kit (exit chute)', p.latch_upgrade_kit_for_exit_chute, p.latch_upgrade_kit_for_exit_chute_url);
      add('replacement collector complete', p.replacement_collector_complete, p.replacement_collector_complete_url);
      add('chassis', p.chassis, p.chassis_url);
      add('replacement impeller option 1', p.replacement_impeller_option_1, p.replacement_impeller_option_1_url);
      add('replacement impeller option 2', p.replacement_impeller_option_2, p.replacement_impeller_option_2_url);
      add('impeller hardware kit', p.impeller_hardware_kit, p.impeller_hardware_kit_url);
      add('blower housing option 1', p.replacement_blower_housing_option_1, p.replacement_blower_housing_option_1_url);
      add('blower housing option 2', p.replacement_blower_housing_option_2, p.replacement_blower_housing_option_2_url);
      add('blower w/ impeller option 1', p.replacement_blower_w_impeller_option_1, p.replacement_blower_w_impeller_option_1_url);
      add('blower w/ impeller option 2', p.replacement_blower_w_impeller_option_2, p.replacement_blower_w_impeller_option_2_url);
      add('replacement engine option 1', p.replacement_engine_option_1, p.replacement_engine_option_1_url);
      add('replacement engine option 2', p.replacement_engine_option_2, p.replacement_engine_option_2_url);
      add('engine blower complete 1', p.engine_blower_complete_option_1, p.engine_blower_complete_option_1_url);
      add('engine blower complete 2', p.engine_blower_complete_option_2, p.engine_blower_complete_option_2_url);
      add('engine blower complete 3', p.engine_blower_complete_option_3, p.engine_blower_complete_option_3_url);
      add('engine blower complete 4', p.engine_blower_complete_option_4, p.engine_blower_complete_option_4_url);
      add('replacement air filters', p.replacement_air_filters, p.replacement_air_filters_url);
      add('MDA collar', p.mda_collar, p.mda_collar_url);
      add('blower inlet', p.blower_inlet, p.blower_inlet_url);
      add('exit chute', p.exit_chute, p.exit_chute_url);
      add('band clamp', p.band_clamp, p.band_clamp_url);
      add('PVP coupling', p.pvp_coupling, p.pvp_coupling_url);
      add('Estate Vac coupling', p.estate_vac_coupling, p.estate_vac_coupling_url);
      add('power unloader chute', p.power_unloader_chute, p.power_unloader_chute_url);
      add('roof rack carrier', p.roof_rack_carrier, p.roof_rack_carrier_url);
      add('PVP PVC', p.pvp_pvc, p.pvp_pvc_url);
      add('PVP urethane', p.pvp_urethane, p.pvp_urethane_url);
      add('Estate Vac PVC', p.estate_vac_pvc, p.estate_vac_pvc_url);
      add('Estate Vac urethane', p.estate_vac_urethane, p.estate_vac_urethane_url);
      add('power unloader PVC', p.power_unloader_pvc, p.power_unloader_pvc_url);
      add('power unloader urethane', p.power_unloader_urethane, p.power_unloader_urethane_url);

      out += '\n';
    }

    // Citations strictly from index *_url fields
    const cites = [];
    for (const d of docs) if (Array.isArray(d.citations)) for (const u of d.citations) if (u && !cites.includes(u)) cites.push(u);
    if (cites.length) {
      out += '**Citations:**\n';
      for (let i = 0; i < Math.min(maxCitations, cites.length); i++) out += `[Source ${i + 1}](${cites[i]})\n`;
    }
    return out.trim();
  }

  async _call(data) {
    const parsed = this.schema.safeParse(data);
    if (!parsed.success) {
      return `INPUT_VALIDATION_FAILED: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    }
    const input = parsed.data;

    const top = Number.isFinite(input.top) ? Math.floor(input.top) : this.topDefault;

    // 1) Strict filtered search
    const filter = this._buildFilter(input);
    const results = [];
    const seen = new Set();

    try {
      for (const client of this.clients) {
        const options = {
          queryType: this.queryType,
          top,
          includeTotalCount: true,
          searchFields: this.searchFields.length ? this.searchFields : undefined,
          filter: filter || undefined,
        };

        const searchResults = await client.search(input.query || '*', options);
        for await (const r of searchResults.results) {
          const d = r.document || {};
          const key = `${client.indexName}::${String(d.record_id || d.id || d.key || d.title || '').toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          d['@search.score'] = r.score;
          results.push(this._shapeDoc(d, client.indexName));
        }
      }
    } catch (error) {
      logger.error('[woodland-product-history] Azure filtered search failed', error);
    }

    // 2) Optional relaxed retry (Lucene) with client-side prefix
    if (this.enableRelaxedRetry && results.length === 0 && (input.rakeModel || input.engineModel)) {
      const rmPrefix = (input.rakeModel || '').trim().toLowerCase();
      const emPrefix = (input.engineModel || '').trim().toLowerCase();

      for (const client of this.clients) {
        try {
          const options = {
            queryType: 'full',
            top,
            includeTotalCount: true,
            searchFields: this.searchFields.length ? this.searchFields : undefined,
          };

          const terms = [];
          if (input.query) terms.push(input.query);
          if (rmPrefix)    terms.push(`${input.rakeModel}\\*`);
          if (emPrefix)    terms.push(`${input.engineModel}\\*`);
          const q = terms.length ? terms.join(' ') : '*';

          const searchResults = await client.search(q, options);
          for await (const r of searchResults.results) {
            const d = r.document || {};
            const rm = (d.rake_model || '').toString().toLowerCase();
            const em = (d.engine_model || '').toString().toLowerCase();

            const ok = (rmPrefix && rm.startsWith(rmPrefix)) || (emPrefix && em.startsWith(emPrefix)) || (!rmPrefix && !emPrefix);
            if (!ok) continue;

            const key = `${client.indexName}::${String(d.record_id || d.id || d.key || d.title || '').toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);

            d['@search.score'] = r.score;
            results.push(this._shapeDoc(d, client.indexName));
          }
        } catch (error) {
          logger.warn('[woodland-product-history] Relaxed retry failed', { index: client.indexName, error });
        }
      }
    }

    if (results.length === 0) return 'NEEDS_HUMAN_REVIEW: No reviewed records found.';

    // Sort + output
    results.sort((a, b) =>
      (b['@search.score'] || 0) - (a['@search.score'] || 0) ||
      String(a.title || '').localeCompare(String(b.title || ''))
    );

    const trimmed = results.slice(0, top);
    if (input.format === 'json') return JSON.stringify(trimmed);
    return this._buildAnswer(trimmed, { groupBy: input.groupBy, maxCitations: input.maxCitations });
  }
}

module.exports = WoodlandProductHistory;