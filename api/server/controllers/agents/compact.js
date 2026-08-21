const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const {
  resolveSender,
  getBalanceConfig,
  compactConversation,
  recordCollectedUsage,
  getTransactionsConfig,
  selectBranchMessages,
  NothingToCompactError,
  GenerationJobManager,
} = require('@librechat/api');
const db = require('~/models');

const NOTHING_TO_COMPACT = 'NOTHING_TO_COMPACT';

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

  try {
    /** A live turn owns the branch tail; compacting under it would strand the
     *  summary on a parent the response is about to replace. The stream id is
     *  the conversation id. */
    const job = await GenerationJobManager.getJob(conversationId);
    if (job?.status === 'running' || job?.status === 'requires_action') {
      return res.status(409).json({ error: 'A response is still generating' });
    }

    const [agent, allMessages] = await Promise.all([
      req.body.endpointOption?.agent,
      db.getMessages({ conversationId, user: req.user.id }),
    ]);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const leafId = parentMessageId ?? allMessages?.[allMessages.length - 1]?.messageId;
    const branch = selectBranchMessages(allMessages ?? [], leafId);
    if (branch.length === 0) {
      return res.status(400).json({ error: 'No messages to compact', code: NOTHING_TO_COMPACT });
    }

    /** Inherit the branch's own assistant identity so the compaction message
     *  carries the same name and avatar as the responses around it. */
    let priorResponse;
    for (let i = branch.length - 1; i >= 0 && !priorResponse; i--) {
      if (branch[i].isCreatedByUser === false) {
        priorResponse = branch[i];
      }
    }

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
    });

    const appConfig = req.config;
    const reqCtx = {
      userId: req.user.id,
      isTemporary: req.body.isTemporary,
      interfaceConfig: appConfig?.interfaceConfig,
    };

    const savedMessage = await db.saveMessage(
      reqCtx,
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
        /** Caps the client-side context estimate at the compacted baseline
         *  instead of re-summing the history the summary replaced. */
        metadata: { summaryUsedTokens: result.summary.tokenCount },
      },
      { context: 'POST /api/agents/chat/compact' },
    );

    if (!savedMessage) {
      return res.status(500).json({ error: 'Failed to save the compaction message' });
    }

    if (result.usage) {
      await recordCollectedUsage(
        {
          spendTokens: db.spendTokens,
          spendStructuredTokens: db.spendStructuredTokens,
          pricing: { getMultiplier: db.getMultiplier, getCacheMultiplier: db.getCacheMultiplier },
          bulkWriteOps: { insertMany: db.bulkInsertTransactions, updateBalance: db.updateBalance },
        },
        {
          user: req.user.id,
          conversationId,
          messageId,
          collectedUsage: [{ ...result.usage, usage_type: 'summarization' }],
          model: result.summary.model,
          context: 'summarization',
          balance: getBalanceConfig(appConfig),
          transactions: getTransactionsConfig(appConfig),
          endpointTokenConfig: result.endpointTokenConfig,
        },
      ).catch((error) => {
        logger.error('[CompactController] Error recording usage', error);
      });
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
    res.status(500).json({ error: 'Failed to compact conversation' });
  }
};

module.exports = CompactController;
