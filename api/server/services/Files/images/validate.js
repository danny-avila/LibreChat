const { visionModels } = require('~/server/routes/endpoints/schemas');

function validateVisionModel(model) {
  if (!model) {
    return false;
  }

  return visionModels.some((visionModel) => model.includes(visionModel));
}

module.exports = {
  validateVisionModel,
};
