// telemetry.js - Shared telemetry and event logging utilities for Woodland agents
const { logger } = require('~/config');

/**
 * Telemetry event types
 */
const EventTypes = {
  QUERY_START: 'query_start',
  QUERY_COMPLETE: 'query_complete',
  QUERY_ERROR: 'query_error',
  CACHE_HIT: 'cache_hit',
  CACHE_MISS: 'cache_miss',
  SEARCH_STRICT: 'search_strict',
  SEARCH_RELAXED: 'search_relaxed',
  SEARCH_FALLBACK: 'search_fallback',
  RESULTS_FILTERED: 'results_filtered',
  POLICY_APPLIED: 'policy_applied',
  NORMALIZATION_COMPLETE: 'normalization_complete',
  AGENT_INVOCATION: 'agent_invocation',
  TOOL_CALL: 'tool_call',
};

/**
 * Structured telemetry event emitter
 */
class TelemetryEmitter {
  constructor(options = {}) {
    const {
      source = 'woodland-agent',
      enabledEvents = Object.values(EventTypes),
      logLevel = 'info',
    } = options;

    this.source = source;
    this.enabledEvents = new Set(enabledEvents);
    this.logLevel = logLevel;
    this.sessionId = this._generateSessionId();
  }

  _generateSessionId() {
    const crypto = require('node:crypto');
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Emit a structured telemetry event
   */
  emit(eventType, data = {}, metadata = {}) {
    if (!this.enabledEvents.has(eventType)) {
      return;
    }

    const event = {
      event: eventType,
      timestamp: new Date().toISOString(),
      source: this.source,
      sessionId: this.sessionId,
      ...data,
      metadata: {
        nodeEnv: process.env.NODE_ENV,
        ...metadata,
      },
    };

    const logMethod = logger?.[this.logLevel] || logger?.info;
    if (logMethod) {
      logMethod(`[${this.source}:telemetry] ${eventType}`, event);
    }
  }

  /**
   * Emit query start event
   */
  queryStart(params = {}) {
    this.emit(EventTypes.QUERY_START, {
      params: this._sanitizeParams(params),
    });
  }

  /**
   * Emit query complete event
   */
  queryComplete(results = [], duration = 0, strategy = 'default') {
    this.emit(EventTypes.QUERY_COMPLETE, {
      resultCount: results.length,
      durationMs: duration,
      strategy,
    });
  }

  /**
   * Emit query error event
   */
  queryError(error, params = {}) {
    this.emit(EventTypes.QUERY_ERROR, {
      error: error?.message || String(error),
      errorType: error?.constructor?.name,
      params: this._sanitizeParams(params),
    });
  }

  /**
   * Emit cache event
   */
  cacheEvent(hit = true, key = null) {
    this.emit(hit ? EventTypes.CACHE_HIT : EventTypes.CACHE_MISS, {
      cacheKey: key ? this._truncateKey(key) : undefined,
    });
  }

  /**
   * Emit search strategy event
   */
  searchStrategy(strategy = 'strict', filter = null, resultCount = 0) {
    const eventType =
      strategy === 'strict'
        ? EventTypes.SEARCH_STRICT
        : strategy === 'relaxed'
          ? EventTypes.SEARCH_RELAXED
          : EventTypes.SEARCH_FALLBACK;

    this.emit(eventType, {
      strategy,
      hasFilter: !!filter,
      resultCount,
    });
  }

  /**
   * Emit results filtered event
   */
  resultsFiltered(before = 0, after = 0, reason = '') {
    this.emit(EventTypes.RESULTS_FILTERED, {
      beforeCount: before,
      afterCount: after,
      filteredCount: before - after,
      reason,
    });
  }

  /**
   * Emit policy applied event
   */
  policyApplied(policyType = '', affected = 0, severity = '') {
    this.emit(EventTypes.POLICY_APPLIED, {
      policyType,
      affectedCount: affected,
      severity,
    });
  }

  /**
   * Emit agent invocation event
   */
  agentInvoked(agentName = '', toolName = '', params = {}) {
    this.emit(EventTypes.AGENT_INVOCATION, {
      agentName,
      toolName,
      params: this._sanitizeParams(params),
    });
  }

  /**
   * Sanitize sensitive parameters for logging
   */
  _sanitizeParams(params = {}) {
    const sanitized = { ...params };
    
    // Remove embeddings (too large)
    if (sanitized.embedding) {
      sanitized.embedding = `[${sanitized.embedding.length} dimensions]`;
    }

    // Truncate long query strings
    if (sanitized.query && sanitized.query.length > 200) {
      sanitized.query = sanitized.query.substring(0, 200) + '...';
    }

    return sanitized;
  }

  /**
   * Truncate cache key for logging
   */
  _truncateKey(key) {
    return key.length > 16 ? key.substring(0, 16) + '...' : key;
  }
}

/**
 * Create performance timer for measuring operation duration
 */
class PerformanceTimer {
  constructor(label = 'operation') {
    this.label = label;
    this.startTime = Date.now();
  }

