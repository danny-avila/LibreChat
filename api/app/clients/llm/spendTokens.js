const { Transaction } = require('../../../models');

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
