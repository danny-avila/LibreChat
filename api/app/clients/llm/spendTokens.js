const { Transaction } = require('../../../models');

/**
 * Creates two transactions to record the spending of tokens.
 *
 * @function
 * @async
 * @param {Object} txData - Transaction data.
 * @param {mongoose.Schema.Types.ObjectId} txData.user - The user ID.
 * @param {String} txData.conversationId - The ID of the conversation.
 * @param {String} txData.model - The model name.
 * @param {String} txData.context - The context in which the transaction is made.
 * @param {String} [txData.valueKey] - The value key (optional).
 * @param {Object} tokenUsage - The number of tokens used.
 * @param {Number} tokenUsage.promptTokens - The number of prompt tokens used.
 * @param {Number} tokenUsage.completionTokens - The number of completion tokens used.
 * @returns {Promise<void>} - Returns nothing.
 * @throws {Error} - Throws an error if there's an issue creating the transactions.
 */
const spendTokens = async (txData, tokenUsage) => {
  const { promptTokens, completionTokens } = tokenUsage;
  try {
    const prompt = await Transaction.create({
      ...txData,
      tokenType: 'prompt',
      rawAmount: -promptTokens,
    });

    const completion = await Transaction.create({
      ...txData,
      tokenType: 'completion',
      rawAmount: -completionTokens,
    });

    if (this.debug) {
      console.dir({ prompt, completion }, { depth: null });
    }
  } catch (err) {
    console.error(err);
  }
};

module.exports = spendTokens;
