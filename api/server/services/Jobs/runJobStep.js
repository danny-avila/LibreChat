const { logger, tenantStorage } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const buildEndpointOption = require('~/server/middleware/buildEndpointOption');
const { initializeClient } = require('~/server/services/Endpoints/agents/initialize');
const { getAppConfig } = require('~/server/services/Config');
const {
  buildHeadlessReq,
  buildHeadlessRes,
  resolveRunTarget,
} = require('~/server/services/Scheduler/headlessRequest');
const { saveMessage, saveConvo } = require('~/models');
const { buildStepPrompt } = require('./prompt');
const { detectStepFailure, extractStepResponseText } = require('./failure');

/**
 * Builds the request body for a single job step. Unlike the scheduler, a job
 * runs many turns in one conversation, so steps chain via `parentMessageId`.
 */
function buildStepBody({ conversationId, target, parentMessageId }) {
  return {
    conversationId,
    parentMessageId: parentMessageId || Constants.NO_PARENT,
    endpoint: target.endpoint,
    endpointType: target.endpointType,
    agent_id: target.agent_id,
    model: target.model,
    spec: target.spec,
    isTemporary: false,
  };
}

/** Extracts the assistant's text from a client response. */
function extractResponseText(response) {
  return extractStepResponseText(response);
}

/**
 * Executes a single step of a long-horizon job: one headless agent turn whose
 * user + assistant messages are persisted into the job's conversation. Reuses
 * the same building blocks as the scheduler (`buildEndpointOption` ->
 * `initializeClient` -> `client.sendMessage`).
 *
 * Runs entirely inside the owner's tenant context so every DB write is scoped.
 *
 * @param {{ owner: object, job: object, stepIndex: number, stepSummaries: string[], parentMessageId?: string }} params
 * @returns {Promise<{ responseText: string, messageId: string }>}
 */
async function runJobStep({ owner, job, stepIndex, stepSummaries, parentMessageId }) {
  return tenantStorage.run(
    {
      tenantId: owner.tenantId,
      userId: String(owner.id ?? owner._id),
      requestId: `job_${job._id}_step_${stepIndex}`,
    },
    () => executeStep({ owner, job, stepIndex, stepSummaries, parentMessageId }),
  );
}

async function executeStep({ owner, job, stepIndex, stepSummaries, parentMessageId }) {
  const userId = String(owner.id ?? owner._id);
  const { conversationId } = job;
  const appConfig = await getAppConfig({
    role: owner.role,
    userId,
    tenantId: owner.tenantId,
  });

  const user = {
    id: userId,
    _id: owner._id ?? owner.id,
    role: owner.role,
    tenantId: owner.tenantId,
  };

  const target = resolveRunTarget(
    {
      agent_id: job.agent_id,
      endpoint: job.endpoint,
      endpointType: job.endpointType,
      model: job.model,
      spec: job.spec,
    },
    appConfig,
  );

  const body = buildStepBody({ conversationId, target, parentMessageId });
  const req = buildHeadlessReq({ user, appConfig, body });
  const res = buildHeadlessRes();

  await buildEndpointOption(req, res, () => {});
  if (!req.body.endpointOption) {
    const reason = res.capturedError ? `: ${res.capturedError}` : '';
    throw new Error(`Failed to build endpoint option for job step${reason}`);
  }

  req.conversationCreatedAt = new Date().toISOString();

  const abortController = new AbortController();
  const { client } = await initializeClient({
    req,
    res,
    endpointOption: req.body.endpointOption,
    signal: abortController.signal,
  });

  const stepPrompt = buildStepPrompt({
    goal: job.goal,
    stepSummaries,
    stepIndex,
    maxSteps: job.maxSteps,
  });

  let userMessage;
  const response = await client.sendMessage(stepPrompt, {
    user: userId,
    conversationId,
    parentMessageId: parentMessageId || Constants.NO_PARENT,
    abortController,
    onStart: (userMsg) => {
      userMessage = userMsg;
    },
    getReqData: (data = {}) => {
      if (data.userMessage) {
        userMessage = data.userMessage;
      }
    },
    progressOptions: {
      res,
    },
  });
  response.endpoint = req.body.endpointOption.endpoint;

  const databasePromise = response.databasePromise;
  delete response.databasePromise;
  if (databasePromise) {
    await databasePromise;
  }

  const responseText = extractResponseText(response);
  const failureMessage = detectStepFailure({
    response,
    responseText,
    capturedError: res.capturedError,
  });
  if (failureMessage) {
    throw new Error(failureMessage);
  }

  const reqCtx = { userId, interfaceConfig: appConfig?.interfaceConfig };

  if (!client.skipSaveUserMessage && userMessage) {
    await saveMessage(reqCtx, userMessage, {
      context: 'Jobs.runJobStep - user message',
    });
  }

  if (client.savedMessageIds && !client.savedMessageIds.has(response.messageId)) {
    await saveMessage(
      reqCtx,
      { ...response, user: userId },
      { context: 'Jobs.runJobStep - response message' },
    );
  }

  await saveConvo(
    reqCtx,
    { conversationId, title: job.goal.slice(0, 100) },
    { context: 'Jobs.runJobStep - ensure convo', noUpsert: true },
  );

  logger.info(`[Jobs] Completed step ${stepIndex} for job ${job._id} (convo ${conversationId})`);

  return { responseText, messageId: response.messageId };
}

module.exports = { runJobStep };
