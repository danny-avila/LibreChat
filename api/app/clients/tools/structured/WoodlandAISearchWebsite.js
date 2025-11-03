// woodland-ai-search-website.js (single-index)
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');

const DEFAULT_EXTRACTIVE =
  String(process.env.WOODLAND_SEARCH_ENABLE_EXTRACTIVE ?? 'false')
    .toLowerCase()
    .trim() === 'true';

class WoodlandAISearchWebsite extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 5;
  static DEFAULT_SELECT =
    'id,title,content,url,parent_id,parent_url,site,page_type,breadcrumb,tags,headings,images_alt,content_length,author,last_published,last_updated,last_crawled,allowlist_match,reviewed';
  static DEFAULT_VECTOR_K = 15;
  static DEFAULT_VECTOR_FIELDS = '';

  _env(v, fallback) {
    return v ?? fallback;
  }

  _provenance(d) {
    try {
      let url = (typeof d?.url === 'string' && d.url) || '';
      if (url && this.baseUrl && !/^https?:\/\//i.test(url)) {
        url = this.baseUrl.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
      }
      const host = url ? new URL(url).hostname : undefined;
      return { url: url || undefined, host, site: d?.site, page_type: d?.page_type };
    } catch (_) {
      return { site: d?.site, page_type: d?.page_type };
    }
  }

  _normalizeDoc(d) {
    const str = (v) => (v == null ? undefined : String(v));
    const num = (v) => (v == null || v === '' ? undefined : Number(v));
    const list = (v) =>
      Array.isArray(v)
        ? v
            .filter(Boolean)
            .map((entry) => String(entry).trim())
            .filter(Boolean)
        : undefined;
    const listFromAny = (value) => {
      if (Array.isArray(value)) {
        return value
          .map((entry) => (entry == null ? '' : String(entry).trim()))
          .map((entry) => (entry && entry.includes('|') ? entry.split('|') : entry))
          .flat()
          .map((entry) => (entry && entry.includes(';') ? entry.split(';') : entry))
          .flat()
          .map((entry) => (entry && entry.includes(',') ? entry.split(',') : entry))
          .flat()
          .map((entry) => String(entry).trim())
          .filter(Boolean);
      }
      if (typeof value === 'string') {
        return value
          .split(/[,;|]/)
          .map((segment) => segment.trim())
          .filter(Boolean);
      }
      return undefined;
    };

    const provenance = this._provenance(d);
    const title = str(d?.title) || str(d?.heading) || str(d?.breadcrumb?.split?.('\n')?.pop());
    const citationLabel = title || (provenance?.host ? `${provenance.host} page` : 'Website doc');
    const citationMarkdown = provenance?.url
      ? `[${citationLabel}](${provenance.url})`
      : citationLabel;

    const normalized = {
      title,
      summary: str(d?.summary) || str(d?.content)?.slice(0, 500) || undefined,
      tags: list(d?.tags),
      images_alt: list(d?.images_alt),
      headings: list(d?.headings),
      breadcrumb: str(d?.breadcrumb),
      last_updated: str(d?.last_updated),
      last_crawled: str(d?.last_crawled),
      pricing: {
        price: num(d?.price),
        sale_price: num(d?.sale_price),
        strike_price: num(d?.strike_price),
        financing_copy: str(d?.financing_copy),
        financing_url: str(d?.financing_url),
      },
      promotions: {
        headline: str(d?.promo_headline),
        subheadline: str(d?.promo_subheadline),
        description: str(d?.promo_description),
        disclaimer: str(d?.promo_disclaimer),
        start_date: str(d?.promo_start),
        end_date: str(d?.promo_end),
        code: str(d?.promo_code),
      },
      cta: {
        text: str(d?.cta_text),
        url: str(d?.cta_url),
        phone: str(d?.cta_phone),
        button_text: str(d?.cta_button_text),
      },
      highlights: listFromAny(d?.highlights) || listFromAny(d?.key_points),
      sections: listFromAny(d?.sections),
      faqs: listFromAny(d?.faqs),
      provenance,
      citation: { label: citationLabel, url: provenance?.url, markdown: citationMarkdown },
    };

    return { ...d, normalized_website: normalized };
  }

  constructor(fields = {}) {
    super();
    this.name = 'woodland-ai-search-website';
    this.description =
      "Use the 'woodland-ai-search-website' tool to query the public Website index (semantic/vector).";

    this.schema = z.object({
      query: z.string().describe('Question or search phrase for Website index'),
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

    // Endpoint/key
    this.serviceEndpoint = this._env(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
    );
    this.apiKey = this._env(fields.AZURE_AI_SEARCH_API_KEY, process.env.AZURE_AI_SEARCH_API_KEY);

    // Website index name
    this.indexName =
      this._env(fields.AZURE_AI_SEARCH_WEBSITE_INDEX, process.env.AZURE_AI_SEARCH_WEBSITE_INDEX) ||
      this._env(
        fields.AZURE_AI_SEARCH_WEBSITE_INDEX_NAME,
        process.env.AZURE_AI_SEARCH_WEBSITE_INDEX_NAME,
      ) ||
      this._env(fields.AZURE_AI_SEARCH_INDEX_NAME, process.env.AZURE_AI_SEARCH_INDEX_NAME);

    // Base URL for resolving relative links (optional)
    this.baseUrl =
      this._env(
        fields.AZURE_AI_SEARCH_WEBSITE_BASE_URL,
        process.env.AZURE_AI_SEARCH_WEBSITE_BASE_URL,
      ) || this._env(fields.AZURE_AI_SEARCH_BASE_URL, process.env.AZURE_AI_SEARCH_BASE_URL);

    if (!this.serviceEndpoint || !this.apiKey || !this.indexName) {
      throw new Error(
        'Missing Azure AI Search envs: AZURE_AI_SEARCH_SERVICE_ENDPOINT, AZURE_AI_SEARCH_API_KEY, and Website index (AZURE_AI_SEARCH_WEBSITE_INDEX or AZURE_AI_SEARCH_INDEX_NAME).',
      );
    }

    // API version
    this.apiVersion = this._env(
      fields.AZURE_AI_SEARCH_API_VERSION,
      process.env.AZURE_AI_SEARCH_API_VERSION || WoodlandAISearchWebsite.DEFAULT_API_VERSION,
    );

    // Defaults
    this.top = WoodlandAISearchWebsite.DEFAULT_TOP;
    this.select = WoodlandAISearchWebsite.DEFAULT_SELECT.split(',').map((s) => s.trim());

    // Semantic/search options
    this.searchFields = (() => {
      const v =
        this._env(
          fields.AZURE_AI_SEARCH_WEBSITE_SEARCH_FIELDS,
          process.env.AZURE_AI_SEARCH_WEBSITE_SEARCH_FIELDS,
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
        'headings',
        'images_alt',
        'breadcrumb',
        'site',
        'page_type',
      ];
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
    this.semanticEnabled = !!this.semanticConfiguration;
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
      )
        .toLowerCase()
        .trim() === 'true';

    // Vector options
    this.vectorFields = (() => {
      const v =
        this._env(
          fields.AZURE_AI_SEARCH_WEBSITE_VECTOR_FIELDS,
          process.env.AZURE_AI_SEARCH_WEBSITE_VECTOR_FIELDS,
        ) ||
        this._env(
          fields.AZURE_AI_SEARCH_VECTOR_FIELDS,
          process.env.AZURE_AI_SEARCH_VECTOR_FIELDS,
        ) ||
        WoodlandAISearchWebsite.DEFAULT_VECTOR_FIELDS;
      return String(v || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    })();

    this.vectorK = Number(
      this._env(
        fields.AZURE_AI_SEARCH_WEBSITE_VECTOR_K,
        process.env.AZURE_AI_SEARCH_WEBSITE_VECTOR_K,
      ) ||
        this._env(fields.AZURE_AI_SEARCH_VECTOR_K, process.env.AZURE_AI_SEARCH_VECTOR_K) ||
        WoodlandAISearchWebsite.DEFAULT_VECTOR_K,
    );

    // Auto-vectorize (text -> vector) support, if the index has a built-in vectorizer configured
    this.vectorizeQueryEnabled =
      String(
        this._env(
          fields.AZURE_AI_SEARCH_VECTORIZE_QUERY,
          process.env.AZURE_AI_SEARCH_VECTORIZE_QUERY || 'false',
        ),
      )
        .toLowerCase()
        .trim() === 'true';

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

    logger.info('[woodland-ai-search-website] Initialized', {
      endpoint: this.serviceEndpoint,
      apiVersion: this.apiVersion,
      index: this.indexName,
      select: this.select,
      searchFields: this.searchFields,
      semanticConfiguration: this.semanticConfiguration || null,
      semanticEnabled: this.semanticEnabled,
      queryLanguage: this.queryLanguage,
      scoringProfile: this.scoringProfile,
      vectorFields: this.vectorFields,
      vectorK: this.vectorK,
      baseUrl: this.baseUrl,
      vectorizeQueryEnabled: this.vectorizeQueryEnabled,
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
      logger.debug('[woodland-ai-search-website] Sending request', {
        query,
        hasVector: Array.isArray(send.vectorQueries) && send.vectorQueries.length > 0,
        options: JSON.stringify({ ...send, vectorQueries: undefined }, null, 2),
      });
      const rs = await this.client.search(query, send);
      const items = [];
      for await (const r of rs.results) items.push(r.document);
      logger.debug('[woodland-ai-search-website] Received response', {
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
        logger.warn('[woodland-ai-search-website] Search failed', { attempt, msg });

        // If the service complains about semantic configuration, fall back to simple search without semantic options
        if (
          /semantic configurations? defined|parameter name:\s*semanticconfiguration|must have valid semantic configurations|semanticConfiguration(?:'|\\\")? must not be empty/i.test(
            msg,
          )
        ) {
          const fallback = { ...opts };
          fallback.queryType = 'simple';
          delete fallback.semanticSearchOptions;
          delete fallback.answers;
          delete fallback.captions;
          delete fallback.speller;
          // keep other options (top, filter, select, searchFields, vectorQueries)
          try {
            logger.info(
              '[woodland-ai-search-website] Falling back to queryType=simple (no semantic options) due to missing semantic configuration',
            );
            const rs = await this.client.search(query, this._sanitizeSearchOptions(fallback));
            const items = [];
            for await (const r of rs.results) items.push(r.document);
            logger.debug('[woodland-ai-search-website] Received response (fallback simple)', {
              count: items.length,
              sample: items.slice(0, 2),
            });
            return { docs: items, retried: true };
          } catch (e2) {
            // If fallback also fails, continue to normal sanitation logic below
            logger.warn('[woodland-ai-search-website] Fallback simple search also failed', {
              msg: e2?.message || String(e2),
            });
          }
        }
        // If service rejects text-based vector queries, drop `text` and retry with no vector queries
        if (
          /Unrecognized field\s+'text'|cannot deserialize.*vectorQueries|invalid property.*vectorQueries/i.test(
            msg,
          )
        ) {
          const fallback = { ...opts };
          if (Array.isArray(fallback.vectorQueries)) delete fallback.vectorQueries;
          try {
            logger.info(
              '[woodland-ai-search-website] Removing text-based vectorQueries and retrying',
            );
            const rs = await this.client.search(query, this._sanitizeSearchOptions(fallback));
            const items = [];
            for await (const r of rs.results) items.push(r.document);
            logger.debug('[woodland-ai-search-website] Received response (no vectorQueries)', {
              count: items.length,
              sample: items.slice(0, 2),
            });
            return { docs: items, retried: true };
          } catch (e3) {
            logger.warn('[woodland-ai-search-website] Retry without vectorQueries also failed', {
              msg: e3?.message || String(e3),
            });
          }
        }

        const sanitized = { ...opts };
        let changed = false;

        if (/orderby/i.test(msg) && String(sanitized.queryType).toLowerCase() === 'semantic') {
          if (sanitized.orderBy) {
            delete sanitized.orderBy;
            changed = true;
            logger.info(
              '[woodland-ai-search-website] Removing orderBy for semantic query and retrying',
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
                '[woodland-ai-search-website] Dropping filter due to unknown fields and retrying',
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
          logger.info('[woodland-ai-search-website] Dropping searchFields entirely and retrying');
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
    const perCallAnswers = data?.answers;
    const perCallCaptions = data?.captions;
    const perCallSpeller = data?.speller;
    const perCallQueryLanguage = data?.queryLanguage;
    const filter =
      typeof data?.filter === 'string' && data.filter.trim() ? data.filter.trim() : undefined;
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
        options.speller = perCallSpeller || 'lexicon';
      }

      if (!this.returnAllFields) {
        options.select = perCallSelect || this.select;
      } else if (perCallSelect) {
        options.select = perCallSelect;
      }
      if (this.scoringProfile) options.scoringProfile = this.scoringProfile;
      if (perCallSearchFields) options.searchFields = perCallSearchFields;

      // Vector / hybrid search
      if (this.vectorFields.length > 0) {
        if (embedding && Array.isArray(embedding)) {
          options.vectorQueries = this.vectorFields.map((vf) => ({
            kind: 'vector',
            vector: embedding,
            kNearestNeighborsCount: vectorK,
            fields: vf,
          }));
        } else if (this.vectorizeQueryEnabled) {
          // Use text -> vector server-side vectorization when available on the index
          options.vectorQueries = this.vectorFields.map((vf) => ({
            kind: 'vector',
            text: String(query || ''),
            kNearestNeighborsCount: vectorK,
            fields: vf,
          }));
        }
      }

      if (options.orderBy) delete options.orderBy;

      const docs = await this._safeSearch(query, options);
      let payload = docs.docs || [];
      if (Array.isArray(payload)) {
        payload = payload.map((d) => (d ? this._normalizeDoc(d) : d));
      }
      logger.info('[woodland-ai-search-website] Query done', {
        count: Array.isArray(payload) ? payload.length : 0,
        vectorUsed: Array.isArray(options.vectorQueries) && options.vectorQueries.length > 0,
        top: finalTop,
        queryType: options.queryType,
        semanticEnabled: this.semanticEnabled,
        vectorQueryMode: Array.isArray(options.vectorQueries)
          ? options.vectorQueries[0]?.vector
            ? 'embedding'
            : options.vectorQueries[0]?.text
              ? 'text'
              : 'none'
          : 'none',
      });
      return JSON.stringify(payload);
    } catch (error) {
      logger.error('[woodland-ai-search-website] Azure AI Search request failed', {
        error: error?.message || String(error),
      });
      const msg = (error && (error.message || String(error))) || 'Unknown error';
      return `AZURE_SEARCH_FAILED: ${msg}`;
    }
  }
}

module.exports = WoodlandAISearchWebsite;
WoodlandAISearchWebsite.enableReusableInstance = true;
