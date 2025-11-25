// configValidation.js - Shared configuration validation and parsing utilities
const { z } = require('zod');
const { logger } = require('~/config');

/**
 * Standard configuration schema for tool configs
 */
const toolConfigSchema = z.object({
  aliases: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  signals: z
    .array(
      z.object({
        name: z.string(),
        keywords: z.array(z.string()).nonempty(),
      })
    )
    .optional(),
  intentKeywords: z.record(z.string(), z.array(z.string()).nonempty()).optional(),
  partTypes: z.record(z.string(), z.string()).optional(),
  fieldMappings: z.record(z.string(), z.array(z.string())).optional(),
  patterns: z
    .object({
      partNumber: z.string().optional(),
      year: z.string().optional(),
      sku: z.string().optional(),
    })
    .optional(),
});

/**
 * Parse and validate configuration from JSON with fallback to defaults
 */
function parseToolConfig(configData, defaults = {}, context = 'tool-config') {
  try {
    const parsed = toolConfigSchema.parse(configData || {});
    return { ...defaults, ...parsed };
  } catch (error) {
    logger?.warn?.(`[${context}] Invalid configuration, using defaults`, {
      error: error?.message || String(error),
    });
    return defaults;
  }
}

/**
 * Normalize alias map to lowercase keys
 */
function normalizeAliasMap(aliases = {}, context = 'aliases') {
  const map = new Map();
  
  Object.entries(aliases).forEach(([canonical, variants]) => {
    const canonicalKey = String(canonical || '').trim().toLowerCase();
    if (!canonicalKey) return;

    // Add canonical as self-reference
    map.set(canonicalKey, canonicalKey);

    // Handle array or string variants
    const variantList = Array.isArray(variants) ? variants : [variants];
    
    variantList.forEach((variant) => {
      const key = String(variant || '').trim().toLowerCase();
      if (!key) return;
      
      if (map.has(key) && map.get(key) !== canonicalKey) {
        logger?.warn?.(`[${context}] Duplicate alias mapping: ${key}`);
      }
      
      map.set(key, canonicalKey);
    });
  });

  return map;
}

/**
 * Convert keyword list to lowercase for case-insensitive matching
 */
function toLowerList(arr) {
  return Array.isArray(arr)
    ? arr.map((s) => (typeof s === 'string' ? s.toLowerCase().trim() : '')).filter(Boolean)
    : [];
}

/**
 * Merge intent keyword sets from defaults and overrides
 */
function mergeIntentKeywords(defaults = {}, overrides = {}) {
  const merged = { ...defaults };
  
  for (const [intent, keywords] of Object.entries(overrides)) {
    if (!Array.isArray(keywords)) continue;
    merged[intent] = [...(merged[intent] || []), ...keywords];
  }

  // Deduplicate and normalize
  return Object.fromEntries(
    Object.entries(merged).map(([intent, keywords]) => {
      const normalized = toLowerList(keywords);
      const unique = Array.from(new Set(normalized));
      return [intent, unique];
    })
  );
}

/**
 * Build regex from pattern string with fallback
 */
function safeRegex(pattern, fallback, flags = 'i') {
  if (typeof pattern === 'string' && pattern.trim()) {
    try {
      return new RegExp(pattern, flags);
    } catch (err) {
      logger?.warn?.('[configValidation] Invalid regex pattern', {
        pattern,
        error: err?.message,
      });
    }
  }
  return fallback;
}

/**
 * Parse field mapping configuration
 */
function parseFieldMappings(mappings = {}) {
  const parsed = {};
  
  for (const [key, fields] of Object.entries(mappings)) {
    if (!Array.isArray(fields)) {
      logger?.warn?.('[configValidation] Field mapping must be array', { key });
      continue;
    }
    
    const validFields = fields.filter(f => typeof f === 'string' && f.trim());
    if (validFields.length > 0) {
      parsed[key] = validFields;
    }
  }
  
  return parsed;
}

/**
 * Parse signal/keyword configuration
 */
function parseSignals(signals = [], context = 'signals') {
  return signals
    .map((signal) => ({
      name: signal?.name,
      keywords: toLowerList(signal?.keywords || []),
    }))
    .filter((signal) => signal.name && signal.keywords.length > 0);
}

/**
 * Extract part type entries with normalization
 */
function normalizePartTypes(partTypes = {}) {
  return Object.entries(partTypes)
    .map(([needle, canonical]) => [
      String(needle).toLowerCase().trim(),
      canonical || needle,
    ])
    .filter(([needle]) => needle);
}

/**
 * Validate environment configuration
 */
function validateEnvConfig(required = [], optional = {}, context = 'env') {
  const missing = [];
  const config = {};

  // Check required vars
  for (const varName of required) {
    const value = process.env[varName];
    if (!value) {
      missing.push(varName);
    } else {
      config[varName] = value;
    }
  }

  // Check optional vars with defaults
  for (const [varName, defaultValue] of Object.entries(optional)) {
    config[varName] = process.env[varName] || defaultValue;
  }

  if (missing.length > 0) {
    throw new Error(
      `[${context}] Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return config;
}

module.exports = {
  toolConfigSchema,
  parseToolConfig,
  normalizeAliasMap,
  toLowerList,
  mergeIntentKeywords,
  safeRegex,
  parseFieldMappings,
  parseSignals,
  normalizePartTypes,
  validateEnvConfig,
};
