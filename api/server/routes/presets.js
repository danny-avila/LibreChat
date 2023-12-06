const express = require('express');
const router = express.Router();
const { getPresets, savePreset, deletePresets } = require('../../models');
const crypto = require('crypto');
const requireJwtAuth = require('../middleware/requireJwtAuth');

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
    console.error(error);
    res.status(500).send(error);
  }
});

router.post('/delete', requireJwtAuth, async (req, res) => {
  let filter = {};
  const { presetId } = req.body || {};

  if (presetId) {
    filter = { presetId };
  }

  console.log('delete preset filter', filter);

  try {
    const deleteCount = await deletePresets(req.user.id, filter);
    res.status(201).send(deleteCount);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

module.exports = router;
