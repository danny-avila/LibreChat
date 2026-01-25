/**
 * Cross-Tool Validation for Critical Parts
 * Validates critical part SKUs across multiple data sources.
 */
const { logger } = require('~/config');

const CRITICAL_PART_CATEGORIES = new Set([
  'impeller',
  'impeller_assembly',
  'engine',
  'engine_assembly',
  'chassis',
  'blower_housing',
  'complete_rake',
  'hitch_assembly',
  'dual_pin_hitch',
  'crs_hitch',
]);

function normalizeCategory(cat) {
  return String(cat || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function requiresCrossValidation(category, categories = []) {
  const all = [category, ...(categories || [])]
    .filter(Boolean)
    .map(normalizeCategory);
  return all.some((c) => CRITICAL_PART_CATEGORIES.has(c));
}

async function validateCriticalPart(catalogDoc, productHistoryTool) {
  const validation = {
    is_valid: true,
    conflicts: [],
    warnings: [],
    validated_at: new Date().toISOString(),
  };

  if (!catalogDoc) {
    validation.is_valid = false;
    validation.conflicts.push({ severity: 'high', type: 'missing_catalog_doc' });
    return validation;
  }

  const sku = catalogDoc.normalized_catalog?.sku;
  const fitmentModels = catalogDoc.normalized_catalog?.fitment?.rake_models || [];

  if (!sku) {
    validation.is_valid = false;
    validation.conflicts.push({ severity: 'high', type: 'missing_sku' });
    return validation;
  }

  if (!productHistoryTool) {
    validation.warnings.push({
      severity: 'medium',
      message: 'Product History unavailable for verification',
      recommendation: 'Manual verification recommended',
    });
    return validation;
  }

  // Query Product History with SKU
  let historyResponse;
  try {
    historyResponse = await productHistoryTool.invoke({
      query: sku,
      top: 5,
      format: 'json',
    });
  } catch (error) {
    logger.warn('[crossToolValidation] Product History query failed', {
      sku,
      error: error.message,
    });
    validation.warnings.push({
      severity: 'medium',
      message: 'Product History query failed',
      recommendation: 'Manual verification recommended',
    });
    return validation;
  }

  // Parse Product History response
  let historyDocs = [];
  if (typeof historyResponse === 'string') {
    try {
      const parsed = JSON.parse(historyResponse);
      historyDocs = parsed.documents || [];
    } catch {
      // Invalid JSON response
    }
  } else if (Array.isArray(historyResponse?.documents)) {
    historyDocs = historyResponse.documents;
  }

  if (historyDocs.length === 0) {
    validation.conflicts.push({
      severity: 'high',
      type: 'sku_not_in_history',
      message: `SKU ${sku} not found in Product History`,
      recommendation: 'Verify SKU is current or not discontinued',
    });
    validation.is_valid = false;
    return validation;
  }

  // Check model fitment consistency
  const historyModels = new Set();
  historyDocs.forEach((doc) => {
    const groups = doc.normalized_product?.groups || {};
    Object.values(groups).forEach((group) => {
      const rakeModels = group?.rake_models || [];
      rakeModels.forEach((model) => historyModels.add(String(model).trim()));
    });
  });

  if (fitmentModels.length > 0 && historyModels.size > 0) {
    const catalogModels = new Set(fitmentModels.map((m) => String(m).trim()));
    const mismatches = [];

    catalogModels.forEach((model) => {
      if (!historyModels.has(model)) {
        mismatches.push(model);
      }
    });

    if (mismatches.length > 0) {
      validation.warnings.push({
        severity: 'medium',
        message: `Fitment discrepancy: models ${mismatches.join(', ')} in Catalog but not in Product History`,
        recommendation: 'Confirm fitment accuracy with technical documentation',
      });
    }
  }

  return validation;
}

function formatValidationWarning(validation) {
  if (!validation || (!validation.conflicts.length && !validation.warnings.length)) {
    return null;
  }
  let out = '\n\n**⚠️ Verification Needed:**\n';
  validation.conflicts.forEach((c) => {
    out += `- ${c.message || c.type}\n`;
    if (c.recommendation) {
      out += `  *Action:* ${c.recommendation}\n`;
    }
  });
  validation.warnings.forEach((w) => {
    out += `- ${w.message}\n`;
    if (w.recommendation) {
      out += `  *Action:* ${w.recommendation}\n`;
    }
  });
  return out;
}

module.exports = {
  CRITICAL_PART_CATEGORIES,
  requiresCrossValidation,
  validateCriticalPart,
  formatValidationWarning,
};
