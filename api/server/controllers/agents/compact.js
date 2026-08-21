const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { Constants, CacheKeys, supportsBalanceCheck } = require('librechat-data-provider');
const {
  checkBalance,
  resolveSender,
  getBalanceConfig,
  validateAgentModel,
  compactConversation,
  recordCollectedUsage,
  getTransactionsConfig,
  selectBranchMessages,
  aggregateEmittedUsage,
  computeUsageCostUSD,
  NothingToCompactError,
  GenerationJobManager,
} = require('@librechat/api');
const { getModelsConfig } = require('~/server/controllers/ModelController');
const { logViolation, getLogStores } = require('~/cache');
const db = require('~/models');

const NOTHING_TO_COMPACT = 'NOTHING_TO_COMPACT';
/** Ceiling on how long a stale lock can wedge a conversation if the process
 *  dies mid-compaction. Comfortably above the service's own call timeout. */
const COMPACT_LOCK_TTL_MS = 180_000;

/** True while another turn owns the conversation's branch tail. */
async function isGenerating(conversationId) {
  const job = await GenerationJobManager.getJob(conversationId);
  return job?.status === 'running' || job?.status === 'requires_action';
}

/**
 * Instruction + tool-schema overhead observed on the branch's most recent
 * response. Same agent and model, so it is the right constant to fold into the
 * compacted baseline.
 * @param {TMessage} [priorResponse]
 * @returns {number}
 */
function priorInstructionTokens(priorResponse) {
  const snapshot = priorResponse?.metadata?.contextUsage;
  const tokens = snapshot?.effectiveInstructionTokens ?? snapshot?.breakdown?.instructionTokens;
  return typeof tokens === 'number' && tokens > 0 ? tokens : 0;
}

/**
 * Bills the compaction call and returns the display rollup to persist on the
 * message. Billing failures are logged, never fatal: the provider call that
 * produced the summary already happened.
 * @returns {Promise<TResponseUsage | null>}
 */
async function recordCompactionUsage({
  req,
  appConfig,
  balanceConfig,
  conversationId,
  messageId,
  result,
}) {
  if (!result.usage) {
    return null;
  }
  const pricing = { getMultiplier: db.getMultiplier, getCacheMultiplier: db.getCacheMultiplier };
  await recordCollectedUsage(
    {
      pricing,
      spendTokens: db.spendTokens,
      spendStructuredTokens: db.spendStructuredTokens,
      bulkWriteOps: { insertMany: db.bulkInsertTransactions, updateBalance: db.updateBalance },
    },
    {
      user: req.user.id,
      conversationId,
      messageId,
      collectedUsage: [{ ...result.usage, usage_type: 'summarization' }],
      model: result.summary.model,
      context: 'summarization',
      balance: balanceConfig,
      transactions: getTransactionsConfig(appConfig),
      endpointTokenConfig: result.endpointTokenConfig,
    },
  ).catch((error) => {
    logger.error('[CompactController] Error recording usage', error);
  });

  const event = { ...result.usage };
  if (appConfig?.interfaceConfig?.contextCost === true) {
    try {
      event.cost = computeUsageCostUSD(result.usage, pricing, result.endpointTokenConfig);
    } catch (error) {
      logger.warn('[CompactController] Could not price the compaction call', error);
    }
  }
  return aggregateEmittedUsage([event]);
}

/**
 * Manually compacts the active branch of a conversation.
 *
 * Persists an assistant message whose only content part is the summary block,
 * which `formatAgentMessages` then treats as the context boundary on every
 * later turn: the same contract the automatic summarization detour writes.
 *
 * @param {ServerRequest} req
 * @param {ServerResponse} res
 */
