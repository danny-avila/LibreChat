const express = require('express');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

/**
 * Health check endpoint for Woodland Azure Search configuration
 * Returns detailed status of all required env vars for woodland tools
 */
router.get('/woodland', (req, res) => {
  const checks = {
    service_endpoint: {
      key: 'AZURE_AI_SEARCH_SERVICE_ENDPOINT',
      value: process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      status: !!process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
    },
    api_key: {
      key: 'AZURE_AI_SEARCH_API_KEY',
      value: process.env.AZURE_AI_SEARCH_API_KEY ? '[REDACTED]' : undefined,
      status: !!process.env.AZURE_AI_SEARCH_API_KEY,
    },
    api_version: {
      key: 'AZURE_AI_SEARCH_API_VERSION',
      value: process.env.AZURE_AI_SEARCH_API_VERSION,
      status: !!process.env.AZURE_AI_SEARCH_API_VERSION,
      optional: true,
    },
    product_history_index: {
      key: 'AZURE_AI_SEARCH_PRODUCT_HISTORY_INDEX',
      value: process.env.AZURE_AI_SEARCH_PRODUCT_HISTORY_INDEX,
      status: !!process.env.AZURE_AI_SEARCH_PRODUCT_HISTORY_INDEX,
    },
    engine_history_index: {
      key: 'AZURE_AI_SEARCH_ENGINE_HISTORY_INDEX',
      value: process.env.AZURE_AI_SEARCH_ENGINE_HISTORY_INDEX,
      status: !!process.env.AZURE_AI_SEARCH_ENGINE_HISTORY_INDEX,
    },
    catalog_index: {
      key: 'AZURE_AI_SEARCH_CATALOG_INDEX',
      value: process.env.AZURE_AI_SEARCH_CATALOG_INDEX,
      status: !!process.env.AZURE_AI_SEARCH_CATALOG_INDEX,
    },
    tractor_index: {
      key: 'AZURE_AI_SEARCH_TRACTOR_INDEX',
      value: process.env.AZURE_AI_SEARCH_TRACTOR_INDEX,
      status: !!process.env.AZURE_AI_SEARCH_TRACTOR_INDEX,
    },
    cyclopedia_index: {
      key: 'AZURE_AI_SEARCH_CYCLOPEDIA_INDEX',
      value: process.env.AZURE_AI_SEARCH_CYCLOPEDIA_INDEX,
      status: !!process.env.AZURE_AI_SEARCH_CYCLOPEDIA_INDEX,
    },
    website_index: {
      key: 'AZURE_AI_SEARCH_WEBSITE_INDEX',
      value: process.env.AZURE_AI_SEARCH_WEBSITE_INDEX,
      status: !!process.env.AZURE_AI_SEARCH_WEBSITE_INDEX,
    },
    cases_index: {
      key: 'AZURE_AI_SEARCH_CASES_INDEX',
      value: process.env.AZURE_AI_SEARCH_CASES_INDEX,
      status: !!process.env.AZURE_AI_SEARCH_CASES_INDEX,
    },
  };

  const required = Object.entries(checks).filter(([_, config]) => !config.optional);
  const allRequiredPresent = required.every(([_, config]) => config.status);
  const missingRequired = required.filter(([_, config]) => !config.status).map(([key, config]) => config.key);

  const response = {
    overall_status: allRequiredPresent ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks,
    summary: {
      total: Object.keys(checks).length,
      required: required.length,
      optional: Object.values(checks).filter(c => c.optional).length,
      passing: Object.values(checks).filter(c => c.status).length,
      failing: Object.values(checks).filter(c => !c.status && !c.optional).length,
      missing_required: missingRequired,
    },
  };

  logger.info('[Health Check - Woodland] Azure Search config check completed', {
    status: response.overall_status,
    missing: missingRequired,
  });

  const statusCode = allRequiredPresent ? 200 : 503;
  res.status(statusCode).json(response);
});

module.exports = router;
