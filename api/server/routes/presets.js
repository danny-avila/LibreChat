const express = require('express');
const router = express.Router();
const { getPresets, savePreset, deletePresets } = require('../../models');
const crypto = require('crypto');
const requireJwtAuth = require('../../middleware/requireJwtAuth');

router.get('/', requireJwtAuth, async (req, res) => {
  try {
    const presets = await getPresets(req.user.id);
    const presetsToSend = presets.map(preset => preset.toObject());
    res.status(200).send(presetsToSend);
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while fetching presets.');
  }
});

router.post('/', requireJwtAuth, async (req, res) => {
  try {
    const { name, data } = req.body;
    const update = { name, data, presetId: crypto.randomUUID() };
    await savePreset(req.user.id, update);
    const presets = await getPresets(req.user.id);
    const presetsToSend = presets.map(preset => preset.toObject());
    res.status(201).send(presetsToSend);
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the preset.');
  }
});

router.post('/delete', requireJwtAuth, async (req, res) => {
  try {
    const { presetId } = req.body.arg || {};
    const filter = presetId ? { presetId } : {};
    await deletePresets(req.user.id, filter);
    const presets = await getPresets(req.user.id);
    const presetsToSend = presets.map(preset => preset.toObject());
    res.status(201).send(presetsToSend);
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while deleting the preset.');
  }
});

module.exports = router;
