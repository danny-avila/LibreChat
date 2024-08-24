const { Transaction } = require('./Transaction');
const { logger } = require('~/config');

/**
 * Creates up to two transactions to record the spending of tokens.
 *
 * @function
 * @async
 * @param {Object} txData - Transaction data.
 * @param {mongoose.Schema.Types.ObjectId} txData.user - The user ID.
 * @param {String} txData.conversationId - The ID of the conversation.
 * @param {String} txData.model - The model name.
 * @param {String} txData.context - The context in which the transaction is made.
 * @param {EndpointTokenConfig} [txData.endpointTokenConfig] - The current endpoint token config.
 * @param {String} [txData.valueKey] - The value key (optional).
 * @param {Object} tokenUsage - The number of tokens used.
 * @param {Number} tokenUsage.promptTokens - The number of prompt tokens used.
 * @param {Number} tokenUsage.completionTokens - The number of completion tokens used.
 * @returns {Promise<void>} - Returns nothing.
 * @throws {Error} - Throws an error if there's an issue creating the transactions.
 */
const spendTokens = async (txData, tokenUsage) => {
  const { promptTokens, completionTokens } = tokenUsage;
  logger.debug(
    `[spendTokens] conversationId: ${txData.conversationId}${
      txData?.context ? ` | Context: ${txData?.context}` : ''
    } | Token usage: `,
    {
      promptTokens,
      completionTokens,
    },
  );
  let prompt, completion;
  try {
    if (promptTokens >= 0) {
      prompt = await Transaction.create({
        ...txData,
        tokenType: 'prompt',
        rawAmount: -promptTokens,
      });
    }

    if (!completionTokens && isNaN(completionTokens)) {
      logger.debug('[spendTokens] !completionTokens', { prompt, completion });
      return;
    }

    completion = await Transaction.create({
      ...txData,
      tokenType: 'completion',
      rawAmount: -completionTokens,
    });

    prompt &&
      completion &&
      logger.debug('[spendTokens] Transaction data record against balance:', {
        user: txData.user,
        prompt: prompt.prompt,
        promptRate: prompt.rate,
        completion: completion.completion,
        completionRate: completion.rate,
        balance: completion.balance,
      });
  } catch (err) {
    logger.error('[spendTokens]', err);
  }
};

/**
 * Creates transactions to record the spending of structured tokens.
 *
 * @function
 * @async
 * @param {Object} txData - Transaction data.
 * @param {mongoose.Schema.Types.ObjectId} txData.user - The user ID.
 * @param {String} txData.conversationId - The ID of the conversation.
 * @param {String} txData.model - The model name.
 * @param {String} txData.context - The context in which the transaction is made.
 * @param {EndpointTokenConfig} [txData.endpointTokenConfig] - The current endpoint token config.
 * @param {String} [txData.valueKey] - The value key (optional).
 * @param {Object} tokenUsage - The number of tokens used.
 * @param {Object} tokenUsage.promptTokens - The number of prompt tokens used.
 * @param {Number} tokenUsage.promptTokens.input - The number of input tokens.
 * @param {Number} tokenUsage.promptTokens.write - The number of write tokens.
 * @param {Number} tokenUsage.promptTokens.read - The number of read tokens.
 * @param {Number} tokenUsage.completionTokens - The number of completion tokens used.
 * @returns {Promise<void>} - Returns nothing.
 * @throws {Error} - Throws an error if there's an issue creating the transactions.
 */
const spendStructuredTokens = async (txData, tokenUsage) => {
  const { promptTokens, completionTokens } = tokenUsage;
  logger.debug(
    `[spendStructuredTokens] conversationId: ${txData.conversationId}${
      txData?.context ? ` | Context: ${txData?.context}` : ''
    } | Token usage: `,
    {
      promptTokens,
      completionTokens,
    },
  );
  let prompt, completion;
  try {
    if (promptTokens) {
      const { input = 0, write = 0, read = 0 } = promptTokens;
      prompt = await Transaction.createStructured({
        ...txData,
        tokenType: 'prompt',
        inputTokens: -input,
        writeTokens: -write,
        readTokens: -read,
      });
    }

    if (completionTokens) {
      completion = await Transaction.create({
        ...txData,
        tokenType: 'completion',
        rawAmount: -completionTokens,
      });
    }

    prompt &&
      completion &&
      logger.debug('[spendStructuredTokens] Transaction data record against balance:', {
        user: txData.user,
        prompt: prompt.tokenValue,
        promptRate: prompt.rate,
        completion: completion.tokenValue,
        completionRate: completion.rate,
        balance: completion.balance,
      });
  } catch (err) {
    logger.error('[spendStructuredTokens]', err);
  }
};

module.exports = { spendTokens, spendStructuredTokens };
