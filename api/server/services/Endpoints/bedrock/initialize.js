const { EModelEndpoint, providerEndpointMap } = require('librechat-data-provider');
const { getDefaultHandlers } = require('~/server/controllers/agents/callbacks');
// const { loadAgentTools } = require('~/server/services/ToolService');
const getOptions = require('~/server/services/Endpoints/bedrock/options');
const AgentClient = require('~/server/controllers/agents/client');
const { getModelMaxTokens } = require('~/utils');

const initializeClient = async ({ req, res, endpointOption }) => {
  if (!endpointOption) {
    throw new Error('Endpoint option not provided');
  }

  // TODO: use endpointOption to determine options/modelOptions
  const eventHandlers = getDefaultHandlers({ res });

  // const tools = [createTavilySearchTool()];

  /** @type {Agent} */
  const agent = {
    id: EModelEndpoint.bedrock,
    name: endpointOption.name,
    instructions: endpointOption.instructions,
    provider: EModelEndpoint.bedrock,
    model: endpointOption.model_parameters.model,
    model_parameters: endpointOption.model_parameters,
  };

  let modelOptions = { model: agent.model };

  // TODO: pass-in override settings that are specific to current run
  const options = await getOptions({
    req,
    res,
    endpointOption,
  });

  modelOptions = Object.assign(modelOptions, options.llmConfig);
  const maxContextTokens =
    agent.max_context_tokens ??
    getModelMaxTokens(modelOptions.model, providerEndpointMap[agent.provider]);

  const client = new AgentClient({
    req,
    agent,
    // tools,
    // toolMap,
    modelOptions,
    eventHandlers,
    maxContextTokens,
    configOptions: options.configOptions,
  });
  return { client };
};

module.exports = { initializeClient };
