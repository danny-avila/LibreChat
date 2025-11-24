// urlValidation.js - URL validation and health checking utilities
const { logger } = require('~/config');
const https = require('https');
const http = require('http');

/**
 * Validate URL format
 */
function isValidUrl(urlString) {
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
 * Normalize URL (remove trailing slashes, fragments, etc.)
 */
function normalizeUrl(urlString, options = {}) {
  const {
    removeFragment = true,
    removeQueryParams = false,
    removeTrailingSlash = true,
  } = options;

  if (!isValidUrl(urlString)) {
    return urlString;
  }

  try {
    const url = new URL(urlString);

    if (removeFragment) {
      url.hash = '';
    }

    if (removeQueryParams) {
      url.search = '';
    }

    let normalized = url.toString();

    if (removeTrailingSlash && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch (_) {
    return urlString;
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname;
  } catch (_) {
    return undefined;
  }
}

/**
 * Check if URL is accessible (HEAD request)
 */
async function checkUrlHealth(urlString, options = {}) {
  const {
    timeout = 5000,
    followRedirects = true,
    maxRedirects = 3,
  } = options;

  if (!isValidUrl(urlString)) {
    return {
      url: urlString,
      valid: false,
      accessible: false,
      error: 'Invalid URL format',
    };
  }

  return new Promise((resolve) => {
    try {
      const url = new URL(urlString);
      const protocol = url.protocol === 'https:' ? https : http;

      const requestOptions = {
        method: 'HEAD',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        timeout,
        headers: {
          'User-Agent': 'WoodlandAgent/1.0',
        },
      };

      const req = protocol.request(requestOptions, (res) => {
        const statusCode = res.statusCode;

        // Handle redirects
        if (followRedirects && statusCode >= 300 && statusCode < 400 && maxRedirects > 0) {
          const location = res.headers.location;
          if (location) {
            resolve(checkUrlHealth(location, { timeout, followRedirects, maxRedirects: maxRedirects - 1 }));
            return;
          }
        }

        resolve({
          url: urlString,
          valid: true,
          accessible: statusCode >= 200 && statusCode < 400,
          statusCode,
          redirected: statusCode >= 300 && statusCode < 400,
          finalUrl: res.headers.location || urlString,
        });
      });

      req.on('error', (error) => {
        resolve({
          url: urlString,
          valid: true,
          accessible: false,
          error: error.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          url: urlString,
          valid: true,
          accessible: false,
          error: 'Request timeout',
        });
      });

      req.end();
    } catch (error) {
      resolve({
        url: urlString,
        valid: false,
        accessible: false,
        error: error.message,
      });
    }
  });
}

/**
 * Batch check multiple URLs
 */
async function checkUrlsHealth(urls, options = {}) {
  const { concurrency = 5 } = options;

  const results = new Map();
  const urlArray = Array.from(new Set(urls.filter(isValidUrl)));

  // Process in batches to avoid overwhelming the network
  for (let i = 0; i < urlArray.length; i += concurrency) {
    const batch = urlArray.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(url => checkUrlHealth(url, options))
    );
    
    batchResults.forEach(result => {
      results.set(result.url, result);
    });
  }

  return results;
}

/**
 * In-memory cache for URL health checks
 */
class UrlHealthCache {
  constructor(options = {}) {
    const {
      ttl = 3600000, // 1 hour default
      maxSize = 1000,
    } = options;

    this.cache = new Map();
    this.ttl = ttl;
    this.maxSize = maxSize;
  }

  set(url, result) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(url, {
      result,
      timestamp: Date.now(),
    });
  }

  get(url) {
    const entry = this.cache.get(url);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.ttl) {
      this.cache.delete(url);
      return null;
    }

    return entry.result;
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

/**
 * Validate and enrich document URLs
 */
function validateDocumentUrls(doc, options = {}) {
  const {
    baseUrl = null,
    requireUrl = true,
    checkHealth = false,
    urlFields = ['url', 'link', 'href', 'citation_url'],
  } = options;

  const urls = [];

  // Extract URLs from known fields
  for (const field of urlFields) {
    const value = doc?.[field];
    if (value && typeof value === 'string') {
      urls.push(value);
    }
  }

  // Resolve relative URLs
  const resolvedUrls = urls.map(url => {
    if (baseUrl && !/^https?:\/\//i.test(url)) {
      try {
        return new URL(url, baseUrl).toString();
      } catch (_) {
        return url;
      }
    }
    return url;
  });

  // Validate format
  const validUrls = resolvedUrls.filter(isValidUrl);

  if (requireUrl && validUrls.length === 0) {
    logger?.warn?.('[urlValidation] Document missing valid URL', {
      id: doc?.id,
      title: doc?.title,
    });
  }

  return {
    hasValidUrl: validUrls.length > 0,
    urls: validUrls,
    primaryUrl: validUrls[0],
  };
}

/**
 * Filter documents by URL health
 */
async function filterByUrlHealth(docs, options = {}) {
  const {
    baseUrl = null,
    urlFields = ['url'],
    excludeBroken = true,
    checkHealth = true,
  } = options;

  if (!checkHealth) {
    return docs;
  }

  const urlsToCheck = new Set();
  const docUrlMap = new Map();

  // Collect all URLs
  docs.forEach(doc => {
    const validation = validateDocumentUrls(doc, { baseUrl, urlFields, requireUrl: false });
    if (validation.primaryUrl) {
      urlsToCheck.add(validation.primaryUrl);
      docUrlMap.set(doc, validation.primaryUrl);
    }
  });

  // Check health
  const healthResults = await checkUrlsHealth(Array.from(urlsToCheck), options);

  // Filter docs
  const filtered = docs.filter(doc => {
    const url = docUrlMap.get(doc);
    if (!url) return !excludeBroken; // Keep if not requiring URLs

    const health = healthResults.get(url);
    if (!health) return !excludeBroken;

    return health.accessible;
  });

  const removed = docs.length - filtered.length;
  if (removed > 0) {
    logger?.info?.('[urlValidation] Filtered documents with broken URLs', {
      total: docs.length,
      removed,
      kept: filtered.length,
    });
  }

  return filtered;
}

/**
 * Singleton cache instance
 */
const globalHealthCache = new UrlHealthCache();

module.exports = {
  isValidUrl,
  normalizeUrl,
  extractDomain,
  checkUrlHealth,
  checkUrlsHealth,
  UrlHealthCache,
  globalHealthCache,
  validateDocumentUrls,
  filterByUrlHealth,
};
