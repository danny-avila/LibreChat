// WoodlandAISearchCyclopedia.js (single-index, semantic + optional vector)
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
let logger;
try {
  ({ logger } = require('~/config'));
} catch (_) {
  try {
    ({ logger } = require('@librechat/data-schemas'));
  } catch (_) {
    logger = console;
  }
}
const { resolveScenarioChecklist } = require('./util/woodlandCyclopediaScenarioResolver');
const { deriveCyclopediaHints } = require('./util/woodlandCyclopediaHints');

const DEFAULT_EXTRACTIVE =
  String(process.env.WOODLAND_SEARCH_ENABLE_EXTRACTIVE ?? 'false')
    .toLowerCase()
    .trim() === 'true';

class WoodlandAISearchCyclopedia extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 6;
  static DEFAULT_SELECT =
    'id,title,content,url,site,page_type,breadcrumb,headings,tags,images_alt,last_crawled,last_updated,reviewed,allowlist_match';
  static DEFAULT_VECTOR_K = 15;
  static DEFAULT_VECTOR_FIELDS = ''; // e.g., "contentVector,titleVector"

  _env(v, fb) {
    return v ?? fb;
  }

  _provenance(d) {
    try {
      const candidateUrl =
        (typeof d?.url === 'string' && d.url) ||
        (typeof d?.source_url === 'string' && d.source_url) ||
        (typeof d?.parent_url === 'string' && d.parent_url) ||
        (typeof d?.document_url === 'string' && d.document_url) ||
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

  _normalizeDoc(d) {
    const str = (v) => (v == null ? undefined : String(v));
    const list = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : undefined);

    const title = str(d?.title);
    const provenance = this._provenance(d);
    const citationLabel = title || 'Cyclopedia';
    const citationUrl = provenance?.url;
    const troubleshooting = deriveCyclopediaHints(d);

    return {
      ...d,
      normalized_cyclopedia: {
        title,
        summary: str(d?.summary),
        breadcrumb: list(d?.breadcrumb),
        headings: list(d?.headings),
        tags: list(d?.tags),
        images_alt: list(d?.images_alt),
        site: str(d?.site),
        page_type: str(d?.page_type),
        last_crawled: str(d?.last_crawled),
        last_updated: str(d?.last_updated) || str(d?.updated_at),
        reviewed: d?.reviewed,
        allowlist_match: d?.allowlist_match,
        provenance,
        troubleshooting,
        citation: {
          label: citationLabel,
          url: citationUrl,
          markdown: citationUrl ? `[${citationLabel}](${citationUrl})` : citationLabel,
        },
      },
    };
  }

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search-cyclopedia';
    this.description =
      "Use the 'woodland-ai-search-cyclopedia' tool to answer questions from the Cyclopedia Azure AI Search index";

    this.schema = z.object({
      query: z.string().describe('Question or search phrase for Cyclopedia index'),
      top: z.number().int().positive().optional(),
      select: z.string().optional().describe('Comma-separated list of fields to return'),
      filter: z.string().optional().describe('OData filter'),
      embedding: z
        .array(z.number())
        .min(8)
        .optional()
        .describe('Optional dense embedding for hybrid/vector search'),
      vectorK: z.number().int().positive().optional().describe('k for vector search'),
      answers: z.enum(['extractive', 'none']).optional(),
      captions: z.enum(['extractive', 'none']).optional(),
      speller: z.enum(['lexicon', 'simple', 'none']).optional(),
      queryLanguage: z.string().optional(),
      searchFields: z.string().optional().describe('Comma-separated search fields override'),
    });

    // Shared endpoint + key
    this.serviceEndpoint = this._env(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
    );
    this.apiKey = this._env(fields.AZURE_AI_SEARCH_API_KEY, process.env.AZURE_AI_SEARCH_API_KEY);

    // Index (Cyclopedia-specific with fallbacks)
    this.indexName = this._env(
      fields.AZURE_AI_SEARCH_CYCLOPEDIA_INDEX,
      process.env.AZURE_AI_SEARCH_CYCLOPEDIA_INDEX,
    );
    // Optional base for resolving relative URLs
    this.baseUrl =
      this._env(
        fields.AZURE_AI_SEARCH_CYCLOPEDIA_BASE_URL,
        process.env.AZURE_AI_SEARCH_CYCLOPEDIA_BASE_URL,
      ) || this._env(fields.AZURE_AI_SEARCH_BASE_URL, process.env.AZURE_AI_SEARCH_BASE_URL);

    if (!this.serviceEndpoint || !this.apiKey || !this.indexName) {
      const missing = {
        hasEndpoint: !!this.serviceEndpoint,
        hasKey: !!this.apiKey,
        hasIndex: !!this.indexName,
        endpointEnv: 'AZURE_AI_SEARCH_SERVICE_ENDPOINT',
        keyEnv: 'AZURE_AI_SEARCH_API_KEY',
        indexEnvCandidates: [
          'AZURE_AI_SEARCH_CYCLOPEDIA_INDEX',
          'AZURE_AI_SEARCH_CYCLOPEDIA_INDEX_NAME',
          'AZURE_AI_SEARCH_INDEX_NAME',
        ],
      };
      logger.error('[woodland-ai-search-cyclopedia] Missing required Azure envs', missing);
      throw new Error(
        'Missing Azure AI Search envs: AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_API_KEY, and Cyclopedia index (AZURE_AI_SEARCH_CYCLOPEDIA_INDEX or AZURE_AI_SEARCH_INDEX_NAME).',
      );
    }

    // API version + defaults
    this.apiVersion = this._env(
      fields.AZURE_AI_SEARCH_API_VERSION,
      process.env.AZURE_AI_SEARCH_API_VERSION || WoodlandAISearchCyclopedia.DEFAULT_API_VERSION,
    );
    this.top = WoodlandAISearchCyclopedia.DEFAULT_TOP;
    this.select = WoodlandAISearchCyclopedia.DEFAULT_SELECT.split(',').map((s) => s.trim());

    // Semantic/search options
    this.searchFields = (() => {
      const v =
        this._env(
          fields.AZURE_AI_SEARCH_CYCLOPEDIA_SEARCH_FIELDS,
          process.env.AZURE_AI_SEARCH_CYCLOPEDIA_SEARCH_FIELDS,
        ) ||
        this._env(fields.AZURE_AI_SEARCH_SEARCH_FIELDS, process.env.AZURE_AI_SEARCH_SEARCH_FIELDS);
      if (v)
        return String(v)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      return [
        'title',
        'content',
        'tags',
        'breadcrumb',
        'headings',
        'images_alt',
        'site',
        'page_type',
      ];
    })();
    // If no semantic config is provided, skip semantic search to avoid Azure errors
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
    this.returnAllFields =
      String(
        this._env(
          fields.AZURE_AI_SEARCH_RETURN_ALL_FIELDS,
          process.env.AZURE_AI_SEARCH_RETURN_ALL_FIELDS || 'true',
        ),
      ).toLowerCase() === 'true';

    // Vector options
    this.vectorFields = (() => {
      const v =
        this._env(
          fields.AZURE_AI_SEARCH_CYCLOPEDIA_VECTOR_FIELDS,
          process.env.AZURE_AI_SEARCH_CYCLOPEDIA_VECTOR_FIELDS,
        ) ||
        this._env(
          fields.AZURE_AI_SEARCH_VECTOR_FIELDS,
          process.env.AZURE_AI_SEARCH_VECTOR_FIELDS,
        ) ||
        WoodlandAISearchCyclopedia.DEFAULT_VECTOR_FIELDS;
      return String(v || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    })();
    this.vectorK = Number(
      this._env(
        fields.AZURE_AI_SEARCH_CYCLOPEDIA_VECTOR_K,
        process.env.AZURE_AI_SEARCH_CYCLOPEDIA_VECTOR_K,
      ) ||
        this._env(fields.AZURE_AI_SEARCH_VECTOR_K, process.env.AZURE_AI_SEARCH_VECTOR_K) ||
        WoodlandAISearchCyclopedia.DEFAULT_VECTOR_K,
    );

    const extractiveEnabled =
      String(
        this._env(
          fields.WOODLAND_SEARCH_ENABLE_EXTRACTIVE,
          process.env.WOODLAND_SEARCH_ENABLE_EXTRACTIVE,
        ) ?? DEFAULT_EXTRACTIVE,
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

    logger.info('[woodland-ai-search-cyclopedia] Initialized', {
      endpoint: this.serviceEndpoint,
      apiVersion: this.apiVersion,
      index: this.indexName,
      baseUrl: this.baseUrl,
      select: this.select,
      searchFields: this.searchFields,
      semanticConfiguration: this.semanticConfiguration || null,
      enableSemantic: this.enableSemantic,
      queryLanguage: this.queryLanguage,
      scoringProfile: this.scoringProfile,
      vectorFields: this.vectorFields,
      vectorK: this.vectorK,
      returnAllFields: this.returnAllFields,
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
    return clean;
  }

  async _safeSearch(query, options) {
    const run = async (opts) => {
      const send = this._sanitizeSearchOptions(opts);
      logger.debug('[woodland-ai-search-cyclopedia] Sending request', {
        query,
        hasVector: Array.isArray(send.vectorQueries) && send.vectorQueries.length > 0,
        options: JSON.stringify({ ...send, vectorQueries: undefined }, null, 2),
      });
      const rs = await this.client.search(query, send);
      const items = [];
      for await (const r of rs.results) items.push(r.document);
      logger.debug('[woodland-ai-search-cyclopedia] Received response', {
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
        logger.warn('[woodland-ai-search-cyclopedia] Search failed', { attempt, msg });

        const sanitized = { ...opts };
        let changed = false;
        // If the index has no semantic configuration, fall back to simple search
        if (/must have valid semantic configurations/i.test(msg)) {
          if (sanitized.semanticSearchOptions) delete sanitized.semanticSearchOptions;
          sanitized.queryType = 'simple';
          // answers/captions require semantic; disable them
          delete sanitized.answers;
          delete sanitized.captions;
          changed = true;
          logger.info(
            '[woodland-ai-search-cyclopedia] Semantic config missing on index — falling back to simple query',
          );
        }

        if (/orderby/i.test(msg) && String(sanitized.queryType).toLowerCase() === 'semantic') {
          if (sanitized.orderBy) {
            delete sanitized.orderBy;
            changed = true;
            logger.info(
              '[woodland-ai-search-cyclopedia] Removing orderBy for semantic query and retrying',
            );
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
              logger.info(
                '[woodland-ai-search-cyclopedia] Dropping filter due to unknown fields and retrying',
              );
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
          logger.info(
            '[woodland-ai-search-cyclopedia] Dropping searchFields entirely and retrying',
          );
        }

        if (!changed) break;
        opts = sanitized;
      }
    }
    throw lastErr;
  }

  async _call(data) {
    const { query, top: topIn } = data;
    const finalTop =
      typeof topIn === 'number' && Number.isFinite(topIn)
        ? Math.max(1, Math.floor(topIn))
        : this.top;

    // Per-call overrides
    const perCallSelect =
      typeof data?.select === 'string'
        ? data.select
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    const perCallSearchFields =
      typeof data?.searchFields === 'string'
        ? data.searchFields
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    const filter =
      typeof data?.filter === 'string' && data.filter.trim() ? data.filter.trim() : undefined;
    const perCallAnswers = data?.answers;
    const perCallCaptions = data?.captions;
    const perCallSpeller = data?.speller;
    const perCallQueryLanguage = data?.queryLanguage;
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
        typeof this.semanticConfiguration === 'string' ? this.semanticConfiguration.trim() : '';
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
        // Ensure semantic-only params are not sent when semantic is disabled
        options.speller = perCallSpeller || 'lexicon';
      }

      if (!this.returnAllFields) {
        options.select = perCallSelect || this.select;
      } else if (perCallSelect) {
        options.select = perCallSelect;
      }
      if (this.scoringProfile) options.scoringProfile = this.scoringProfile;
      if (perCallSearchFields) options.searchFields = perCallSearchFields;

      if (embedding && this.vectorFields.length > 0) {
        options.vectorQueries = this.vectorFields.map((vf) => ({
          kind: 'vector',
          vector: embedding,
          kNearestNeighborsCount: vectorK,
          fields: vf,
        }));
      }

      if (options.orderBy) delete options.orderBy;

      logger.debug('[woodland-ai-search-cyclopedia] Built search options', {
        queryType: options.queryType,
        hasSemantic: !!options.semanticSearchOptions,
        answers: options.answers,
        captions: options.captions,
      });

      const res = await this._safeSearch(query, options);
      let payload = res.docs || [];
      if (Array.isArray(payload)) {
        payload = payload.map((d) => (d ? this._normalizeDoc(d) : d));
        for (const doc of payload) {
          try {
            const hints = doc?.normalized_cyclopedia?.troubleshooting;
            if (!hints) {
              continue;
            }
            const hasSteps = Array.isArray(hints.steps) && hints.steps.length > 0;
            const hasChecklist = Array.isArray(hints.checklists) && hints.checklists.length > 0;
            const scenarios = Array.isArray(hints.scenarios) ? hints.scenarios : [];

            const scenarioDefaults = [];
            if (scenarios.length > 0 && !hasSteps) {
              for (const scenario of scenarios) {
                const defaults = await resolveScenarioChecklist(scenario);
                if (Array.isArray(defaults) && defaults.length > 0) {
                  scenarioDefaults.push({
                    scenario,
                    steps: defaults,
                  });
                }
              }
            }

            if (scenarioDefaults.length > 0) {
              hints.scenario_defaults = scenarioDefaults;
            }

            hints.hasTroubleshooting =
              hasSteps ||
              hasChecklist ||
              (Array.isArray(hints.scenario_defaults) && hints.scenario_defaults.length > 0);
          } catch (err) {
            logger?.warn?.('[woodland-ai-search-cyclopedia] Failed to resolve scenario defaults', {
              error: err?.message || String(err),
            });
          }
        }
      }
      logger.info('[woodland-ai-search-cyclopedia] Query done', {
        count: Array.isArray(payload) ? payload.length : 0,
        vectorUsed: Array.isArray(options.vectorQueries) && options.vectorQueries.length > 0,
        top: finalTop,
      });
      return JSON.stringify(payload);
    } catch (error) {
      logger.error('[woodland-ai-search-cyclopedia] Azure AI Search request failed', {
        error: error?.message || String(error),
      });
      const msg = (error && (error.message || String(error))) || 'Unknown error';
      return `AZURE_SEARCH_FAILED: ${msg}`;
    }
  }
}

module.exports = WoodlandAISearchCyclopedia;
WoodlandAISearchCyclopedia.enableReusableInstance = true;
