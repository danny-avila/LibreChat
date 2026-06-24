const crypto = require('crypto');
const { logger, tenantStorage } = require('@librechat/data-schemas');
const { Constants, SCHEDULED_CONVO_TAG } = require('librechat-data-provider');
const buildEndpointOption = require('~/server/middleware/buildEndpointOption');
const { initializeClient } = require('~/server/services/Endpoints/agents/initialize');
const { getAppConfig } = require('~/server/services/Config');
const {
  buildHeadlessReq,
  buildHeadlessRes,
  buildRunBody,
  resolveRunTarget,
} = require('./headlessRequest');
const { saveMessage, saveConvo, getUserById } = require('~/models');

/**
 * Executes a single agent turn for a schedule, with no live HTTP/SSE client.
 * Reuses the same building blocks the resumable controller uses
 * (`buildEndpointOption` -> `initializeClient` -> `client.sendMessage`) and
 * persists the user + response messages exactly as the controller does, then
 * tags the resulting conversation as a scheduled run.
 *
 * Must be invoked with `owner` already resolved. Runs entirely inside the
 * owner's tenant context so every DB write is correctly scoped.
 *
 * @param {{ owner: object, schedule: object }} params
 * @returns {Promise<{ conversationId: string, responseMessageId?: string }>}
 */
async function runScheduledTurn({ owner, schedule, conversationId }) {
  return tenantStorage.run(
    { tenantId: owner.tenantId, userId: String(owner.id ?? owner._id), requestId: `sched_${schedule._id}` },
    () => executeTurn({ owner, schedule, conversationId }),
  );
}

async function executeTurn({ owner, schedule, conversationId: providedConversationId }) {
  const userId = String(owner.id ?? owner._id);
  const conversationId = providedConversationId || crypto.randomUUID();
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
  const target = resolveRunTarget(schedule, appConfig);
  const body = buildRunBody({ schedule, conversationId, target });
  const req = buildHeadlessReq({ user, appConfig, body });
  const res = buildHeadlessRes();

  await buildEndpointOption(req, res, () => {});
  if (!req.body.endpointOption) {
    const reason = res.capturedError ? `: ${res.capturedError}` : '';
    throw new Error(`Failed to build endpoint option for scheduled run${reason}`);
  }

  req.conversationCreatedAt = new Date().toISOString();

  const abortController = new AbortController();
  const { client } = await initializeClient({
    req,
    res,
    endpointOption: req.body.endpointOption,
    signal: abortController.signal,
  });

  let userMessage;
  const messageOptions = {
    user: userId,
    conversationId,
    parentMessageId: Constants.NO_PARENT,
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
      res: { write: () => true, end: () => {}, headersSent: false, writableEnded: false },
    },
  };

  const response = await client.sendMessage(schedule.prompt, messageOptions);
  response.endpoint = req.body.endpointOption.endpoint;

  const databasePromise = response.databasePromise;
  delete response.databasePromise;
  if (databasePromise) {
    await databasePromise;
  }

  const reqCtx = { userId, interfaceConfig: appConfig?.interfaceConfig };

  if (!client.skipSaveUserMessage && userMessage) {
    await saveMessage(reqCtx, userMessage, {
      context: 'Scheduler.runScheduledTurn - user message',
    });
  }

  if (client.savedMessageIds && !client.savedMessageIds.has(response.messageId)) {
    await saveMessage(
      reqCtx,
      { ...response, user: userId },
      { context: 'Scheduler.runScheduledTurn - response message' },
    );
  }

  await saveConvo(
    reqCtx,
    { conversationId, tags: [SCHEDULED_CONVO_TAG], title: schedule.name },
    { context: 'Scheduler.runScheduledTurn - tag scheduled convo', noUpsert: true },
  );

  logger.info(
    `[Scheduler] Completed scheduled run for schedule ${schedule._id} (convo ${conversationId})`,
  );

  return { conversationId, responseMessageId: response.messageId };
}

module.exports = { runScheduledTurn, getOwnerForSchedule: getUserById };
