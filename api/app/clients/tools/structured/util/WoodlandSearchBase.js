// WoodlandSearchBase.js - Shared base class for all Woodland AI Search tools
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');
const TTLCache = require('../../util/ttlCache');

/**
 * Base class providing common patterns for Woodland AI Search tools:
 * - Environment variable resolution with fallbacks
 * - SearchClient initialization
 * - Provenance/citation formatting
 * - Caching infrastructure
 * - Semantic/vector search configuration
 * - Field validation
 * - Adaptive search strategies
 */
class WoodlandSearchBase extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 5;
  static DEFAULT_SELECT = '*';
  static DEFAULT_VECTOR_K = 15;
  static DEFAULT_CACHE_TTL_MS = 10000;
  static DEFAULT_CACHE_MAX = 200;
  static VALID_FIELD_REGEX = /^[a-zA-Z_][\w.]*$/;

  constructor(fields = {}) {
    super();
    this.fields = fields;
  }

  /**
   * Environment variable resolution with fallback chain
   */
  _env(value, fallback) {
    return value ?? fallback;
  }

  /**
   * Initialize Azure Search Client with standard configuration
   */
  _initializeSearchClient(options = {}) {
    const {
      serviceEndpoint = this.serviceEndpoint,
      apiKey = this.apiKey,
      indexName = this.indexName,
      apiVersion = this.apiVersion,
    } = options;

    if (!serviceEndpoint || !apiKey || !indexName) {
      const missing = [];
      if (!serviceEndpoint) missing.push('AZURE_AI_SEARCH_SERVICE_ENDPOINT');
      if (!apiKey) missing.push('AZURE_AI_SEARCH_API_KEY');
      if (!indexName) missing.push('index name');
      
      throw new Error(
        `Missing required Azure AI Search configuration: ${missing.join(', ')}`
      );
    }

    const credential = new AzureKeyCredential(apiKey);
    return new SearchClient(serviceEndpoint, indexName, credential, { apiVersion });
  }

  /**
   * Extract and format provenance information from document
   * Validates URL and ensures it's properly formatted
   */
  _provenance(doc, baseUrl = null) {
    try {
      let url = (typeof doc?.url === 'string' && doc.url) || '';
      
      // Resolve relative URLs if baseUrl provided
      if (url && baseUrl && !/^https?:\/\//i.test(url)) {
        url = baseUrl.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
      }

      // Validate URL format
      let isValid = false;
      let host;
      
      if (url) {
        try {
          const parsedUrl = new URL(url);
          isValid = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
          host = parsedUrl.hostname;
        } catch (_) {
          isValid = false;
        }
      }

      return {
        url: isValid ? url : undefined,
        host,
        site: doc?.site,
        page_type: doc?.page_type,
        url_valid: isValid,
      };
    } catch (_) {
      return {
        url: undefined,
        site: doc?.site,
        page_type: doc?.page_type,
        url_valid: false,
      };
    }
  }

  /**
   * Build citation object for referencing sources
   * Only creates citation if valid URL exists
   */
  _buildCitation(doc, options = {}) {
    const {
      titleField = 'title',
      skuField = 'sku',
      defaultLabel = 'Document',
      baseUrl = null,
      requireUrl = true,
    } = options;

    const provenance = this._provenance(doc, baseUrl);
    const title = doc?.[titleField];
    const sku = doc?.[skuField];

    // Skip citation if URL required but invalid
    if (requireUrl && !provenance.url_valid) {
      return {
        label: undefined,
        url: undefined,
        markdown: undefined,
        valid: false,
      };
    }

    const citationLabel = sku ? `${title || defaultLabel} — ${sku}` : title || defaultLabel;
    const citationUrl = provenance?.url;
    const citationMarkdown = citationUrl 
      ? `[${citationLabel}](${citationUrl})` 
      : citationLabel;

    return {
      label: citationLabel,
      url: citationUrl,
      markdown: citationMarkdown,
      valid: !!citationUrl,
    };
  }

  /**
   * Validate and sanitize field list for search operations
   */
  _sanitizeFieldList(fields, context = 'fields') {
    if (!Array.isArray(fields)) {
      logger?.warn?.(`[${this.name}] ${context} must be array, got ${typeof fields}`);
      return [];
    }
    
    const sanitized = fields.filter((f) => {
      if (typeof f !== 'string') {
        logger?.warn?.(`[${this.name}] ${context} contains non-string: ${typeof f}`);
        return false;
      }
      if (!WoodlandSearchBase.VALID_FIELD_REGEX.test(f)) {
        logger?.warn?.(`[${this.name}] ${context} contains invalid field: ${f}`);
        return false;
      }
      return true;
    });

    return sanitized;
  }

  /**
   * Build OData filter combining multiple conditions with AND
   */
  _andFilter(...filters) {
    const valid = filters.filter(f => f && typeof f === 'string');
    if (valid.length === 0) return undefined;
    if (valid.length === 1) return valid[0];
    return valid.map(f => `(${f})`).join(' and ');
  }

  /**
   * Build OData filter combining multiple conditions with OR
   */
  _orFilter(...filters) {
    const valid = filters.filter(f => f && typeof f === 'string');
    if (valid.length === 0) return undefined;
    if (valid.length === 1) return valid[0];
    return valid.map(f => `(${f})`).join(' or ');
  }

  /**
   * Escape string literal for OData filter
   */
  _escapeLiteral(value) {
    return String(value).replace(/'/g, "''");
  }

  /**
   * Initialize TTL cache for search results
   */
  _initializeCache(options = {}) {
    const {
      ttl = WoodlandSearchBase.DEFAULT_CACHE_TTL_MS,
      maxEntries = WoodlandSearchBase.DEFAULT_CACHE_MAX,
    } = options;

    return new TTLCache(ttl, maxEntries);
  }

  /**
   * Generate cache key from search parameters
   */
  _generateCacheKey(params) {
    const crypto = require('node:crypto');
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Parse semantic configuration from environment
   */
  _parseSemanticConfiguration(rawValue) {
    if (rawValue == null) return undefined;
    const str = String(rawValue).trim();
    if (!str || str.toLowerCase() === 'none') return undefined;
    return str;
  }

  /**
   * Parse boolean from environment variable
   */
  _parseBoolEnv(value, defaultValue = false) {
    if (value == null) return defaultValue;
    return String(value).toLowerCase().trim() === 'true';
  }

  /**
   * Type conversion helpers for normalization
   */
  _str(value) {
    return value == null ? undefined : String(value);
  }

  _num(value) {
    return value == null || value === '' ? undefined : Number(value);
  }

  _bool(value) {
    if (value == null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return undefined;
      if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
      if (['false', 'no', 'n', '0'].includes(normalized)) return false;
      return undefined;
    }
    return undefined;
  }

  _list(value) {
    return Array.isArray(value)
      ? value
          .filter((x) => x != null && x !== '')
          .map((x) => String(x).trim())
          .filter(Boolean)
      : undefined;
  }

  /**
   * Parse delimited string or array into clean list
   */
  _listFromAny(value, delimiters = /[,;|]/) {
    if (Array.isArray(value)) {
      return value
        .map((entry) => (entry == null ? '' : String(entry).trim()))
        .flatMap((entry) => (entry.includes('|||') ? entry.split('|||') : entry))
        .flatMap((entry) => (entry.includes('|') ? entry.split('|') : entry))
        .flatMap((entry) => (entry.includes(';') ? entry.split(';') : entry))
        .flatMap((entry) => (entry.includes(',') ? entry.split(',') : entry))
        .map((entry) => String(entry).trim())
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(delimiters)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return undefined;
  }

  /**
   * Remove duplicate entries from array
   */
  _unique(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.filter((item, index, self) => self.indexOf(item) === index);
  }

  /**
   * Adaptive search strategy: try strict filter first, fallback to relaxed
   */
  async _adaptiveSearch(strictParams, relaxedParams, options = {}) {
    const { context = 'adaptive-search', logResults = true } = options;

    // Try strict search first
    if (logResults) {
      logger?.info?.(`[${this.name}] ${context}: attempting strict search`);
    }

    const strictResults = await this._executeSearch(strictParams);

    if (strictResults && strictResults.length > 0) {
      if (logResults) {
        logger?.info?.(`[${this.name}] ${context}: strict search succeeded`, {
          count: strictResults.length,
        });
      }
      return { results: strictResults, strategy: 'strict' };
    }

    // Fallback to relaxed search
    if (logResults) {
      logger?.info?.(`[${this.name}] ${context}: strict empty, trying relaxed search`);
    }

    const relaxedResults = await this._executeSearch(relaxedParams);

    if (logResults) {
      logger?.info?.(`[${this.name}] ${context}: relaxed search completed`, {
        count: relaxedResults?.length || 0,
      });
    }

    return { results: relaxedResults || [], strategy: 'relaxed' };
  }

  /**
   * Execute search against Azure AI Search
   * Override in subclass to customize search behavior
   */
  async _executeSearch(params) {
    throw new Error('_executeSearch must be implemented by subclass');
  }

  /**
   * Log structured telemetry event
   */
  _emitTelemetry(eventName, data = {}) {
    logger?.info?.(`[${this.name}:telemetry] ${eventName}`, {
      timestamp: new Date().toISOString(),
      tool: this.name,
      ...data,
    });
  }

  /**
   * Extract intent keywords from query text
   */
  _classifyIntent(query, intentKeywords = {}) {
    const normalized = String(query || '').toLowerCase();
    const matched = {};

    for (const [intent, keywords] of Object.entries(intentKeywords)) {
      if (!Array.isArray(keywords)) continue;
      const hits = keywords.filter(kw => normalized.includes(kw.toLowerCase()));
      if (hits.length > 0) {
        matched[intent] = hits;
      }
    }

    return matched;
  }

  /**
   * Build vector search queries for hybrid search
   */
  _buildVectorQueries(embedding, vectorFields = [], k = 15) {
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return undefined;
    }

    if (!Array.isArray(vectorFields) || vectorFields.length === 0) {
      return undefined;
    }

    return vectorFields.map((field) => ({
      kind: 'vector',
      vector: embedding,
      fields: field,
      k,
    }));
  }

  /**
   * Log initialization details
   */
  _logInitialization(config = {}) {
    logger?.info?.(`[${this.name}] Initialized`, {
      endpoint: this.serviceEndpoint,
      index: this.indexName,
      apiVersion: this.apiVersion,
      enableSemantic: this.enableSemantic,
      semanticConfiguration: this.semanticConfiguration || null,
      ...config,
    });
  }

  /**
   * Validate URL format
   */
  _isValidUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') {
      return false;
    }

    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  /**
   * Filter documents to only those with valid URLs
   */
  _filterDocsByValidUrl(docs, options = {}) {
    const {
      urlFields = ['url', 'link', 'href'],
      baseUrl = null,
      logFiltered = true,
    } = options;

    const beforeCount = docs.length;

    const filtered = docs.filter((doc) => {
      // Check each possible URL field
      for (const field of urlFields) {
        let url = doc?.[field];
        
        if (!url || typeof url !== 'string') {
          continue;
        }

        // Resolve relative URLs
        if (baseUrl && !/^https?:\/\//i.test(url)) {
          try {
            url = new URL(url, baseUrl).toString();
          } catch (_) {
            continue;
          }
        }

        // Check if valid
        if (this._isValidUrl(url)) {
          return true;
        }
      }

      return false;
    });

    const removed = beforeCount - filtered.length;

    if (logFiltered && removed > 0) {
      logger?.info?.(`[${this.name}] Filtered documents without valid URLs`, {
        total: beforeCount,
        removed,
        kept: filtered.length,
      });
    }

    return filtered;
  }

  /**
   * Validate and enhance document URLs
   */
  _validateDocUrl(doc, options = {}) {
    const {
      urlFields = ['url', 'link', 'href'],
      baseUrl = null,
    } = options;

    for (const field of urlFields) {
      let url = doc?.[field];
      
      if (!url || typeof url !== 'string') {
        continue;
      }

      // Resolve relative URLs
      if (baseUrl && !/^https?:\/\//i.test(url)) {
        try {
          url = new URL(url, baseUrl).toString();
        } catch (_) {
          continue;
        }
      }

      // Return first valid URL found
      if (this._isValidUrl(url)) {
        return {
          url,
          field,
          valid: true,
        };
      }
    }

    return {
      url: undefined,
      field: undefined,
      valid: false,
    };
  }
}

module.exports = WoodlandSearchBase;
