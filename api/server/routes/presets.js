const crypto = require('crypto');
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { createContentFilter, extractPresetContent, inspectContent } = require('@librechat/api');
const { getPresets, savePreset, deletePresets } = require('~/models');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');

const router = express.Router();
const filterPresetContent = createContentFilter({
  getFilters: (req) => req.config?.filters,
  extract: (req) => extractPresetContent(req.body),
});

const getFilteredPresetContent = (req, preset) => {
  if (req.config?.filters == null) {
    return null;
  }
  return inspectContent(extractPresetContent(preset), {
    filters: req.config.filters,
  });
};

/**
 * Removes policy-covered fields from an older stored preset that no longer
 * satisfies the active policy. Structural fields remain so the preset can
 * still be selected for replacement or deletion.
 */
const redactFilteredStoredPreset = (req, preset) => {
  if (preset == null || getFilteredPresetContent(req, preset) == null) {
    return preset;
  }

  const {
    name: _name,
    description: _description,
    oneliner: _oneliner,
    category: _category,
    command: _command,
    prompt: _prompt,
    title: _title,
    promptPrefix: _promptPrefix,
    system: _system,
    context: _context,
    instructions: _instructions,
    additional_instructions: _additionalInstructions,
    greeting: _greeting,
    examples: _examples,
    stop: _stop,
    additionalModelRequestFields: _additionalModelRequestFields,
    additional_model_request_fields: _additionalModelRequestFieldsSnakeCase,
    response_format: _responseFormat,
    responseFormat: _responseFormatCamelCase,
    metadata: _metadata,
    model_parameters: _modelParameters,
    options: _options,
    ...structuralFields
  } = preset;

  return {
    ...structuralFields,
    title: '',
    contentFilterBlocked: true,
  };
};

router.use(requireJwtAuth);

router.get('/', configMiddleware, async (req, res) => {
  const presets = (await getPresets(req.user.id)).map((preset) =>
    redactFilteredStoredPreset(req, preset),
  );
  res.status(200).json(presets);
});

router.post('/', configMiddleware, filterPresetContent, async (req, res) => {
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
