const express = require('express');
const router = express.Router();
const { getPresets, savePreset, deletePresets } = require('../../models');
const crypto = require('crypto');
const requireJwtAuth = require('../../middleware/requireJwtAuth');

router.get('/', requireJwtAuth, async (req, res) => {
  const presets = (await getPresets(req.user.username)).map((preset) => {
    return preset.toObject();
  });
  res.status(200).send(presets);
});

router.post('/', requireJwtAuth, async (req, res) => {
  const update = req.body || {};

  update.presetId = update?.presetId || crypto.randomUUID();

  try {
    await savePreset(req.user.username, update);

    const presets = (await getPresets(req.user.username)).map((preset) => {
      return preset.toObject();
    });
    res.status(201).send(presets);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

router.post('/delete', requireJwtAuth, async (req, res) => {
  let filter = {};
  const { presetId } = req.body.arg || {};

  if (presetId) filter = { presetId };

  console.log('delete preset filter', filter);

  try {
    await deletePresets(req.user.username, filter);

    const presets = (await getPresets(req.user.username)).map(preset => preset.toObject());

    // console.log('delete preset response', presets);
    res.status(201).send(presets);
    // res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

module.exports = router;
