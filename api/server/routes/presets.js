const express = require('express');
const crypto = require('crypto');
const { getPresets, savePreset, deletePresets } = require('~/models');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { logger } = require('~/config');

const router = express.Router();

router.get('/', requireJwtAuth, async (req, res) => {
  const presets = (await getPresets(req.user.id)).map((preset) => preset);
  res.status(200).send(presets);
});

router.post('/', requireJwtAuth, async (req, res) => {
  const update = req.body || {};

  update.presetId = update?.presetId || crypto.randomUUID();

  try {
    const preset = await savePreset(req.user.id, update);
    res.status(201).send(preset);
  } catch (error) {
    logger.error('[/presets] error saving preset', error);
    res.status(500).send(error);
  }
});

router.post('/delete', requireJwtAuth, async (req, res) => {
  let filter = {};
  const { presetId } = req.body || {};

  if (presetId) {
    filter = { presetId };
  }

  logger.debug('[/presets/delete] delete preset filter', filter);

  try {
    const deleteCount = await deletePresets(req.user.id, filter);
    res.status(201).send(deleteCount);
  } catch (error) {
    logger.error('[/presets/delete] error deleting presets', error);
    res.status(500).send(error);
  }
});

module.exports = router;
