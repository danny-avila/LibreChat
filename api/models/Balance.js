const mongoose = require('mongoose');
const { balanceSchema } = require('@librechat/data-schemas');
const { getMultiplier } = require('./tx');
const { logger } = require('~/config');

balanceSchema.statics.check = async function ({
  user,
  model,
  endpoint,
  valueKey,
  tokenType,
  amount,
  endpointTokenConfig,
}) {
  const multiplier = getMultiplier({ valueKey, tokenType, model, endpoint, endpointTokenConfig });
  const tokenCost = amount * multiplier;
  const { tokenCredits: balance } = (await this.findOne({ user }, 'tokenCredits').lean()) ?? {};

  logger.debug('[Balance.check]', {
    user,
    model,
    endpoint,
    valueKey,
    tokenType,
    amount,
    balance,
    multiplier,
    endpointTokenConfig: !!endpointTokenConfig,
  });

  if (!balance) {
    return {
      canSpend: false,
      balance: 0,
      tokenCost,
    };
  }

  logger.debug('[Balance.check]', { tokenCost });

  return { canSpend: balance >= tokenCost, balance, tokenCost };
};

module.exports = mongoose.model('Balance', balanceSchema);
