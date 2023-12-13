const { visionModels } = require('librechat-data-provider');

function validateVisionModel(model) {
  if (!model) {
    return false;
  }

  return visionModels.some((visionModel) => model.includes(visionModel));
}

module.exports = {
  validateVisionModel,
};
