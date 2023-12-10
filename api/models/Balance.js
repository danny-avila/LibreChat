const mongoose = require('mongoose');
const balanceSchema = require('./schema/balance');
const { getMultiplier } = require('./tx');

balanceSchema.statics.check = async function ({
  user,
  model,
  endpoint,
  valueKey,
  tokenType,
  amount,
  debug,
}) {
  const multiplier = getMultiplier({ valueKey, tokenType, model, endpoint });
  const tokenCost = amount * multiplier;
  const { tokenCredits: balance } = (await this.findOne({ user }, 'tokenCredits').lean()) ?? {};

  if (debug) {
    console.log('balance check', {
      user,
      model,
      endpoint,
      valueKey,
      tokenType,
      amount,
      debug,
      balance,
      multiplier,
    });
  }

  if (!balance) {
    return {
      canSpend: false,
      balance: 0,
      tokenCost,
    };
  }

  if (debug) {
    console.log('balance check', { tokenCost });
  }

  return { canSpend: balance >= tokenCost, balance, tokenCost };
};

module.exports = mongoose.model('Balance', balanceSchema);
