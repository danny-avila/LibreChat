// woodland-ai-search-cases.js (single-index)
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

class WoodlandAISearchCases extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 9;
  static DEFAULT_SELECT = 'id,title,content,url';

  _env(v, fallback) {
    return v ?? fallback;
  }

  _provenance(d) {
    try {
      const url = (typeof d?.url === 'string' && d.url) || '';
      const host = url ? new URL(url).hostname : undefined;
      return { url: url || undefined, host, site: d?.site, page_type: d?.page_type };
    } catch (_) {
      return { site: d?.site, page_type: d?.page_type };
    }
  }

  /** Lightweight normalization for Cases/Knowledge docs */
  _extractList(text, labelRegexes) {
    try {
      const t = (text || '').toString();
      for (const re of labelRegexes) {
        const m = re.exec(t);
        if (m && m[1]) {
          const line = m[1]
            .replace(/\r/g, '')
            .split(/\n|;|•|\u2022|\-/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (line.length) return line;
        }
      }
    } catch (_) {}
    return undefined;
  }

  _extractSteps(text) {
    try {
      const t = (text || '').toString();
      // Find numbered steps or lines starting with dash/bullet
      const lines = t.split(/\r?\n/);
      const steps = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^(\d+\.|- |• |\u2022 )/.test(trimmed)) {
          steps.push(trimmed.replace(/^(\d+\.|- |• |\u2022 )\s*/, ''));
        }
      }
      return steps.length ? steps : undefined;
    } catch (_) {
      return undefined;
    }
  }

  _normalizeDoc(d) {
    const str = (v) => (v == null ? undefined : String(v));
    const list = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : undefined);

    const title = str(d?.title);
    const content = str(d?.content) || str(d?.summary) || str(d?.answer);
    const requirements =
      this._extractList(content, [/requirements?\s*[:\-]\s*([^\n]+)/i, /eligibility\s*[:\-]\s*([^\n]+)/i]) ||
      list(d?.requirements);
    const exceptions =
      this._extractList(content, [/exceptions?\s*[:\-]\s*([^\n]+)/i]) || list(d?.exceptions);
    const scope = str(d?.category) || str(d?.scope) || undefined;
    const steps = this._extractSteps(content);

    const normalized = {
      policy_name: title,
      scope,
      summary: str(d?.summary),
      effective_date: str(d?.effective_date),
      last_updated: str(d?.last_updated),
      requirements,
      exceptions,
      steps,
      tags: list(d?.tags),
      keywords: list(d?.keywords),
      provenance: this._provenance(d),
    };

    return { ...d, normalized_cases: normalized };
  }

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search-cases';
    this.description = "Use the 'woodland-ai-search-cases' tool to answer questions from the Cases Azure AI Search index";

    this.schema = z.object({
      query: z.string().describe('Question or search phrase for Cases index'),
      top: z.number().int().positive().optional(),
    });

    // Shared endpoint + key
    this.serviceEndpoint = this._env(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
    );
    this.apiKey = this._env(fields.AZURE_AI_SEARCH_API_KEY, process.env.AZURE_AI_SEARCH_API_KEY);

    // Cases index name (support multiple env names; fallback to generic index name)
    this.indexName =
      this._env(fields.AZURE_AI_SEARCH_CASES_INDEX, process.env.AZURE_AI_SEARCH_CASES_INDEX) ||
      this._env(fields.AZURE_AI_SEARCH_CASE_INDEX, process.env.AZURE_AI_SEARCH_CASE_INDEX) ||
      this._env(fields.AZURE_AI_SEARCH_CASES_INDEX_NAME, process.env.AZURE_AI_SEARCH_CASES_INDEX_NAME) ||
      this._env(fields.AZURE_AI_SEARCH_INDEX_NAME, process.env.AZURE_AI_SEARCH_INDEX_NAME);

    if (!this.serviceEndpoint || !this.apiKey || !this.indexName) {
      throw new Error(
        'Missing Azure AI Search envs: AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_API_KEY, and Cases index (AZURE_AI_SEARCH_CASES_INDEX or AZURE_AI_SEARCH_INDEX_NAME).',
      );
    }

    // Optional API version
    this.apiVersion = this._env(
      fields.AZURE_AI_SEARCH_API_VERSION,
      process.env.AZURE_AI_SEARCH_API_VERSION || WoodlandAISearchCases.DEFAULT_API_VERSION,
    );

    // Defaults
    this.top = WoodlandAISearchCases.DEFAULT_TOP;
    this.select = WoodlandAISearchCases.DEFAULT_SELECT.split(',').map((s) => s.trim());

    // Semantic/search options
    this.searchFields = (() => {
      // Prefer cases-specific override, else global
      const v =
        this._env(
          fields.AZURE_AI_SEARCH_CASES_SEARCH_FIELDS,
          process.env.AZURE_AI_SEARCH_CASES_SEARCH_FIELDS,
        ) || this._env(fields.AZURE_AI_SEARCH_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_SEARCH_FIELDS);
      if (v) return String(v).split(',').map((s) => s.trim()).filter(Boolean);
      // Generic defaults suitable for Q&A corpora; avoid page_type
      return ['title', 'content', 'summary', 'tags', 'keywords', 'category', 'question', 'answer'];
    })();
    this.semanticConfiguration = this._env(
      fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
      process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION || 'sem1',
    );
    this.queryLanguage = this._env(
      fields.AZURE_AI_SEARCH_QUERY_LANGUAGE,
      process.env.AZURE_AI_SEARCH_QUERY_LANGUAGE || 'en-us',
    );
    this.scoringProfile = this._env(
      fields.AZURE_AI_SEARCH_SCORING_PROFILE,
      process.env.AZURE_AI_SEARCH_SCORING_PROFILE,
    );
    this.returnAllFields = String(
      this._env(
        fields.AZURE_AI_SEARCH_RETURN_ALL_FIELDS,
        process.env.AZURE_AI_SEARCH_RETURN_ALL_FIELDS || 'true',
      ),
    )
      .toLowerCase()
      .trim() === 'true';

    // Client
    const credential = new AzureKeyCredential(this.apiKey);
    this.client = new SearchClient(this.serviceEndpoint, this.indexName, credential, {
      apiVersion: this.apiVersion,
    });

    logger.info('[woodland-ai-search-cases] Initialized', {
      endpoint: this.serviceEndpoint,
      apiVersion: this.apiVersion,
      index: this.indexName,
      select: this.select,
      searchFields: this.searchFields,
      semanticConfiguration: this.semanticConfiguration,
      queryLanguage: this.queryLanguage,
      scoringProfile: this.scoringProfile,
    });
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
      logger.debug('[woodland-ai-search-cases] Sending request', {
        query,
        options: JSON.stringify(send, null, 2),
      });
      const rs = await this.client.search(query, send);
      const items = [];
      for await (const r of rs.results) items.push(r.document);
      logger.debug('[woodland-ai-search-cases] Received response', {
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
        const msg = (err && (err.message || String(err))) || '';
        logger.warn('[woodland-ai-search-cases] Search failed', { attempt, msg });

        const sanitized = { ...opts };
        let changed = false;

        if (/orderby/i.test(msg) && String(sanitized.queryType).toLowerCase() === 'semantic') {
          if (sanitized.orderBy) {
            delete sanitized.orderBy;
            changed = true;
            logger.info('[woodland-ai-search-cases] Removing orderBy for semantic query and retrying');
          }
        }

        const unknownFieldRegex = /Unknown field '([^']+)'/gi;
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
              logger.info('[woodland-ai-search-cases] Dropping filter due to unknown fields and retrying');
            }
            if (sanitized.orderBy) {
              delete sanitized.orderBy;
              changed = true;
            }
          }
        }
        if (!changed && !droppedSearchFields && sanitized.searchFields) {
          delete sanitized.searchFields;
          droppedSearchFields = true;
          changed = true;
          logger.info('[woodland-ai-search-cases] Dropping searchFields entirely and retrying');
        }

        if (!changed) break;
        opts = sanitized;
      }
    }
    throw lastErr;
  }

  async _call(data) {
    const { query, top: topIn } = data;
    const finalTop = typeof topIn === 'number' && Number.isFinite(topIn) ? Math.max(1, Math.floor(topIn)) : this.top;

    try {
      const inferredMode = (() => {
        const q = (query || '').toString();
        if (/".+"/.test(q) || /\b(AND|OR|NOT)\b/i.test(q)) return 'all';
        return 'any';
      })();

      const options = {
        queryType: 'semantic',
        searchMode: inferredMode,
        top: finalTop,
        semanticSearchOptions: {
          configurationName: this.semanticConfiguration,
          queryLanguage: this.queryLanguage,
        },
        answers: 'extractive',
        captions: 'extractive',
        speller: 'lexicon',
      };
      if (!this.returnAllFields) {
        options.select = this.select;
      }
      if (this.scoringProfile) options.scoringProfile = this.scoringProfile;

      // Ensure orderBy removed for semantic ranking
      if (options.orderBy) delete options.orderBy;

      const docs = await this._safeSearch(query, options);
      let payload = docs.docs || [];
      if (Array.isArray(payload)) {
        payload = payload.map((d) => (d ? this._normalizeDoc(d) : d));
      }
      logger.info('[woodland-ai-search-cases] Query done', { count: Array.isArray(payload) ? payload.length : 0 });
      return JSON.stringify(payload);
    } catch (error) {
      logger.error('[woodland-ai-search-cases] Azure AI Search request failed', {
        error: error?.message || String(error),
      });
      const msg = (error && (error.message || String(error))) || 'Unknown error';
      return `AZURE_SEARCH_FAILED: ${msg}`;
    }
  }
}

module.exports = WoodlandAISearchCases;
