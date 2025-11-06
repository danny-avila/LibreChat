const axios = require('axios');
const { logger } = require('@librechat/data-schemas');
const { loadWebSearchAuth } = require('@librechat/api');
const { executeWebSearch } = require('~/server/services/WebSearch/handler');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { buildRuntimeConfig } = require('~/server/services/WebSearch/config');
const { SearchProviders } = require('librechat-data-provider');

const runWebSearch = async (req, res) => {
  try {
    const appConfig = req.config;
    const userId = req.user?.id;

    if (!appConfig?.webSearch) {
      return res.status(400).json({ error: 'Web search is not configured' });
    }

    const auth = await loadWebSearchAuth({
      userId,
      webSearchConfig: appConfig.webSearch,
      loadAuthValues,
      throwError: false,
    });

    if (!auth.authenticated && auth.authResult?.searchProvider !== SearchProviders.LOCAL) {
      return res.status(403).json({ error: 'Web search credentials are not available' });
    }

    const result = await executeWebSearch({
      input: req.body ?? {},
      authResult: auth.authResult,
      webSearchConfig: appConfig.webSearch,
      logger,
    });

    return res.json(result);
  } catch (error) {
    logger.error('[WebSearchController.runWebSearch]', error);
    return res.status(400).json({ error: error.message });
  }
};

const getWebStatus = async (req, res) => {
  try {
    const appConfig = req.config;
    const userId = req.user?.id;

    if (!appConfig?.webSearch) {
      return res.json({
        ok: false,
        authenticated: false,
        reason: 'disabled',
      });
    }

    const auth = await loadWebSearchAuth({
      userId,
      webSearchConfig: appConfig.webSearch,
      loadAuthValues,
      throwError: false,
    });

    const runtimeConfig = buildRuntimeConfig({
      authResult: auth.authResult,
      webSearchConfig: appConfig.webSearch,
    });

    const status = {
      ok: auth.authenticated || runtimeConfig.search.kind === SearchProviders.LOCAL,
      authenticated: auth.authenticated,
      search: {
        kind: runtimeConfig.search.kind,
        ok: true,
      },
      scraper: {
        kind: runtimeConfig.scraper.kind,
        ok: true,
      },
      rerank: {
        kind: runtimeConfig.rerank.kind,
        ok: runtimeConfig.rerank.kind !== 'local' || Boolean(runtimeConfig.rerank.baseURL),
      },
    };

    if (runtimeConfig.search.kind === SearchProviders.LOCAL && runtimeConfig.search.baseURL) {
      try {
        const healthResponse = await axios.get(`${runtimeConfig.search.baseURL}/health`, {
          timeout: 3000,
        });
        status.search.ok = healthResponse?.data?.ok !== false;
        status.ok = status.ok && status.search.ok;
      } catch (error) {
        status.search.ok = false;
        status.ok = false;
        logger.error('[WebSearchController.getWebStatus] ws-local health check failed', error);
      }
    }

    return res.json(status);
  } catch (error) {
    logger.error('[WebSearchController.getWebStatus]', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports = {
  runWebSearch,
  getWebStatus,
};
