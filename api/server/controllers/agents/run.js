const { Run } = require('@librechat/agentus');
const { providerEndpointMap } = require('librechat-data-provider');

/**
 * @typedef {import('@librechat/agentus').t} t
 * @typedef {import('@librechat/agentus').StreamEventData} StreamEventData
 * @typedef {import('@librechat/agentus').ClientOptions} ClientOptions
 * @typedef {import('@librechat/agentus').EventHandler} EventHandler
 * @typedef {import('@librechat/agentus').GraphEvents} GraphEvents
 * @typedef {import('@librechat/agentus').IState} IState
 */

/**
 * Creates a new Run instance with custom handlers and configuration.
 *
 * @param {Object} options - The options for creating the Run instance.
 * @param {Agent} options.agent - The agent for this run.
 * @param {StructuredTool[] | undefined} [options.tools] - The tools to use in the run.
 * @param {Record<string, StructuredTool[]> | undefined} [options.toolMap] - The tool map for the run.
 * @param {Record<GraphEvents, EventHandler> | undefined} [options.customHandlers] - Custom event handlers.
 * @param {string | undefined} [options.runId] - Optional run ID; otherwise, a new run ID will be generated.
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
  const llmConfig = Object.assign(
    {
      provider: providerEndpointMap[agent.provider],
      streaming,
      streamUsage,
    },
    modelOptions,
  );

  return Run.create({
    graphConfig: {
      runId,
      llmConfig,
      tools,
      toolMap,
      instructions: agent.instructions,
      additional_instructions: agent.additional_instructions,
    },
    customHandlers,
  });
}

module.exports = { createRun };
