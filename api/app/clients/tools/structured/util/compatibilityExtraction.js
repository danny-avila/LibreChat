// compatibilityExtraction.js - Shared utilities for extracting compatibility information from text
const { logger } = require('~/config');

/**
 * Extract compatibility information from text content and tags
 * Returns array of model/make identifiers found in common compatibility patterns
 */
function extractCompatFromText(text, tags = [], options = {}) {
  const {
    patterns = [
      /compatible\s+with\s*[:\-]?\s*([^\n\.]+)/gi,
      /fits\s*[:\-]?\s*([^\n\.]+)/gi,
      /models?\s*[:\-]?\s*([^\n\.]+)/gi,
      /supported\s+models?\s*[:\-]?\s*([^\n\.]+)/gi,
      /works\s+with\s*[:\-]?\s*([^\n\.]+)/gi,
    ],
    maxLength = 40,
    context = 'compat-extraction',
  } = options;

  try {
    const out = new Set();
    
    const addMany = (arr) => {
      arr.forEach((s) => {
        const v = String(s).trim();
        if (v && v.length <= maxLength) {
          out.add(v);
        }
      });
    };

    const textContent = String(text || '');

    // Extract from text patterns
    for (const regex of patterns) {
      let match;
      while ((match = regex.exec(textContent)) !== null) {
        const captured = (match[1] || '')
          .replace(/\band\b/gi, ',')
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        addMany(captured);
      }
    }

    // Extract from tags (filter for reasonable model/series names)
    if (Array.isArray(tags)) {
      const tagModels = tags
        .map((x) => String(x).trim())
        .filter((x) => /[A-Za-z0-9]/.test(x) && x.length <= maxLength);
      addMany(tagModels);
    }

    const result = out.size ? Array.from(out) : undefined;

    if (result && logger?.debug) {
      logger.debug(`[${context}] Extracted compatibility entries`, {
        count: result.length,
      });
    }

    return result;
  } catch (err) {
    logger?.warn?.(`[${context}] Extraction failed`, {
      error: err?.message,
    });
    return undefined;
  }
}

/**
 * Clean and normalize compatibility list
 * Removes empty/invalid entries and normalizes spacing
 */
function cleanCompatList(arr, options = {}) {
  const { maxLength = 50, minLength = 1 } = options;

  try {
    if (!Array.isArray(arr)) return undefined;

    const cleaned = arr
      .map((x) => String(x || '').trim())
      .filter((x) => x.length >= minLength && x.length <= maxLength)
      .filter((x) => !/^[\s\-_.,;:]+$/.test(x)); // Remove pure punctuation

    return cleaned.length > 0 ? cleaned : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * Normalize size/dimension values (e.g., "42 inches" -> "42")
 */
function normalizeDimension(value, unit = 'in') {
  if (value == null) return undefined;

  const str = String(value).toLowerCase();
  const pattern = new RegExp(`(\\d{1,3})(?:\\s?(?:${unit}|inch|inches))?`, 'i');
  const match = str.match(pattern);

  return match ? match[1] : undefined;
}

/**
 * Extract year values from text (1900-2099)
 */
function extractYears(text, options = {}) {
  const { min = 1900, max = 2099 } = options;
  
  try {
    const yearPattern = /\b(19|20)\d{2}\b/g;
    const matches = String(text || '').match(yearPattern) || [];
    
    const years = matches
      .map(y => parseInt(y, 10))
      .filter(y => y >= min && y <= max)
      .filter((y, i, arr) => arr.indexOf(y) === i); // unique

    return years.length > 0 ? years : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * Extract part numbers matching common patterns
 */
function extractPartNumbers(text, pattern = /\b\d{2,3}-[a-z0-9]{2,3}-[a-z0-9]{3,}\b/gi) {
  try {
    const matches = String(text || '').match(pattern) || [];
    const unique = [...new Set(matches.map(m => m.toUpperCase()))];
    return unique.length > 0 ? unique : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * Parse multi-word brand/make from query text
 * Handles brands like "John Deere", "Cub Cadet", "Troy-Bilt"
 */
function extractMultiWordBrand(query, brandAliases = {}) {
  const normalized = String(query || '').toLowerCase();
  
  for (const [pattern, canonical] of Object.entries(brandAliases)) {
    if (normalized.includes(pattern.toLowerCase())) {
      return canonical;
    }
  }
  
  return undefined;
}

/**
 * Match text against signal keywords and return matched signals
 */
function matchSignals(text, signals = [], options = {}) {
  const { caseSensitive = false } = options;
  const normalized = caseSensitive ? text : String(text || '').toLowerCase();
  const matched = [];

  for (const signal of signals) {
    if (!signal.name || !Array.isArray(signal.keywords)) continue;

    const hits = signal.keywords.filter((keyword) => {
      const kw = caseSensitive ? keyword : keyword.toLowerCase();
      return normalized.includes(kw);
    });

    if (hits.length > 0) {
      matched.push({
        name: signal.name,
        keywords: hits,
        score: hits.length,
      });
    }
  }

  return matched.sort((a, b) => b.score - a.score);
}

/**
 * Canonicalize model/name using alias map
 */
function canonicalizeValue(value, aliasMap) {
  if (!value) return undefined;
  
  const key = String(value).trim().toLowerCase();
  if (!key) return undefined;

  if (aliasMap instanceof Map) {
    return aliasMap.get(key) || key;
  }

  if (typeof aliasMap === 'object') {
    return aliasMap[key] || key;
  }

  return key;
}

/**
 * Build compatibility object from various source fields
 */
function buildCompatibilityObject(doc, fieldMappings = {}) {
  const compat = {};

  for (const [key, fields] of Object.entries(fieldMappings)) {
    if (!Array.isArray(fields)) continue;

    const values = [];
    for (const field of fields) {
      const val = doc?.[field];
      if (val != null && val !== '') {
        if (Array.isArray(val)) {
          values.push(...val);
        } else {
          values.push(val);
        }
      }
    }

    if (values.length > 0) {
      const cleaned = cleanCompatList(values);
      if (cleaned) {
        compat[key] = cleaned;
      }
    }
  }

  return Object.keys(compat).length > 0 ? compat : undefined;
}

module.exports = {
  extractCompatFromText,
  cleanCompatList,
  normalizeDimension,
  extractYears,
  extractPartNumbers,
  extractMultiWordBrand,
  matchSignals,
  canonicalizeValue,
  buildCompatibilityObject,
};
