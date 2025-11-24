// urlPolicy.js - Policy rules for URL validation and broken link handling
const { logger } = require('~/config');
const { isValidUrl, checkUrlHealth, globalHealthCache } = require('./urlValidation');

/**
 * Policy severity levels for URL issues
 */
const UrlPolicySeverity = {
  BLOCK: 'block',      // Document must be excluded
  WARN: 'warn',        // Flag for review but allow
  INFO: 'info',        // Informational only
};

/**
 * Apply URL validation policy to documents
 */
function applyUrlPolicy(docs, options = {}) {
  const {
    requireValidUrl = true,
    checkBrokenLinks = false,
    baseUrl = null,
    urlFields = ['url', 'link', 'href'],
    logResults = true,
  } = options;

  const results = {
    docs: [],
    blocked: 0,
    warnings: [],
    policies: [],
  };

  for (const doc of docs) {
    const policy = {
      flags: [],
      severity: null,
      notes: [],
    };

    // Extract and validate URL
    let validUrl = null;
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

      if (isValidUrl(url)) {
        validUrl = url;
        break;
      }
    }

    // Apply policies
    if (!validUrl) {
      policy.flags.push('missing_valid_url');
      policy.notes.push('Document does not contain a valid URL');
      
      if (requireValidUrl) {
        policy.severity = UrlPolicySeverity.BLOCK;
        results.blocked++;
        continue; // Skip this document
      } else {
        policy.severity = UrlPolicySeverity.WARN;
        results.warnings.push({
          id: doc?.id || doc?.title,
          reason: 'Missing valid URL',
        });
      }
    }

    // Check for broken links if requested
    if (checkBrokenLinks && validUrl) {
      const cached = globalHealthCache.get(validUrl);
      if (cached && !cached.accessible) {
        policy.flags.push('broken_link');
        policy.notes.push(`URL not accessible: ${cached.error || 'Unknown error'}`);
        policy.severity = UrlPolicySeverity.BLOCK;
        results.blocked++;
        continue; // Skip this document
      }
    }

    // Add policy metadata to document
    const enhancedDoc = {
      ...doc,
      url_policy: policy.flags.length > 0 ? policy : undefined,
      validated_url: validUrl,
    };

    results.docs.push(enhancedDoc);
    
    if (policy.flags.length > 0) {
      results.policies.push({
        doc_id: doc?.id || doc?.title,
        policy,
      });
    }
  }

  if (logResults && (results.blocked > 0 || results.warnings.length > 0)) {
    logger?.info?.('[urlPolicy] Applied URL validation policies', {
      total: docs.length,
      passed: results.docs.length,
      blocked: results.blocked,
      warnings: results.warnings.length,
    });
  }

  return results;
}

/**
 * Async version that checks link health
 */
async function applyUrlPolicyAsync(docs, options = {}) {
  const {
    checkBrokenLinks = true,
    baseUrl = null,
    urlFields = ['url', 'link', 'href'],
    cacheResults = true,
    timeout = 3000,
  } = options;

  // First pass: validate format
  const formatValidated = applyUrlPolicy(docs, {
    ...options,
    checkBrokenLinks: false,
  });

  if (!checkBrokenLinks || formatValidated.docs.length === 0) {
    return formatValidated;
  }

  // Collect URLs to check
  const urlsToCheck = new Map();
  formatValidated.docs.forEach((doc, index) => {
    const url = doc.validated_url;
    if (url && !globalHealthCache.get(url)) {
      urlsToCheck.set(url, index);
    }
  });

  // Check health for uncached URLs
  if (urlsToCheck.size > 0) {
    const healthChecks = await Promise.allSettled(
      Array.from(urlsToCheck.keys()).map(url =>
        checkUrlHealth(url, { timeout })
      )
    );

    healthChecks.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        const url = Array.from(urlsToCheck.keys())[i];
        if (cacheResults) {
          globalHealthCache.set(url, result.value);
        }
      }
    });
  }

  // Second pass: filter by health
  const results = {
    docs: [],
    blocked: formatValidated.blocked,
    warnings: [...formatValidated.warnings],
    policies: [...formatValidated.policies],
  };

  for (const doc of formatValidated.docs) {
    const url = doc.validated_url;
    if (!url) {
      results.docs.push(doc);
      continue;
    }

    const health = globalHealthCache.get(url);
    if (health && !health.accessible) {
      results.blocked++;
      results.policies.push({
        doc_id: doc?.id || doc?.title,
        policy: {
          flags: ['broken_link'],
          severity: UrlPolicySeverity.BLOCK,
          notes: [`URL not accessible: ${health.error || health.statusCode}`],
        },
      });
      continue;
    }

    results.docs.push(doc);
  }

  logger?.info?.('[urlPolicy] Applied URL health checks', {
    total: docs.length,
    passed: results.docs.length,
    blocked: results.blocked,
    checked: urlsToCheck.size,
    cached: formatValidated.docs.length - urlsToCheck.size,
  });

  return results;
}

/**
 * Filter citation links to only include valid URLs
 */
function filterValidCitations(citations) {
  if (!Array.isArray(citations)) {
    return citations;
  }

  return citations.filter(citation => {
    if (!citation) return false;
    
    const url = citation.url || citation.link || citation.href;
    return isValidUrl(url);
  });
}

/**
 * Enhance citation with URL validation
 */
function validateCitation(citation, options = {}) {
  const { requireUrl = true } = options;

  if (!citation) {
    return { valid: false, citation: null };
  }

  const url = citation.url || citation.link || citation.href;
  const hasValidUrl = isValidUrl(url);

  if (requireUrl && !hasValidUrl) {
    return { valid: false, citation: null };
  }

  return {
    valid: hasValidUrl || !requireUrl,
    citation: {
      ...citation,
      url_valid: hasValidUrl,
    },
  };
}

module.exports = {
  UrlPolicySeverity,
  applyUrlPolicy,
  applyUrlPolicyAsync,
  filterValidCitations,
  validateCitation,
};
