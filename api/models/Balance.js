const mongoose = require('mongoose');
const balanceSchema = require('./schema/balance');
const { getMultiplier } = require('./tx');

balanceSchema.statics.check = async function ({ user, model, valueKey, tokenType, amount, debug }) {
  const { tokenCredits: balance } = await this.findOne({ user });
  const multiplier = getMultiplier({ valueKey, tokenType, model });

  if (debug) {
    console.log('balance check', {
      user,
      model,
      valueKey,
      tokenType,
      amount,
      debug,
      balance,
      multiplier,
    });
  }

  if (!balance) {
    return false;
  }
  const tokenCost = amount * multiplier;

  if (debug) {
    console.log('balance check', { tokenCost });
  }

  return balance >= tokenCost;
};

module.exports = mongoose.model('Balance', balanceSchema);
