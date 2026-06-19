const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  isTarsConfigured,
  createTarsDomain,
  updateTarsDomain,
  deleteTarsDomain,
  fetchTarsDomainsForUser,
  fetchTarsDomainPrepareData,
} = require('@librechat/api');
const { requireJwtAuth, requireTarsAdmin } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

/**
 * @route GET /api/tars/domains
 * @desc List the pwc_tars specialized brains (專用腦) the authenticated user may access.
 * @access Private
 */
router.get('/domains', async (req, res) => {
  if (!isTarsConfigured() || !req.user?.tarsId) {
    return res.json({ domains: [] });
  }

  try {
    const domains = await fetchTarsDomainsForUser(req.user.tarsId);
    return res.json({ domains });
  } catch (error) {
    logger.error('[GET /api/tars/domains] Failed to fetch pwc_tars domains', error);
    return res.status(500).json({ error: 'Failed to fetch pwc_tars domains' });
  }
});

/**
 * @route GET /api/tars/domains/admin/prepare-data
 * @desc All domains, knowledge bases and roles for the domain admin editor.
 * @access Admin (pwc_tars)
 */
router.get('/domains/admin/prepare-data', requireTarsAdmin, async (req, res) => {
  try {
    const data = await fetchTarsDomainPrepareData();
    return res.json(data);
  } catch (error) {
    logger.error('[GET /api/tars/domains/admin/prepare-data] Failed', error);
    return res.status(500).json({ error: 'Failed to fetch pwc_tars domain data' });
  }
});

/**
 * @route POST /api/tars/domains
 * @desc Create a specialized brain.
 * @access Admin (pwc_tars)
 */
router.post('/domains', requireTarsAdmin, async (req, res) => {
  try {
    const domain = await createTarsDomain(req.user.tarsId, req.body ?? {});
    return res.status(201).json({ domain });
  } catch (error) {
    logger.error('[POST /api/tars/domains] Failed to create pwc_tars domain', error);
    return res.status(500).json({ error: 'Failed to create pwc_tars domain' });
  }
});

/**
 * @route PUT /api/tars/domains/:id
 * @desc Update a specialized brain.
 * @access Admin (pwc_tars)
 */
router.put('/domains/:id', requireTarsAdmin, async (req, res) => {
  try {
    const domain = await updateTarsDomain(req.user.tarsId, req.params.id, req.body ?? {});
    return res.json({ domain });
  } catch (error) {
    logger.error('[PUT /api/tars/domains/:id] Failed to update pwc_tars domain', error);
    return res.status(500).json({ error: 'Failed to update pwc_tars domain' });
  }
});

/**
 * @route DELETE /api/tars/domains/:id
 * @desc Delete a specialized brain.
 * @access Admin (pwc_tars)
 */
router.delete('/domains/:id', requireTarsAdmin, async (req, res) => {
  try {
    await deleteTarsDomain(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    logger.error('[DELETE /api/tars/domains/:id] Failed to delete pwc_tars domain', error);
    return res.status(500).json({ error: 'Failed to delete pwc_tars domain' });
  }
});

module.exports = router;
