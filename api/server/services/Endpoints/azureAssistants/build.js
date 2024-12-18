const { removeNullishValues } = require('librechat-data-provider');
const generateArtifactsPrompt = require('~/app/clients/prompts/artifacts');
const { getAssistant } = require('~/models/Assistant');

const buildOptions = async (endpoint, parsedBody) => {
  // eslint-disable-next-line no-unused-vars
  const { promptPrefix, assistant_id, iconURL, greeting, spec, artifacts, ...modelOptions } =
    parsedBody;
  const endpointOption = removeNullishValues({
    endpoint,
    promptPrefix,
    assistant_id,
    iconURL,
    greeting,
    spec,
    modelOptions,
  });

  if (assistant_id) {
    const assistantDoc = await getAssistant({ assistant_id });
    if (assistantDoc) {
      endpointOption.assistant = {
        append_current_datetime: assistantDoc.append_current_datetime,
        assistant_id: assistantDoc.assistant_id,
        conversation_starters: assistantDoc.conversation_starters,
        createdAt: assistantDoc.createdAt,
        updatedAt: assistantDoc.updatedAt,
      };
    }
  }

  if (typeof artifacts === 'string') {
    endpointOption.artifactsPrompt = generateArtifactsPrompt({ endpoint, artifacts });
  }

  return endpointOption;
};

module.exports = buildOptions;
