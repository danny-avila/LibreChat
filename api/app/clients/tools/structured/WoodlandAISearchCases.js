// woodland-ai-search-cases.js (single-index)
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

const DEFAULT_EXTRACTIVE = String(process.env.WOODLAND_SEARCH_ENABLE_EXTRACTIVE ?? 'false')
  .toLowerCase()
  .trim() === 'true';

class WoodlandAISearchCases extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 6;
  static DEFAULT_SELECT = 'id,title,content,url,case_number';
  static DEFAULT_VECTOR_K = 15;
  static DEFAULT_VECTOR_FIELDS = ''; // comma-separated list, e.g., "contentVector,titleVector"

  _env(v, fallback) {
    return v ?? fallback;
  }

  _provenance(d) {
    try {
      const candidateUrl =
        (typeof d?.url === 'string' && d.url) ||
        (typeof d?.source_url === 'string' && d.source_url) ||
        (typeof d?.document_url === 'string' && d.document_url) ||
        (typeof d?.case_url === 'string' && d.case_url) ||
        (typeof d?.href === 'string' && d.href) ||
        '';

      let resolved = candidateUrl;
      if (resolved && this.baseUrl && !/^https?:\/\//i.test(resolved)) {
        resolved = this.baseUrl.replace(/\/+$/, '') + '/' + resolved.replace(/^\/+/, '');
      }

      const host = resolved ? new URL(resolved).hostname : undefined;
      return { url: resolved || undefined, host, site: d?.site, page_type: d?.page_type };
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

    // Build provenance and a Markdown-ready citation
    const provenance = this._provenance(d);
    const caseNumber = d?.case_number ?? d?.caseNumber;
    const citationLabel = caseNumber ? `Case #${caseNumber}` : (title || 'Case');
    const citationUrl = provenance?.url;
    const citationMarkdown = citationUrl ? `[${citationLabel}](${citationUrl})` : citationLabel;

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
      provenance,
      citation: {
        label: citationLabel,
        url: citationUrl,
        markdown: citationMarkdown
      },
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
      select: z.string().optional().describe('Comma-separated list of fields to return. Use "*" to select all fields (omit $select).'),
      filter: z.string().optional().describe("OData filter"),
      embedding: z.array(z.number()).min(8).optional().describe('Optional dense embedding for hybrid/vector search'),
      vectorK: z.number().int().positive().optional().describe('k for vector search'),
      answers: z.enum(['extractive', 'none']).optional(),
      captions: z.enum(['extractive', 'none']).optional(),
      speller: z.enum(['lexicon', 'simple', 'none']).optional(),
      queryLanguage: z.string().optional(),
      searchFields: z.string().optional().describe('Comma-separated search fields override')
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

    // Base URL for resolving relative URLs
    this.baseUrl =
      this._env(fields.AZURE_AI_SEARCH_CASES_BASE_URL, process.env.AZURE_AI_SEARCH_CASES_BASE_URL) ||
      this._env(fields.AZURE_AI_SEARCH_BASE_URL, process.env.AZURE_AI_SEARCH_BASE_URL);

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
    const rawSemanticConfiguration = this._env(
      fields.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
      process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
    );
    const normalizedSemanticConfiguration = (() => {
      if (rawSemanticConfiguration == null) return undefined;
      const str = String(rawSemanticConfiguration).trim();
      if (!str || str.toLowerCase() === 'none') return undefined;
      return str;
    })();
    this.semanticConfiguration = normalizedSemanticConfiguration;
    this.enableSemantic = !!this.semanticConfiguration;
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

    // Vector options
    this.vectorFields = (() => {
      const v =
        this._env(fields.AZURE_AI_SEARCH_CASES_VECTOR_FIELDS, process.env.AZURE_AI_SEARCH_CASES_VECTOR_FIELDS) ||
        this._env(fields.AZURE_AI_SEARCH_VECTOR_FIELDS, process.env.AZURE_AI_SEARCH_VECTOR_FIELDS) ||
        WoodlandAISearchCases.DEFAULT_VECTOR_FIELDS;
      return String(v || '').split(',').map(s => s.trim()).filter(Boolean);
    })();
    this.vectorK = Number(
      this._env(fields.AZURE_AI_SEARCH_CASES_VECTOR_K, process.env.AZURE_AI_SEARCH_CASES_VECTOR_K) ||
      this._env(fields.AZURE_AI_SEARCH_VECTOR_K, process.env.AZURE_AI_SEARCH_VECTOR_K) ||
      WoodlandAISearchCases.DEFAULT_VECTOR_K
    );

    const extractiveEnabled = String(
      this._env(fields.WOODLAND_SEARCH_ENABLE_EXTRACTIVE, process.env.WOODLAND_SEARCH_ENABLE_EXTRACTIVE) ??
        DEFAULT_EXTRACTIVE,
    )
      .toLowerCase()
      .trim() === 'true';

    this.defaultAnswerMode = extractiveEnabled ? 'extractive' : 'none';
    this.defaultCaptionMode = extractiveEnabled ? 'extractive' : 'none';

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
      semanticConfiguration: this.semanticConfiguration || null,
      enableSemantic: this.enableSemantic,
      queryLanguage: this.queryLanguage,
      scoringProfile: this.scoringProfile,
      vectorFields: this.vectorFields,
      vectorK: this.vectorK,
      defaultAnswerMode: this.defaultAnswerMode,
      defaultCaptionMode: this.defaultCaptionMode,
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
    if (!Array.isArray(clean.vectorQueries) || clean.vectorQueries.length === 0) {
      delete clean.vectorQueries;
    }
    // If caller asked for all fields via "*" or select got emptied, drop $select
    if (Array.isArray(clean.select)) {
      if (clean.select.length === 0 || clean.select.includes('*')) {
        delete clean.select;
      }
    } else if (typeof clean.select === 'string') {
      if (clean.select.trim() === '*' || clean.select.trim() === '') {
        delete clean.select;
      }
    }
    return clean;
  }

  async _safeSearch(query, options) {
    const run = async (opts) => {
      const send = this._sanitizeSearchOptions(opts);
      logger.debug('[woodland-ai-search-cases] Sending request', {
        query,
        hasVector: Array.isArray(send.vectorQueries) && send.vectorQueries.length > 0,
        options: JSON.stringify({ ...send, vectorQueries: undefined }, null, 2)
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

        if (/semantic configuration/i.test(msg) || /semanticConfiguration(?:'|\\")? must not be empty/i.test(msg)) {
          if (sanitized.semanticSearchOptions) delete sanitized.semanticSearchOptions;
          sanitized.queryType = 'simple';
          delete sanitized.answers;
          delete sanitized.captions;
          changed = true;
          logger.info(
            '[woodland-ai-search-cases] Semantic config missing or empty on index — falling back to simple query',
          );
        }

        if (/orderby/i.test(msg) && String(sanitized.queryType).toLowerCase() === 'semantic') {
          if (sanitized.orderBy) {
            delete sanitized.orderBy;
            changed = true;
            logger.info('[woodland-ai-search-cases] Removing orderBy for semantic query and retrying');
          }
        }

        // Catch both "Unknown field 'x'" and "Could not find a property named 'x'"
        const toRemove = [];
        const regexes = [
          /Unknown field '([^']+)'/gi,
          /Could not find a property named '([^']+)'/gi
        ];
        for (const rx of regexes) {
          let m;
          while ((m = rx.exec(msg)) !== null) {
            const fld = (m[1] || '').trim();
            if (fld) toRemove.push(fld);
          }
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
        // Final safety: if we still fail and $select exists, drop it once and retry
        if (!changed && sanitized.select) {
          delete sanitized.select;
          changed = true;
          logger.info('[woodland-ai-search-cases] Dropping select entirely as final fallback and retrying');
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

    // Per-call overrides and normalization
    let perCallSelect;
    if (typeof data?.select === 'string') {
      const raw = data.select.trim();
      if (raw === '' || raw === '*') {
        perCallSelect = [];
      } else {
        perCallSelect = raw.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    const perCallSearchFields = typeof data?.searchFields === 'string' ? data.searchFields.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const perCallAnswers = data?.answers;
    const perCallCaptions = data?.captions;
    const perCallSpeller = data?.speller;
    const perCallQueryLanguage = data?.queryLanguage;
    const filter = typeof data?.filter === 'string' && data.filter.trim() ? data.filter.trim() : undefined;
    const embedding = Array.isArray(data?.embedding) ? data.embedding : undefined;
    const vectorK = Number.isFinite(data?.vectorK) ? Number(data.vectorK) : this.vectorK;

    const resolveMode = (raw, fallback) =>
      raw === 'extractive' || raw === 'none' ? raw : fallback;
    const answersMode = resolveMode(perCallAnswers, this.defaultAnswerMode);
    const captionsMode = resolveMode(perCallCaptions, this.defaultCaptionMode);

    try {
      const inferredMode = (() => {
        const q = (query || '').toString();
        if (/".+"/.test(q) || /\b(AND|OR|NOT)\b/i.test(q)) return 'all';
        return 'any';
      })();

      const options = {
        searchMode: inferredMode,
        top: finalTop,
        filter,
      };

      const semanticConfigName =
        typeof this.semanticConfiguration === 'string'
          ? this.semanticConfiguration.trim()
          : '';
      const allowSemantic = !!semanticConfigName;

      if (allowSemantic) {
        options.queryType = 'semantic';
        options.semanticSearchOptions = {
          configurationName: semanticConfigName,
          queryLanguage: perCallQueryLanguage || this.queryLanguage,
        };
        if (answersMode === 'extractive') {
          options.answers = 'extractive';
        }
        if (captionsMode === 'extractive') {
          options.captions = 'extractive';
        }
        options.speller = perCallSpeller || 'lexicon';
      } else {
        options.queryType = 'simple';
        options.speller = perCallSpeller || 'lexicon';
      }
      // By default we DO NOT send $select to retrieve all fields.
      // Only set select when: returnAllFields=false AND caller did not request "*" (empty list)
      if (!this.returnAllFields) {
        if (Array.isArray(perCallSelect)) {
          if (perCallSelect.length > 0) {
            options.select = perCallSelect;
          } else {
            // per-call "*" or blank: omit $select
            logger.info('[woodland-ai-search-cases] Per-call select requested ALL fields; omitting $select');
          }
        } else if (this.select && this.select.length > 0) {
          options.select = this.select;
        }
      } else if (Array.isArray(perCallSelect) && perCallSelect.length > 0) {
        // returnAllFields=true, but explicit fields provided: honor them
        options.select = perCallSelect;
      }
      if (this.scoringProfile) options.scoringProfile = this.scoringProfile;
      if (perCallSearchFields) options.searchFields = perCallSearchFields;

      // Vector queries if embedding and vector fields are present
      if (embedding && this.vectorFields.length > 0) {
        options.vectorQueries = this.vectorFields.map((vf) => ({
          kind: 'vector',
          vector: embedding,
          kNearestNeighborsCount: vectorK,
          fields: vf,
        }));
      }

      // Ensure orderBy removed for semantic ranking
      if (options.orderBy) delete options.orderBy;

      const docs = await this._safeSearch(query, options);
      let payload = docs.docs || [];
      if (Array.isArray(payload)) {
        payload = payload.map((d) => (d ? this._normalizeDoc(d) : d));
      }
      logger.info('[woodland-ai-search-cases] Query done', {
        count: Array.isArray(payload) ? payload.length : 0,
        vectorUsed: Array.isArray(options.vectorQueries) && options.vectorQueries.length > 0,
        top: finalTop,
      });
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
