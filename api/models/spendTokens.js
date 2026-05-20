const { logger } = require('@librechat/data-schemas');
const { createTransaction, createStructuredTransaction } = require('./Transaction');
const { getMultiplier } = require('./tx');
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

  let prompt, completion;
  try {
    if (promptTokens !== undefined) {
      prompt = await createTransaction({
        ...txData,
        tokenType: 'prompt',
        rawAmount: promptTokens === 0 ? 0 : -Math.max(promptTokens, 0),
      });
    }

    if (completionTokens !== undefined) {
      completion = await createTransaction({
        ...txData,
        tokenType: 'completion',
        rawAmount: completionTokens === 0 ? 0 : -Math.max(completionTokens, 0),
      });
    }

    // No logging by default; rely on upstream summary logs
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

  let prompt, completion;
  try {
    if (promptTokens) {
      const { input = 0, write = 0, read = 0 } = promptTokens;
      prompt = await createStructuredTransaction({
        ...txData,
        tokenType: 'prompt',
        inputTokens: -input,
        writeTokens: -write,
        readTokens: -read,
      });
    }

    if (completionTokens) {
      completion = await createTransaction({
        ...txData,
        tokenType: 'completion',
        rawAmount: -completionTokens,
      });
    }

    // No logging by default; rely on upstream summary logs
  } catch (err) {
    logger.error('[spendStructuredTokens]', err);
  }

  return { prompt, completion };
};

/**
 * Records MemoryRun usage as a single combined transaction (prompt + completion cost).
 *
 * @function
 * @async
 * @param {txData} txData - Transaction data (must include model, context: 'memory', endpointTokenConfig).
 * @param {Object} tokenUsage
 * @param {Number} tokenUsage.promptTokens
 * @param {Number} tokenUsage.completionTokens
 * @returns {Promise<void>}
 */
const spendMemoryTokens = async (txData, tokenUsage) => {
  const promptTokens = Math.max(Number(tokenUsage.promptTokens) || 0, 0);
  const completionTokens = Math.max(Number(tokenUsage.completionTokens) || 0, 0);
  const totalTokens = promptTokens + completionTokens;

  if (totalTokens === 0) {
    return;
  }

  const { model, endpointTokenConfig } = txData;
  const promptRate = Math.abs(
    getMultiplier({ tokenType: 'prompt', model, endpointTokenConfig }),
  );
  const completionRate = Math.abs(
    getMultiplier({ tokenType: 'completion', model, endpointTokenConfig }),
  );
  const totalCost = promptTokens * promptRate + completionTokens * completionRate;
  const blendedRate = totalCost / totalTokens;

  try {
    await createTransaction({
      ...txData,
      tokenType: 'credits',
      rawAmount: -totalTokens,
      rate: blendedRate,
      inputTokens: promptTokens,
      writeTokens: completionTokens,
    });
  } catch (err) {
    logger.error('[spendMemoryTokens]', err);
  }
};

module.exports = { spendTokens, spendStructuredTokens, spendMemoryTokens };
