const { logger } = require('@librechat/data-schemas');
const { createTransaction, createStructuredTransaction } = require('./Transaction');
/**
 * Creates up to two transactions to record the spending of tokens.
 *
 * @function
 * @async
 * @param {txData} txData - Transaction data.
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
  const normalizedPromptTokens = Math.max(promptTokens ?? 0, 0);
  try {
    if (promptTokens !== undefined) {
      prompt = await createTransaction({
        ...txData,
        tokenType: 'prompt',
        rawAmount: promptTokens === 0 ? 0 : -normalizedPromptTokens,
        inputTokenCount: normalizedPromptTokens,
      });
    }

    if (completionTokens !== undefined) {
      completion = await createTransaction({
        ...txData,
        tokenType: 'completion',
        rawAmount: completionTokens === 0 ? 0 : -Math.max(completionTokens, 0),
        inputTokenCount: normalizedPromptTokens,
      });
    }

    if (prompt || completion) {
      logger.debug('[spendTokens] Transaction data record against balance:', {
        user: txData.user,
        prompt: prompt?.prompt,
        promptRate: prompt?.rate,
        completion: completion?.completion,
        completionRate: completion?.rate,
        balance: completion?.balance ?? prompt?.balance,
      });
    } else {
      logger.debug('[spendTokens] No transactions incurred against balance');
    }
  } catch (err) {
    logger.error('[spendTokens]', err);
  }
};

/**
 * Creates transactions to record the spending of structured tokens.
 *
 * @function
 * @async
 * @param {txData} txData - Transaction data.
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
      const input = Math.max(promptTokens.input ?? 0, 0);
      const write = Math.max(promptTokens.write ?? 0, 0);
      const read = Math.max(promptTokens.read ?? 0, 0);
      const totalInputTokens = input + write + read;
      prompt = await createStructuredTransaction({
        ...txData,
        tokenType: 'prompt',
        inputTokens: -input,
        writeTokens: -write,
        readTokens: -read,
        inputTokenCount: totalInputTokens,
      });
    }

    if (completionTokens) {
      const totalInputTokens = promptTokens
        ? Math.max(promptTokens.input ?? 0, 0) +
          Math.max(promptTokens.write ?? 0, 0) +
          Math.max(promptTokens.read ?? 0, 0)
        : undefined;
      completion = await createTransaction({
        ...txData,
        tokenType: 'completion',
        rawAmount: -Math.max(completionTokens, 0),
        inputTokenCount: totalInputTokens,
      });
    }

    if (prompt || completion) {
      logger.debug('[spendStructuredTokens] Transaction data record against balance:', {
        user: txData.user,
        prompt: prompt?.prompt,
        promptRate: prompt?.rate,
        completion: completion?.completion,
        completionRate: completion?.rate,
        balance: completion?.balance ?? prompt?.balance,
      });
    } else {
      logger.debug('[spendStructuredTokens] No transactions incurred against balance');
    }
  } catch (err) {
    logger.error('[spendStructuredTokens]', err);
  }

  return { prompt, completion };
};

module.exports = { spendTokens, spendStructuredTokens };
