// /api/app/clients/tools/structured/WoodlandEngineHistory.js
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

class WoodlandEngineHistory extends Tool {
  // Defaults aligned with your AzureAISearch template
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_QUERY_TYPE = 'simple';
  static DEFAULT_TOP = 20;

  _initializeField(field, envVar, defaultValue) {
    return field ?? process.env[envVar] ?? defaultValue;
  }

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-engine-history';
    this.description =
      'Use to query the Airtable Engine History (engine indexes only). Strict $filter eq, optional relaxed retry, only index fields used.';
    this.override = fields.override ?? false;

    // Schema: only Azure index fields
    this.schema = z.object({
      query: z.string().default(''),

      // Filters (strict equality in $filter)
      engineModel: z.string().optional(),         // engine_model
      rakeModel: z.string().optional(),           // rake_model
      horsepower: z.string().optional(),          // engine_horsepower
      filterShape: z.string().optional(),         // filter_shape
      blowerColor: z.string().optional(),         // blower_color
      airFilter: z.string().optional(),           // air_filter
      engineMaintenanceKit: z.string().optional(),// engine_maintenance_kit

      // Output controls
      format: z.enum(['json', 'answer']).default('answer'),
      maxCitations: z.number().int().positive().max(10).default(3),
      groupBy: z.enum(['engine_model', 'rake_model', 'none']).default('engine_model'),

      // Optional: limit results
      top: z.number().int().positive().max(100).optional(),
    });

    // Core fields & options
    this.serviceEndpoint = this._initializeField(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      'AZURE_AI_SEARCH_SERVICE_ENDPOINT'
    );
    // NOTE: you can pass a comma-separated list; we’ll pick engine-only below
    this.indexName = this._initializeField(
      fields.AZURE_AI_SEARCH_HISTORY_INDEX ?? fields.AZURE_AI_SEARCH_INDEX_NAME,
      'AZURE_AI_SEARCH_HISTORY_INDEX',
    );
    this.apiKey = this._initializeField(fields.AZURE_AI_SEARCH_API_KEY, 'AZURE_AI_SEARCH_API_KEY');
    this.apiVersion = this._initializeField(
      fields.AZURE_AI_SEARCH_API_VERSION, 'AZURE_AI_SEARCH_API_VERSION', WoodlandEngineHistory.DEFAULT_API_VERSION
    );
    this.queryType = this._initializeField(
      fields.AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE,
      'AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE',
      WoodlandEngineHistory.DEFAULT_QUERY_TYPE
    );
    this.topDefault = Number(this._initializeField(
      fields.WOODLAND_HISTORY_DEFAULT_TOP,
      'WOODLAND_HISTORY_DEFAULT_TOP',
      WoodlandEngineHistory.DEFAULT_TOP
    ));

    this.searchFields = (this._initializeField(
      fields.WOODLAND_HISTORY_SEARCH_FIELDS,
      'WOODLAND_HISTORY_SEARCH_FIELDS',
      'title,content,tags,engine_model,rake_model'
    ) || '').split(',').map(s => s.trim()).filter(Boolean);

    this.enableRelaxedRetry = (this._initializeField(
      fields.WOODLAND_ENABLE_RELAXED_RETRY,
      'WOODLAND_ENABLE_RELAXED_RETRY',
      '1'
    ) !== '0');

    // Requireds check
    if (!this.override && (!this.serviceEndpoint || !this.indexName || !this.apiKey)) {
      throw new Error(
        'Missing AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_HISTORY_INDEX (or AZURE_AI_SEARCH_INDEX_NAME), or AZURE_AI_SEARCH_API_KEY.'
      );
    }
    if (this.override) return;

    // Resolve engine-only indexes from a comma-separated list
    const allIndexNames = String(this.indexName)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    this.engineIndexes = allIndexNames.filter(n => /engine/i.test(n));
    if (this.engineIndexes.length === 0 && allIndexNames.length === 1) {
      this.engineIndexes = allIndexNames;
    }
    if (this.engineIndexes.length === 0) {
      throw new Error('[woodland-engine-history] No engine index configured (expects name containing "engine").');
    }