  /**
   * Get elapsed time in milliseconds
   */
  elapsed() {
    return Date.now() - this.startTime;
  }

  /**
   * Log completion with duration
   */
  complete(source = 'timer') {
    const duration = this.elapsed();
    logger?.debug?.(`[${source}] ${this.label} completed`, {
      durationMs: duration,
    });
    return duration;
  }

  /**
   * Create checkpoint and log intermediate timing
   */
  checkpoint(label = 'checkpoint') {
    const duration = this.elapsed();
    logger?.debug?.(`[${this.label}] ${label}`, {
      durationMs: duration,
    });
    return duration;
  }
}

/**
 * Query metrics aggregator
 */
class QueryMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalQueries = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.errors = 0;
    this.strictSearches = 0;
    this.relaxedSearches = 0;
    this.fallbacks = 0;
    this.totalDurationMs = 0;
  }

  recordQuery(options = {}) {
    const {
      cached = false,
      error = false,
      strategy = 'strict',
      duration = 0,
    } = options;

    this.totalQueries++;
    
    if (cached) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }

    if (error) {
      this.errors++;
    }

    if (strategy === 'strict') {
      this.strictSearches++;
    } else if (strategy === 'relaxed') {
      this.relaxedSearches++;
    }

    this.totalDurationMs += duration;
  }

  recordFallback() {
    this.fallbacks++;
  }

  getStats() {
    const avgDuration = this.totalQueries > 0 
      ? this.totalDurationMs / this.totalQueries 
      : 0;

    const cacheHitRate = (this.cacheHits + this.cacheMisses) > 0
      ? this.cacheHits / (this.cacheHits + this.cacheMisses)
      : 0;

    return {
      totalQueries: this.totalQueries,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: (cacheHitRate * 100).toFixed(2) + '%',
      errors: this.errors,
      errorRate: this.totalQueries > 0 
        ? ((this.errors / this.totalQueries) * 100).toFixed(2) + '%'
        : '0%',
      strictSearches: this.strictSearches,
      relaxedSearches: this.relaxedSearches,
      fallbacks: this.fallbacks,
      totalDurationMs: this.totalDurationMs,
      avgDurationMs: avgDuration.toFixed(2),
    };
  }

  log(source = 'metrics') {
    logger?.info?.(`[${source}] Query metrics`, this.getStats());
  }
}

/**
 * Create standard telemetry emitter for a tool/agent
 */
function createTelemetry(source, options = {}) {
  return new TelemetryEmitter({ source, ...options });
}

/**
 * Create performance timer
 */
function createTimer(label) {
  return new PerformanceTimer(label);
}

/**
 * Create metrics tracker
 */
function createMetrics() {
  return new QueryMetrics();
}

module.exports = {
  EventTypes,
  TelemetryEmitter,
  PerformanceTimer,
  QueryMetrics,
  createTelemetry,
  createTimer,
  createMetrics,
};
