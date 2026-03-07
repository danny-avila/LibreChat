const crypto = require('crypto');
const express = require('express');
const { logger } = require('@bizu/data-schemas');
const { getPresets, savePreset, deletePresets } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
router.use(requireJwtAuth);

// Block all preset operations when presets are disabled in interface config
router.use(async (req, res, next) => {
  try {
    const appConfig = await getAppConfig();
    if (appConfig?.interfaceConfig?.presets === false) {
      return res.status(403).json({ message: 'Presets are disabled' });
    }
    next();
  } catch (error) {
    logger.error('[presets] Error checking interface config', error);
    next();
  }
});

router.get('/', async (req, res) => {
  const presets = (await getPresets(req.user.id)).map((preset) => preset);
  res.status(200).json(presets);
});

router.post('/', async (req, res) => {
  const update = req.body || {};

  update.presetId = update?.presetId || crypto.randomUUID();

  try {
    const preset = await savePreset(req.user.id, update);
    res.status(201).json(preset);
  } catch (error) {
    logger.error('[/presets] error saving preset', error);
    res.status(500).send('There was an error when saving the preset');
  }
});

router.post('/delete', async (req, res) => {
  let filter = {};
  const { presetId } = req.body || {};

  if (presetId) {
    filter = { presetId };
  }

  logger.debug('[/presets/delete] delete preset filter', filter);

  try {
    const deleteCount = await deletePresets(req.user.id, filter);
    res.status(201).json(deleteCount);
  } catch (error) {
    logger.error('[/presets/delete] error deleting presets', error);
    res.status(500).send('There was an error deleting the presets');
  }
});

module.exports = router;
