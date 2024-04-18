const { CacheKeys, RunStatus, isUUID } = require('librechat-data-provider');
const { initializeClient } = require('~/server/services/Endpoints/assistants');
const { checkMessageGaps, recordUsage } = require('~/server/services/Threads');
const { getConvo } = require('~/models/Conversation');
const getLogStores = require('~/cache/getLogStores');
const { sendMessage } = require('~/server/utils');
const { logger } = require('~/config');

const three_minutes = 1000 * 60 * 3;

async function abortRun(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const { abortKey } = req.body;
  const [conversationId, latestMessageId] = abortKey.split(':');
  const conversation = await getConvo(req.user.id, conversationId);

  if (conversation?.model) {
    req.body.model = conversation.model;
  }

  if (!isUUID.safeParse(conversationId).success) {
    logger.error('[abortRun] Invalid conversationId', { conversationId });
    return res.status(400).send({ message: 'Invalid conversationId' });
  }

  const cacheKey = `${req.user.id}:${conversationId}`;
  const cache = getLogStores(CacheKeys.ABORT_KEYS);
  const runValues = await cache.get(cacheKey);
  const [thread_id, run_id] = runValues.split(':');

  if (!run_id) {
    logger.warn('[abortRun] Couldn\'t find run for cancel request', { thread_id });
    return res.status(204).send({ message: 'Run not found' });
  } else if (run_id === 'cancelled') {
    logger.warn('[abortRun] Run already cancelled', { thread_id });
    return res.status(204).send({ message: 'Run already cancelled' });
  }

  let runMessages = [];
  /** @type {{ openai: OpenAI }} */
  const { openai } = await initializeClient({ req, res });

  try {
    await cache.set(cacheKey, 'cancelled', three_minutes);
    const cancelledRun = await openai.beta.threads.runs.cancel(thread_id, run_id);
    logger.debug('[abortRun] Cancelled run:', cancelledRun);
  } catch (error) {
    logger.error('[abortRun] Error cancelling run', error);
    if (
      error?.message?.includes(RunStatus.CANCELLED) ||
      error?.message?.includes(RunStatus.CANCELLING)
    ) {
      return res.end();
    }
  }

  try {
    const run = await openai.beta.threads.runs.retrieve(thread_id, run_id);
    await recordUsage({
      ...run.usage,
      model: run.model,
      user: req.user.id,
      conversationId,
    });
  } catch (error) {
    logger.error('[abortRun] Error fetching or processing run', error);
  }

  runMessages = await checkMessageGaps({
    openai,
    latestMessageId,
    thread_id,
    run_id,
    conversationId,
  });

  const finalEvent = {
    final: true,
    conversation,
    runMessages,
  };

  if (res.headersSent && finalEvent) {
    return sendMessage(res, finalEvent);
  }

  res.json(finalEvent);
}

module.exports = {
  abortRun,
};
