const crypto = require('crypto');
const { logger, tenantStorage } = require('@librechat/data-schemas');
const { Constants, ContentTypes, isEphemeralAgentId } = require('librechat-data-provider');
const buildEndpointOption = require('~/server/middleware/buildEndpointOption');
const { initializeClient } = require('~/server/services/Endpoints/agents/initialize');
const { getAppConfig } = require('~/server/services/Config');
const {
  buildHeadlessReq,
  buildHeadlessRes,
  resolveRunTarget,
} = require('~/server/services/Scheduler/headlessRequest');
const { saveMessage, saveConvo } = require('~/models');
const {
  buildStepPrompt,
  buildDisplayUserText,
  buildDisplayResponseText,
  extractLocalImageForVision,
  patchMessageTextFields,
} = require('./prompt');
const { detectStepFailure, extractStepResponseText, formatCapturedError } = require('./failure');

/**
 * Job steps after the first chain onto the previous assistant message. The
 * agent client still creates an ephemeral user turn, so the raw response may
 * point at that unsaved id — re-parent before persisting for display.
 *
 * @param {{ stepIndex: number, parentMessageId?: string, responseParentMessageId?: string, userMessageId?: string }} params
 * @returns {string}
 */
function resolveAssistantParentMessageId({
  stepIndex,
  parentMessageId,
  responseParentMessageId,
  userMessageId,
}) {
  if (
    stepIndex === 0 &&
    typeof userMessageId === 'string' &&
    userMessageId.length > 0 &&
    userMessageId !== Constants.NO_PARENT
  ) {
    return userMessageId;
  }
  if (
    stepIndex > 0 &&
    typeof parentMessageId === 'string' &&
    parentMessageId.length > 0 &&
    parentMessageId !== Constants.NO_PARENT
  ) {
    return parentMessageId;
  }
  if (
    typeof responseParentMessageId === 'string' &&
    responseParentMessageId.length > 0 &&
    responseParentMessageId !== Constants.NO_PARENT
  ) {
    return responseParentMessageId;
  }
  return parentMessageId ?? Constants.NO_PARENT;
}

/**
 * Builds the request body for a single job step. Unlike the scheduler, a job
 * runs many turns in one conversation, so steps chain via `parentMessageId`.
 */
function buildStepBody({ conversationId, target, parentMessageId }) {
  const hasSavedAgent =
    typeof target.agent_id === 'string' &&
    target.agent_id.length > 0 &&
    !isEphemeralAgentId(target.agent_id);

  const body = {
    conversationId,
    parentMessageId: parentMessageId || Constants.NO_PARENT,
    endpoint: target.endpoint,
    endpointType: target.endpointType,
    model: target.model,
    spec: target.spec,
    isTemporary: false,
  };

  if (hasSavedAgent) {
    body.agent_id = target.agent_id;
  } else {
    body.ephemeralAgent = { skills: true };
  }

  return body;
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
    const captured = formatCapturedError(res.capturedError);
    const reason = captured ? `: ${captured}` : '';
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

  client.skipSaveUserMessage = true;

  const checkpoint = job.checkpoint && typeof job.checkpoint === 'object' ? job.checkpoint : {};

  const stepPrompt = buildStepPrompt({
    goal: job.goal,
    stepSummaries,
    stepIndex,
    maxSteps: job.maxSteps,
    lastClientOpResult: checkpoint.lastClientOpResult,
  });

  const localImage = extractLocalImageForVision(checkpoint.lastClientOpResult);
  const attachLocalImageToMessage = (message) => {
    if (!localImage?.dataUrl || !message) {
      return;
    }
    message.image_urls = [
      {
        type: ContentTypes.IMAGE_URL,
        image_url: {
          url: localImage.dataUrl,
          detail: 'high',
        },
      },
    ];
  };

  const reqCtx = { userId, interfaceConfig: appConfig?.interfaceConfig };
  const displayUserText = buildDisplayUserText({ stepIndex, goal: job.goal });

  if (displayUserText && stepIndex === 0) {
    const userMessageId = crypto.randomUUID();
    await saveMessage(
      reqCtx,
      {
        messageId: userMessageId,
        parentMessageId: parentMessageId || Constants.NO_PARENT,
        conversationId,
        sender: 'User',
        text: displayUserText,
        isCreatedByUser: true,
      },
      { context: 'Jobs.runJobStep - user message (step 0)' },
    );
    req.body.overrideUserMessageId = userMessageId;
    client.savedMessageIds.add(userMessageId);
  }

  let userMessage;
  const response = await client.sendMessage(stepPrompt, {
    user: userId,
    conversationId,
    parentMessageId: parentMessageId || Constants.NO_PARENT,
    abortController,
    onStart: (userMsg) => {
      userMessage = userMsg;
      attachLocalImageToMessage(userMsg);
    },
    getReqData: (data = {}) => {
      if (data.userMessage) {
        userMessage = data.userMessage;
        attachLocalImageToMessage(userMessage);
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

  const displayResponseText = buildDisplayResponseText(responseText, {
    lastClientOpResult: checkpoint.lastClientOpResult,
    goal: job.goal,
  });
  const resolvedParentMessageId = resolveAssistantParentMessageId({
    stepIndex,
    parentMessageId,
    responseParentMessageId: response.parentMessageId,
    userMessageId: userMessage?.messageId,
  });

  if (response.messageId) {
    try {
      let assistantMessage = {
        ...response,
        messageId: response.messageId,
        conversationId,
        parentMessageId: resolvedParentMessageId,
        isCreatedByUser: false,
      };
      if (displayResponseText.length > 0) {
        assistantMessage = patchMessageTextFields(assistantMessage, displayResponseText);
      }
      await saveMessage(reqCtx, assistantMessage, {
        context: 'Jobs.runJobStep - assistant message',
      });
    } catch (error) {
      logger.warn(
        `[Jobs] Failed to persist assistant message ${response.messageId} for job step:`,
        error,
      );
    }
  }

  await saveConvo(
    reqCtx,
    { conversationId, title: job.goal.slice(0, 100) },
    { context: 'Jobs.runJobStep - ensure convo', noUpsert: true },
  );

  logger.info(`[Jobs] Completed step ${stepIndex} for job ${job._id} (convo ${conversationId})`);

  return { responseText, messageId: response.messageId };
}

module.exports = { runJobStep, resolveAssistantParentMessageId };