    // Client per index (keeps the template’s SearchClient usage)
    this.clients = this.engineIndexes.map(
      name => new SearchClient(this.serviceEndpoint, name, new AzureKeyCredential(this.apiKey), { apiVersion: this.apiVersion })
    );
  }

  /** Build a strict $filter string (eq only) */
  _buildFilter(input) {
    const filters = [];
    const addEq = (field, value) => {
      if (!value) return;
      const sanitized = String(value).replace(/'/g, "''").replace(/\s+/g, ' ').trim();
      filters.push(`${field} eq '${sanitized}'`);
    };
    addEq('engine_model', input.engineModel);
    addEq('rake_model', input.rakeModel);
    addEq('engine_horsepower', input.horsepower);
    addEq('filter_shape', input.filterShape);
    addEq('blower_color', input.blowerColor);
    addEq('air_filter', input.airFilter);
    addEq('engine_maintenance_kit', input.engineMaintenanceKit);
    return filters.join(' and ');
  }

  /** Collect URLs strictly from engine *_url fields */
  _collectUrls(doc) {
    const urls = [];
    const v = doc.engine_maintenance_kit_url;
    if (typeof v === 'string') urls.push(v);
    else if (Array.isArray(v)) for (const u of v) if (typeof u === 'string') urls.push(u);
    return { primaryUrl: urls[0] || '', supplementalUrls: urls.slice(1) };
  }

  /** Normalize doc to output (only engine index fields) */
  _shapeDoc(d, indexName) {
    const { primaryUrl, supplementalUrls } = this._collectUrls(d);
    const out = {
      id: d.id || d.key || d.record_id,
      title: d.title,
      content: typeof d.content === 'string' ? d.content : '',
      tags: d.tags || [],
      index: indexName,
      page_type: 'enginehistory',
      '@search.score': typeof d['@search.score'] === 'number' ? d['@search.score'] : undefined,
      citations: [primaryUrl, ...(supplementalUrls || [])].filter(Boolean),

      // Only engine fields (from your index)
      engine_model: d.engine_model,
      inuse_date: d.inuse_date,
      engine_horsepower: d.engine_horsepower,
      filter_shape: d.filter_shape,
      deck_hose_diameter: d.deck_hose_diameter,
      rake_model: d.rake_model,
      blower_color: d.blower_color,
      air_filter: d.air_filter,
      engine_maintenance_kit: d.engine_maintenance_kit,
      engine_maintenance_kit_url: d.engine_maintenance_kit_url,
    };
    return out;
  }

  /** Markdown answer */
  _buildAnswer(docs, { groupBy = 'engine_model', maxCitations = 3 } = {}) {
    // Group
    let groups = [];
    if (groupBy === 'engine_model' || groupBy === 'rake_model') {
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
      const first = g.docs[0];
      const headerKey =
        groupBy === 'engine_model'
          ? (g.key || first.engine_model || '')
          : groupBy === 'rake_model'
            ? (g.key || first.rake_model || '')
            : `${first.rake_model || ''}${first.rake_model && first.engine_model ? ' — ' : ''}${first.engine_model || ''}`;
      const headerLabel = groupBy === 'engine_model' ? 'Engine' : groupBy === 'rake_model' ? 'Model' : 'Product Group';
      out += `**${headerLabel}: ${headerKey || '—'}**\n`;

      const facts = [];
      if (first.inuse_date)        facts.push(`- **in use:** ${first.inuse_date}`);
      if (first.engine_horsepower) facts.push(`- **horsepower:** ${first.engine_horsepower}`);
      if (first.filter_shape)      facts.push(`- **filter shape:** ${first.filter_shape}`);
      if (first.engine_maintenance_kit) {
        const u = first.engine_maintenance_kit_url;
        facts.push(`- **engine maintenance kit:** ${first.engine_maintenance_kit}${u ? ` [Link](${u})` : ''}`);
      }
      if (facts.length) out += facts.join('\n') + '\n\n';
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

  /** Main call (aligned with your template’s style) */
  async _call(data) {
    const parsed = this.schema.safeParse(data);
    if (!parsed.success) {
      return `INPUT_VALIDATION_FAILED: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    }
    const input = parsed.data;

    const top = Number.isFinite(input.top) ? Math.floor(input.top) : this.topDefault;

    // 1) Strict filtered search on each engine index
    const filter = this._buildFilter(input);
    const results = [];
    const seen = new Set(); // dedupe across indexes

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
          // preserve score in the doc shape
          d['@search.score'] = r.score;
          results.push(this._shapeDoc(d, client.indexName));
        }
      }
    } catch (error) {
      logger.error('[woodland-engine-history] Azure filtered search failed', error);
    }

    // 2) Optional relaxed retry (Lucene, no $filter, client-side prefix test)
    if (this.enableRelaxedRetry && results.length === 0 && (input.engineModel || input.rakeModel)) {
      const engPrefix = (input.engineModel || '').trim().toLowerCase();
      const rmPrefix  = (input.rakeModel  || '').trim().toLowerCase();

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
          if (engPrefix)   terms.push(`${input.engineModel}\\*`);
          if (rmPrefix)    terms.push(`${input.rakeModel}\\*`);

          const q = terms.length ? terms.join(' ') : '*';
          const searchResults = await client.search(q, options);

          for await (const r of searchResults.results) {
            const d = r.document || {};
            const em = (d.engine_model || '').toString().toLowerCase();
            const rm = (d.rake_model || '').toString().toLowerCase();
            const ok = (engPrefix && em.startsWith(engPrefix)) || (rmPrefix && rm.startsWith(rmPrefix)) || (!engPrefix && !rmPrefix);
            if (!ok) continue;

            const key = `${client.indexName}::${String(d.record_id || d.id || d.key || d.title || '').toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            d['@search.score'] = r.score;
            results.push(this._shapeDoc(d, client.indexName));
          }
        } catch (error) {
          logger.warn('[woodland-engine-history] Relaxed retry failed', { index: client.indexName, error });
        }
      }
    }

    if (results.length === 0) return 'NEEDS_HUMAN_REVIEW: No reviewed records found.';

    // Sort: score desc, then title
    results.sort((a, b) =>
      (b['@search.score'] || 0) - (a['@search.score'] || 0) ||
      String(a.title || '').localeCompare(String(b.title || ''))
    );

    const trimmed = results.slice(0, top);
    if (input.format === 'json') return JSON.stringify(trimmed);
    return this._buildAnswer(trimmed, { groupBy: input.groupBy, maxCitations: input.maxCitations });
  }
}

module.exports = WoodlandEngineHistory;