const { logger } = require('@librechat/data-schemas');
const { isAgentsEndpoint, removeNullishValues, Constants } = require('librechat-data-provider');
const { getJuristaiToolNames } = require('~/server/services/juristaiTools');
const { loadAgent } = require('~/models/Agent');

/**
 * Appends curated django-hub tool names to the agent's tools array so they are
 * advertised to the model. No-op unless JURISTAI_DJANGO_TOOLS_ENABLED is set.
 */
const appendJuristaiTools = async (req, agent) => {
  if (!agent) {
    return agent;
  }
  try {
    const names = await getJuristaiToolNames(req);
    if (names.length > 0) {
      const existing = Array.isArray(agent.tools) ? agent.tools : [];
      agent.tools = Array.from(new Set([...existing, ...names]));
    }
  } catch (error) {
    logger.error('[buildOptions] Failed to append django-hub tools to agent', error);
  }
  return agent;
};

const DEFAULT_AGENT_ID = process.env.DEFAULT_AGENT_ID ?? 'agent_lhpnDhDHKBbh96Ra1s1Qu';

const readTextValue = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readPromptValue = (value, field) => {
  if (value == null || typeof value !== 'object') {
    return undefined;
  }

  return readTextValue(value[field]);
};

const buildOptions = (req, endpoint, parsedBody, endpointType) => {
  const {
    spec,
    iconURL,
    model_parameters: nestedModelParameters,
    agent_id,
    threadId,
    thread_id,
    promptId,
    promptVersion,
    openaiConversationId,
    openai_conversation_id,
    prompt_id,
    prompt_version,
    ...flatModelParameters
  } = parsedBody;
  const mergedModelParameters =
    nestedModelParameters != null && typeof nestedModelParameters === 'object'
      ? { ...nestedModelParameters, ...flatModelParameters }
      : { ...flatModelParameters };
  const promptConfig =
    mergedModelParameters.prompt != null && typeof mergedModelParameters.prompt === 'object'
      ? mergedModelParameters.prompt
      : undefined;
  const resolvedAgentId = isAgentsEndpoint(endpoint)
    ? agent_id || DEFAULT_AGENT_ID
    : Constants.EPHEMERAL_AGENT_ID;
  const normalizedModelParameters = removeNullishValues({
    ...mergedModelParameters,
    openai_conversation_id:
      readTextValue(openai_conversation_id) ??
      readTextValue(openaiConversationId) ??
      readTextValue(threadId) ??
      readTextValue(thread_id) ??
      readTextValue(mergedModelParameters.openai_conversation_id) ??
      readTextValue(mergedModelParameters.openaiConversationId) ??
      readTextValue(mergedModelParameters.conversation),
    prompt_id:
      readTextValue(prompt_id) ??
      readTextValue(promptId) ??
      readTextValue(mergedModelParameters.prompt_id) ??
      readPromptValue(promptConfig, 'id'),
    prompt_version:
      readTextValue(prompt_version) ??
      readTextValue(promptVersion) ??
      readTextValue(mergedModelParameters.prompt_version) ??
      readPromptValue(promptConfig, 'version'),
  });

  const agentPromise = loadAgent({
    req,
    spec,
    agent_id: resolvedAgentId,
    endpoint,
    model_parameters: normalizedModelParameters,
  })
    .then((agent) => appendJuristaiTools(req, agent))
    .catch((error) => {
      logger.error(
        `[/agents/:${resolvedAgentId}] Error retrieving agent during build options step`,
        error,
      );
      return undefined;
    });

  /** @type {import('librechat-data-provider').TConversation | undefined} */
  const addedConvo = req.body?.addedConvo;

  return removeNullishValues({
    spec,
    iconURL,
    endpoint,
    agent_id: resolvedAgentId,
    endpointType,
    model_parameters: normalizedModelParameters,
    agent: agentPromise,
    addedConvo,
  });
};

module.exports = { buildOptions };
