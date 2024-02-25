const { EModelEndpoint, CacheKeys, ViolationTypes } = require('librechat-data-provider');
const { loadModels } = require('~/server/controllers/ModelController');
const { logViolation, getLogStores } = require('~/cache');
const { handleError } = require('~/server/utils');

/**
 * Validates the model of the request.
 *
 * @async
 * @param {Express.Request} req - The Express request object.
 * @param {Express.Response} res - The Express response object.
 * @param {Function} next - The Express next function.
 */
const validateModel = async (req, res, next) => {
  const { model, endpoint } = req.body;
  if (!model) {
    return handleError(res, { text: 'Model not provided' });
  }

  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let modelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  if (!modelsConfig) {
    modelsConfig = await loadModels(req);
  }

  if (!modelsConfig) {
    return handleError(res, { text: 'Models not loaded' });
  }

  const availableModels = modelsConfig[endpoint];
  if (!availableModels) {
    return handleError(res, { text: 'Endpoint models not loaded' });
  }

  let validModel = !!availableModels.find((availableModel) => availableModel === model);
  if (endpoint === EModelEndpoint.gptPlugins) {
    validModel = validModel && availableModels.includes(req.body.agentOptions?.model);
  }

  if (validModel) {
    return next();
  }

  const { ILLEGAL_MODEL_REQ_SCORE: score = 5 } = process.env ?? {};

  const type = ViolationTypes.ILLEGAL_MODEL_REQUEST;
  const errorMessage = {
    type,
  };

  await logViolation(req, res, type, errorMessage, score);
  return handleError(res, { text: 'Illegal model request' });
};

module.exports = validateModel;