const CompactController = async (req, res) => {
  const { conversationId, parentMessageId } = req.body;
  if (
    !conversationId ||
    conversationId === Constants.NEW_CONVO ||
    conversationId === Constants.PENDING_CONVO
  ) {
    return res.status(400).json({ error: 'No conversation to compact' });
  }

  if (req.config?.summarization?.enabled === false) {
    return res.status(403).json({ error: 'Compaction is disabled' });
  }

  /** Serializes compactions of the same conversation across replicas. A
   *  point-in-time job check alone cannot: the model call outlives it, so a
   *  second compaction could start mid-flight and both would attach to the
   *  same captured leaf. */
  const lockStore = getLogStores(CacheKeys.PENDING_REQ);
  const lockKey = `compact:${conversationId}`;
  let holdsLock = false;

  try {
    if (await lockStore?.get(lockKey)) {
      return res.status(409).json({ error: 'A compaction is already running' });
    }
    if (await isGenerating(conversationId)) {
      return res.status(409).json({ error: 'A response is still generating' });
    }
    await lockStore?.set(lockKey, true, COMPACT_LOCK_TTL_MS);
    holdsLock = true;

    const [agent, allMessages, modelsConfig] = await Promise.all([
      req.body.endpointOption?.agent,
      db.getMessages({ conversationId, user: req.user.id }),
      getModelsConfig(req),
    ]);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    /** The ephemeral agent `buildEndpointOption` builds carries the request's
     *  own `model` verbatim, so without this a caller could compact against a
     *  model absent from their available list. Validated against the AGENT's
     *  model, leaving an administrator's `summarization.model` override alone. */
    const validation = await validateAgentModel({ req, res, agent, modelsConfig, logViolation });
    if (!validation.isValid) {
      return res.status(422).json({ error: validation.error?.message });
    }

    const leafId = parentMessageId ?? allMessages?.[allMessages.length - 1]?.messageId;
    const branch = selectBranchMessages(allMessages ?? [], leafId);
    if (branch.length === 0) {
      return res.status(400).json({ error: 'No messages to compact', code: NOTHING_TO_COMPACT });
    }

    /** Inherit the branch's own assistant identity so the compaction message
     *  carries the same name and avatar as the responses around it, and its
     *  instruction overhead so the persisted baseline matches what the
     *  automatic path records. */
    let priorResponse;
    for (let i = branch.length - 1; i >= 0 && !priorResponse; i--) {
      if (branch[i].isCreatedByUser === false) {
        priorResponse = branch[i];
      }
    }

    const appConfig = req.config;
    const balanceConfig = getBalanceConfig(appConfig);
    const messageId = uuidv4();
    const ids = { messageId, conversationId, parentMessageId: leafId };
    const abortController = new AbortController();
    res.on('close', () => abortController.abort());

    const result = await compactConversation({
      req,
      agent,
      branch,
      ids,
      db: { getUserKey: db.getUserKey, getUserKeyValues: db.getUserKeyValues },
      signal: abortController.signal,
      /** Same gate `BaseClient` applies before a normal turn contacts the
       *  provider, so a spent-out user cannot compact repeatedly for free. */
      beforeInvoke: async ({ promptTokens, model, endpointTokenConfig }) => {
        if (balanceConfig?.enabled !== true || supportsBalanceCheck[req.body.endpoint] !== true) {
          return;
        }
        await checkBalance(
          {
            req,
            res,
            txData: {
              model,
              user: req.user.id,
              tokenType: 'prompt',
              amount: promptTokens,
              endpoint: req.body.endpoint,
              endpointTokenConfig,
            },
          },
          {
            logViolation,
            balanceConfig,
            getMultiplier: db.getMultiplier,
            findBalanceByUser: db.findBalanceByUser,
            createAutoRefillTransaction: db.createAutoRefillTransaction,
            upsertBalanceFields: db.upsertBalanceFields,
          },
        );
      },
    });

    /** Real spend whether or not the summary lands, so bill before deciding. */
    const usageRollup = await recordCompactionUsage({
      req,
      appConfig,
      balanceConfig,
      conversationId,
      messageId,
      result,
    });

    /** Re-checked after the call: a turn that started meanwhile owns the tail,
     *  and writing here would strand the summary on a sibling branch where it
     *  compacts nothing. */
    const laterMessages = await db.getMessages(
      { conversationId, user: req.user.id, parentMessageId: leafId },
      'messageId',
    );
    if (laterMessages?.length > 0 || (await isGenerating(conversationId))) {
      return res.status(409).json({ error: 'The conversation moved on during compaction' });
    }

    const summaryUsedTokens = result.summary.tokenCount + priorInstructionTokens(priorResponse);
    const savedMessage = await db.saveMessage(
      {
        userId: req.user.id,
        isTemporary: req.body.isTemporary,
        interfaceConfig: appConfig?.interfaceConfig,
      },
      {
        messageId,
        conversationId,
        parentMessageId: leafId,
        user: req.user.id,
        isCreatedByUser: false,
        sender:
          priorResponse?.sender ??
          resolveSender({
            agent,
            specLabel: req.body.spec,
            endpointOption: {
              ...(req.body.endpointOption ?? {}),
              model: agent.model_parameters?.model ?? agent.model,
            },
          }),
        endpoint: req.body.endpoint,
        iconURL: priorResponse?.iconURL ?? req.body.iconURL,
        model: agent.model_parameters?.model ?? agent.model,
        content: [result.summary],
        tokenCount: 0,
        unfinished: false,
        error: false,
        metadata: {
          /** Caps the client-side context estimate at the compacted baseline
           *  instead of re-summing the history the summary replaced. The client
           *  stops adding its own cached instruction overhead once this marker
           *  exists, so the marker has to carry that overhead the way
           *  `computeSummaryUsedTokens` does. The branch's last snapshot
           *  describes the same agent and model; with no snapshot the client
           *  has no cached overhead to lose either. */
          summaryUsedTokens,
          /** The context-usage UI rebuilds branch and session totals from each
           *  response message's `metadata.usage`, so a compaction the user was
           *  charged for is invisible in them without it. */
          ...(usageRollup ? { usage: usageRollup } : {}),
        },
      },
      { context: 'POST /api/agents/chat/compact' },
    );

    if (!savedMessage) {
      return res.status(500).json({ error: 'Failed to save the compaction message' });
    }

    res.status(201).json(savedMessage);
  } catch (error) {
    /** The branch already ends at a summary boundary, so there is nothing left
     *  for a second pass to fold in. Coded so the client can say so plainly
     *  instead of reporting a failure. */
    if (error instanceof NothingToCompactError) {
      return res.status(400).json({ error: 'No messages to compact', code: NOTHING_TO_COMPACT });
    }
    logger.error('[CompactController] Error compacting conversation', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to compact conversation' });
    }
  } finally {
    if (holdsLock) {
      await lockStore?.delete(lockKey).catch(() => {});
    }
  }
};

module.exports = CompactController;
