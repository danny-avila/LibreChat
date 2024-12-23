const { Run, Providers } = require('@librechat/agents');
const { providerEndpointMap } = require('librechat-data-provider');

/**
 * @typedef {import('@librechat/agents').t} t
 * @typedef {import('@librechat/agents').StandardGraphConfig} StandardGraphConfig
 * @typedef {import('@librechat/agents').StreamEventData} StreamEventData
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
 * @param {AbortSignal} options.signal - The signal for this run.
 * @param {Record<GraphEvents, EventHandler> | undefined} [options.customHandlers] - Custom event handlers.
 * @param {boolean} [options.streaming=true] - Whether to use streaming.
 * @param {boolean} [options.streamUsage=true] - Whether to stream usage information.
 * @returns {Promise<Run<IState>>} A promise that resolves to a new Run instance.
 */
async function createRun({
  runId,
  agent,
  signal,
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
    agent.model_parameters,
  );

  /** @type {StandardGraphConfig} */
  const graphConfig = {
    signal,
    llmConfig,
    tools: agent.tools,
    instructions: agent.instructions,
    additional_instructions: agent.additional_instructions,
    // toolEnd: agent.end_after_tools,
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
