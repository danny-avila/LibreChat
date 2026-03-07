const { handleError } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const { getModelsConfig } = require('~/server/controllers/ModelController');
const { isModelAllowedForPlan } = require('~/server/services/Config/planModels');
const { logViolation } = require('~/cache');
/**
 * Validates the model of the request.
 *
 * @async
 * @param {ServerRequest} req - The Express request object.
 * @param {Express.Response} res - The Express response object.
 * @param {Function} next - The Express next function.
 */
const validateModel = async (req, res, next) => {
  const { model, endpoint } = req.body;
  if (!model) {
    return handleError(res, { text: 'Model not provided' });
  }

  const modelsConfig = await getModelsConfig(req);

  if (!modelsConfig) {
    return handleError(res, { text: 'Models not loaded' });
  }

  const availableModels = modelsConfig[endpoint];
  if (!availableModels) {
    return handleError(res, { text: 'Endpoint models not loaded' });
  }

  let validModel = !!availableModels.find((availableModel) => availableModel === model);

  if (!validModel) {
    const { ILLEGAL_MODEL_REQ_SCORE: score = 1 } = process.env ?? {};

    const type = ViolationTypes.ILLEGAL_MODEL_REQUEST;
    const errorMessage = {
      type,
    };

    await logViolation(req, res, type, errorMessage, score);
    return handleError(res, { text: 'Illegal model request' });
  }

  // Bizu: Check plan-based model access
  const userPlan = req.user?.plan || 'free';
  if (!isModelAllowedForPlan(userPlan, model)) {
    return handleError(res, {
      text: 'upgrade_required',
      model,
      plan: userPlan,
    });
  }

  return next();
};

module.exports = validateModel;
