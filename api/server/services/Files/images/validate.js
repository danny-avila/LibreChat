const { visionModels } = require('~/server/services/Endpoints/schemas');

function validateVisionModel(model) {
  if (!model) {
    return false;
  }

  return visionModels.some((visionModel) => model.includes(visionModel));
}

module.exports = {
  validateVisionModel,
};
