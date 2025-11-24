// adaptiveSearch.js - Reusable adaptive search strategies for all Woodland tools
const { logger } = require('~/config');

/**
 * Adaptive search configuration
 */
const AdaptiveSearchStrategies = {
  STRICT_THEN_RELAXED: 'strict-then-relaxed',
  FILTERED_THEN_UNFILTERED: 'filtered-then-unfiltered',
  EXACT_THEN_FUZZY: 'exact-then-fuzzy',
  HYBRID: 'hybrid',
};

/**
 * Search strategy executor that handles fallback logic
 */
class AdaptiveSearchExecutor {
  constructor(searchFunction, options = {}) {
    const {
      strategy = AdaptiveSearchStrategies.STRICT_THEN_RELAXED,
      minResults = 1,
      maxRetries = 2,
      logResults = true,
      context = 'adaptive-search',
    } = options;

    this.searchFunction = searchFunction;
    this.strategy = strategy;
    this.minResults = minResults;
    this.maxRetries = maxRetries;
    this.logResults = logResults;
    this.context = context;
  }

  /**
   * Execute search with adaptive fallback
   */
  async execute(params, fallbackConfigs = []) {
    const attempts = [params, ...fallbackConfigs];
    let lastError = null;

    for (let i = 0; i < attempts.length && i <= this.maxRetries; i++) {
      const config = attempts[i];
      const attemptLabel = i === 0 ? 'primary' : `fallback-${i}`;

      if (this.logResults) {
        logger?.info?.(`[${this.context}] Attempting ${attemptLabel} search`);
      }

      try {
        const results = await this.searchFunction(config);

        if (this.logResults) {
          logger?.info?.(`[${this.context}] ${attemptLabel} completed`, {
            count: results?.length || 0,
          });
        }

        // Check if results meet minimum threshold
        if (results && results.length >= this.minResults) {
          return {
            results,
            strategy: attemptLabel,
            attempt: i,
            success: true,
          };
        }

        // Log insufficient results
        if (this.logResults && results) {
          logger?.info?.(`[${this.context}] ${attemptLabel} insufficient results`, {
            count: results.length,
            required: this.minResults,
          });
        }
      } catch (error) {
        lastError = error;
        logger?.warn?.(`[${this.context}] ${attemptLabel} failed`, {
          error: error?.message,
        });
      }
    }

    // All attempts exhausted
    if (lastError) {
      throw lastError;
    }

    return {
      results: [],
      strategy: 'exhausted',
      attempt: attempts.length,
      success: false,
    };
  }
}

/**
 * Build relaxed search params from strict params
 */
function relaxSearchParams(strictParams, options = {}) {
  const {
    removeFilters = true,
    expandTop = true,
    disableStrictMode = true,
  } = options;

  const relaxed = { ...strictParams };

  if (removeFilters) {
    delete relaxed.filter;
  }

  if (expandTop && relaxed.top) {
    relaxed.top = Math.min((relaxed.top || 5) * 2, 20);
  }

  if (disableStrictMode) {
    relaxed.relaxed = true;
    relaxed.strict = false;
  }

  return relaxed;
}

/**
 * Build filtered search params with specific filter
 */
function buildFilteredParams(baseParams, filterExpression) {
  return {
    ...baseParams,
    filter: filterExpression,
  };
}

/**
 * Build retry config for make/model fallback (used in Tractor)
 */
function buildMakeModelFallback(params, make, model) {
  const fallback = { ...params };
  
  // Build simplified filter focusing just on make/model
  const makeFilter = make ? `search.ismatch('${make}', 'make')` : null;
  const modelFilter = model ? `search.ismatch('${model}', 'model')` : null;
  
  const filters = [makeFilter, modelFilter].filter(Boolean);
  
  if (filters.length > 0) {
    fallback.filter = filters.map(f => `(${f})`).join(' and ');
  } else {
    delete fallback.filter;
  }
  
  return fallback;
}

/**
 * Build rake/model context fallback (used in Catalog)
 */
function buildRakeContextFallback(params, rakeName = null) {
  const fallback = { ...params };
  
  // Keep rake name if provided, but remove SKU-level filtering
  if (rakeName) {
    fallback.rakeName = rakeName;
  }
  
  delete fallback.rakeSku;
  delete fallback.filter; // Remove strict filters
  fallback.relaxed = true;
  
  return fallback;
}

/**
 * Create standard strict-then-relaxed search executor
 */
function createStrictThenRelaxed(searchFunction, options = {}) {
  return new AdaptiveSearchExecutor(searchFunction, {
    strategy: AdaptiveSearchStrategies.STRICT_THEN_RELAXED,
    ...options,
  });
}

/**
 * Execute two-tier search: strict first, fallback on empty
 */
async function executeTwoTierSearch(searchFunction, strictParams, relaxedParams, options = {}) {
  const { context = 'two-tier', logResults = true } = options;

  if (logResults) {
    logger?.info?.(`[${context}] Starting strict search`);
  }

  const strictResults = await searchFunction(strictParams);

  if (strictResults && strictResults.length > 0) {
    if (logResults) {
      logger?.info?.(`[${context}] Strict search succeeded`, {
        count: strictResults.length,
      });
    }
    return { results: strictResults, strategy: 'strict' };
  }

  if (logResults) {
    logger?.info?.(`[${context}] Strict empty, trying relaxed`);
  }

  const relaxedResults = await searchFunction(relaxedParams);

  if (logResults) {
    logger?.info?.(`[${context}] Relaxed search completed`, {
      count: relaxedResults?.length || 0,
    });
  }

  return { results: relaxedResults || [], strategy: 'relaxed' };
}

/**
 * Execute search with multiple fallback tiers
 */
async function executeMultiTierSearch(searchFunction, tiers = [], options = {}) {
  const { context = 'multi-tier', logResults = true, stopOnFirst = true } = options;

  for (let i = 0; i < tiers.length; i++) {
    const { params, label = `tier-${i}`, minResults = 1 } = tiers[i];

    if (logResults) {
      logger?.info?.(`[${context}] Attempting ${label}`);
    }

    try {
      const results = await searchFunction(params);

      if (logResults) {
        logger?.info?.(`[${context}] ${label} completed`, {
          count: results?.length || 0,
        });
      }

      if (stopOnFirst && results && results.length >= minResults) {
        return { results, strategy: label, tier: i };
      }

      if (!stopOnFirst && results && results.length > 0) {
        // Accumulate results from all tiers
        return { results, strategy: label, tier: i };
      }
    } catch (error) {
      logger?.warn?.(`[${context}] ${label} failed`, {
        error: error?.message,
      });
    }
  }

  return { results: [], strategy: 'exhausted', tier: tiers.length };
}

/**
 * Determine if results need fallback based on count and quality
 */
function shouldFallback(results, options = {}) {
  const { minResults = 1, minScore = 0, requireAll = false } = options;

  if (!results || results.length < minResults) {
    return true;
  }

  if (minScore > 0 && requireAll) {
    return results.every((r) => (r['@search.score'] || 0) < minScore);
  }

  if (minScore > 0) {
    return results.some((r) => (r['@search.score'] || 0) < minScore);
  }

  return false;
}

module.exports = {
  AdaptiveSearchStrategies,
  AdaptiveSearchExecutor,
  relaxSearchParams,
  buildFilteredParams,
  buildMakeModelFallback,
  buildRakeContextFallback,
  createStrictThenRelaxed,
  executeTwoTierSearch,
  executeMultiTierSearch,
  shouldFallback,
};
