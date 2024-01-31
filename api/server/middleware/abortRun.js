const { CacheKeys } = require('librechat-data-provider');
const { initializeClient } = require('~/server/services/Endpoints/assistant');
const { checkMessageGaps } = require('~/server/services/Threads');
const { getConvo } = require('~/models/Conversation');
const getLogStores = require('~/cache/getLogStores');
const { sendMessage } = require('~/server/utils');
// const spendTokens = require('~/models/spendTokens');
const { logger } = require('~/config');

async function abortRun(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const { abortKey } = req.body;
  const [thread_id, conversationId] = abortKey.split(':');
  if (!thread_id || !conversationId) {
    return res.status(400).send({ message: 'Invalid abortKey' });
  }
  const cache = getLogStores(CacheKeys.ABORT_KEYS);
  const run_id = await cache.get(thread_id);

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
    await cache.set(thread_id, 'cancelled');
    const cancelledRun = await openai.beta.threads.runs.cancel(thread_id, run_id);
    console.dir(cancelledRun, { depth: null });
  } catch (error) {
    logger.error('[abortRun] Error cancelling run', { error });
  }
  runMessages = await checkMessageGaps({ openai, thread_id, conversationId });

  const finalEvent = {
    title: 'New Chat',
    final: true,
    conversation: await getConvo(req.user.id, conversationId),
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
