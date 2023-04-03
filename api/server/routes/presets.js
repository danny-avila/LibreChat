const express = require('express');
const router = express.Router();
const { getPreset, getPresets, savePreset, deletePresets } = require('../../models');
const crypto = require('crypto');

router.get('/', async (req, res) => {
  const presets = (await getPresets(req?.session?.user?.username)).map(preset => {
    return preset.toObject();
  });
  res.status(200).send(presets);
});

router.post('/', async (req, res) => {
  const update = req.body || {};

  update.presetId = update?.presetId || crypto.randomUUID();

  try {
    await savePreset(req?.session?.user?.username, update);

    const presets = (await getPresets(req?.session?.user?.username)).map(preset => {
      return preset.toObject();
    });
    res.status(201).send(presets);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

router.post('/delete', async (req, res) => {
  let filter = {};
  const { presetId } = req.body.arg || {};

  if (presetId) filter = { presetId };

  try {
    await deletePresets(req?.session?.user?.username, filter);

    const presets = (await getPresets(req?.session?.user?.username)).map(preset => {
      return preset.toObject();
    });
    res.status(201).send(presets);
    // res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

module.exports = router;
