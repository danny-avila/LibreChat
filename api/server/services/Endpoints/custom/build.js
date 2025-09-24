const { removeNullishValues } = require("librechat-data-provider");
const generateArtifactsPrompt = require("~/app/clients/prompts/artifacts");
const generateCanvasPrompt = require("~/app/clients/prompts/canvas");

const buildOptions = (endpoint, parsedBody, endpointType) => {
  const {
    modelLabel,
    chatGptLabel,
    promptPrefix,
    maxContextTokens,
    fileTokenLimit,
    resendFiles = true,
    imageDetail,
    iconURL,
    greeting,
    spec,
    artifacts,
    canvas,
    ...modelOptions
  } = parsedBody;
  const endpointOption = removeNullishValues({
    endpoint,
    endpointType,
    modelLabel,
    chatGptLabel,
    promptPrefix,
    resendFiles,
    imageDetail,
    iconURL,
    greeting,
    spec,
    maxContextTokens,
    fileTokenLimit,
    modelOptions,
  });

  if (typeof artifacts === "string") {
    endpointOption.artifactsPrompt = generateArtifactsPrompt({
      endpoint,
      artifacts,
    });
  }

  if (typeof canvas === "string") {
    endpointOption.canvasPrompt = generateCanvasPrompt({
      endpoint,
      canvas,
      model: modelLabel,
    });
  }

  return endpointOption;
};

module.exports = buildOptions;
