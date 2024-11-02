const { Run, Providers } = require('@librechat/agents');
const { providerEndpointMap } = require('librechat-data-provider');

/**
 * @typedef {import('@librechat/agents').t} t
 * @typedef {import('@librechat/agents').StreamEventData} StreamEventData
 * @typedef {import('@librechat/agents').ClientOptions} ClientOptions
 * @typedef {import('@librechat/agents').EventHandler} EventHandler
 * @typedef {import('@librechat/agents').GraphEvents} GraphEvents
 * @typedef {import('@librechat/agents').IState} IState
 */

/**
 * Creates a new Run instance with custom handlers and configuration.
 *
 * @param {Object} options - The options for creating the Run instance.
 * @param {ServerRequest} [options.req] - The server request.
 * @param {string | undefined} [options.runId] - Optional run ID; otherwise, a new run ID will be generated.
 * @param {Agent} options.agent - The agent for this run.
 * @param {StructuredTool[] | undefined} [options.tools] - The tools to use in the run.
 * @param {Record<string, StructuredTool[]> | undefined} [options.toolMap] - The tool map for the run.
 * @param {Record<GraphEvents, EventHandler> | undefined} [options.customHandlers] - Custom event handlers.
 * @param {ClientOptions} [options.modelOptions] - Optional model to use; if not provided, it will use the default from modelMap.
 * @param {boolean} [options.streaming=true] - Whether to use streaming.
 * @param {boolean} [options.streamUsage=true] - Whether to stream usage information.
 * @returns {Promise<Run<IState>>} A promise that resolves to a new Run instance.
 */
async function createRun({
  runId,
  tools,
  agent,
  toolMap,
  modelOptions,
  customHandlers,
  streaming = true,
  streamUsage = true,
}) {
  const provider = providerEndpointMap[agent.provider] ?? agent.provider;
  const llmConfig = Object.assign(
    {
      provider,
      streaming,
      streamUsage,
    },
    modelOptions,
  );

  const graphConfig = {
    tools,
    toolMap,
    llmConfig,
    instructions: agent.instructions,
    additional_instructions: agent.additional_instructions,
  };

  // TEMPORARY FOR TESTING
  if (agent.provider === Providers.ANTHROPIC) {
    graphConfig.streamBuffer = 2000;
  }

  return Run.create({
    runId,
    graphConfig,
    customHandlers,
  });
}

module.exports = { createRun };
