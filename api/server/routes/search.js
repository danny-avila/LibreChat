const express = require('express');
const { MeiliSearch } = require('meilisearch');
const { isEnabled } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const { getSearchProvider, detectSearchProvider } = require('@librechat/data-schemas');

const router = express.Router();

router.use(requireJwtAuth);

router.get('/enable', async function (req, res) {
  if (!isEnabled(process.env.SEARCH)) {
    return res.send(false);
  }

  try {
    const providerType = detectSearchProvider ? detectSearchProvider() : null;

    if (providerType && providerType !== 'meilisearch') {
      // Use generic search provider (OpenSearch, etc.)
      const provider = getSearchProvider ? getSearchProvider() : null;
      if (!provider) {
        return res.send(false);
      }
      const healthy = await provider.healthCheck();
      return res.send(healthy);
    }

    // Default: MeiliSearch (backward compatible)
    const client = new MeiliSearch({
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
    });

    const { status } = await client.health();
    return res.send(status === 'available');
  } catch (error) {
    return res.send(false);
  }
});

module.exports = router;
